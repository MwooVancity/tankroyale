# Tank Royale plan

**Goal:** a playable Android game on Google Play (app.tankroyale) that lifts the 2.25-star rating ("couldn't even play").
**Reader:** a phone player starting a Bots battle.

## Numbers (dated)
- 2026-11-06: Production = 1.86.0 [86], committed via `tools/play.mjs promote`, sent for Google review (auto). Previous production: 77.
- 2026-11-06: Pixel 6a Android 12 (Test Lab), Bots battle, 0 crashes. Perf log (5 s windows): build 85 = 11-12 fps (frame 80-90 ms, main thread ~43 ms, canvas 2401x1081); build 86 = 12-16 fps (frame 63-80 ms, main thread 28-36 ms, canvas 915x412). The on-screen badge read 9 at one screenshot. Target 60: not reached.
- 2026-11-06: build 82 (bot mesh merge only): 9 fps on Pixel 6a = no change; draw calls were not the phone limit.
- 2026-11-06: bot draw calls (Node scene-graph count, 9 bots, `node tools/tank-draw-count.mjs`): 495 -> 311 at 60 m, 344 -> 252 at 100 m.
- 2026-11-06: sim + bot AI = 0.41 ms/tick for 10 bots (desktop, `node tools/sim-tick-cost.mjs`): not the bottleneck.
- 2026-11-06: online relay live on Render: `node tools/relay-live-check.mjs` -> "delivered relay-ok" (Render auto-deploys on push to tank-royale-main).

## What the phone frame is (Pixel 6a, build 86)
GPU ~2x main thread: frame ~70 ms vs main thread ~32 ms at 915x412. Remaining GPU cost is scene shading (3 CSM shadow cascades sampled per fragment, physical hull material, 343 shader programs), not resolution.

## Next
1. Shadows on the Performance preset: 1-2 cascades or shadows off for far objects (`src/engine/lighting.ts` cascadeCount, `quality.ts` mobile-low). Measure with the `[perf]` logcat line on Test Lab Pixel 6a (`MODEL=bluejay API=32`).
2. Main thread ~32 ms: profile on a phone (adb + chrome://inspect when the owner's phone is available); not a desktop browser.
3. Online play on two real phones (relay path) is NOT tested on Android.
4. Review replies + in-app review prompt.

## Owner-only
- Play Console: declare Trader status; confirm "Contains ads" and advertising ID in Data safety.
- (Dropped 2026-11-06: Cloudflare TURN; replaced by the server relay.)

## Tools
- Phone fps: `APK=<debug apk> ROBO=tools/testlab-robo-battle.json MODEL=bluejay API=32 node tools/testlab.mjs <sa.json> <label>`, then `grep "[perf]"` in the logcat. Max 5 physical runs/day.
- Play: `node tools/play.mjs <sa.json> tracks|promote <vc> "<notes>"`. Never while CI's upload is running.

Latest handoff: `docs/handoffs/HANDOFF_android-perf_11-04_19-40.md` (superseded by this file for numbers).
