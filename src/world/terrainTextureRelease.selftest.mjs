// node src/world/terrainTextureRelease.selftest.mjs
// Teardown 2026-11-10: each new map left its terrain splat textures on the GPU (they reach the shader only
// through onBeforeCompile), and the WebView renderer was OOM-killed on the ~12th map. World eviction must free them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { disposeObject3DResources, registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';

const freed = new Set();
const tex = (name) => { const t = new THREE.Texture(); t.name = name; t.addEventListener('dispose', () => freed.add(name)); return t; };

// 1) Registered live iterable (terrain): a layer swapped in place after build (sourced set) is the one freed.
const layers = { G: { albedo: tex('G0'), normal: tex('Gn') } };
const mask = tex('mask');
const world = new THREE.Group();
const mat = new THREE.MeshStandardMaterial();
mat.onBeforeCompile = (s) => { s.uniforms.uAlbG = { value: layers.G.albedo }; s.uniforms.uMask = { value: mask }; };
world.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
registerRetainedObject3DResources(world, { textures: { *[Symbol.iterator]() { yield layers.G.albedo; yield layers.G.normal; yield mask; } } });
layers.G.albedo = tex('G-sourced');
disposeObject3DResources(world);
assert.ok(freed.has('G-sourced') && freed.has('Gn') && freed.has('mask'), 'terrain splat textures freed with the world');

// 2) userData.hookTextures (props grime): freed with the material's world.
const grime = tex('grime');
const pm = new THREE.MeshStandardMaterial(); pm.userData.hookTextures = [grime];
const props = new THREE.Group(); props.add(new THREE.Mesh(new THREE.BoxGeometry(), pm));
disposeObject3DResources(props);
assert.ok(freed.has('grime'), 'hook-only prop texture freed');

// 3) The real builders wire it.
const terrain = await readFile(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /textures: mat\.userData\.splatTextures/, 'terrain registers its splat textures');
assert.match(terrain, /yield mask; yield noiseTex;/);
const propsSrc = await readFile(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(propsSrc, /m\.userData\.hookTextures = \[grimeTex\]/);
console.log('terrainTextureRelease.selftest: terrain splat + prop grime textures freed on world eviction passed');
