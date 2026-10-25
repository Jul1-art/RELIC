import test from 'node:test';
import assert from 'node:assert/strict';
import { LunarBaseSimulation, LUNAR_GRAVITY_M_S2 } from '../lunar-physics.js';

test('snapshot exposes physical units, finite resources, and no shared mutable data', () => {
  const simulation = new LunarBaseSimulation();
  const state = simulation.snapshot();
  assert.equal(state.lunarGravityMps2, LUNAR_GRAVITY_M_S2);
  assert.equal(state.assumedEquipment, true);
  assert.equal(state.airlock.interlocked, true);
  assert.ok(state.power.batteryPercent > 0 && state.power.batteryPercent < 100);
  assert.ok(state.lifeSupport.pressureKPa > 60);
  state.modules.greenhouse.enabled = false;
  state.rover.position.x = 999;
  assert.equal(simulation.snapshot().modules.greenhouse.enabled, true);
  assert.deepEqual(simulation.snapshot().rover.position, { x: 12, z: 15 });
  assert.doesNotThrow(() => JSON.stringify(state));
});

test('solar shading and array fault change the energy budget, while battery buffers darkness', () => {
  const simulation = new LunarBaseSimulation();
  simulation.command('setLighting', 'day');
  simulation.update(3600);
  const sun = simulation.snapshot();
  assert.ok(sun.power.generationKw > 0);
  simulation.command('setFailure', 'solarDust');
  simulation.update(1);
  assert.ok(simulation.snapshot().power.generationKw < sun.power.generationKw * 0.5);
  simulation.command('setLighting', 'night');
  const batteryBefore = simulation.snapshot().power.batteryKWh;
  simulation.update(3600);
  const dark = simulation.snapshot();
  assert.equal(dark.power.generationKw, 0);
  assert.ok(dark.power.batteryKWh < batteryBefore);
  assert.ok(dark.power.suppliedKw > 0);
});

test('airlock cycles through pressure transfer and never opens both doors', () => {
  const simulation = new LunarBaseSimulation();
  assert.equal(simulation.command('airlockCycle', 'outbound').ok, true);
  assert.equal(simulation.command('airlockCycle', 'outbound').ok, false);
  for (let seconds = 0; seconds < 90; seconds += 1) {
    simulation.update(1);
    const lock = simulation.snapshot().airlock;
    assert.equal(lock.interlocked, true);
    if (lock.outerDoor === 'open') {
      assert.equal(lock.innerDoor, 'closed');
      assert.ok(lock.chamberPressureKPa < 0.1);
    }
  }
  assert.equal(simulation.snapshot().airlock.phase, 'outerOpen');
  const gasBefore = simulation.snapshot().lifeSupport.gasReserveKg;
  assert.equal(simulation.command('airlockCycle').ok, true);
  for (let seconds = 0; seconds < 110; seconds += 1) {
    simulation.update(1);
    const lock = simulation.snapshot().airlock;
    assert.equal(lock.interlocked, true);
    if (lock.innerDoor === 'open') assert.ok(lock.chamberPressureKPa > 69);
  }
  const end = simulation.snapshot();
  assert.equal(end.airlock.phase, 'sealed');
  assert.equal(end.airlock.innerDoor, 'closed');
  assert.equal(end.airlock.outerDoor, 'closed');
  assert.ok(end.lifeSupport.gasReserveKg < gasBefore);
});

test('airlock rejects inbound cycle when gas reserve cannot fill chamber', () => {
  const simulation = new LunarBaseSimulation({ initialGasKg: 2 });
  simulation.command('airlockCycle', 'outbound');
  simulation.update(90);
  assert.equal(simulation.snapshot().airlock.phase, 'outerOpen');
  const result = simulation.command('airlockCycle', 'inbound');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'gas_low');
  assert.equal(simulation.snapshot().airlock.outerDoor, 'open');
});

test('airlock actuators stop during a power outage and resume when power returns', () => {
  const simulation = new LunarBaseSimulation({ batteryInitialPercent: 0 });
  simulation.command('setLighting', 'night');
  simulation.command('airlockCycle', 'outbound');
  simulation.update(30);
  const blocked = simulation.snapshot().airlock;
  assert.equal(blocked.phase, 'innerOpening');
  assert.equal(blocked.innerDoor, 'closed');
  assert.equal(blocked.outerDoor, 'closed');
  simulation.command('setLighting', 'day');
  simulation.update(30);
  assert.notEqual(simulation.snapshot().airlock.phase, 'innerOpening');
});

test('life support blackout raises CO2 and lowers temperature without inventing oxygen', () => {
  const simulation = new LunarBaseSimulation({ batteryInitialPercent: 0 });
  simulation.command('setLighting', 'night');
  const initial = simulation.snapshot();
  simulation.update(8 * 3600);
  const failed = simulation.snapshot();
  assert.equal(failed.power.generationKw, 0);
  assert.equal(failed.power.loads.lifeSupport.powered, false);
  assert.ok(failed.lifeSupport.oxygenKg < initial.lifeSupport.oxygenKg);
  assert.ok(failed.lifeSupport.co2Ppm > initial.lifeSupport.co2Ppm);
  assert.ok(failed.lifeSupport.temperatureC < initial.lifeSupport.temperatureC);
  assert.equal(failed.status.level, 'critical');
});

test('rover motion consumes finite energy and returns to dock on the route', () => {
  const simulation = new LunarBaseSimulation();
  const batteryBefore = simulation.snapshot().rover.batteryKWh;
  assert.equal(simulation.command('setRover', { active: true, speedMps: 2, gradeDeg: 8 }).ok, true);
  simulation.update(12);
  const moving = simulation.snapshot().rover;
  assert.equal(moving.active, true);
  assert.ok(moving.distanceM > 20);
  assert.ok(moving.batteryKWh < batteryBefore);
  assert.ok(moving.drivePowerKw > 0.34);
  assert.equal(simulation.command('returnRover').ok, true);
  simulation.update(75);
  const home = simulation.snapshot().rover;
  assert.equal(home.docked, true);
  assert.deepEqual(home.position, { x: 12, z: 15 });
});

test('ISRU improves water and oxygen reserves when its power is available', () => {
  const baseline = new LunarBaseSimulation();
  const extracting = new LunarBaseSimulation();
  baseline.command('setLighting', 'day');
  extracting.command('setLighting', 'day');
  extracting.command('setModule', { name: 'isru', enabled: true });
  baseline.update(12 * 3600);
  extracting.update(12 * 3600);
  const without = baseline.snapshot().lifeSupport;
  const withIsru = extracting.snapshot().lifeSupport;
  assert.ok(withIsru.waterKg > without.waterKg);
  assert.ok(withIsru.oxygenKg > without.oxygenKg);
  assert.ok(extracting.snapshot().power.loadKw > baseline.snapshot().power.loadKw);
});

test('commands validate payloads and reject occupied habitat shutdown', () => {
  const simulation = new LunarBaseSimulation();
  assert.equal(simulation.command('setModule', { name: 'habitat', enabled: false }).code, 'habitat_occupied');
  assert.equal(simulation.command('setFailure', 'unknown').ok, false);
  assert.equal(simulation.command('setTimeScale', 0).ok, false);
  assert.equal(simulation.command('setModule', { name: 'isru', enabled: true }).ok, true);
  assert.equal(simulation.snapshot().modules.isru.enabled, true);
  assert.throws(() => simulation.update(-1), RangeError);
  assert.throws(() => simulation.update(Number.POSITIVE_INFINITY), RangeError);
});
