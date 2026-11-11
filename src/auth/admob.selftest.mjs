// node src/auth/admob.selftest.mjs: the ad never shows late (into the next battle) and never makes the player wait on a fill.
import assert from 'node:assert/strict';
import { register } from 'node:module';

const stub = `export const Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
export const registerPlugin = () => globalThis.__adStub;`;
const hook = `export async function resolve(spec, ctx, next) {
  if (spec === '@capacitor/core') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook));

const store = new Map([['tr.ads.firstSeenMs', String(Date.now() - 31 * 60e3)]]);
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
let fillMs = 300, shown = 0;
globalThis.__adStub = {
  initialize: async () => {}, showConsentForm: async () => {},
  requestConsentInfo: async () => ({ isConsentFormAvailable: false, status: 'OBTAINED' }),
  prepareInterstitial: () => new Promise((r) => setTimeout(r, fillMs)),
  showInterstitial: async () => { shown++; },
};
const ad = await import('./admob.ts');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

assert.deepEqual([ad.takeAdTurn(), ad.takeAdTurn(), ad.takeAdTurn()], [false, false, true], 'every 3rd match');

// Slow fill: the player leaves results before the ad loaded. No ad, no wait, and none later.
fillMs = 600; ad.prepareAd();
let t = Date.now(); await ad.showInterstitialNow();
assert.ok(Date.now() - t < 50, 'leaving never waits on a fill');
await wait(800);
assert.equal(shown, 0, 'a late fill never shows into the next battle');

// Loaded in time (player read results): shown once at leave, then spent.
fillMs = 50; ad.prepareAd(); await wait(100);
await ad.showInterstitialNow();
assert.equal(shown, 1, 'preloaded ad shows at leave');
await ad.showInterstitialNow();
assert.equal(shown, 1, 'one ad per turn');

assert.equal(ad.inFirstSession(Date.now(), Date.now() - 10 * 60e3), true, 'first 30 min ad-free');
console.log('admob.selftest: no late ad, no wait on fill, one ad per turn passed');
