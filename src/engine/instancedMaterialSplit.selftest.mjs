// node src/vehicles/instancedMaterialSplit.selftest.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { splitInstancedMaterials, setShadowTwinning, twinSource } from './instancedMaterialSplit.ts';

const shared = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.7 });
shared.userData.appearanceRole = 'wheelDisc';
const hook = () => {};
shared.onBeforeCompile = hook;
const geo = new THREE.BoxGeometry();
const root = new THREE.Group();
const plain = new THREE.Mesh(geo, shared);
const inst = new THREE.InstancedMesh(geo, shared, 4);
const solo = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(), 2); // not shared: untouched
const csm = new THREE.MeshStandardMaterial(); csm.defines = { USE_CSM: 1 };
const csmPlain = new THREE.Mesh(geo, csm), csmInst = new THREE.InstancedMesh(geo, csm, 2);
root.add(plain, inst, solo, csmPlain, csmInst);

assert.equal(splitInstancedMaterials(root), 1, 'one shared material split');
const twin = inst.material;
assert.notEqual(twin, shared, 'instanced side has its own material');
assert.equal(plain.material, shared, 'plain side keeps the original');
assert.equal(csmInst.material, csm, 'cascade-shadow material left shared');
assert.ok(twin.isMeshStandardMaterial && twin.color.getHex() === 0x334455 && twin.roughness === 0.7, 'same look');
assert.equal(twin.onBeforeCompile, hook, 'shader hook carried (Material.clone drops it)');
assert.equal(twin.userData.appearanceRole, 'wheelDisc');
assert.notEqual(twin.userData, shared.userData, 'own userData: per-material hook guards stay separate');

const hookOnce = inst.onBeforeRender;
assert.equal(splitInstancedMaterials(root), 0, 'rescan: nothing left to move');
assert.equal(inst.material, twin, 'rescan keeps the same twin');
assert.equal(inst.onBeforeRender, hookOnce, 'no double wrap');
const renderer = { info: { render: { frame: 1 } } };
const draw = () => inst.onBeforeRender(renderer, null, null, geo, twin, null);
shared.color.setHex(0x111111); // mutated in place (camo, normalize)
assert.equal(twin.color.getHex(), 0x111111, 'color shared by reference');
shared.opacity = 0.4; shared.transparent = true; // reassigned (wreck fade)
draw();
assert.equal(twin.opacity, 0.4); assert.equal(twin.transparent, true);
const v = twin.version; shared.needsUpdate = true; renderer.info.render.frame++; draw();
assert.ok(twin.version > v, 'original needsUpdate rebuilds the twin');

// Wreck burn hooks each material it finds (guard on userData.__burnU): both must hook.
const burnU = {};
const burn = (m) => { if (m.userData.__burnU) return m.userData.__burnU === burnU; m.userData.__burnU = burnU; m.onBeforeCompile = () => {}; m.needsUpdate = true; return true; };
burn(twin); burn(shared);
const twinHook = twin.onBeforeCompile; const tv = twin.version;
renderer.info.render.frame++; draw();
assert.notEqual(shared.onBeforeCompile, hook, 'original got its own burn hook');
assert.equal(twin.onBeforeCompile, twinHook, 'sync does not overwrite the twin burn hook');
assert.ok(twin.version >= tv, 'twin version never rolled back');

let disposed = false; twin.addEventListener('dispose', () => { disposed = true; });
shared.dispose();
assert.ok(disposed, 'twin freed with the original');
// Cascade-shadow materials: twin registered the same way, own defines, released with the original.
const reg = [], rel = [];
setShadowTwinning({ twin: (s, d) => { reg.push([s, d]); return true; }, release: (d) => rel.push(d) });
assert.equal(splitInstancedMaterials(root), 1, 'csm material split once lighting can register the twin');
assert.equal(reg.length, 1); assert.equal(reg[0][0], csm); assert.equal(csmInst.material, reg[0][1]);
assert.equal(twinSource(csmInst.material), csm);
assert.notEqual(csmInst.material.defines, csm.defines, 'own defines: releasing one never strips the other');
csm.dispose(); assert.deepEqual(rel, [reg[0][1]], 'twin released from cascades with the original');
console.log('instancedMaterialSplit.selftest: split, same look, live sync, burn hooks separate passed');
