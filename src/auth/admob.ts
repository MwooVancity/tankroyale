/**
 * AdMob interstitial — every 3rd match, shown when the player leaves results.
 * Auto-dismissed after 10 seconds regardless of ad state.
 * Silently no-ops in browser / if network is down.
 *
 * UMP consent: collected once on first run (required by AdMob ToS for EU/EEA
 * users under GDPR). Result is cached by the Google UMP SDK — no repeated prompts.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_ID ='ca-app-pub-8997828618122077/6954732609';

let initialized = false;
let pending = false;

async function getAdMob() {
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
}
let adMobPlugin: AdMobApi | undefined;

async function ensureConsent(AdMob: Awaited<ReturnType<typeof getAdMob>>): Promise<void> {
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
    const AdMob = await getAdMob();
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

let matchesSinceAd = 0;
const MATCHES_PER_AD = 3; // one interstitial every 3rd match, not every match
const FIRST_SEEN_KEY = 'tr.ads.firstSeenMs';
const FIRST_SESSION_MS = 30 * 60e3;

/**
 * Never an ad in a player's first session: the first process that reaches a
 * match end records the time, and that process stays ad-free for 30 min
 * (most players who leave do so on day 1). Storage blocked = treat as first.
 */
let firstSeenMs = 0;
try {
  firstSeenMs = Number(localStorage.getItem(FIRST_SEEN_KEY)) || 0;
  if (!firstSeenMs) { firstSeenMs = Date.now(); localStorage.setItem(FIRST_SEEN_KEY, String(firstSeenMs)); }
} catch { firstSeenMs = Date.now(); }
export function inFirstSession(nowMs = Date.now(), seenMs = firstSeenMs): boolean {
  return nowMs - seenMs < FIRST_SESSION_MS;
}

/** Called once per finished match: true = this match owes an ad when the player leaves results. */
export function takeAdTurn(): boolean {
  if (inFirstSession()) return false;
  matchesSinceAd += 1;
  if (matchesSinceAd < MATCHES_PER_AD) return false;
  matchesSinceAd = 0;
  return true;
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
      await (await getAdMob()).prepareInterstitial({ adId: AD_ID });
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
  const done = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
  const ad = (async () => {
    try { await (await getAdMob()).showInterstitial(); } catch { /* cancelled: fine */ }
  })();
  try {
    await Promise.race([ad, done]);
  } finally {
    pending = false;
  }
}
