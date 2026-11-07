// Lite (Lambert) copies must follow later repaints of their source material:
// the garage retints wheels/fittings after the Performance preset swapped them.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyLiteMaterials } from './liteMaterials.ts';

const src = new THREE.MeshStandardMaterial({ color: 0x336633, metalness: 0.1, emissive: 0x000000 });
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), src);
const root = new THREE.Group();
root.add(mesh);
assert.equal(applyLiteMaterials(root), 1);
assert.ok(mesh.material.isMeshLambertMaterial, 'swapped to Lambert');

src.color.set(0xaa2211); // garage repaint (retintEntryFittings)
src.emissive.set(0x110000);
assert.equal(mesh.material.color.getHex(), 0xaa2211, 'repaint reaches the lite copy');
assert.equal(mesh.material.emissive.getHex(), 0x110000, 'emissive follows too');
assert.equal(applyLiteMaterials(root), 0, 'second scan changes nothing');

const idle = new THREE.PointLight(0xffffff, 0);
root.add(idle);
assert.equal(applyLiteMaterials(root), 1);
assert.equal(idle.visible, false, 'idle point light hidden');
console.log('liteMaterials selftest ok');
