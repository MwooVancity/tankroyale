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
assert.equal(sheets, 1, 'three mode picks open the sheet once');
assert.equal(store.get('tr.google.asked'), '1', 'remembered across launches');

// A signed-in player still gets their cached account without any sheet.
store.set('tr.google.user.v1', JSON.stringify({ id: 'x1', displayName: 'Ace', email: '', photoUrl: '' }));
const user = await g.signInWithGoogle();
assert.equal(user?.displayName, 'Ace', 'cached account returned');
assert.equal(sheets, 1, 'no sheet for a signed-in player');
console.log('googleAuth.selftest: sign-in sheet asked once, cancel remembered passed');
