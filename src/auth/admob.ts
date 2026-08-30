/**
 * AdMob interstitial — fires once after each match ends.
 * Auto-dismissed after 10 seconds regardless of ad state.
 * Silently no-ops in browser / if network is down.
 */

const TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712'; // Google test ID

declare const ADMOB_INTERSTITIAL_ID: string | undefined;
const AD_ID =
  typeof ADMOB_INTERSTITIAL_ID !== 'undefined' && ADMOB_INTERSTITIAL_ID
    ? ADMOB_INTERSTITIAL_ID
    : TEST_INTERSTITIAL_ID;

let initialized = false;
let pending = false;

async function getAdMob() {
  const pkg = '@capacitor-community/admob';
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const { AdMob } = await (new Function('p', 'return import(p)'))(pkg) as {
    AdMob: {
      initialize(opts: object): Promise<void>;
      prepareInterstitial(opts: { adId: string }): Promise<void>;
      showInterstitial(): Promise<void>;
    };
  };
  return AdMob;
}

async function ensureInit(): Promise<boolean> {
  if (initialized) return true;
  try {
    const AdMob = await getAdMob();
    await AdMob.initialize({});
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

  await Promise.race([ad, done]);
  pending = false;
}
