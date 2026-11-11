// node src/vehicles/farGear.selftest.mjs: far-tank tier hides only small instanced wheel layers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { collectFarGearObjects } from './tankFactoryCore.js';

const geo = new THREE.BoxGeometry(), mat = new THREE.MeshStandardMaterial();
const root = new THREE.Group();
const inst = (name, visible = true) => { const m = new THREE.InstancedMesh(geo, mat, 4); m.name = name; m.visible = visible; root.add(m); return m; };
const plain = (name) => { const m = new THREE.Mesh(geo, mat); m.name = name; root.add(m); return m; };
inst('gearRoadWheelTires'); inst('gearRoadWheelDiscs'); inst('gearTrackBandL');
const hub = inst('gearRoadWheelHubCaps'); const rims = inst('gearRoadWheelOuterRims'); const roller = inst('gearReturnRollerTires');
inst('gearRoadWheelInsets', false); // already hidden by its builder: never resurrected
plain('gearEndWheelBody'); plain('botMerge_0'); inst('destructible-crate');
const picked = collectFarGearObjects(root).map((r) => r.object);
assert.deepEqual(picked.map((o) => o.name).sort(), [hub, rims].map((o) => o.name).sort(), 'only small wheel layers; tires, discs, tracks, plain meshes kept');
assert.ok(!picked.includes(roller), 'return-roller tires keep their silhouette row');

// The battle toggle: hysteresis 230/260 m, inspection (no distance) shows all, reset restores.
const src = await readFile(new URL('./tankFactoryCore.js', import.meta.url), 'utf8');
assert.match(src, /viewDistM !== undefined && \(farGearHidden \? viewDistM > 230 : viewDistM > 260\)/);
assert.match(src, /if \(farGearHidden\) \{\s*farGearHidden = false;/);
console.log('farGear.selftest: far tier picks small wheel layers only, hysteresis and reset wired passed');
