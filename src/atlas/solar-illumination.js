import { BODY_ORIENTATION_MODELS } from './body-orientation-data.js';

export const ORIENTATION_SOURCE = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc';
const DEG = Math.PI / 180;
const OBLIQUITY = 23.4392911 * DEG;
const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/** UTC -> TT for the present, post-2017 leap-second table. TDB differs by <2 ms.
 * This is a cartographic IAU orientation, not high-precision spacecraft pointing.
 */
function ephemerisDays(date) {
  const time = Number(date);
  return Number.isFinite(time) ? (time - J2000_MS + 69184) / DAY_MS : NaN;
}

const polynomial = (coefficients, time) => coefficients.reduceRight((sum, value) => sum * time + value, 0);
const wrap = angle => ((angle % 360) + 360) % 360;

/** IAU pole and prime meridian evaluated at the date, including PCK periodic terms. */
export function bodyOrientationAngles(id, date = new Date()) {
  const model = BODY_ORIENTATION_MODELS[id], days = ephemerisDays(date);
  if (!model || !Number.isFinite(days)) return null;
  const centuries = days / 36525;
  let ra = polynomial(model.POLE_RA, centuries);
  let dec = polynomial(model.POLE_DEC, centuries);
  let primeMeridian = polynomial(model.PM, days);
  const stride = (model.PHASE_DEGREE || 1) + 1;
  for (let index = 0; index < (model.ANGLES?.length || 0) / stride; index++) {
    const phase = polynomial(model.ANGLES.slice(index * stride, (index + 1) * stride), centuries) * DEG;
    ra += (model.NUT_PREC_RA?.[index] || 0) * Math.sin(phase);
    dec += (model.NUT_PREC_DEC?.[index] || 0) * Math.cos(phase);
    primeMeridian += (model.NUT_PREC_PM?.[index] || 0) * Math.sin(phase);
  }
  return { raDeg:wrap(ra), decDeg:dec, primeMeridianDeg:wrap(primeMeridian) };
}

function equatorialToScene({x, y, z}) {
  return { x, y:-y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY), z:-y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY) };
}

/** Three.js sphere axes: +X is the map's central meridian, +Y north, -Z east.
 * Assumes a conventional equirectangular map with longitude zero at u=0.5.
 * Gas-giant texture clouds are archival features, not live cloud observations.
 */
export function bodyOrientationBasis(id, date = new Date()) {
  const angles = bodyOrientationAngles(id, date);
  if (!angles) return null;
  const ra = angles.raDeg * DEG, dec = angles.decDeg * DEG, w = angles.primeMeridianDeg * DEG;
  const node = { x:-Math.sin(ra), y:Math.cos(ra), z:0 };
  const across = { x:-Math.sin(dec) * Math.cos(ra), y:-Math.sin(dec) * Math.sin(ra), z:Math.cos(dec) };
  const north = { x:Math.cos(dec) * Math.cos(ra), y:Math.cos(dec) * Math.sin(ra), z:Math.sin(dec) };
  const prime = {}, minusEast = {};
  for (const axis of ['x', 'y', 'z']) {
    prime[axis] = node[axis] * Math.cos(w) + across[axis] * Math.sin(w);
    minusEast[axis] = node[axis] * Math.sin(w) - across[axis] * Math.cos(w);
  }
  return { x:equatorialToScene(prime), y:equatorialToScene(north), z:equatorialToScene(minusEast) };
}

/** Convert JPL heliocentric ecliptic kilometres into a unit Sunward scene vector. */
export function sunDirectionScene(position) {
  if (!position) return null;
  const length = Math.hypot(position.x, position.y, position.z);
  if (!Number.isFinite(length) || length <= 0) return null;
  return { x:-position.x / length, y:-position.z / length, z:position.y / length };
}

/** One solar direction per parent system; analytic Lambert illumination is
 * independent of the compressed scene distances and camera orientation.
 * The small night floor is a display aid, not measured reflected irradiance.
 */
export function createSolarIllumination({THREE, getHeliocentricPosition, nightFloor = .012, dayIntensity = 1.3}) {
  const parents = new Map(), materials = new Map(), atmospheres = new Map(), orientations = new Map(), roots = new Map();
  const matrix = new THREE.Matrix4(), x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
  let lastUpdate = -Infinity;

  function parent(id) {
    if (!parents.has(id)) parents.set(id, { value:new THREE.Vector3(1, 0, 0) });
    return parents.get(id);
  }

  function register(id, object) {
    if (!object) return;
    roots.set(object, id);
    const direction = parent(id);
    object.traverse(node => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material || materials.has(material)) continue;
        if (material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial) {
          const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
          material.onBeforeCompile = function(shader, renderer) {
            previousCompile.call(this, shader, renderer);
            shader.uniforms.relicSunDirection = direction;
            shader.uniforms.relicNightFloor = { value:nightFloor };
            shader.uniforms.relicDayIntensity = { value:dayIntensity };
            shader.fragmentShader = 'uniform vec3 relicSunDirection;\nuniform float relicNightFloor;\nuniform float relicDayIntensity;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
              vec3 relicSunView = normalize(mat3(viewMatrix) * relicSunDirection);
              float relicDaylight = max(dot(normalize(normal), relicSunView), 0.0);
              outgoingLight = diffuseColor.rgb * (relicNightFloor + relicDayIntensity * relicDaylight);
              #include <opaque_fragment>
            `);
          };
          material.customProgramCacheKey = function() { return previousKey.call(this) + ':relic-solar-lambert-v1'; };
          const onDispose = () => { materials.delete(material); material.removeEventListener('dispose', onDispose); };
          material.addEventListener('dispose', onDispose);
          materials.set(material, { previousCompile, previousKey, onDispose });
          material.needsUpdate = true;
        } else if (node === object.userData.atmosphere && material.isShaderMaterial && !atmospheres.has(material)) {
          const previousFragment = material.fragmentShader;
          material.uniforms.relicSunDirection = direction;
          material.fragmentShader = 'uniform vec3 relicSunDirection;\n' + previousFragment.replace('gl_FragColor=vec4(tint,edge*strength);', 'float day=max(dot(normalize(vNormal),normalize(mat3(viewMatrix)*relicSunDirection)),0.0);gl_FragColor=vec4(tint,edge*strength*(.04+.96*day));');
          atmospheres.set(material, previousFragment);
          material.needsUpdate = true;
        }
      }
    });
  }

  function registerOrientation(id, mesh) {
    if (BODY_ORIENTATION_MODELS[id]) orientations.set(mesh, id);
  }

  function applyBodyOrientation(mesh, id, date = new Date()) {
    const basis = bodyOrientationBasis(id, date);
    if (!basis) return false;
    x.set(basis.x.x, basis.x.y, basis.x.z); y.set(basis.y.x, basis.y.y, basis.y.z); z.set(basis.z.x, basis.z.y, basis.z.z);
    matrix.makeBasis(x, y, z); mesh.quaternion.setFromRotationMatrix(matrix);
    return true;
  }

  function update(date = new Date()) {
    const time = Number(date);
    if(!Number.isFinite(time))return;
    // Surface-detail tiles can appear after their parent was registered.
    for (const [object, id] of roots) register(id, object);
    if(Math.abs(time-lastUpdate)<100)return;
    for (const [id, uniform] of parents) {
      const direction = sunDirectionScene(getHeliocentricPosition(id, date));
      if (direction) uniform.value.set(direction.x, direction.y, direction.z);
    }
    for (const [mesh, id] of orientations) applyBodyOrientation(mesh, id, date);
    lastUpdate = time;
  }

  return { register, registerOrientation, applyBodyOrientation, update,
    dispose() {
      for (const [material, original] of materials) { material.onBeforeCompile = original.previousCompile; material.customProgramCacheKey = original.previousKey; material.removeEventListener('dispose', original.onDispose); material.needsUpdate = true; }
      for (const [material, fragment] of atmospheres) { material.fragmentShader = fragment; delete material.uniforms.relicSunDirection; material.needsUpdate = true; }
      materials.clear(); atmospheres.clear(); parents.clear(); orientations.clear(); roots.clear();
    }
  };
}
