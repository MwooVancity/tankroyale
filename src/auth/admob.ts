/**
 * AdMob interstitial — every 3rd match, shown when the player leaves results.
 * Leaving results waits for the ad to close (dismiss/failed event, 60 s cap).
 * Silently no-ops in browser / if network is down.
 *
 * UMP consent: collected once on first run (required by AdMob ToS for EU/EEA
 * users under GDPR). Result is cached by the Google UMP SDK — no repeated prompts.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_ID = 'ca-app-pub-8997828618122077/6954732609';
// Google's public demo interstitial unit: safe to load anywhere, never billed.
export const TEST_AD_ID = 'ca-app-pub-3940256099942544/1033173712';
let testAds = false;
/** Debug builds, autoplay runs and Test Lab / pre-launch devices: demo ads only. */
export function useTestAds(): void { testAds = true; }
export function adUnitId(): string { return testAds ? TEST_AD_ID : AD_ID; }

let initialized = false;
let pending = false;

// NOT async: awaiting a Capacitor plugin proxy calls its .then as a native method
// ("AdMob.then() is not implemented on android") and never settles: ads never
// loaded since e782bd16 (RC3 QA 2026-11-12).
function getAdMob(): AdMobApi {
  // A runtime import('@capacitor-community/admob') cannot resolve inside the
  // packaged app, so ads never loaded. registerPlugin binds to the native side.
  if (!Capacitor.isNativePlatform()) throw new Error('AdMob: not native');
  return (adMobPlugin ??= registerPlugin<AdMobApi>('AdMob'));
}
interface AdMobApi {
  initialize(opts: object): Promise<void>;
  requestConsentInfo(opts: object): Promise<{ isConsentFormAvailable: boolean; status: string }>;
  showConsentForm(): Promise<void>;
  prepareInterstitial(opts: { adId: string }): Promise<void>;
  showInterstitial(): Promise<void>;
  addListener(event: string, fn: () => void): Promise<{ remove(): Promise<void> }>;
}
let adMobPlugin: AdMobApi | undefined;

async function ensureConsent(AdMob: AdMobApi): Promise<void> {
  try {
    const info = await AdMob.requestConsentInfo({
      debugGeography: 0,
      tagForUnderAgeOfConsent: false,
    });
    // status 'REQUIRED' means user in EEA/UK and hasn't consented yet
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
      await AdMob.showConsentForm();
    }
  } catch { /* consent unavailable in this context — proceed, ads may be limited */ }
}

async function ensureInit(): Promise<boolean> {
  if (initialized) return true;
  try {
    const AdMob = getAdMob();
    // iOS 14.5+: App Tracking Transparency must be requested before AdMob
    // initialize(), otherwise Apple rejects the binary and ads are limited.
    if ((globalThis as Record<string, unknown>).Capacitor &&
        (globalThis as { Capacitor?: { getPlatform?(): string } }).Capacitor?.getPlatform?.() === 'ios') {
      try { await (AdMob as unknown as Record<string, () => Promise<void>>).requestTrackingAuthorization(); } catch { /* pre-14.5 or already authorized */ }
    }
    await ensureConsent(AdMob);
    await AdMob.initialize({ initializeForTesting: false });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

const MATCHES_PER_AD = 3; // one interstitial every 3rd match, not every match
// Owner rule (via PM, 2026-11-11): no interstitial in a player's first 2
// finished battles, lifetime; then every 3rd battle. Replaces the 30-minute
// first-session window, which also kept ads off a player's long first session.
export const FREE_BATTLES = 2;
const BATTLES_KEY = 'tr.ads.battles.v1';
let lifetimeBattles = 0;
try { lifetimeBattles = Number(localStorage.getItem(BATTLES_KEY)) || 0; } catch { /* blocked: counts from 0 this run */ }

/** Called once per finished match: true = this match owes an ad when the player leaves results. */
export function takeAdTurn(): boolean {
  lifetimeBattles += 1;
  try { localStorage.setItem(BATTLES_KEY, String(lifetimeBattles)); } catch { /* blocked: memory only */ }
  // Every 3rd battle counted over the player's lifetime (3, 6, 9...), so the
  // first 2 are free by construction and a restart never resets the cadence.
  return lifetimeBattles > FREE_BATTLES && lifetimeBattles % MATCHES_PER_AD === 0;
}

let loading = false;
let loaded = false;
/** Load the owed ad while the player reads results, so leaving never waits on a fill. */
export function prepareAd(): void {
  if (loading || loaded) return;
  loading = true;
  void (async () => {
    try {
      if (!await ensureInit()) return;
      await getAdMob().prepareInterstitial({ adId: adUnitId() });
      loaded = true;
    } catch { /* no Android, network down: no ad this turn */ } finally { loading = false; }
  })();
}

/**
 * Show the preloaded interstitial now, between battles only (the end screen
 * waits for this before the next battle starts). Not loaded yet = no ad: a
 * late fill used to land in the next battle's countdown. Resolves after the
 * ad closes or 10 s, whichever comes first.
 */
export async function showInterstitialNow(): Promise<void> {
  if (pending || !loaded) return;
  pending = true;
  loaded = false;
  // admob 8.x resolves showInterstitial when the ad SHOWS, not when it closes
  // (RC3 QA 2026-11-12): wait for dismiss/failed so the next battle never loads
  // behind the ad. Capped so a lost event can never strand the player.
  const handles: Array<{ remove(): Promise<void> }> = [];
  let closed!: () => void;
  const closedP = new Promise<void>((resolve) => { closed = resolve; });
  const cap = new Promise<void>((resolve) => setTimeout(resolve, AD_CLOSE_CAP_MS));
  try {
    const AdMob = getAdMob();
    for (const ev of ['interstitialAdDismissed', 'interstitialAdFailedToShow']) {
      try { handles.push(await AdMob.addListener(ev, () => closed())); } catch { /* no events: cap only */ }
    }
    try { await AdMob.showInterstitial(); } catch { closed(); /* not shown: nothing to wait for */ }
    await Promise.race([closedP, cap]);
  } catch { /* not native */ } finally {
    for (const h of handles) h.remove().catch(() => {});
    pending = false;
  }
}
const AD_CLOSE_CAP_MS = 60_000;
