// node src/vehicles/farProxy.selftest.mjs: far bot tanks draw one baked mesh per moving node.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { buildFarProxy } from './tankFactoryCore.js';

const geo = new THREE.BoxGeometry();
const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true });
const mat = (hex) => new THREE.MeshStandardMaterial({ color: hex });
const root = new THREE.Group(); root.name = 'tank_test';
const turret = new THREE.Group(); turret.name = 'rig_turret'; root.add(turret);
const gun = new THREE.Group(); gun.name = 'rig_gun'; turret.add(gun);
const add = (parent, m, name = 'part') => { const x = new THREE.Mesh(geo, m); x.name = name; parent.add(x); return x; };
for (let i = 0; i < 6; i++) add(root, mat(0x445533));
for (let i = 0; i < 4; i++) add(turret, mat(0x445533));
add(gun, mat(0x222222)); add(gun, mat(0x333333));
const shadow = add(root, Object.assign(mat(0), { colorWrite: false }), 'procShadow_hull');
const detail = add(turret, mat(0x777777), 'antenna');
const hidden = add(root, mat(0x777777), 'thrownBand'); hidden.visible = false;
const wheels = new THREE.InstancedMesh(geo, mat(0x111111), 6); wheels.name = 'gearRoadWheelTires'; root.add(wheels);
const hubs = new THREE.InstancedMesh(geo, mat(0x999999), 6); hubs.name = 'gearRoadWheelHubCaps'; root.add(hubs);
const pads = new THREE.InstancedMesh(geo, mat(0x111111), 80); pads.name = 'gearTrackPads'; root.add(pads);

const disposables = [];
const out = buildFarProxy(root, { skip: new Set([detail]), paint: () => paintMat, disposables });
assert.ok(out, 'proxy built');
assert.equal(out.proxies.length, 3, 'one proxy per moving node (hull, turret, gun)');
assert.ok(out.proxies.every((p) => p.visible === false && p.material === paintMat), 'proxies start hidden, vertex-colored paint');
assert.ok(out.proxies.some((p) => p.parent === root)); assert.ok(out.proxies.some((p) => p.parent === turret) && out.proxies.some((p) => p.parent === gun), 'turret and gun keep their own rotation');
assert.ok(!out.originals.includes(shadow) && !out.originals.includes(detail) && !out.originals.includes(hidden), 'shadow proxies, skipped detail, hidden parts left alone');
assert.ok(out.originals.includes(wheels) && !out.originals.includes(hubs) && !out.originals.includes(pads), 'main wheel rows baked; small layers and pads not');
assert.equal(out.savedDraws, (6 + 1) + 4 + 2 - 3, 'draws saved = source meshes - proxies');
const hull = out.proxies.find((p) => p.parent === root);
assert.equal(hull.geometry.attributes.position.count, (6 + 6) * 36, 'six hull boxes + six baked wheel instances, non-indexed (36 verts per box)');
assert.ok(hull.geometry.attributes.color, 'colors baked per vertex');

// Battle wiring: hysteresis 110/130 m, wrecks and inspection show the real tank.
const src = await readFile(new URL('./tankFactoryCore.js', import.meta.url), 'utf8');
assert.match(src, /!destroyed && \(isEmergencyPreset\(\) \|\| \(viewDistM !== undefined && \(farProxyOn \? viewDistM > 110 : viewDistM > 130\)\)\)/,
  'hysteresis 110/130 m; inspection (no distance) and wrecks show the real tank unless the emergency experiment is on');
assert.match(src, /setDestroyed\(opts\) \{[\s\S]{0,400}?setFarProxy\(false\);/, 'wreck snapshot never sees the proxy');
console.log('farProxy.selftest: one baked mesh per moving node, detail/shadow/pads excluded, wiring pinned passed');
