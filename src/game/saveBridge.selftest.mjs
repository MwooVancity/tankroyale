// node src/game/saveBridge.selftest.mjs [--dump]: the Unity save bridge copies
// every save key, and every "tr." key in the source is documented for Unity.
// --dump prints the key list (the contract the Unity importer reads).
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { snapshotSaves, KNOWN_SAVE_KEYS, BRIDGE_SCHEMA } from './saveBridge.ts';

// 1. Copies everything in storage, verbatim, except the bridge's own "__" names.
const fake = new Map([
  ['tr.profile.v2', '{"credits":1250,"unlocked":["m1a2","t90"]}'],
  ['tr.settings.v1', '{"leftHanded":true,"sensitivity":1.4}'],
  ['tr.camo.m1a2', 'desert_digital'],
  ['tr.some.future.key', 'x'],
  ['__bridge_schema', '9'],
  ['empty', ''],
]);
const storage = { get length() { return fake.size; }, key: (i) => [...fake.keys()][i] ?? null, getItem: (k) => fake.get(k) ?? null };
const snap = snapshotSaves(storage);
assert.deepEqual(Object.keys(snap).sort(), ['empty', 'tr.camo.m1a2', 'tr.profile.v2', 'tr.settings.v1', 'tr.some.future.key'], 'every key copied, "__" skipped');
assert.equal(snap['tr.settings.v1'], fake.get('tr.settings.v1'), 'values verbatim (left-handed setting survives)');
assert.equal(snap.empty, '', 'empty values kept');
assert.equal(BRIDGE_SCHEMA, 1);

// 2. Every "tr." storage key literal in the game source is in KNOWN_SAVE_KEYS.
const root = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = (await readdir(root, { recursive: true })).filter((f) => /\.(ts|js)$/.test(f) && !/selftest/.test(f));
const found = new Set();
for (const f of files) {
  const src = await readFile(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/'(tr\.[A-Za-z0-9._]+)'/g)) found.add(m[1]);
}
const missing = [...found].filter((k) => !(k in KNOWN_SAVE_KEYS));
assert.deepEqual(missing, [], 'new save key: add it to KNOWN_SAVE_KEYS so the Unity importer knows it');
assert.ok(found.size >= 20, `source scan found ${found.size} keys (scan broken if tiny)`);

// 3. Native side: same prefs name, schema, timestamp, foreign "__" keys untouched.
const java = await readFile(new URL('../../android/app/src/main/java/app/tankroyale/SaveBridgePlugin.java', import.meta.url), 'utf8');
assert.match(java, /PREFS = "tankroyale_bridge"/);
assert.match(java, /putInt\("__bridge_schema"/); assert.match(java, /putLong\("__bridge_ts"/);
assert.match(java, /!k\.startsWith\("__"\) && !live\.contains\(k\)/, 'deleted keys removed, Unity markers kept');
const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /^installSaveBridge\(\);/m, 'bridge runs on every launch');
const act = await readFile(new URL('../../android/app/src/main/java/app/tankroyale/MainActivity.java', import.meta.url), 'utf8');
assert.match(act, /registerPlugin\(SaveBridgePlugin\.class\)/, 'plugin registered');

if (process.argv.includes('--dump')) for (const [k, v] of Object.entries(KNOWN_SAVE_KEYS)) console.log(`${k}\t${v}`);
console.log(`saveBridge.selftest: all keys copied verbatim, ${found.size} source keys documented, native prefs pinned`);
