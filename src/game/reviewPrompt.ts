// Play In-App Review: ask once after a WON solo (Bots) battle, never after a
// loss/draw, an online match, or a session that logged a JS error; at most
// once per 30 days (Play also quotas it and may show nothing). Asked from the
// end screen after the killcam, only on a match with no interstitial ad.
import { registerPlugin } from '@capacitor/core';

export const REVIEW_KEY = 'tr.review.lastAskMs';
export const REVIEW_GAP_MS = 30 * 864e5;
export const BATTLES_KEY = 'tr.review.battles';
/** A few sessions in: never on a first win in the first minutes of play. */
export const REVIEW_MIN_BATTLES = 5;

export interface ReviewCtx { result: unknown; online: boolean; errored: boolean; lastAskMs: number; nowMs: number; battles: number }

export function shouldAskReview(c: ReviewCtx): boolean {
  return c.result === 'victory' && !c.online && !c.errored && c.battles >= REVIEW_MIN_BATTLES
    && !(c.nowMs - c.lastAskMs < REVIEW_GAP_MS);
}

let errored = false;
let armed = false;
// A runtime import() of a Capacitor plugin cannot resolve in the packaged app
// (see src/auth/admob.ts); registerPlugin binds to the native side.
let plugin: { requestReview(): Promise<void> } | undefined;

/** Wire once at boot. `online()` says whether the battle was a network match. */
export function installReviewPrompt(bus: { on(ev: string, fn: (e: any) => void): void }, online: () => boolean): void {
  addEventListener('error', () => { errored = true; });
  addEventListener('unhandledrejection', () => { errored = true; });
  bus.on('battle:ended', (e) => {
    let last = 0, battles = 0;
    try {
      last = Number(localStorage.getItem(REVIEW_KEY)) || 0;
      battles = (Number(localStorage.getItem(BATTLES_KEY)) || 0) + 1;
      localStorage.setItem(BATTLES_KEY, String(battles));
    } catch { /* storage blocked: battles stays 0, never asks */ }
    armed = shouldAskReview({ result: e?.result, online: online(), errored, lastAskMs: last, nowMs: Date.now(), battles });
  });
}

/** End screen calls this after the killcam on a match that showed no ad. */
export async function askReviewIfArmed(): Promise<void> {
  if (!armed || errored) return;
  armed = false;
  try { localStorage.setItem(REVIEW_KEY, String(Date.now())); } catch { /* storage blocked */ }
  try {
    plugin ??= registerPlugin<{ requestReview(): Promise<void> }>('InAppReview');
    await plugin.requestReview();
    console.info('[review] requested');
  } catch (err) { console.warn('[review] unavailable', String(err).slice(0, 120)); }
}
