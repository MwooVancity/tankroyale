/**
 * AdMob interstitial — fires once after each match ends.
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

/**
 * Show a 10-second interstitial after a match ends.
 * Resolves after ad closes or 10s — whichever comes first.
 */
export async function showMatchEndAd(): Promise<void> {
  if (pending) return;
  pending = true;

  const done = new Promise<void>((resolve) => setTimeout(resolve, 10_000));

  const ad = (async () => {
    try {
      if (!await ensureInit()) return;
      const AdMob = await getAdMob();
      await AdMob.prepareInterstitial({ adId: AD_ID });
      await AdMob.showInterstitial();
    } catch { /* no Android, cancelled, network down — fine */ }
  })();

  try {
    await Promise.race([ad, done]);
  } finally {
    pending = false;
  }
}
