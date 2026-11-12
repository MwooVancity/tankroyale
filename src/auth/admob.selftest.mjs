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

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
let fillMs = 300, shown = 0;
// Behaves like a Capacitor plugin proxy: EVERY property is a native call,
// including .then, which never settles (RC3 QA: "AdMob.then() is not
// implemented on android"; awaiting the proxy froze ads since e782bd16).
let thenCalled = false, adOpenMs = 0, lastAdId = '';
const listeners = new Map();
const impl = {
  initialize: async () => {}, showConsentForm: async () => {},
  requestConsentInfo: async () => ({ isConsentFormAvailable: false, status: 'OBTAINED' }),
  prepareInterstitial: (o) => { lastAdId = o.adId; return new Promise((r) => setTimeout(r, fillMs)); },
  // admob 8.x: resolves on SHOW; dismiss arrives later as an event.
  showInterstitial: async () => { shown++; setTimeout(() => listeners.get('interstitialAdDismissed')?.(), adOpenMs); },
  addListener: async (ev, fn) => { listeners.set(ev, fn); return { remove: async () => listeners.delete(ev) }; },
};
globalThis.__adStub = new Proxy(impl, { get: (t, p) => (p in t ? t[p] : p === 'then' ? () => { thenCalled = true; } : () => new Promise(() => {})) });
const ad = await import('./admob.ts');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// New player: battles 1-2 never owe an ad (lifetime, persisted), then every 3rd: battles 3, 6.
const turns = Array.from({ length: 8 }, () => ad.takeAdTurn());
assert.deepEqual(turns, [false, false, true, false, false, true, false, false], 'first 2 battles free, ad at 3 and 6');
assert.equal(store.get('tr.ads.battles.v1'), '8', 'lifetime count persisted');
assert.equal(ad.FREE_BATTLES, 2);
assert.ok(!('inFirstSession' in ad), 'the 30-minute window is gone');
// Returning player (count survives a restart): no new free battles; the lifetime cadence continues (ad at 42).
{
  store.set('tr.ads.battles.v1', '40');
  const again = await import('./admob.ts?restart');
  assert.deepEqual([again.takeAdTurn(), again.takeAdTurn(), again.takeAdTurn()], [false, true, false], 'restart: lifetime cadence, ad at battle 42');
}

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
assert.equal(thenCalled, false, 'the plugin proxy is never awaited');

// Leaving waits for the ad to CLOSE, not just open (next battle never loads behind it).
fillMs = 10; adOpenMs = 300; ad.prepareAd(); await wait(50);
t = Date.now(); await ad.showInterstitialNow();
assert.ok(Date.now() - t >= 280, `waited for dismiss (${Date.now() - t} ms)`);
assert.equal(listeners.size, 0, 'listeners removed after close');

// Live unit for players; Google's demo unit once a debug/autoplay/Test Lab run asks for it (RC4 QA).
assert.equal(lastAdId, 'ca-app-pub-8997828618122077/6954732609', 'players get the live unit');
ad.useTestAds(); fillMs = 5; ad.prepareAd(); await wait(30);
assert.equal(lastAdId, 'ca-app-pub-3940256099942544/1033173712', 'test runs load the demo unit');
await ad.showInterstitialNow();
console.log('admob.selftest: first 2 lifetime battles ad-free then every 3rd, no late ad, no wait on fill, one ad per turn passed');
