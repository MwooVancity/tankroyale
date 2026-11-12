// Save-migration bridge (Unity PLAN E12, PM 2026-11-11). The Unity build that
// replaces this app cannot read WebView localStorage, so every launch and every
// move to the background mirrors ALL save keys into Android SharedPreferences
// "tankroyale_bridge" (android/.../SaveBridgePlugin.java). Unity reads them once,
// writes its own save and marks them migrated. Copying every key (not a list)
// means a key added later can never be left behind.
import { registerPlugin, Capacitor } from '@capacitor/core';

export const BRIDGE_SCHEMA = 1;

/** Every save key the game writes today (all start with "tr."), for the Unity
 *  importer. Prefix entries end with "." and are followed by a tank spec id.
 *  The bridge copies whatever is in storage; this list documents meaning only.
 *  saveBridge.selftest.mjs fails when the source gains a "tr." key not listed. */
export const KNOWN_SAVE_KEYS: Record<string, string> = {
  'tr.profile.v2': 'profile JSON: currency, unlocks, stats, player progress (src/game/profile.ts)',
  'tr.settings.v1': 'gameplay settings JSON incl. leftHanded, sensitivity, volumes (src/game/input.ts)',
  'tr.bindings.v1': 'primary key bindings JSON (desktop)',
  'tr.bindings2.v1': 'secondary key bindings JSON (desktop)',
  'tr.bindings.layout.v3': 'bindings migration receipt',
  'tr.padBindings.v1': 'gamepad bindings JSON',
  'tr.lastTank.v1': 'last selected tank spec id',
  'tr.garage.variant': 'garage display variant',
  'tr.camo.': 'prefix + specId: chosen camo pattern id per tank',
  'tr.camoCustom.v1.': 'prefix + specId: custom camo JSON per tank',
  'tr.player.id.v1': 'stable local player id',
  'tr.player.name.v1': 'player display name',
  'tr.ranked.identity.v1': 'ranked identity JSON',
  'tr.google.user.v1': 'Google sign-in user JSON (id, name)',
  'tr.google.asked': 'sign-in prompt already shown flag',
  'tr.game.mode.v1': 'last chosen game mode id',
  'tr.room.size.v1': 'last private room size',
  'tr.gfxPreset': 'desktop graphics preset',
  'tr.gfxMobilePreset': 'phone graphics preset',
  'tr.gfxAutoTier': 'auto-detected device tier',
  'tr.gfxAutoTierPolicy': 'auto-tier policy version',
  'tr.netdiag.v1': 'network diagnostics panel visible flag',
  'tr.review.battles': 'battles counted for the rating prompt',
  'tr.review.lastAskMs': 'last rating prompt time (ms epoch)',
  'tr.ads.battles.v1': 'lifetime finished battles for ad pacing (first 2 ad-free)',
  'tr.ads.firstSeenMs': 'legacy (before 2026-11-12): first app open time, no longer read',
};

/** All localStorage entries as strings (the bridge payload). */
export function snapshotSaves(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k == null || k.startsWith('__')) continue; // "__" names are the bridge's own
    const v = storage.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

interface SaveBridgeNative { write(o: { entries: Record<string, string>; schema: number }): Promise<{ written: number }> }

/** Android app only: mirror saves now (after boot settles) and on every background. */
export function installSaveBridge(): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const native = registerPlugin<SaveBridgeNative>('SaveBridge');
  const flush = () => {
    try {
      native.write({ entries: snapshotSaves(localStorage), schema: BRIDGE_SCHEMA }).catch(() => {});
    } catch { /* storage blocked: next flush retries */ }
  };
  // Off the boot path: time to battle matters more than a few seconds of lag here.
  setTimeout(flush, 8000);
  // Background = the moment an update can replace the app; earnings since
  // launch must be in the bridge by then.
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appStateChange', ({ isActive }) => { if (!isActive) flush(); });
  }).catch(() => {});
}
