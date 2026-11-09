// Performance preset: long-lived smoke/fire puffs emit at half rate (overdraw).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPuffThinner } from './particles.js';

let lite = true;
const thin = createPuffThinner(() => lite);
const smoke = { thinnable: true }, flash = { thinnable: false };
const column = { life: 6, alpha: 0.5 }, burst = { life: 0.5, alpha: 0.5 };
const kept = (pool, o, n) => Array.from({ length: n }, () => thin(pool, o)).filter(Boolean);

assert.equal(kept(smoke, column, 100).length, 50, 'wreck smoke columns emit at half rate');
assert.equal(kept(smoke, column, 2)[0].alpha, 0.7, 'kept puffs are denser');
assert.equal(kept(smoke, burst, 100).length, 100, 'short bursts (hits, muzzle) untouched');
assert.equal(kept(flash, column, 100).length, 100, 'other pools untouched');
{
  const s = { thinnable: true }, f = { thinnable: true };
  let ns = 0, nf = 0;
  for (let i = 0; i < 100; i++) { if (thin(s, column)) ns++; if (thin(f, column)) nf++; }
  assert.deepEqual([ns, nf], [50, 50], 'a wreck emitting smoke then fire halves both');
}
lite = false;
assert.equal(kept(smoke, column, 100).length, 100, 'desktop presets untouched');
assert.match(await readFile('src/fx/particles.js', 'utf8'), /o = thin\(pool, o\);/, 'emitPuff runs the thinner');
console.log('particlesThin.selftest: Performance halves long-lived smoke/fire puffs');
