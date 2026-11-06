// Draw calls per battle-bot tank as a phone builds it (geometryQuality 'low',
// batchStatic), counted from the scene graph in Node: no browser, no GPU.
// Each visible mesh = 1 color draw (instanced/batched = 1).
// Usage: node tools/tank-draw-count.mjs [specId ...]   (default: the 9 probe bots)
import * as THREE from 'three';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.js';
import { createTankState } from '../src/sim/movement.ts';

const ids = process.argv.slice(2);
const specs = ids.length ? ids : ['k2b', 'm1a2_tusk', 'type10', 'challenger2e', 'ua_challenger2', 'm1a2', 'm1a1', 'merkava4b', 't84'];
let total = 0;
let syncMs = 0;
for (const id of specs) {
  const v = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'ai', geometryQuality: 'low', batchStatic: true, botPaint: true });
  const st = createTankState(getSpec(id), new THREE.Vector3(), 0);
  v.syncFromState(st, 0, Number(process.env.DIST || 60));
  // per-frame visual cost: state sync + world matrices (what the renderer redoes every frame)
  const t0 = performance.now();
  for (let f = 0; f < 300; f++) { st.turretYaw = f * 0.01; v.syncFromState(st, 1 / 60, Number(process.env.DIST || 60)); v.root.updateMatrixWorld(true); }
  syncMs += (performance.now() - t0) / 300;
  let draws = 0, shadow = 0;
  const byParent = new Map();
  v.root.traverseVisible((o) => {
    if (!o.isMesh) return;
    draws++;
    if (o.castShadow) shadow++;
    if (process.env.DUMP) {
      const a = []; for (let p = o.parent; p && p !== v.root; p = p.parent) a.unshift(p.name || p.type);
      console.log(`  ${a.join('/')} | ${o.name || '-'} | ${o.isInstancedMesh ? 'inst ' : ''}${o.isBatchedMesh ? 'batch ' : ''}mat#${o.material.id} ud=${Object.keys(o.userData).join(',')}`);
    }
    const k = `${o.parent?.name || '?'}`;
    byParent.set(k, (byParent.get(k) || 0) + 1);
  });
  total += draws;
  const top = [...byParent].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}:${n}`).join(' ');
  console.log(`${id.padEnd(16)} draws ${String(draws).padStart(3)} shadow ${String(shadow).padStart(3)}  ${top}`);
  v.dispose?.();
}
console.log(`TOTAL ${total} draws for ${specs.length} bots; visual sync+matrices ${syncMs.toFixed(2)} ms/frame (desktop 1x)`);
