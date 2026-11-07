// CI release tests: run every selftest suite; fail on any failure not in the
// known-broken list below (ratchet: the list may only shrink). Runs before the
// Play upload so a build that breaks a passing test never reaches players.
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// Failing on unchanged code as of 2026-11-07 (website pages, attribution,
// fleet era fixtures, lazy-runtime string checks, a timing-flaky handoff test).
export const KNOWN_FAILING = new Set([
  'src/vehicles/fleetLazy.selftest.mjs',
  'tools/attribution-audit.mjs',
  'src/vehicles/profiles/fleetEraFinish.selftest.mjs',
  'src/fx/lazyRuntime.selftest.mjs',
  'src/presentation/publicNav.selftest.mjs',
  'src/presentation/seoMetadata.selftest.mjs',
  'src/presentation/analytics.selftest.mjs',
  'src/net/privateMatchHandoff.selftest.mjs',
  'src/fx/impactDecals.selftest.mjs',
]);

const { SELFTEST_SUITES } = await import(pathToFileURL(path.resolve('tools/selftest-suites.mjs')).href);
const files = [...new Set(Object.values(SELFTEST_SUITES).flat())];
const run = (f) => new Promise((resolve) => {
  const child = spawn(process.execPath, [f], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  // 10 min: tankAssets alone runs past 5 min when every test runs at once.
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 600_000);
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ f, ok: code === 0, out: timedOut ? `TIMED OUT after 600 s\n${out}` : out });
  });
});

const started = Date.now();
const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(2, os.cpus().length) }, async () => {
  while (next < files.length) results.push(await run(files[next++]));
}));
const newFails = results.filter((r) => !r.ok && !KNOWN_FAILING.has(r.f));
const fixed = results.filter((r) => r.ok && KNOWN_FAILING.has(r.f)).map((r) => r.f);
console.log(`release-tests: ${results.length} run, ${results.filter((r) => !r.ok).length} failed (${newFails.length} new) in ${Math.round((Date.now() - started) / 1000)} s`);
if (fixed.length) console.log(`now passing, remove from KNOWN_FAILING: ${fixed.join(', ')}`);
for (const r of newFails) console.log(`NEW FAIL ${r.f}\n${r.out.split('\n').slice(-12).join('\n')}`);
process.exit(newFails.length ? 1 : 0);
