// node src/engine/phoneWorldStyle.selftest.mjs: art direction C on phones (owner 2026-11-11).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { applyPhoneWorldShadows } from './phoneWorldStyle.ts';

const mesh = (name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); m.name = name; m.castShadow = m.receiveShadow = true; return m; };
const scene = new THREE.Scene();
const world = new THREE.Group(); world.name = 'world-winter';
const terrain = new THREE.Group(); terrain.name = 'terrain'; const chunk = mesh('chunk'); terrain.add(chunk);
const props = new THREE.Group(); props.name = 'props'; const house = mesh('house'); props.add(house);
const veg = new THREE.Group(); veg.name = 'vegetation'; const tree = mesh('tree'); veg.add(tree);
world.add(terrain, props, veg);
const tank = new THREE.Group(); tank.name = 'tank_t90'; const hull = mesh('hull'); tank.add(hull);
scene.add(world, tank);

assert.equal(applyPhoneWorldShadows(scene), 3);
assert.deepEqual([chunk.castShadow, chunk.receiveShadow], [false, true], 'terrain keeps receiving: tank ground shadows stay');
assert.deepEqual([house.castShadow, house.receiveShadow, tree.castShadow, tree.receiveShadow], [false, false, false, false], 'world props/vegetation: no live shadows');
assert.deepEqual([hull.castShadow, hull.receiveShadow], [true, true], 'tanks untouched');
assert.equal(applyPhoneWorldShadows(scene), 0, 'idempotent (the 1 s scan changes nothing twice)');

// Grade rides the screen pass; EASU feeding RCAS must not grade twice.
const post = await readFile(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(post, /fragmentShader: graded\(FSR_RCAS_FRAG\)/);
assert.match(post, /fragmentShader: graded\(CopyShader\.fragmentShader\)/);
assert.match(post, /uGradeOn\.value = applyRcas \? 0 : 1/);
assert.match(post, /const grade = getDeviceTier\(\) === 'mobile';/, 'phones only');
const map = await readFile(new URL('../world/map.ts', import.meta.url), 'utf8');
assert.match(map, /if \(getDeviceTier\(\) === 'mobile'\) applyPhoneWorldShadows\(group\);/, 'applied at build, before shader warm-up');
console.log('phoneWorldStyle.selftest: world shadows off (terrain receives), tanks untouched, grade on screen pass only passed');
