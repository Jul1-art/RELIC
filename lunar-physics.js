/**
 * Lunar base systems simulation. No DOM, renderer, network or external dependency.
 *
 * This is a deterministic, simplified engineering model, NOT a validated mission
 * design or life-support controller. Equipment capacities/rates and the local
 * horizon are illustrative assumptions. `update(seconds)` advances simulated
 * seconds; a UI can call `setTimeScale` or pass larger steps for a time-lapse.
 *
 * NASA reference facts:
 *  - Lunar surface gravity 1.62 m/s²:
 *    https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
 *  - Synodic lunar day 29.53 Earth days:
 *    https://ntrs.nasa.gov/api/citations/19940014011/downloads/19940014011.pdf
 *  - Polar Sun stays near the horizon and local terrain casts long shadows:
 *    https://science.nasa.gov/resource/shadows-near-the-moons-south-pole/
 *  - ECLSS regulates atmosphere, removes CO2, recycles water and makes oxygen:
 *    https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/
 */

export const LUNAR_GRAVITY_M_S2 = 1.62;
export const LUNAR_SOLAR_DAY_SECONDS = 29.53 * 86400;

const DAY_SECONDS = 86400;
const MAX_STEP_SECONDS = 20;
const TARGET_PRESSURE_KPA = 70;
const CABIN_VOLUME_M3 = 400;
const CABIN_TEMP_K = 293.15;
const GAS_MOLAR_MASS_KG = 0.029;
const GAS_KG_PER_KPA = (1000 * CABIN_VOLUME_M3 * GAS_MOLAR_MASS_KG) / (8.314462618 * CABIN_TEMP_K);
const CO2_MOLAR_MASS_KG = 0.04401;
const CABIN_MOLES = (TARGET_PRESSURE_KPA * 1000 * CABIN_VOLUME_M3) / (8.314462618 * CABIN_TEMP_K);
const CO2_KG_PER_PPM = CABIN_MOLES * CO2_MOLAR_MASS_KG / 1e6;

const ASSUMED = Object.freeze({
  solarPeakKw: 27,
  batteryCapacityKWh: 780,
  batteryInitialPercent: 82,
  roverBatteryKWh: 14,
  roverInitialPercent: 88,
  oxygenCapacityKg: 42,
  initialOxygenKg: 34,
  waterCapacityKg: 600,
  initialWaterKg: 500,
  gasCapacityKg: 80,
  initialGasKg: 65,
  crew: 4,
  roverMassKg: 620,
  roverRollingResistance: 0.04,
  roverDriveEfficiency: 0.68,
  chamberVolumeM3: 14,
});

const FAULT_NAMES = new Set([
  'solarDust', 'solarArray', 'battery', 'oxygenGenerator',
  'co2Scrubber', 'pressureLeak', 'heater', 'rover', 'isru',
]);

const AIRLOCK_PHASE_SECONDS = Object.freeze({
  innerOpening: 5,
  innerOpen: 14,
  innerClosing: 5,
  depressurizing: 45,
  outerOpening: 5,
  outerClosing: 5,
  pressurizing: 55,
});

// Illustrative marked track kept clear of the central domes and landing pad.
// Contact/terrain dynamics are deliberately outside this systems model.
const ROVER_ROUTE = Object.freeze([
  [12, 15], [12, 33], [43, 33], [43, 8],
  [20, 8], [20, 12], [12, 12], [12, 15],
]);
const ROVER_ROUTE_LENGTH_M = ROVER_ROUTE.slice(1).reduce((total, point, index) =>
  total + Math.hypot(point[0] - ROVER_ROUTE[index][0], point[1] - ROVER_ROUTE[index][1]), 0);

function roverPose(distanceM) {
  let remaining = ((distanceM % ROVER_ROUTE_LENGTH_M) + ROVER_ROUTE_LENGTH_M) % ROVER_ROUTE_LENGTH_M;
  for (let index = 1; index < ROVER_ROUTE.length; index += 1) {
    const from = ROVER_ROUTE[index - 1];
    const to = ROVER_ROUTE[index];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (remaining <= length || index === ROVER_ROUTE.length - 1) {
      const fraction = clamp(remaining / length, 0, 1);
      return {
        position: { x: from[0] + (to[0] - from[0]) * fraction,
          z: from[1] + (to[1] - from[1]) * fraction },
        headingRad: Math.atan2(to[0] - from[0], to[1] - from[1]),
      };
    }
    remaining -= length;
  }
  return { position: { x: 12, z: 15 }, headingRad: 0 };
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const round = (value, digits = 3) => Number(value.toFixed(digits));
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * System-level simulator with an interlocked airlock and deterministic failures.
 *
 * API: `new LunarBaseSimulation(options?)`, `update(seconds)`,
 * `command(name, payload?)`, `snapshot()`, `drainEvents()`.
 */
export class LunarBaseSimulation {
  constructor(options = {}) {
    const config = { ...ASSUMED, ...options };
    this.config = Object.freeze({
      ...config,
      solarPeakKw: positive(config.solarPeakKw, ASSUMED.solarPeakKw),
      batteryCapacityKWh: positive(config.batteryCapacityKWh, ASSUMED.batteryCapacityKWh),
      roverBatteryKWh: positive(config.roverBatteryKWh, ASSUMED.roverBatteryKWh),
      oxygenCapacityKg: positive(config.oxygenCapacityKg, ASSUMED.oxygenCapacityKg),
      waterCapacityKg: positive(config.waterCapacityKg, ASSUMED.waterCapacityKg),
      gasCapacityKg: positive(config.gasCapacityKg, ASSUMED.gasCapacityKg),
      crew: clamp(Math.round(config.crew), 0, 12),
    });
    this.timeSeconds = Math.max(0, Number(options.startTimeSeconds) || 0);
    this.timeScale = positive(options.timeScale, 1);
    this.lightingMode = 'auto';
    this.manualSunElevationDeg = 2.5;
    this.solarEnabled = true;
    this.modules = { habitat: true, greenhouse: true, isru: false };
    this.faults = Object.fromEntries([...FAULT_NAMES].map(name => [name, false]));
    this.power = {
      batteryKWh: this.config.batteryCapacityKWh * clamp(this.config.batteryInitialPercent / 100, 0, 1),
      generationKw: 0,
      demandKw: 0,
      suppliedKw: 0,
      curtailedKw: 0,
      supplyFraction: 1,
      loads: {},
    };
    this.lifeSupport = {
      oxygenKg: clamp(this.config.initialOxygenKg, 0, this.config.oxygenCapacityKg),
      waterKg: clamp(this.config.initialWaterKg, 0, this.config.waterCapacityKg),
      gasKg: clamp(this.config.initialGasKg, 0, this.config.gasCapacityKg),
      co2Kg: 480 * CO2_KG_PER_PPM,
      pressureKPa: TARGET_PRESSURE_KPA,
      temperatureC: 20,
    };
    this.airlock = {
      phase: 'sealed', direction: null, elapsedSeconds: 0,
      chamberPressureKPa: TARGET_PRESSURE_KPA,
      innerDoor: 'closed', outerDoor: 'closed', pumpActive: false,
    };
    this.rover = {
      mode: 'docked', batteryKWh: this.config.roverBatteryKWh * clamp(this.config.roverInitialPercent / 100, 0, 1),
      speedMps: 1.5, gradeDeg: 0, distanceM: 0, position: { x: 12, z: 15 }, headingRad: 0,
      drivePowerKw: 0,
    };
    this.events = [];
    this._eventId = 0;
    this._lastAlarm = '';
    this._updatePower(0);
  }

  /** Advances simulated seconds. A step is limited internally for stable transitions. */
  update(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('seconds must be finite and >= 0');
    const total = seconds * this.timeScale;
    if (total > 7 * DAY_SECONDS) throw new RangeError('one update may advance at most seven simulated days');
    let remaining = total;
    while (remaining > 1e-9) {
      const phase = this.airlock.phase;
      const phaseRemaining = AIRLOCK_PHASE_SECONDS[phase] === undefined ? Infinity :
        Math.max(0.001, AIRLOCK_PHASE_SECONDS[phase] - this.airlock.elapsedSeconds);
      const dt = Math.min(MAX_STEP_SECONDS, remaining, phaseRemaining);
      this.timeSeconds += dt;
      this._updatePower(dt);
      this._updateAirlock(dt);
      this._updateRover(dt);
      this._updateLifeSupport(dt);
      remaining -= dt;
    }
    this._updateAlarm();
    return this.snapshot();
  }

  /**
   * Command names and payloads:
   * airlockCycle: 'outbound'|'inbound' (direction optional, inferred from phase)
   * abortAirlock, setSolar: boolean, toggleSolar,
   * setLighting: 'auto'|'day'|'night'|{ mode, elevationDeg? },
   * setRover: boolean|{ active, speedMps?, gradeDeg? }, toggleRover,
   * returnRover, dockRover, setModule: { name, enabled },
   * setFailure: name|{ name, active }, clearFailure: name,
   * setTimeScale: positive number, setCrew: integer 0..12.
   * Returns { ok, code, message }; rejected commands never mutate state.
   */
  command(name, payload) {
    switch (name) {
      case 'airlockCycle': return this._commandAirlock(payload);
      case 'abortAirlock': return this._abortAirlock();
      case 'setSolar':
        if (typeof payload !== 'boolean') return this._reject('invalid_payload', 'État des panneaux invalide.');
        this.solarEnabled = payload;
        return this._accept('solar', payload ? 'Panneaux déployés.' : 'Panneaux repliés.');
      case 'toggleSolar': return this.command('setSolar', !this.solarEnabled);
      case 'setLighting': return this._setLighting(payload);
      case 'setRover': return this._setRover(payload);
      case 'toggleRover': return this.command('setRover', this.rover.mode !== 'driving');
      case 'returnRover':
        if (this.rover.mode === 'docked') return this._reject('already_docked', 'Le rover est déjà à la base.');
        if (this.rover.mode === 'stopped' && this._distanceFromBase() < 0.5) {
          this.rover.mode = 'docked';
          return this._accept('rover_docked', 'Rover amarré et en recharge.');
        }
        if (this.rover.batteryKWh <= 0 || this.faults.rover) return this._reject('rover_unavailable', 'Le rover ne peut pas repartir.');
        this.rover.mode = 'returning';
        return this._accept('rover_returning', 'Le rover rejoint la base.');
      case 'dockRover':
        if (this.rover.mode === 'driving' || this.rover.mode === 'returning') return this._reject('rover_moving', 'Immobilisez le rover avant de l’amarrer.');
        if (this._distanceFromBase() > 5) return this._reject('rover_far', 'Le rover est trop loin du point d’amarrage.');
        this.rover.mode = 'docked';
        return this._accept('rover_docked', 'Rover amarré et en recharge.');
      case 'setModule': return this._setModule(payload);
      case 'setFailure': return this._setFailure(payload, true);
      case 'clearFailure': return this._setFailure(payload, false);
      case 'setTimeScale':
        if (!Number.isFinite(payload) || payload <= 0 || payload > 3600) return this._reject('invalid_payload', 'Accélération entre 0 et 3 600 requise.');
        this.timeScale = payload;
        return this._accept('time_scale', `Simulation ×${payload}.`);
      case 'setCrew':
        if (!Number.isInteger(payload) || payload < 0 || payload > 12) return this._reject('invalid_payload', 'Équipage entre 0 et 12 requis.');
        this.config = Object.freeze({ ...this.config, crew: payload });
        return this._accept('crew', `Équipage : ${payload}.`);
      default: return this._reject('unknown_command', 'Commande inconnue.');
    }
  }

  snapshot() {
    const lighting = this._lighting();
    const capacity = this._effectiveBatteryCapacity();
    const life = this.lifeSupport;
    const status = this._status();
    return {
      simulationTimeSeconds: round(this.timeSeconds, 2),
      lunarGravityMps2: LUNAR_GRAVITY_M_S2,
      lunarSolarDaySeconds: LUNAR_SOLAR_DAY_SECONDS,
      timeScale: this.timeScale,
      assumedEquipment: true,
      lighting,
      modules: Object.fromEntries(Object.entries(this.modules).map(([key, enabled]) => [key, { enabled }])),
      power: {
        solarEnabled: this.solarEnabled,
        generationKw: round(this.power.generationKw),
        demandKw: round(this.power.demandKw),
        loadKw: round(this.power.demandKw),
        suppliedKw: round(this.power.suppliedKw),
        curtailedKw: round(this.power.curtailedKw),
        supplyFraction: round(this.power.supplyFraction),
        loads: { ...this.power.loads },
        batteryKWh: round(this.power.batteryKWh),
        batteryCapacityKWh: capacity,
        batteryPercent: round(100 * this.power.batteryKWh / capacity, 1),
      },
      lifeSupport: {
        crew: this.config.crew,
        oxygenKg: round(life.oxygenKg),
        oxygenCapacityKg: this.config.oxygenCapacityKg,
        oxygenPercent: round(100 * life.oxygenKg / this.config.oxygenCapacityKg, 1),
        waterKg: round(life.waterKg),
        waterLiters: round(life.waterKg / 0.998),
        waterCapacityKg: this.config.waterCapacityKg,
        waterPercent: round(100 * life.waterKg / this.config.waterCapacityKg, 1),
        co2Ppm: round(life.co2Kg / CO2_KG_PER_PPM, 0),
        pressureKPa: round(life.pressureKPa, 2),
        temperatureC: round(life.temperatureC, 2),
        gasReserveKg: round(life.gasKg),
      },
      airlock: {
        ...this.airlock,
        interlocked: !(this.airlock.innerDoor === 'open' && this.airlock.outerDoor === 'open'),
        elapsedSeconds: round(this.airlock.elapsedSeconds, 2),
        chamberPressureKPa: round(this.airlock.chamberPressureKPa, 2),
        progress: this.airlock.phase === 'sealed' || this.airlock.phase === 'outerOpen' ? 1 :
          round(clamp(this.airlock.elapsedSeconds / (AIRLOCK_PHASE_SECONDS[this.airlock.phase] || 1), 0, 1)),
      },
      rover: {
        ...this.rover,
        batteryKWh: round(this.rover.batteryKWh),
        batteryCapacityKWh: this.config.roverBatteryKWh,
        batteryPercent: round(100 * this.rover.batteryKWh / this.config.roverBatteryKWh, 1),
        distanceM: round(this.rover.distanceM, 1),
        position: { x: round(this.rover.position.x, 2), z: round(this.rover.position.z, 2) },
        drivePowerKw: round(this.rover.drivePowerKw),
        docked: this.rover.mode === 'docked',
        active: this.rover.mode === 'driving' || this.rover.mode === 'returning',
      },
      faults: { ...this.faults },
      status,
      events: this.events.map(event => ({ ...event })),
    };
  }

  drainEvents() {
    const pending = this.events.map(event => ({ ...event }));
    this.events.length = 0;
    return pending;
  }

  _lighting() {
    const phase = (this.timeSeconds % LUNAR_SOLAR_DAY_SECONDS) / LUNAR_SOLAR_DAY_SECONDS;
    const azimuthDeg = (phase * 360) % 360;
    // Illustrative local polar horizon. NASA confirms grazing illumination,
    // but this waveform is not ephemeris or measured terrain for a real site.
    const horizonDeg = 0.85 + 0.9 * Math.sin(2 * Math.PI * phase + 0.8) +
      0.25 * Math.sin(6 * Math.PI * phase - 0.4);
    const autoElevationDeg = 1.6 + 1.15 * Math.sin(2 * Math.PI * phase - 0.7);
    const elevationDeg = this.lightingMode === 'auto' ? autoElevationDeg :
      this.lightingMode === 'night' ? -2 : this.manualSunElevationDeg;
    const solarVisibility = this.lightingMode === 'night' ? 0 :
      this.lightingMode === 'day' ? clamp((elevationDeg + 0.25) / 3.25, 0, 1) :
      clamp((elevationDeg - horizonDeg + 0.3) / 1.3, 0, 1);
    return {
      mode: this.lightingMode,
      sunElevationDeg: round(elevationDeg, 2),
      sunAzimuthDeg: round(azimuthDeg, 2),
      localHorizonDeg: round(horizonDeg, 2),
      solarVisibility: round(solarVisibility),
      isSunlit: solarVisibility > 0.05,
    };
  }

  _effectiveBatteryCapacity() {
    return this.config.batteryCapacityKWh * (this.faults.battery ? 0.55 : 1);
  }

  _updatePower(dt) {
    const light = this._lighting();
    const generation = this.solarEnabled && !this.faults.solarArray ?
      this.config.solarPeakKw * light.solarVisibility * (this.faults.solarDust ? 0.35 : 1) : 0;
    const loads = {
      habitat: this.modules.habitat ? 4.6 : 0,
      lifeSupport: 2.3,
      thermal: this.faults.heater ? 0 : (light.isSunlit ? 2.3 : 4.4),
      communications: 0.55,
      greenhouse: this.modules.greenhouse ? 3.1 : 0,
      isru: this.modules.isru && !this.faults.isru ? 8.5 : 0,
      airlock: this.airlock.phase === 'sealed' || this.airlock.phase === 'outerOpen' ? 0 :
        ['depressurizing', 'pressurizing'].includes(this.airlock.phase) ? 2.6 : 0.45,
      roverCharge: this.rover.mode === 'docked' && this.rover.batteryKWh < this.config.roverBatteryKWh ? 1.8 : 0,
    };
    const demand = Object.values(loads).reduce((sum, kw) => sum + kw, 0);
    const capacity = this._effectiveBatteryCapacity();
    this.power.batteryKWh = Math.min(capacity, this.power.batteryKWh);
    const hours = dt / 3600;
    const batteryDeliverableKw = hours > 0 ? Math.min(50, this.power.batteryKWh * 0.93 / hours) : 50;
    const availableKw = generation + batteryDeliverableKw;
    // Shed noncritical work before life support; zero energy still causes outage.
    const order = ['isru', 'greenhouse', 'roverCharge', 'habitat', 'communications', 'thermal', 'airlock', 'lifeSupport'];
    const suppliedLoads = {};
    let leftKw = availableKw;
    for (const key of [...order].reverse()) {
      suppliedLoads[key] = Math.min(loads[key], Math.max(0, leftKw));
      leftKw -= suppliedLoads[key];
    }
    const supplied = Object.values(suppliedLoads).reduce((sum, kw) => sum + kw, 0);
    const fromBatteryKw = Math.max(0, supplied - generation);
    const chargeKw = Math.max(0, generation - supplied);
    this.power.batteryKWh = clamp(
      this.power.batteryKWh - fromBatteryKw * hours / 0.93 + chargeKw * hours * 0.94,
      0, capacity,
    );
    this.power.generationKw = generation;
    this.power.demandKw = demand;
    this.power.suppliedKw = supplied;
    this.power.curtailedKw = Math.max(0, demand - supplied);
    this.power.supplyFraction = demand ? supplied / demand : 1;
    this.power.loads = Object.fromEntries(Object.entries(loads).map(([key, requestedKw]) => [key, {
      requestedKw: round(requestedKw), suppliedKw: round(suppliedLoads[key]),
      powered: requestedKw === 0 || suppliedLoads[key] >= requestedKw * 0.9,
    }]));
  }

  _updateLifeSupport(dt) {
    const life = this.lifeSupport;
    const crew = this.config.crew;
    const eclssPower = this.power.loads.lifeSupport.powered;
    const greenhousePower = this.modules.greenhouse && this.power.loads.greenhouse.powered;
    const isruPower = this.modules.isru && this.power.loads.isru.powered && !this.faults.isru;
    const oxygenProduced = eclssPower && !this.faults.oxygenGenerator && life.waterKg > 0 ? 4.6 * dt / DAY_SECONDS : 0;
    const oxygenFromIsru = isruPower ? 2.5 * dt / DAY_SECONDS : 0;
    const oxygenCrew = crew * 0.84 * dt / DAY_SECONDS;
    const waterElectrolysis = oxygenProduced * 1.125;
    const waterCrewNet = crew * 1.3 * dt / DAY_SECONDS; // after assumed 90% recovery
    const waterIsru = isruPower ? 9 * dt / DAY_SECONDS : 0;
    life.oxygenKg = clamp(life.oxygenKg + oxygenProduced + oxygenFromIsru - oxygenCrew, 0, this.config.oxygenCapacityKg);
    life.waterKg = clamp(life.waterKg + waterIsru - waterElectrolysis - waterCrewNet, 0, this.config.waterCapacityKg);
    const co2Produced = crew * 1.02 * dt / DAY_SECONDS;
    const co2Floor = 420 * CO2_KG_PER_PPM;
    const scrubCapacity = eclssPower && !this.faults.co2Scrubber ? 6.5 * dt / DAY_SECONDS : 0;
    const greenhouseUptake = greenhousePower ? 0.35 * dt / DAY_SECONDS : 0;
    life.co2Kg = Math.max(co2Floor, life.co2Kg + co2Produced - scrubCapacity - greenhouseUptake);
    const leakKPaPerHour = this.faults.pressureLeak ? 0.16 : 0.002;
    life.pressureKPa = Math.max(0, life.pressureKPa - leakKPaPerHour * dt / 3600);
    if (eclssPower && life.gasKg > 0 && life.pressureKPa < TARGET_PRESSURE_KPA) {
      const restoreKPa = Math.min(TARGET_PRESSURE_KPA - life.pressureKPa, 0.025 * dt, life.gasKg / GAS_KG_PER_KPA);
      life.pressureKPa += restoreKPa;
      life.gasKg -= restoreKPa * GAS_KG_PER_KPA;
    }
    const outsideC = this._lighting().isSunlit ? -45 : -155; // illustrative site, not measured temperature
    const heatPowered = !this.faults.heater && this.power.loads.thermal.powered;
    const targetC = heatPowered ? 20 : outsideC;
    const thermalTimeConstant = heatPowered ? 3 * 3600 : 18 * 3600;
    life.temperatureC += (targetC - life.temperatureC) * (1 - Math.exp(-dt / thermalTimeConstant));
  }

  _updateAirlock(dt) {
    const lock = this.airlock;
    if (lock.phase === 'sealed' || lock.phase === 'outerOpen') { lock.pumpActive = false; return; }
    const pumping = lock.phase === 'depressurizing' || lock.phase === 'pressurizing';
    const actuatorPowered = this.power.loads.airlock.powered;
    lock.pumpActive = pumping && actuatorPowered;
    if (!actuatorPowered) return;
    if (lock.phase === 'pressurizing') {
      const chamberKgPerKPa = GAS_KG_PER_KPA * this.config.chamberVolumeM3 / CABIN_VOLUME_M3;
      const requestedKPa = TARGET_PRESSURE_KPA * dt / AIRLOCK_PHASE_SECONDS.pressurizing;
      const availableKPa = this.lifeSupport.gasKg / chamberKgPerKPa;
      const pressureGain = Math.min(requestedKPa, availableKPa, TARGET_PRESSURE_KPA - lock.chamberPressureKPa);
      if (pressureGain <= 1e-9) {
        lock.pumpActive = false;
        if (!this._gasAlarmIssued) {
          this._emit('warning', 'airlock_gas_low', 'Réserve de gaz insuffisante pour pressuriser le sas.');
          this._gasAlarmIssued = true;
        }
        return;
      }
      this.lifeSupport.gasKg -= pressureGain * chamberKgPerKPa;
      lock.chamberPressureKPa += pressureGain;
      // If gas runs out part-way through a step, hold the phase at its actual pressure.
      lock.elapsedSeconds = AIRLOCK_PHASE_SECONDS.pressurizing * lock.chamberPressureKPa / TARGET_PRESSURE_KPA;
      this._gasAlarmIssued = false;
    } else {
      lock.elapsedSeconds += dt;
    }
    if (lock.phase === 'depressurizing') {
      lock.chamberPressureKPa = TARGET_PRESSURE_KPA *
        (1 - clamp(lock.elapsedSeconds / AIRLOCK_PHASE_SECONDS.depressurizing, 0, 1));
    }
    const duration = AIRLOCK_PHASE_SECONDS[lock.phase];
    if (lock.elapsedSeconds + 1e-9 < duration) return;
    const previous = lock.phase;
    const next = {
      innerOpening: 'innerOpen',
      innerOpen: 'innerClosing',
      innerClosing: lock.direction === 'outbound' ? 'depressurizing' : 'sealed',
      depressurizing: 'outerOpening',
      outerOpening: 'outerOpen',
      outerClosing: 'pressurizing',
      pressurizing: 'innerOpening',
    }[lock.phase];
    lock.phase = next;
    lock.elapsedSeconds = 0;
    if (previous === 'outerClosing') lock.outerDoor = 'closed';
    if (next === 'innerOpen') lock.innerDoor = 'open';
    if (next === 'innerClosing') lock.innerDoor = 'closed';
    if (next === 'outerOpen') lock.outerDoor = 'open';
    if (next === 'outerClosing') lock.outerDoor = 'closed';
    if (next === 'sealed') lock.direction = null;
    this._emit('info', `airlock_${next}`, `Sas : ${next}.`);
  }

  _updateRover(dt) {
    const rover = this.rover;
    rover.drivePowerKw = 0;
    if (rover.mode === 'docked') {
      if (this.power.loads.roverCharge.powered) {
        rover.batteryKWh = Math.min(this.config.roverBatteryKWh, rover.batteryKWh + 1.8 * dt / 3600 * 0.9);
      }
      return;
    }
    if (rover.mode !== 'driving' && rover.mode !== 'returning') return;
    if (this.faults.rover || rover.batteryKWh <= 0) {
      rover.mode = 'stopped';
      this._emit('warning', 'rover_stopped', 'Rover immobilisé : énergie ou propulsion indisponible.');
      return;
    }
    const speed = rover.speedMps;
    const gradeRad = rover.gradeDeg * Math.PI / 180;
    const rollingN = this.config.roverRollingResistance * this.config.roverMassKg * LUNAR_GRAVITY_M_S2 * Math.cos(gradeRad);
    const climbingN = this.config.roverMassKg * LUNAR_GRAVITY_M_S2 * Math.sin(gradeRad);
    const driveKw = 0.34 + Math.max(0, (rollingN + climbingN) * speed) /
      (1000 * this.config.roverDriveEfficiency);
    const nextDockDistance = (Math.floor(rover.distanceM / ROVER_ROUTE_LENGTH_M) + 1) * ROVER_ROUTE_LENGTH_M;
    const maxReturnSeconds = rover.mode === 'returning' ? (nextDockDistance - rover.distanceM) / speed : Infinity;
    const availableSeconds = Math.min(dt, rover.batteryKWh * 3600 / driveKw, maxReturnSeconds);
    rover.drivePowerKw = driveKw;
    rover.distanceM += speed * availableSeconds;
    rover.batteryKWh = Math.max(0, rover.batteryKWh - driveKw * availableSeconds / 3600);
    const pose = roverPose(rover.distanceM);
    rover.position = pose.position;
    rover.headingRad = pose.headingRad;
    if (rover.mode === 'returning' && rover.distanceM >= nextDockDistance - 1e-6) {
      rover.distanceM = nextDockDistance;
      rover.position = { x: 12, z: 15 };
      rover.headingRad = 0;
      rover.mode = 'docked';
      this._emit('info', 'rover_docked', 'Le rover a rejoint le point d’amarrage.');
    }
    if (rover.batteryKWh === 0) {
      rover.mode = 'stopped';
      this._emit('warning', 'rover_battery_empty', 'Batterie du rover épuisée.');
    }
  }

  _distanceFromBase() {
    return Math.hypot(this.rover.position.x - 12, this.rover.position.z - 15);
  }

  _commandAirlock(payload) {
    const phase = this.airlock.phase;
    const direction = typeof payload === 'string' ? payload : payload?.direction ||
      (phase === 'outerOpen' ? 'inbound' : 'outbound');
    if (direction !== 'outbound' && direction !== 'inbound') return this._reject('invalid_payload', 'Direction de sas invalide.');
    if (phase !== 'sealed' && phase !== 'outerOpen') return this._reject('airlock_busy', 'Un cycle de sas est déjà en cours.');
    if (direction === 'outbound' && phase !== 'sealed') return this._reject('airlock_direction', 'Fermez le sas extérieur avant une sortie.');
    if (direction === 'inbound' && phase !== 'outerOpen') return this._reject('airlock_direction', 'Le sas extérieur doit être ouvert pour une rentrée.');
    if (direction === 'outbound' && Math.abs(this.airlock.chamberPressureKPa - this.lifeSupport.pressureKPa) > 3)
      return this._reject('pressure_mismatch', 'La pression du sas doit égaler celle de l’habitat.');
    const chamberGasKg = GAS_KG_PER_KPA * TARGET_PRESSURE_KPA *
      this.config.chamberVolumeM3 / CABIN_VOLUME_M3;
    if (direction === 'inbound' && this.lifeSupport.gasKg < chamberGasKg)
      return this._reject('gas_low', 'Réserve de gaz insuffisante pour une rentrée.');
    this.airlock.direction = direction;
    this.airlock.phase = direction === 'outbound' ? 'innerOpening' : 'outerClosing';
    this.airlock.elapsedSeconds = 0;
    return this._accept('airlock_cycle', direction === 'outbound' ? 'Cycle de sortie lancé.' : 'Cycle de rentrée lancé.');
  }

  _abortAirlock() {
    const lock = this.airlock;
    if (lock.phase === 'sealed') return this._reject('airlock_idle', 'Aucun cycle de sas actif.');
    if (lock.phase === 'outerOpen') return this._commandAirlock('inbound');
    if (lock.phase === 'depressurizing' || lock.phase === 'outerOpening') {
      lock.outerDoor = 'closed';
      lock.direction = 'inbound';
      lock.phase = 'pressurizing';
      lock.elapsedSeconds = lock.chamberPressureKPa / TARGET_PRESSURE_KPA * AIRLOCK_PHASE_SECONDS.pressurizing;
      return this._accept('airlock_abort', 'Sortie annulée ; repressurisation du sas.');
    }
    return this._reject('airlock_abort_unavailable', 'Finissez le cycle de sas en cours.');
  }

  _setLighting(payload) {
    const mode = typeof payload === 'string' ? payload : payload?.mode;
    if (!['auto', 'day', 'night'].includes(mode)) return this._reject('invalid_payload', 'Mode solaire invalide.');
    const elevation = payload && typeof payload === 'object' ? payload.elevationDeg : undefined;
    if (elevation !== undefined && (!Number.isFinite(elevation) || elevation < -5 || elevation > 10))
      return this._reject('invalid_payload', 'Élévation solaire invalide.');
    this.lightingMode = mode;
    if (elevation !== undefined) this.manualSunElevationDeg = elevation;
    return this._accept('lighting', `Éclairage : ${mode}.`);
  }

  _setRover(payload) {
    const active = typeof payload === 'boolean' ? payload : payload?.active;
    if (typeof active !== 'boolean') return this._reject('invalid_payload', 'État du rover invalide.');
    if (active && (this.rover.batteryKWh <= 0 || this.faults.rover))
      return this._reject('rover_unavailable', 'Le rover ne peut pas démarrer.');
    if (payload && typeof payload === 'object') {
      if (payload.speedMps !== undefined && (!Number.isFinite(payload.speedMps) || payload.speedMps <= 0 || payload.speedMps > 4))
        return this._reject('invalid_payload', 'Vitesse du rover invalide.');
      if (payload.gradeDeg !== undefined && (!Number.isFinite(payload.gradeDeg) || Math.abs(payload.gradeDeg) > 20))
        return this._reject('invalid_payload', 'Pente du rover invalide.');
      if (payload.speedMps !== undefined) this.rover.speedMps = payload.speedMps;
      if (payload.gradeDeg !== undefined) this.rover.gradeDeg = payload.gradeDeg;
    }
    this.rover.mode = active ? 'driving' : this.rover.mode === 'docked' ? 'docked' : 'stopped';
    return this._accept('rover', active ? 'Rover en route.' : 'Rover immobilisé.');
  }

  _setModule(payload) {
    const name = payload?.name;
    if (!Object.hasOwn(this.modules, name) || typeof payload.enabled !== 'boolean')
      return this._reject('invalid_payload', 'Module ou état invalide.');
    if (name === 'habitat' && !payload.enabled && this.config.crew > 0)
      return this._reject('habitat_occupied', 'L’habitat ne peut pas être coupé avec un équipage à bord.');
    this.modules[name] = payload.enabled;
    return this._accept('module', `${name} ${payload.enabled ? 'activé' : 'désactivé'}.`);
  }

  _setFailure(payload, defaultActive) {
    const name = typeof payload === 'string' ? payload : payload?.name;
    const active = typeof payload === 'object' && payload !== null && Object.hasOwn(payload, 'active') ? payload.active : defaultActive;
    if (!FAULT_NAMES.has(name) || typeof active !== 'boolean') return this._reject('invalid_payload', 'Panne invalide.');
    this.faults[name] = active;
    if (name === 'battery' && active) this.power.batteryKWh = Math.min(this.power.batteryKWh, this._effectiveBatteryCapacity());
    return this._accept(active ? 'failure_started' : 'failure_cleared', `${name} : ${active ? 'panne simulée' : 'réparé'}.`, active ? 'warning' : 'info');
  }

  _status() {
    const life = this.lifeSupport;
    const co2Ppm = life.co2Kg / CO2_KG_PER_PPM;
    if (life.pressureKPa < 55 || life.oxygenKg <= 0 || co2Ppm > 5000 || life.temperatureC < 4 || life.temperatureC > 36)
      return { level: 'critical', label: 'Habitat en danger', code: 'habitat_critical' };
    if (this.power.batteryKWh / this._effectiveBatteryCapacity() < 0.15 || life.oxygenKg / this.config.oxygenCapacityKg < 0.15 ||
      co2Ppm > 2500 || life.pressureKPa < 65 || life.temperatureC < 14 || this.power.curtailedKw > 0)
      return { level: 'warning', label: 'Ressources à surveiller', code: 'resources_low' };
    return { level: 'nominal', label: 'Base opérationnelle', code: 'nominal' };
  }

  _updateAlarm() {
    const status = this._status();
    if (status.code === this._lastAlarm) return;
    this._lastAlarm = status.code;
    if (status.level !== 'nominal') this._emit(status.level, status.code, status.label);
    else this._emit('info', 'nominal', 'Systèmes stabilisés.');
  }

  _emit(level, code, message) {
    this.events.push({ id: ++this._eventId, timeSeconds: round(this.timeSeconds, 2), level, code, message });
    if (this.events.length > 30) this.events.shift();
  }

  _accept(code, message, level = 'info') {
    this._emit(level, code, message);
    return { ok: true, code, message };
  }

  _reject(code, message) {
    this._emit('warning', code, message);
    return { ok: false, code, message };
  }
}

export default LunarBaseSimulation;
