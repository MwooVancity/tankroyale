// node src/auth/googleAuth.selftest.mjs: the Google sheet opens once; a cancel is remembered (teardown 2026-11-10).
import assert from 'node:assert/strict';
import { register } from 'node:module';

const stub = `export const Capacitor = { isNativePlatform: () => true };
export const registerPlugin = () => globalThis.__gStub;`;
const hook = `export async function resolve(spec, ctx, next) {
  if (spec === '@capacitor/core') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook));

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let sheets = 0;
globalThis.__gStub = { initialize: async () => {}, signIn: async () => { sheets++; throw new Error('User cancelled'); }, signOut: async () => {} };
const g = await import('./googleAuth.ts');

assert.equal(await g.signInWithGoogle(), null);
assert.equal(await g.signInWithGoogle(), null);
assert.equal(await g.signInWithGoogle(), null);
assert.equal(sheets, 1, 'three mode picks in one run open the sheet once');
assert.equal(store.get('tr.google.asked'), undefined, 'a cancel is not stored forever');

// Next launch (fresh module): the player can try again by tapping an online mode (RC3 QA #5).
store.set('tr.google.asked', '1'); // a phone that ran the old build
const g2 = await import('./googleAuth.ts?relaunch');
assert.equal(await g2.signInWithGoogle(), null);
assert.equal(sheets, 2, 'retryable on a later launch, even after the old persisted flag');
await g2.signInWithGoogle();
assert.equal(sheets, 2, 'still once per run');

// A signed-in player still gets their cached account without any sheet.
store.set('tr.google.user.v1', JSON.stringify({ id: 'x1', displayName: 'Ace', email: '', photoUrl: '' }));
const user = await g.signInWithGoogle();
assert.equal(user?.displayName, 'Ace', 'cached account returned');
assert.equal(sheets, 2, 'no sheet for a signed-in player');
console.log('googleAuth.selftest: sign-in sheet once per run, retryable on a later launch passed');
