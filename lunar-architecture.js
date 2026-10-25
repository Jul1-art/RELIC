/**
 * Conceptual lunar outpost, in metres. The scene is an engineering illustration,
 * not a certified pressure vessel or a source of mission telemetry.
 *
 * buildArchitecture(scene, THREE) returns:
 *   focusPoints  camera presets keyed by habitat, greenhouse, science, airlock,
 *                solar, rover, comms and landing;
 *   pickables    major meshes tagged with userData.focus for the host raycaster;
 *   update(dt, time, state)  animate airlock, arrays, rover and equipment. State
 *                supports airlock, airlockPhase, solar, rover, night, focus;
 *   setInteriorMode(key | false)  replace the target pressure shell with a
 *                lower-half cutaway for inspection (habitat/greenhouse/science);
 *   interiorFocusPoints  camera presets for top/front inspection of each room;
 *   components   references to root, modules, doors, solarPivots, rover, lights.
 *
 * The airlock animation always keeps one hatch shut before opening the other.
 */
export function buildArchitecture(scene, THREE) {
  const root = new THREE.Group();
  root.name = 'Lunar outpost architecture';
  scene.add(root);

  const focusPoints = {
    habitat: { point: [0, 2.2, -3], eye: [8.2, 6.4, 6.8], title: 'Habitat' },
    greenhouse: { point: [-11, 2, -3], eye: [-15.8, 5.3, 5.9], title: 'Serre' },
    science: { point: [11, 2, -3], eye: [17, 5.4, 5], title: 'Laboratoire' },
    airlock: { point: [0, 1.8, 5.4], eye: [7, 4.6, 12.8], title: 'Sas' },
    solar: { point: [-23, 1.8, -11], eye: [-34, 8.1, -1], title: 'Énergie' },
    rover: { point: [12, 1.3, 15], eye: [18.5, 5, 21.5], title: 'Rover' },
    comms: { point: [-24, 4, 16], eye: [-32, 9, 22], title: 'Communications' },
    landing: { point: [30, 2, 21], eye: [40, 10, 34], title: 'Atterrissage' },
    overview: { point: [1, 1.7, 1], eye: [29, 24, 40], title: 'Vue d’ensemble' }
  };
  const interiorFocusPoints = {
    habitat: { point: [0, 1.75, -3], eye: [8, 6.5, 3], title: 'Habitat · intérieur' },
    greenhouse: { point: [-11, 1.75, -3], eye: [-3, 6.5, 3], title: 'Serre · intérieur' },
    science: { point: [11, 1.75, -3], eye: [19, 6.5, 3], title: 'Laboratoire · intérieur' },
    airlock: { point: [0, 1.77, 5.25], eye: [4.2, 5.5, 11.2], title: 'Sas · intérieur' }
  };
  const pickables = [];
  const modules = {};
  const solarPivots = [];
  const roverWheels = [];
  const warningLights = [];
  const indicatorLights = [];
  const allLights = [];
  const siteSpotlights = [];
  const shared = {};

  const mat = (color, metalness = 0, roughness = .7, extras = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extras });
  const ceramic = mat(0xe1e1d7, .08, .71, { emissive: 0x292b28, emissiveIntensity: .19 });
  const pressureWhite = mat(0xe0e5df, .16, .69, { emissive: 0x29302e, emissiveIntensity: .32 });
  const alloy = mat(0x727d82, .73, .36);
  const graphite = mat(0x252e34, .45, .65);
  const softBlack = mat(0x131b22, .32, .62);
  const gasket = mat(0x343936, .18, .9);
  const gold = mat(0xb2945e, .69, .36);
  const blanket = mat(0xd9cfb9, .03, .96, { side: THREE.DoubleSide,
    emissive: 0x393329, emissiveIntensity: .3 });
  const bermMaterial = mat(0x767570, .03, 1, { flatShading: true });
  const blue = mat(0x4e849b, .12, .67, { emissive: 0x1c4152, emissiveIntensity: .34 });
  const screen = mat(0x173b48, .12, .27, { emissive: 0x397a8a, emissiveIntensity: .8 });
  const copper = mat(0x9b775b, .63, .43);
  const rubber = mat(0x272928, .05, .94);
  const floorMat = mat(0x899395, .1, .84, { emissive: 0x1f2526, emissiveIntensity: .15 });
  const leafMat = mat(0x53846b, .02, .83, { side: THREE.DoubleSide });
  const fruitMat = mat(0xc88f6a, .02, .77);
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x6692a5, metalness: .13, roughness: .13,
    transmission: .18, transparent: true, opacity: .62, depthWrite: false, side: THREE.DoubleSide });
  const windowMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc3cd, metalness: .1, roughness: .13,
    transmission: .36, transparent: true, opacity: .68, depthWrite: false, side: THREE.DoubleSide });
  const panelCell = mat(0x152c4e, .32, .25, { emissive: 0x0b1930, emissiveIntensity: .2 });
  const cleanPanelColor = new THREE.Color(0x152c4e);
  const dustyPanelColor = new THREE.Color(0x77746c);
  const lum = color => new THREE.MeshBasicMaterial({ color });
  const lightWarm = lum(0xffe3ac);
  const lightCool = lum(0xb9f1e5);
  const lightRed = lum(0xff815f);

  const add = (parent, geometry, material, xyz = [0, 0, 0], shadows = true) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...xyz);
    const size = geometry.parameters || {};
    const majorForm = geometry.type === 'BoxGeometry'
      ? Math.min(size.width, size.height, size.depth) > .13
      : geometry.type === 'SphereGeometry' ? size.radius > .25
        : geometry.type === 'CylinderGeometry'
          ? Math.max(size.radiusTop, size.radiusBottom) > .16 && size.height > .2
          : false;
    // Thin seals, wires, lettering strokes and LEDs have negligible shadows but
    // would each add a separate shadow-map draw call on low-power devices.
    object.castShadow = shadows && !material.transparent && majorForm;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (parent, size, xyz, material, shadows = true) =>
    add(parent, new THREE.BoxGeometry(...size), material, xyz, shadows);
  const cylinder = (parent, rt, rb, height, xyz, material, segments = 32) =>
    add(parent, new THREE.CylinderGeometry(rt, rb, height, segments), material, xyz);
  const sphere = (parent, radius, xyz, material, detail = 16) =>
    add(parent, new THREE.SphereGeometry(radius, detail, Math.max(10, Math.floor(detail * .65))), material, xyz);
  const ring = (parent, radius, tube, xyz, material, rotation = [0, 0, 0]) => {
    const item = add(parent, new THREE.TorusGeometry(radius, tube, 8, 40), material, xyz);
    item.rotation.set(...rotation);
    return item;
  };
  const rod = (parent, a, b, radius, material, sides = 10) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const vector = end.clone().sub(start);
    const item = add(parent, new THREE.CylinderGeometry(radius, radius, vector.length(), sides), material,
      start.add(end).multiplyScalar(.5).toArray());
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    return item;
  };
  const cable = (parent, points, radius = .025, material = softBlack) => add(parent,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))),
      Math.max(12, points.length * 7), radius, 5, false), material, [0, 0, 0], false);
  const selectable = (mesh, key) => { mesh.userData.focus = key; pickables.push(mesh); return mesh; };
  const groupAt = (parent, name, xyz) => {
    const group = new THREE.Group(); group.name = name; group.position.set(...xyz); parent.add(group); return group;
  };
  const pointLight = (parent, color, intensity, distance, xyz) => {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(...xyz); parent.add(light); allLights.push(light); return light;
  };
  const label = (parent, name, xyz, width = .98) => {
    // Small graphic plate. Lettering is supplied by the host UI to keep WebGL crisp.
    const plate = box(parent, [width, .21, .018], xyz, graphite, false);
    box(parent, [.035, .12, .019], [xyz[0] - width * .34, xyz[1], xyz[2] + .013], lightCool, false);
    plate.name = name;
    return plate;
  };

  function hatch(parent, xyz, axis = 'x', radius = 1.01, key = null) {
    // Inflatable hatch seals are represented by a thick annular rim and gasket.
    const group = groupAt(parent, 'Hatch pressure ring', xyz);
    if (axis === 'x') group.rotation.y = Math.PI / 2;
    if (axis === 'y') group.rotation.x = Math.PI / 2;
    ring(group, radius, .095, [0, 0, 0], alloy);
    ring(group, radius * .83, .065, [0, 0, .012], gasket);
    const bolts = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 8, 6), gold, 12);
    const boltPose = new THREE.Object3D();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      boltPose.position.set(Math.cos(a) * radius, Math.sin(a) * radius, .09);
      boltPose.updateMatrix(); bolts.setMatrixAt(i, boltPose.matrix);
    }
    bolts.instanceMatrix.needsUpdate = true;
    bolts.castShadow = false;
    group.add(bolts);
    if (key) selectable(group.children[0], key);
    return group;
  }

  function makeModule(key, center, length, radius, interior) {
    const g = groupAt(root, `${key} pressure module`, center);
    const shellY = 2.33;
    // Horizontal aluminium/composite pressure shell. The lower inspection shell
    // is normally hidden and is a visual cut only; its pressure state is simulated.
    const fullShell = add(g, new THREE.CylinderGeometry(radius, radius, length, 48, 1, true), pressureWhite,
      [0, shellY, 0]);
    fullShell.rotation.z = Math.PI / 2;
    const ghostShell = fullShell.clone();
    ghostShell.material = mat(0xc9dedc, .06, .46, { transparent: true,
      opacity: .13, depthWrite: false, side: THREE.DoubleSide });
    ghostShell.castShadow = false;
    ghostShell.visible = false;
    ghostShell.userData = {};
    g.add(ghostShell);
    const cutShell = add(g,
      new THREE.CylinderGeometry(radius, radius, length, 48, 1, true, Math.PI, Math.PI),
      pressureWhite, [0, shellY, 0]);
    cutShell.rotation.z = Math.PI / 2;
    cutShell.visible = false;
    selectable(fullShell, key);
    selectable(cutShell, key);
    // Soft thermal blankets, stiffening hoops, and pressure-rated bulkheads.
    const ribs = [];
    for (let x = -length / 2 + .7; x <= length / 2 - .6; x += 1.15) ribs.push(x);
    const hoopBatch = new THREE.InstancedMesh(new THREE.TorusGeometry(radius + .018, .043, 8, 40), alloy, ribs.length);
    const ribPose = new THREE.Object3D();
    ribs.forEach((x, i) => {
      ribPose.position.set(x, shellY, 0); ribPose.rotation.set(0, Math.PI / 2, 0);
      ribPose.updateMatrix(); hoopBatch.setMatrixAt(i, ribPose.matrix);
    });
    hoopBatch.instanceMatrix.needsUpdate = true;
    hoopBatch.castShadow = false;
    g.add(hoopBatch);
    for (const x of [-length / 2, length / 2]) {
      ring(g, radius, .17, [x, shellY, 0], graphite, [0, Math.PI / 2, 0]);
      // Annular pressure bulkhead closes the shell between the hatch throat and
      // full module radius; the central aperture mates with the connector.
      const bulkhead = add(g, new THREE.RingGeometry(.97, radius, 48), pressureWhite,
        [x, shellY, 0]);
      bulkhead.rotation.y = Math.sign(x) * Math.PI / 2;
      hatch(g, [x + Math.sign(x) * .055, shellY, 0], 'x', .97, key);
    }
    const outerBlanket = add(g,
      new THREE.CylinderGeometry(radius + .045, radius + .045, length - .55, 44, 1, true, Math.PI, Math.PI),
      blanket, [0, shellY, 0]);
    outerBlanket.rotation.z = Math.PI / 2;
    // Segmented micrometeoroid/thermal covers on the sunward side. Narrow gaps
    // reveal the pressure hoops and keep the massing legible from orbit view.
    const armorPanels = [];
    for (let i = -1; i <= 1; i++) {
      const panel = add(g,
        new THREE.CylinderGeometry(radius + .105, radius + .105, length * .27,
          28, 1, true, Math.PI * .055, Math.PI * .37),
        ceramic, [i * length * .31, shellY, 0]);
      panel.rotation.z = Math.PI / 2;
      panel.castShadow = false;
      armorPanels.push(panel);
      box(g, [length * .24, .11, .08], [i * length * .31,
        shellY + radius * .43, radius * .92], alloy, false);
    }
    // Lower dust berm is shaped without pretending a transparent unshielded dome
    // would protect a sleeping crew from solar particle events.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = -length * .42 + i * length * .21;
        const mound = sphere(g, .92, [x, .36, side * (radius + .55)], bermMaterial, 9);
        mound.scale.set(1.18, .47, .77);
        mound.castShadow = false;
      }
    }
    // Floor legs are clamped to a level prepared landing surface.
    for (const x of [-length * .38, length * .38]) {
      for (const z of [-1.35, 1.35]) {
        box(g, [.34, .59, .38], [x, .34, z], alloy);
        box(g, [.76, .1, .62], [x, .04, z], graphite);
      }
    }
    box(g, [length - .47, .12, radius * 1.47], [0, .7, 0], floorMat);
    for (let x = -length / 2 + .55; x < length / 2 - .3; x += .72) {
      box(g, [.03, .01, radius * 1.44], [x, .768, 0], alloy, false);
    }
    // Ceiling utility trunk with isolated lighting runs.
    box(g, [length - .45, .15, .32], [0, shellY + radius - .22, 0], graphite);
    for (let x = -length / 2 + 1.1; x <= length / 2 - 1.1; x += 1.4) {
      box(g, [.75, .035, .19], [x, shellY + radius - .31, 0], lightCool, false);
    }
    pointLight(g, 0xdaf6ed, 8, 8, [0, shellY + radius - .31, 0]);
    // External numbered manifold and radial coolant pipes.
    box(g, [length * .4, .24, .2], [0, 1.17, radius + .03], graphite);
    for (const z of [-.18, .18]) {
      cable(g, [[-length / 2 + .55, 1.12, radius + z], [0, 1.12, radius + z],
        [length / 2 - .55, 1.12, radius + z]], .035, copper);
    }
    label(g, key.toUpperCase(), [0, 1.68, radius + .08], 1.15);
    interior(g, length, radius);
    modules[key] = { group: g, fullShell, ghostShell, cutShell, outerBlanket, armorPanels,
      hoopBatch, radius, length };
    return g;
  }

  function habitatInterior(g, length, radius) {
    // Bunks use restraints; lunar gravity alone is too weak to keep loose objects
    // reliably located during vigorous crew activity.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const x = -2.95 + i * 2.35;
        const z = side * 1.13;
        box(g, [1.95, .12, .88], [x, 1.18, z], alloy);
        box(g, [1.76, .1, .69], [x, 1.3, z], blue);
        box(g, [.38, .14, .54], [x - .56, 1.41, z], ceramic);
        box(g, [1.48, .018, .04], [x, 1.45, z - side * .28], gold, false);
        box(g, [1.52, .055, .78], [x, 1.82, z], graphite);
        label(g, 'CREW BERTH', [x, 1.97, z - side * .42], .7);
      }
    }
    // Galley and water recovery: blue gauges, hose, air purifier.
    box(g, [1.46, 1.52, .51], [3.45, 1.53, -.92], ceramic);
    box(g, [1.03, .52, .04], [3.45, 1.92, -.63], screen, false);
    for (let i = 0; i < 4; i++) box(g, [.14, .24, .08], [2.98 + i * .31, 1.22, -.62], alloy);
    cylinder(g, .38, .38, .58, [2.92, 1.06, .91], copper, 16);
    cylinder(g, .36, .36, .58, [3.84, 1.06, .91], blue, 16);
    cable(g, [[2.92, 1.3, .91], [3.26, 1.86, 1], [3.84, 1.35, .91]], .034, graphite);
    // Folded central mess/work table, with instrument rather than loose utensils.
    box(g, [1.6, .07, .93], [.8, 1.46, 0], ceramic);
    for (const x of [.16, 1.44]) rod(g, [x, .77, 0], [x, 1.43, 0], .055, alloy);
    box(g, [.54, .03, .34], [.8, 1.51, 0], screen, false);
    for (const x of [-.1, 1.7]) {
      const seat = box(g, [.42, .09, .6], [x, 1.05, 0], graphite);
      seat.rotation.y = Math.PI / 2;
      box(g, [.09, .62, .6], [x + Math.sign(x - .8) * .2, 1.36, 0], alloy);
    }
    // Shallow observation cupola with radiation shutters and structural webs.
    const cupola = groupAt(g, 'Shielded observation cupola', [1.65, 4.34, 0]);
    cylinder(cupola, 1.12, 1.21, .44, [0, .09, 0], alloy, 32);
    const glass = add(cupola, new THREE.SphereGeometry(1.04, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      windowMat, [0, .23, 0], false);
    glass.name = 'Observation glazing';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      rod(cupola, [Math.cos(a) * 1.07, .21, Math.sin(a) * 1.07], [0, 1.3, 0], .029, ceramic, 7);
    }
    ring(cupola, 1.11, .11, [0, .2, 0], graphite, [Math.PI / 2, 0, 0]);
    const shutters = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const shutter = add(cupola, new THREE.SphereGeometry(1.105, 12, 8, a, Math.PI / 2 - .05,
        0, Math.PI / 2), blanket, [0, .23, 0]);
      shutter.visible = false;
      shutters.push(shutter);
    }
    modules.habitatShutters = shutters;
  }

  function greenhouseInterior(g, length) {
    // Enclosed hydroponics, not an unprotected giant greenhouse: plants grow under
    // regulated LEDs and use contained nutrient loops.
    const soil = mat(0x615c4a, 0, .95);
    const stems = [], leaves = [], fruits = [];
    for (const side of [-1, 1]) {
      const z = side * 1.1;
      for (const level of [1.12, 2.42]) {
        box(g, [length - 1.3, .15, .83], [0, level, z], ceramic);
        box(g, [length - 1.45, .035, .69], [0, level + .085, z], soil, false);
        box(g, [length - 1.28, .04, .76], [0, level + .8, z], lightWarm, false);
        for (let i = 0; i < 13; i++) {
          const x = -length / 2 + .79 + i * (length - 1.55) / 12;
          stems.push([x, level + .235, z]);
          for (const s of [-1, 1]) {
            leaves.push([x + .1 * s, level + .34, z + s * .11, s * .45]);
          }
          if (i % 3 === 1) fruits.push([x, level + .24, z + side * .13]);
        }
      }
      for (let i = -1; i <= 1; i++) rod(g, [i * 2.6, .77, z], [i * 2.6, 3.39, z], .045, alloy);
    }
    const vegetationBatch = (positions, geometry, material, poseFn) => {
      const batch = new THREE.InstancedMesh(geometry, material, positions.length);
      const pose = new THREE.Object3D();
      positions.forEach((item, i) => {
        pose.position.set(item[0], item[1], item[2]);
        pose.rotation.set(0, 0, 0); pose.scale.set(1, 1, 1);
        if (poseFn) poseFn(pose, item);
        pose.updateMatrix(); batch.setMatrixAt(i, pose.matrix);
      });
      batch.instanceMatrix.needsUpdate = true; batch.castShadow = false; g.add(batch);
    };
    vegetationBatch(stems, new THREE.CylinderGeometry(.026, .026, .29, 6), leafMat);
    vegetationBatch(leaves, new THREE.SphereGeometry(.16, 8, 6), leafMat, (pose, item) => {
      pose.scale.set(.55, .23, 1.25); pose.rotation.y = item[3];
    });
    vegetationBatch(fruits, new THREE.SphereGeometry(.055, 8, 6), fruitMat);
    // Blue nutrient and water lines, oxygen buffer and filtration cylinder.
    cable(g, [[-3.4, 1.05, -1.64], [0, 1.05, -1.64], [3.4, 1.05, -1.64]], .045, blue);
    cable(g, [[-3.4, 2.4, 1.64], [0, 2.4, 1.64], [3.4, 2.4, 1.64]], .04, copper);
    cylinder(g, .39, .39, 1.13, [3.37, 1.36, 0], pressureWhite, 20);
    ring(g, .39, .07, [3.37, 1.83, 0], graphite, [Math.PI / 2, 0, 0]);
    box(g, [.82, .5, .13], [-3.38, 2.33, 0], screen, false);
    // Small service cupola, normally protected by closed regolith shutters.
    const cupola = groupAt(g, 'Greenhouse service cupola', [-.9, 4.62, 0]);
    cylinder(cupola, .75, .84, .4, [0, .06, 0], graphite, 24);
    add(cupola, new THREE.SphereGeometry(.73, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      windowMat, [0, .2, 0], false);
    ring(cupola, .78, .08, [0, .2, 0], alloy, [Math.PI / 2, 0, 0]);
    box(cupola, [1.3, .08, .2], [0, .65, 0], blanket);
  }

  function scienceInterior(g, length) {
    // Glovebox and assay bench are enclosed to reduce dust contamination.
    for (const side of [-1, 1]) {
      const z = side * 1.13;
      for (const x of [-2.4, 0, 2.4]) {
        box(g, [1.8, .13, .73], [x, 1.18, z], ceramic);
        box(g, [1.7, .59, .67], [x, 1.57, z], side > 0 ? windowMat : graphite, false);
        box(g, [1.64, .08, .7], [x, 1.94, z], alloy);
        if (side > 0) {
          for (const hand of [-.41, .41]) {
            ring(g, .17, .035, [x + hand, 1.48, z + .355], gasket);
            sphere(g, .13, [x + hand, 1.48, z + .39], softBlack, 10).scale.z = .3;
          }
        } else {
          box(g, [1.43, .5, .06], [x, 1.59, z + .37], screen, false);
          for (let j = -1; j <= 1; j++) box(g, [.31, .05, .07], [x + j * .4, 1.23, z + .38], lightCool, false);
        }
      }
    }
    // Isolated sample vault, microscope optics, medical analyzer and lockers.
    cylinder(g, .33, .4, 1.23, [3.13, 1.44, -.02], graphite, 16);
    sphere(g, .34, [3.13, 2.09, -.02], windowMat, 16);
    rod(g, [2.33, 1.9, 0], [2.53, 1.33, 0], .056, alloy);
    box(g, [.46, .18, .29], [2.58, 1.3, 0], graphite);
    for (const x of [-3.4, -2.7]) {
      box(g, [.55, 1.48, .55], [x, 1.55, 0], pressureWhite);
      box(g, [.37, .26, .02], [x, 1.9, .29], screen, false);
    }
    label(g, 'SAMPLE ISOLATION', [0, 2.12, 1.65], 1.45);
    // Shielded specimen/sky observation cupola. A narrow aperture has much less
    // exposed glazing than a full transparent pressure dome.
    const cupola = groupAt(g, 'Laboratory shielded cupola', [-1.53, 4.5, 0]);
    cylinder(cupola, .82, .88, .34, [0, .03, 0], graphite, 24);
    add(cupola, new THREE.SphereGeometry(.79, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      windowMat, [0, .19, 0], false);
    ring(cupola, .83, .075, [0, .18, 0], alloy, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      rod(cupola, [Math.cos(a) * .79, .2, Math.sin(a) * .79], [0, .95, 0], .024, ceramic, 6);
    }
    box(cupola, [1.17, .07, .17], [0, .71, 0], blanket);
  }

  makeModule('greenhouse', [-11, 0, -3], 7.6, 2.24, greenhouseInterior);
  makeModule('habitat', [0, 0, -3], 10.2, 2.3, habitatInterior);
  makeModule('science', [11, 0, -3], 7.8, 2.2, scienceInterior);

  function tunnel(name, from, to, radius, focusKey) {
    const g = groupAt(root, name, [0, 0, 0]);
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const length = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(.5);
    const shell = add(g, new THREE.CylinderGeometry(radius, radius, length, 28, 1, true),
      pressureWhite, mid.toArray());
    const direction = b.clone().sub(a).normalize();
    shell.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    selectable(shell, focusKey);
    for (let t = .03; t <= .97; t += .16) {
      const p = a.clone().lerp(b, t);
      const item = ring(g, radius + .025, .055, p.toArray(), graphite);
      item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
    const deck = box(g, [length - .08, .11, radius * 1.42], [mid.x, .74, mid.z], floorMat);
    deck.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    // Pinched feed-through flexible hose at the exterior pressure rings.
    const hosePts = [a.toArray(), mid.toArray(), b.toArray()].map(([x, y, z]) => [x, y + radius * .73, z + .06]);
    cable(g, hosePts, .04, copper);
    return g;
  }
  tunnel('West pressure connector', [-7.2, 2.33, -3], [-5.1, 2.33, -3], 1.13, 'greenhouse');
  tunnel('East pressure connector', [5.1, 2.33, -3], [7.1, 2.33, -3], 1.13, 'science');
  const evaConnector = tunnel('EVA pressure connector', [0, 1.87, -.7], [0, 1.87, 2.7], 1.08, 'airlock');

  function makeAirlock() {
    const g = groupAt(root, 'Dual-door EVA airlock', [0, 0, 5.25]);
    // Prepared raised slab, multilayer walls, outer thermal blanket and dust porch.
    box(g, [3.6, .31, 5.1], [0, .3, 0], graphite);
    box(g, [3.22, .1, 4.64], [0, .56, 0], floorMat);
    for (const x of [-1.62, 1.62]) box(g, [.24, 3.08, 4.77], [x, 2.12, 0], pressureWhite);
    const roof = box(g, [3.63, .31, 5.1], [0, 3.72, 0], blanket);
    selectable(roof, 'airlock');
    for (const z of [-2.37, 2.37]) {
      for (const x of [-1.18, 1.18]) box(g, [.58, 2.82, .22], [x, 2.05, z], pressureWhite);
      box(g, [3.6, .44, .22], [0, 3.51, z], alloy);
      hatch(g, [0, 2.02, z], 'z', 1.03, 'airlock');
    }
    for (const x of [-.96, .96]) {
      box(g, [.5, .28, 1.6], [x, .92, .45], ceramic);
      box(g, [.52, 1.04, .38], [x, 1.8, -.7], graphite);
      cylinder(g, .19, .19, 1.19, [x, 1.39, -.71], gold, 12);
      sphere(g, .28, [x, 2.03, -.7], ceramic, 12);
    }
    // Dust extraction manifold with visible filters and a pressure gauge.
    for (let i = 0; i < 3; i++) cylinder(g, .16, .16, .75, [-1.37, 1.21, -.7 + i * .65], blue, 12);
    box(g, [.6, .62, .12], [1.5, 2.56, 1.65], screen, false);
    box(g, [2.15, .08, .16], [0, 3.45, 0], lightCool, false);
    pointLight(g, 0xd7eee7, 6, 6, [0, 3.3, 0]);
    const doors = {};
    for (const [which, z] of [['inner', -2.39], ['outer', 2.39]]) {
      const leaves = [];
      for (const sign of [-1, 1]) {
        const leaf = box(g, [.95, 2.26, .13], [sign * .48, 1.94, z], ceramic);
        box(leaf, [.12, 1.1, .021], [-sign * .25, -.04, .077], graphite, false);
        const port = sphere(leaf, .21, [0, .35, .071], windowMat, 12);
        port.scale.z = .12;
        leaves.push({ mesh: leaf, sign, closedX: sign * .48, openX: sign * 1.44 });
      }
      doors[which] = leaves;
      const beacon = sphere(g, .07, [1.31, 3.22, z + (which === 'outer' ? .14 : -.14)], lightRed, 10);
      warningLights.push(beacon);
    }
    for (const x of [-1.3, 1.3]) {
      rod(g, [x, .4, 2.5], [x, .09, 4.1], .044, alloy);
      box(g, [1.2, .11, 1.4], [x, .12, 3.9], graphite);
    }
    for (let z = 2.67; z < 4.35; z += .28) box(g, [2.8, .018, .03], [0, .21, z], lightWarm, false);
    label(g, 'EVA AIRLOCK', [0, 3.29, 2.51], 1.28);
    return { group: g, doors, roof };
  }
  const airlock = makeAirlock();

  function solarField() {
    const solar = groupAt(root, 'Deployable solar farm', [-24, 0, -11]);
    const eastGroup = groupAt(root, 'East solar farm', [25, 0, -17]);
    const frameSize = [3.5, .12, 2.12];
    for (const field of [solar, eastGroup]) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const mount = groupAt(field, 'Solar tracking mount', [-5.25 + i * 3.5, 0, side * 3.55]);
          cylinder(mount, .17, .31, 1.4, [0, .73, 0], alloy, 12);
          cylinder(mount, .31, .31, .11, [0, .06, 0], graphite, 12);
          rod(mount, [-1.6, 1.48, 0], [1.6, 1.48, 0], .065, alloy);
          const pivot = groupAt(mount, 'Solar tilt axis', [0, 1.56, 0]);
          pivot.rotation.x = -.31;
          solarPivots.push(pivot);
          box(pivot, frameSize, [0, 0, 0], alloy);
          selectable(box(pivot, [3.28, .02, 1.89], [0, .071, 0], panelCell, false), 'solar');
          const grid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), copper, 8);
          const line = new THREE.Object3D();
          let gridIndex = 0;
          for (let j = -2; j <= 2; j++) {
            line.position.set(j * .55, .084, 0); line.scale.set(.014, .026, 1.88);
            line.updateMatrix(); grid.setMatrixAt(gridIndex++, line.matrix);
          }
          for (let j = -1; j <= 1; j++) {
            line.position.set(0, .085, j * .47); line.scale.set(3.27, .026, .012);
            line.updateMatrix(); grid.setMatrixAt(gridIndex++, line.matrix);
          }
          grid.instanceMatrix.needsUpdate = true; grid.castShadow = false; pivot.add(grid);
          box(pivot, [3.58, .055, .075], [0, -.045, -1.08], ceramic);
          box(pivot, [3.58, .055, .075], [0, -.045, 1.08], ceramic);
          cable(mount, [[0, 1.51, .1], [.46, 1.2, .7], [.5, .18, .75]], .028, softBlack);
        }
      }
    }
    // Independent cable trunks to storage and habitat. Rectifier and battery units
    // are shielded, elevated above the surface, and visibly serviceable.
    cable(root, [[-24, .11, -11], [-20, .12, -8], [-17, .17, -5], [-15, .3, -3]], .095, softBlack);
    cable(root, [[25, .11, -17], [25, .12, -12], [22, .12, -8], [16, .18, -5]], .095, softBlack);
    const battery = groupAt(root, 'Battery and power conditioning shelter', [-18, 0, -4]);
    box(battery, [3.8, 2.3, 2.45], [0, 1.22, 0], ceramic);
    selectable(box(battery, [3.9, .24, 2.6], [0, 2.49, 0], blanket), 'solar');
    for (let x = -1.38; x <= 1.38; x += .92) {
      box(battery, [.72, 1.56, .09], [x, 1.19, 1.28], graphite);
      box(battery, [.49, .22, .015], [x, 1.73, 1.336], screen, false);
      for (let i = 0; i < 3; i++) box(battery, [.49, .015, .02], [x, .74 + i * .13, 1.34], alloy, false);
    }
    label(battery, 'POWER', [0, 2.22, 1.33], 1.1);
    return { group: solar, eastGroup, battery };
  }
  const solar = solarField();

  function roverModel() {
    const g = groupAt(root, 'Pressurized lunar rover', [12, 0, 15]);
    // Six wheel rocker-bogie layout. Meshes rotate; suspension remains schematic.
    box(g, [3.55, .42, 2.23], [0, 1.12, 0], alloy);
    selectable(box(g, [2.83, 1.36, 1.91], [.22, 1.93, 0], ceramic), 'rover');
    box(g, [1.9, .75, .045], [-.3, 2.13, 1], windowMat, false);
    box(g, [1.13, .73, .048], [1.61, 2.15, 0], windowMat, false).rotation.y = Math.PI / 2;
    box(g, [1.6, .06, .82], [-.8, 2.66, -.08], panelCell, false);
    for (const side of [-1, 1]) {
      const z = side * 1.27;
      rod(g, [-1.7, 1.0, z], [1.7, 1.0, z], .09, alloy);
      for (const x of [-1.44, 0, 1.44]) {
        rod(g, [x, 1.04, z], [x, .61, z * 1.1], .085, graphite);
        const wheel = add(g, new THREE.CylinderGeometry(.46, .46, .28, 18), rubber,
          [x, .47, z * 1.2]);
        wheel.rotation.x = Math.PI / 2;
        roverWheels.push(wheel);
        const hub = add(g, new THREE.CylinderGeometry(.21, .21, .291, 14), alloy,
          [x, .47, z * 1.2]);
        hub.rotation.x = Math.PI / 2;
        ring(g, .36, .034, [x, .47, z * 1.2 + side * .147], graphite);
      }
    }
    // Regolith sampling arm; joints and wrist are visible when zoomed.
    const shoulder = groupAt(g, 'Rover sample manipulator', [1.56, 1.48, -1.05]);
    sphere(shoulder, .18, [0, 0, 0], alloy, 12);
    rod(shoulder, [0, 0, 0], [.65, -.13, -.53], .083, alloy);
    sphere(shoulder, .13, [.65, -.13, -.53], graphite, 12);
    rod(shoulder, [.65, -.13, -.53], [1.17, -.52, -.73], .056, alloy);
    box(shoulder, [.27, .12, .14], [1.23, -.53, -.73], gold);
    cylinder(g, .055, .065, .92, [-1.26, 3.07, -.67], alloy, 10);
    sphere(g, .17, [-1.26, 3.6, -.67], graphite, 12);
    for (const x of [-1.85, 1.84]) {
      box(g, [.12, .17, .14], [x, 1.07, -.7], lightWarm, false);
      box(g, [.12, .17, .14], [x, 1.07, .7], lightRed, false);
    }
    label(g, 'LUNAR ROVER', [.35, 1.48, 1.13], 1.16);
    return g;
  }
  const rover = roverModel();

  function communications() {
    const g = groupAt(root, 'Earth relay communications mast', [-24, 0, 16]);
    box(g, [2.9, .24, 2.9], [0, .14, 0], graphite);
    for (const [x, z] of [[-1.1, -1.1], [-1.1, 1.1], [1.1, -1.1], [1.1, 1.1]]) {
      rod(g, [x, .25, z], [0, 7.34, 0], .056, alloy);
    }
    for (const y of [1.7, 3.4, 5.1]) {
      box(g, [1.42, .055, 1.42], [0, y, 0], alloy);
      for (const side of [-1, 1]) rod(g, [side * .67, y, -.67], [side * .23, y + 1.6, -.23], .027, graphite);
    }
    const dishMount = groupAt(g, 'Two-axis high-gain dish', [0, 7.15, 0]);
    cylinder(dishMount, .29, .33, .55, [0, .13, 0], alloy, 16);
    const dish = groupAt(dishMount, 'Directional reflector', [0, .43, 0]);
    dish.rotation.x = -.35;
    // Thin parabolic dish: radial aluminium ribs and reflective mesh.
    const bowl = add(dish,
      new THREE.SphereGeometry(2.06, 28, 12, 0, Math.PI * 2, 0, .79),
      mat(0xc3c5bf, .7, .34, { side: THREE.DoubleSide }), [0, -.52, 0]);
    selectable(bowl, 'comms');
    ring(dish, 1.43, .044, [0, .96, 0], graphite, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      rod(dish, [0, 1.53, 0], [Math.cos(a) * 1.43, .96, Math.sin(a) * 1.43], .018, alloy, 6);
    }
    rod(dish, [0, .8, 0], [0, 2.25, 0], .035, graphite);
    sphere(dish, .13, [0, 2.25, 0], gold, 10);
    const omni = groupAt(g, 'Backup omnidirectional antenna', [1.78, 3.17, 0]);
    cylinder(omni, .035, .035, 4.2, [0, 2.1, 0], alloy, 8);
    sphere(omni, .13, [0, 4.2, 0], lightCool, 10);
    warningLights.push(sphere(g, .105, [0, 7.53, 0], lightRed, 10));
    cable(root, [[-23.9, .15, 15.4], [-20, .12, 11], [-14, .12, 6], [-5, .12, -1]], .07, softBlack);
    return { group: g, dishMount };
  }
  const comms = communications();

  function landerAndPad() {
    const g = groupAt(root, 'Dust-separated landing zone', [30, 0, 21]);
    const pad = cylinder(g, 8.2, 8.4, .22, [0, .14, 0], mat(0x5c6260, .16, .89), 64);
    selectable(pad, 'landing');
    ring(g, 7.55, .1, [0, .29, 0], ceramic, [Math.PI / 2, 0, 0]);
    ring(g, 5.38, .045, [0, .29, 0], gold, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const x = Math.cos(a) * 7.4, z = Math.sin(a) * 7.4;
      cylinder(g, .082, .13, .43, [x, .48, z], graphite, 8);
      indicatorLights.push(sphere(g, .075, [x, .72, z], lightWarm, 8));
    }
    // Uncrewed cargo lander, physically separated from habitat because rocket
    // exhaust excavates abrasive regolith. It is concept art, not a flight model.
    const craft = groupAt(g, 'Cargo lander', [0, .35, 0]);
    const descent = cylinder(craft, 1.84, 2.06, 1.34, [0, 1.05, 0], gold, 10);
    selectable(descent, 'landing');
    cylinder(craft, 1.37, 1.56, 2.05, [0, 2.65, 0], ceramic, 12);
    cylinder(craft, .88, 1.27, .7, [0, 4.03, 0], ceramic, 12);
    for (const side of [-1, 1]) {
      cylinder(craft, .41, .42, 1.42, [side * 1.52, 2.52, 0], alloy, 16);
      box(craft, [1.2, .53, .03], [side * .3, 3.08, 1.34], windowMat, false);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const c = Math.cos(a), s = Math.sin(a);
      rod(craft, [c * 1.31, 1.85, s * 1.31], [c * 2.61, .44, s * 2.61], .093, alloy);
      rod(craft, [c * 2.61, .44, s * 2.61], [c * 2.87, .16, s * 2.87], .083, graphite);
      cylinder(craft, .27, .32, .09, [c * 2.87, .12, s * 2.87], alloy, 12);
    }
    // Cargo lift and a small fold-out unloading platform.
    box(craft, [1.75, .11, 1.15], [-1.45, 1.7, 1.8], alloy);
    for (const x of [-2.17, -.71]) rod(craft, [x, 1.64, 1.8], [x, .25, 2.47], .035, graphite);
    cylinder(craft, .057, .065, .95, [0, 4.9, 0], alloy, 8);
    sphere(craft, .13, [0, 5.43, 0], lightWarm, 10);
    // Blast berm between pad and living modules, with a dedicated rover track.
    for (let i = 0; i < 9; i++) {
      const rock = sphere(root, .91, [18 + i * 1.1, .28, 10.5 + Math.sin(i * .55) * .7], bermMaterial, 8);
      rock.scale.set(1, .55, .8);
    }
    return { group: g, craft };
  }
  const landing = landerAndPad();

  function siteDetails() {
    const paths = [
      [[-17, .07, 7], [-9, .07, 8], [0, .07, 9]],
      [[3, .07, 9], [8, .07, 12], [12, .07, 15]],
      [[15, .07, 15], [21, .07, 19], [23, .07, 21]]
    ];
    for (const p of paths) cable(root, p, .047, mat(0x777a75, .2, .98));
    // Site wayfinding and hazard beacons anchored away from the vehicle route.
    for (const [x, z] of [[-16, 6], [-8, 8], [5, 10], [16, 7], [23, 13], [-7, -8]]) {
      cylinder(root, .08, .12, .67, [x, .35, z], graphite, 8);
      indicatorLights.push(sphere(root, .11, [x, .74, z], lightWarm, 10));
    }
    // Externally accessible radiator wings, raised above dust accumulation.
    for (const x of [-1.2, 1.2]) {
      const r = groupAt(root, 'Thermal radiator', [x, 0, -7.25]);
      rod(r, [0, .2, 0], [0, 2.3, 0], .075, alloy);
      box(r, [1.76, 1.6, .075], [0, 1.57, -.3], ceramic);
      for (let i = -4; i <= 4; i++) box(r, [1.66, .026, .08], [0, 1.57 + i * .17, -.24], graphite, false);
      cable(root, [[x, .07, -7.25], [x, .09, -5.1], [x, .35, -3]], .037, copper);
    }
    // Vacuum-compatible storage cans and sealed waste/ISRU demonstration skid.
    const skid = groupAt(root, 'ISRU demonstration skid', [18, 0, -11]);
    box(skid, [5.4, .22, 2.8], [0, .19, 0], graphite);
    selectable(box(skid, [2.55, 1.55, 1.9], [-1.13, 1.06, 0], ceramic), 'science');
    for (let i = 0; i < 3; i++) {
      cylinder(skid, .42, .42, 1.53, [1 + i * .87, 1.07, 0], alloy, 16);
      cylinder(skid, .45, .45, .15, [1 + i * .87, 1.83, 0], gold, 16);
      cable(skid, [[-1.4, 1.12, .9], [0, 1.12, .9], [1 + i * .87, 1.6, .5]], .026, copper);
    }
    label(skid, 'ISRU', [-1.14, 1.43, .97], .6);
  }
  siteDetails();

  function localNightLighting() {
    // Narrow work lights illuminate only crew routes and hardware, leaving the
    // wider lunar horizon dark. None casts a dynamic shadow map on mobile.
    const fixtures = [
      { mast: [-12.7, 0, 2.9], aim: [-10.7, 1.6, -3], power: 100, span: 16 },
      { mast: [8.2, 0, 3.4], aim: [8.7, 1.7, -3], power: 110, span: 17 },
      { mast: [5.9, 0, 10.8], aim: [0, 1.4, 5], power: 115, span: 15 },
      { mast: [-21.1, 0, -6.4], aim: [-24, 1.5, -11], power: 80, span: 15 },
      { mast: [22.5, 0, -11.5], aim: [25, 1.5, -17], power: 80, span: 15 },
      { mast: [25.3, 0, 15.9], aim: [30, .7, 21], power: 85, span: 16 }
    ];
    for (const fixture of fixtures) {
      const [x, , z] = fixture.mast;
      const mast = groupAt(root, 'Local work light mast', [x, 0, z]);
      cylinder(mast, .09, .13, 4.28, [0, 2.14, 0], alloy, 10);
      box(mast, [.58, .28, .36], [0, 4.33, 0], graphite);
      const lens = box(mast, [.4, .14, .055], [0, 4.32, .203], lightWarm, false);
      const spot = new THREE.SpotLight(0xffead0, 0, fixture.span, .55, .46, 1.3);
      spot.position.set(x, 4.26, z);
      spot.target.position.set(...fixture.aim);
      spot.castShadow = false;
      root.add(spot, spot.target);
      siteSpotlights.push({ light: spot, lens, power: fixture.power });
    }
  }
  localNightLighting();

  // Collapse stationary detail meshes by material. This keeps the visual detail
  // while avoiding hundreds of WebGL draw calls. Animated, selectable, toggled
  // and transparent meshes stay separate. All merged positions use root space.
  function batchStaticDetail() {
    root.updateMatrixWorld(true);
    const movable = new Set([
      rover, comms.dishMount, evaConnector, ...solarPivots,
      ...airlock.doors.inner.map(leaf => leaf.mesh),
      ...airlock.doors.outer.map(leaf => leaf.mesh)
    ]);
    const protectedMeshes = new Set([
      ...pickables, airlock.roof,
      ...indicatorLights, ...warningLights,
      ...siteSpotlights.map(item => item.lens),
      ...['habitat', 'greenhouse', 'science'].flatMap(name => [
        modules[name].fullShell, modules[name].cutShell, modules[name].outerBlanket,
        ...modules[name].armorPanels
      ]),
      ...(modules.habitatShutters || [])
    ]);
    const groups = new Map();
    root.traverse(item => {
      if (!item.isMesh || item.isInstancedMesh || !item.visible ||
        item.material.transparent || protectedMeshes.has(item)) return;
      for (let parent = item; parent && parent !== root; parent = parent.parent) {
        if (movable.has(parent)) return;
      }
      const key = `${item.material.id}:${item.castShadow ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { material: item.material,
        castShadow: item.castShadow, items: [] });
      groups.get(key).items.push(item);
    });
    const staticBatch = groupAt(root, 'Batched stationary site detail', [0, 0, 0]);
    let collapsed = 0;
    for (const entry of groups.values()) {
      if (entry.items.length < 2) continue;
      const pieces = [];
      let vertexCount = 0;
      for (const item of entry.items) {
        const geometry = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
        geometry.applyMatrix4(item.matrixWorld);
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        pieces.push(geometry);
        vertexCount += geometry.getAttribute('position').count;
      }
      const position = new Float32Array(vertexCount * 3);
      const normal = new Float32Array(vertexCount * 3);
      let offset = 0;
      for (const geometry of pieces) {
        position.set(geometry.getAttribute('position').array, offset);
        normal.set(geometry.getAttribute('normal').array, offset);
        offset += geometry.getAttribute('position').count * 3;
        geometry.dispose();
      }
      const combined = new THREE.BufferGeometry();
      combined.setAttribute('position', new THREE.BufferAttribute(position, 3));
      combined.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      combined.computeBoundingSphere();
      const batch = new THREE.Mesh(combined, entry.material);
      batch.name = `Static batch: ${entry.material.name || entry.material.type}`;
      batch.castShadow = entry.castShadow;
      batch.receiveShadow = true;
      staticBatch.add(batch);
      for (const item of entry.items) { item.parent.remove(item); collapsed++; }
    }
    return collapsed;
  }
  const batchedMeshes = batchStaticDetail();

  let inspection = false;
  function setInteriorMode(key = false) {
    inspection = key || false;
    for (const name of ['habitat', 'greenhouse', 'science']) {
      const module = modules[name];
      const active = key === name || key === true || key === 'all';
      module.fullShell.visible = !active;
      module.ghostShell.visible = active;
      module.cutShell.visible = active;
      module.outerBlanket.visible = !active;
      for (const panel of module.armorPanels) panel.visible = !active;
      module.hoopBatch.visible = !active;
    }
    // The airlock roof is removable only for the visual inspection mode.
    airlock.roof.visible = !(key === 'airlock' || key === true || key === 'all');
    evaConnector.visible = !(key === 'habitat' || key === 'all' || key === true);
    return inspection;
  }

  const components = {
    root, modules, airlock, doors: airlock.doors, solar, solarPivots, rover,
    roverWheels, comms, landing, lights: { allLights, warningLights, indicatorLights,
      siteSpotlights },
    interiors: interiorFocusPoints, batchedMeshes, setInteriorMode
  };

  let roverTravel = 0;
  let priorRover = false;
  let priorRoverPosition = null;
  let dustAppearance = 0;
  function update(dt = 0, time = 0, state = {}) {
    const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    // Doors are hardware-interlocked. Generic boolean maps to an exterior hatch
    // only; the inner hatch stays sealed. Distinct phases can be supplied by a
    // future systems simulation without opening both at once.
    const phase = state.airlockPhase || (state.airlock ? 'outerOpen' : 'sealed');
    const normalizedPhase = String(phase).toLowerCase().replace(/[^a-z]/g, '');
    const innerOpen = normalizedPhase === 'inneropen';
    const outerOpen = normalizedPhase === 'outeropen' || normalizedPhase === 'eva';
    for (const leaf of airlock.doors.inner) {
      leaf.mesh.position.x = THREE.MathUtils.damp(leaf.mesh.position.x,
        innerOpen ? leaf.openX : leaf.closedX, 4.6, step);
    }
    for (const leaf of airlock.doors.outer) {
      leaf.mesh.position.x = THREE.MathUtils.damp(leaf.mesh.position.x,
        outerOpen && !innerOpen ? leaf.openX : leaf.closedX, 4.6, step);
    }
    // Maintain a clear visual alarm during depressurization/egress.
    for (const light of warningLights) light.visible =
      normalizedPhase !== 'sealed' ? Math.sin(time * .009) > -.12 : false;
    const panelsActive = state.solar !== false;
    const dustTarget = typeof state.solarDust === 'number'
      ? THREE.MathUtils.clamp(state.solarDust, 0, 1) : state.solarDust ? 1 : 0;
    dustAppearance = THREE.MathUtils.damp(dustAppearance, dustTarget, 1.8, step);
    panelCell.color.copy(cleanPanelColor).lerp(dustyPanelColor, dustAppearance);
    panelCell.roughness = .25 + dustAppearance * .57;
    const sunAngle = Number.isFinite(state.sunAngle) ? state.sunAngle : -.32;
    for (const pivot of solarPivots) {
      pivot.rotation.x = THREE.MathUtils.damp(pivot.rotation.x,
        panelsActive ? sunAngle : 1.42, 2.7, step);
    }
    // The mount follows a shallow Earth direction, not a full lunar sky solver.
    comms.dishMount.rotation.y = .07 * Math.sin(time * .00008);
    const moveRover = !!state.rover;
    const commandedPosition = state.roverPosition;
    if (commandedPosition && Number.isFinite(commandedPosition.x) && Number.isFinite(commandedPosition.z)) {
      const x = commandedPosition.x, z = commandedPosition.z;
      if (priorRoverPosition) {
        const dx = x - priorRoverPosition.x, dz = z - priorRoverPosition.z;
        const distance = Math.hypot(dx, dz);
        if (distance > .002 && distance < 3) {
          if (!Number.isFinite(state.roverHeadingRad)) rover.rotation.y = Math.atan2(-dz, dx);
          for (const wheel of roverWheels) wheel.rotateY(distance / .46);
        }
      }
      rover.position.set(x, 0, z);
      if (Number.isFinite(state.roverHeadingRad)) rover.rotation.y = -state.roverHeadingRad;
      priorRoverPosition = { x, z };
    } else if (moveRover) {
      roverTravel += step * .135;
      const a = roverTravel;
      const x = 14 + 8 * Math.cos(a), z = 16 + 5.4 * Math.sin(a);
      const dx = -8 * Math.sin(a), dz = 5.4 * Math.cos(a);
      rover.position.set(x, 0, z);
      rover.rotation.y = Math.atan2(-dz, dx);
      for (const wheel of roverWheels) wheel.rotateY(step * 1.65);
    } else if (priorRover && state.resetRover) {
      roverTravel = 0; rover.position.set(12, 0, 15); rover.rotation.y = 0;
    }
    priorRover = moveRover;
    if (state.interiorMode !== undefined && state.interiorMode !== inspection) setInteriorMode(state.interiorMode);
    const atNight = !!state.night;
    const powered = state.powered !== false;
    for (const light of indicatorLights) light.visible = atNight;
    for (const fixture of siteSpotlights) {
      fixture.light.intensity = THREE.MathUtils.damp(fixture.light.intensity,
        atNight && powered ? fixture.power : 0, 2.8, step);
      fixture.lens.visible = atNight && powered;
    }
    const cabinLightTarget = powered ? atNight ? 8 : 7.5 : .25;
    for (const light of allLights) light.intensity = THREE.MathUtils.damp(light.intensity,
      cabinLightTarget, 2, step);
  }

  return { focusPoints, interiorFocusPoints, pickables, update, components, setInteriorMode };
}
