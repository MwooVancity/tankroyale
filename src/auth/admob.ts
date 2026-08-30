/**
 * AdMob interstitial — fires once after each match ends.
 * Auto-dismissed after 10 seconds regardless of ad state.
 * Silently no-ops in browser / if network is down.
 */

const AD_ID = 'ca-app-pub-8997828618122077/6954732609';

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
