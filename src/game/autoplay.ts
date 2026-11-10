// Self-test autoplay (2026-11-09). Started only by Firebase Test Lab's Game Loop
// intent (com.google.intent.action.TEST_LOOP, also run by Play's pre-launch
// report) or locally by `adb shell am start -n app.tankroyale/.MainActivity
// --ez autoplay true --ei scenario 1`. A normal launch gets scenario 0 and
// nothing here runs. Scenario 1: garage -> Bots battle -> end screen, 3 times,
// through the same buttons a player taps. The game times itself (Test Lab's
// fps metric does not see WebView frames) and writes one JSON result.
import { registerPlugin } from '@capacitor/core';

/** 3 battles of at most 10 min plus loads fit; Test Lab's virtual cap is 60 min. */
export const AUTOPLAY_WATCHDOG_MS = 40 * 60000;
type Bus ={ on(ev: string, fn: (e: any) => void): void };
type Native = { get(): Promise<{ scenario: number; map?: string }>; finish(o: { json: string }): Promise<void> };

/** Frame intervals (ms) of one battle -> per-second fps p10/p50 and freezes > 2 s. */
export function summarizeFrames(deltas: number[]) {
  const fps: number[] = [];
  let acc = 0, n = 0;
  const freezes = deltas.filter((d) => d > 2000).length;
  for (const d of deltas) {
    if (d > 2000) { acc = 0; n = 0; continue; } // a freeze is counted, not averaged in
    acc += d; n++;
    if (acc >= 1000) { fps.push((1000 * n) / acc); acc = 0; n = 0; }
  }
  fps.sort((a, b) => a - b);
  const q = (p: number) => (fps.length ? Math.round(fps[Math.floor(fps.length * p)] * 10) / 10 : null);
  return { fpsP10: q(0.1), fpsP50: q(0.5), seconds: fps.length, freezes, worstFrameMs: Math.round(Math.max(0, ...deltas)) };
}

// ponytail: no JS heap number; WebView buckets performance.memory (read 11 MB all run). Memory = adb PSS.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function click(sel: string, maxMs: number) {
  const end = performance.now() + maxMs;
  while (performance.now() < end) {
    // Tap first, like a finger: the boot screen ("Ready for battle") only
    // leaves on a tap, and buttons under it already count as visible.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await wait(1000);
    const b = document.querySelector<HTMLElement>(sel);
    if (b && b.offsetParent !== null) { b.click(); return true; }
  }
  return false;
}

export async function installAutoplay(bus: Bus): Promise<void> {
  let native: Native;
  let scenario = 0, map = '';
  try {
    native = registerPlugin<Native>('Autoplay');
    const got = await native.get();
    scenario = got.scenario || 0;
    map = got.map || '';
  } catch { return; } // web build / plugin missing: never autoplay
  // Scenario 2 = scenario 1 on monsoon, the heaviest map (Game Loop passes only a number).
  if (scenario === 2) map ||= 'monsoon';
  else if (scenario !== 1) return;
  console.info(`[autoplay] scenario ${scenario} start`);
  let presented = 0, ended: unknown = null, deltas: number[] = [], last = 0, inBattle = false, visAt = -1e9;
  bus.on('battle:rollout', () => { if (inBattle) return; presented = performance.now(); inBattle = true; deltas = []; last = 0; });
  bus.on('battle:ended', (e) => { ended = e?.result ?? 'ended'; inBattle = false; });
  const frame = (t: number) => {
    // Background time is not a freeze (home button, screen off).
    // Frames within 3 s of a visibility change can span the background gap: not a freeze.
    if (inBattle && !document.hidden) { if (last && t - visAt > 3000) deltas.push(t - last); last = t; } else last = 0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const out: Record<string, unknown> = { scenario, battles: [] as unknown[], errors: 0, resumeMs: [] as number[] };
  addEventListener('error', () => { (out.errors as number)++; });
  // Render loop must come back after home / screen off: time from visible to the next frame.
  document.addEventListener('visibilitychange', () => {
    visAt = performance.now(); last = 0;
    if (document.hidden) return;
    const at = performance.now();
    requestAnimationFrame(() => {
      const ms = Math.round(performance.now() - at);
      (out.resumeMs as number[]).push(ms);
      console.info(`[autoplay] resume ${ms}ms`);
    });
    // Background pauses a solo battle (pause menu); press Resume like a player.
    setTimeout(() => {
      const b = document.querySelector<HTMLElement>('.resume');
      if (b && b.offsetParent !== null && b.textContent === 'Resume') { b.click(); console.info('[autoplay] pressed Resume'); }
    }, 1500);
  });
  let finished = false;
  const finish = async (why: string) => {
    if (finished) return;
    finished = true;
    out.end = why;
    const json = JSON.stringify(out);
    console.info(`[autoplay] result ${json}`);
    try { await native.finish({ json }); } catch { /* results file unwritable: logcat keeps it */ }
  };
  // Watchdog: a hang still writes what it has and ends the Game Loop.
  setTimeout(() => { void finish('watchdog'); }, AUTOPLAY_WATCHDOG_MS);
  await wait(8000); // garage settles
  if (map) {
    // Tap the map's card in the garage, like a player choosing it (id is [a-z0-9-], checked natively).
    // The map grid can sit in a closed panel: click the card once it exists, visible or not.
    let picked = false;
    for (let t = 0; t < 30 && !picked; t++) {
      const card = document.querySelector<HTMLElement>(`.mthumb.${map}`)?.closest<HTMLElement>('.cot-map-card');
      if (card) { card.click(); picked = true; } else await wait(1000);
    }
    console.info(`[autoplay] map ${map} picked=${picked}`);
  }
  for (let i = 0; i < 3; i++) {
    presented = 0; ended = null;
    const tapAt = performance.now();
    const ok = i === 0 ? await click('.cot-battle', 60000) : await click('.cot-es-btn.prime', 60000);
    const battle: Record<string, unknown> = { tapped: ok };
    while (!presented && performance.now() - tapAt < 180000) await wait(500);
    battle.tapToFightMs = presented ? Math.round(presented - tapAt) : null; // load + countdown
    while (presented && ended === null && performance.now() - presented < 600000) await wait(1000);
    Object.assign(battle, { result: ended }, summarizeFrames(deltas));
    (out.battles as unknown[]).push(battle);
    console.info(`[autoplay] battle ${i + 1} ${JSON.stringify(battle)}`);
    if (!presented || ended === null) break;
    await wait(15000); // killcam + any match-end ad, then the end screen buttons
  }
  await finish('done');
}
