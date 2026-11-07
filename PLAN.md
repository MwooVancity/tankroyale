# Tank Royale plan

**Goal:** a playable Android game on Google Play (app.tankroyale) that lifts the 2.25-star rating ("couldn't even play").
**Reader:** a phone player starting a Bots battle.

## Numbers (dated)
- 2026-11-07: "0 allies 0 enemies" root cause (build 86 Test Lab screenshot, Pixel 6a Android 12): bots DID spawn (allies visible on screen); the HUD's big numbers were kill scores (start at 0) and the loading screen hard-coded "Allies 0 / Enemies 0". Fixed: HUD shows tanks alive per team, loading shows "–" until rosters arrive. Logcat now proves it: `[perf] ... bots=7/7`.
- 2026-11-07: Pixel 6a on-phone A/B lab (`VITE_PERF_LAB=1`, `src/engine/perfLab.ts`, Test Lab vc871-873, fps): build-86 base 11.7; shadows frozen 11.8; no post chain 12.3; Lambert override 44.4; half resolution 27.6. Cost = per-pixel world material shading + 6 idle point lights + alpha grass, not draw calls, shadows or post.
- 2026-11-07: shipped Performance preset (`liteMaterials`): Lambert world/vehicle surfaces, one-read terrain, 4x terrain aniso, idle point lights hidden, grass to 70 m: 20-24 fps at battle start, 15-17 late battle (burning wrecks/smoke + main thread 35-55 ms). Output 1.5x via FSR costs ~0 fps (24.8 vs 23.5); 2.0x = 20.7, native 19.7. Target 30 NOT reached.
- 2026-11-07: online: relay caps dropped 44.5% of a 2v2 room's traffic (`server/signalRelayRate.selftest.mjs`) -> fixed (0.2% loss, control channel never dropped). Cold Render server: app client failed its 5 s connect; /health took 8 s to wake -> Play menu wakes the server, 15 s connect.
- 2026-11-06: Production = 1.86.0 [86], committed via `tools/play.mjs promote`, sent for Google review (auto). Previous production: 77.
- 2026-11-06: Pixel 6a Android 12 (Test Lab), Bots battle, 0 crashes. Perf log (5 s windows): build 85 = 11-12 fps (frame 80-90 ms, main thread ~43 ms, canvas 2401x1081); build 86 = 12-16 fps (frame 63-80 ms, main thread 28-36 ms, canvas 915x412). The on-screen badge read 9 at one screenshot. Target 60: not reached.
- 2026-11-06: build 82 (bot mesh merge only): 9 fps on Pixel 6a = no change; draw calls were not the phone limit.
- 2026-11-06: bot draw calls (Node scene-graph count, 9 bots, `node tools/tank-draw-count.mjs`): 495 -> 311 at 60 m, 344 -> 252 at 100 m.
- 2026-11-06: sim + bot AI = 0.41 ms/tick for 10 bots (desktop, `node tools/sim-tick-cost.mjs`): not the bottleneck.
- 2026-11-06: online relay live on Render: `node tools/relay-live-check.mjs` -> "delivered relay-ok" (Render auto-deploys on push to tank-royale-main).

## What the phone frame is (Pixel 6a, 2026-11-07 ship build)
GPU still sets the pace at the start of a battle (frame ~42 ms, main thread ~21 ms). Late in a battle the main thread grows to 35-55 ms (FX, more AI contacts), and the GPU frame grows to ~60 ms (smoke and fire overdraw).

## Next
1. Late-battle cost: smoke and fire overdraw plus the LateFx pass (4 full-screen passes while any FX is alive), and main-thread JS (35-55 ms). Measure with perfLab configs.
2. Terrain and foliage keep their PBR hook shaders. A Lambert port of the terrain hook is the remaining big GPU win (the Lambert override measured 44 fps).
3. Shadow sampling: PCFSoft to PCF on the Performance preset (not yet measured).
4. Budget phones (Play ANRs: Galaxy A13 / Helio G85 class) are 2-4x weaker than a Pixel 6a: target them next.
5. Online, not fixed: a mid-match Wi-Fi to LTE switch cannot fall back to the relay (`webrtcPeer.ts` activateRelay); a known player id can take over a seat (`server/roomStore.ts`). Two-phone online test on mobile data is NOT done.
6. App bundle is 213 MB of web files (website-only media/icons): prune (separate task).
7. Review replies + in-app review prompt.

## Owner-only
- Play Console: declare Trader status; confirm "Contains ads" and advertising ID in Data safety.
- (Dropped 2026-11-06: Cloudflare TURN; replaced by the server relay.)

## Tools
- Phone fps: `APK=<debug apk> ROBO=tools/testlab-robo-battle.json MODEL=bluejay API=32 node tools/testlab.mjs <sa.json> <label>`; it prints a GATE line (>= 6 battle [perf] lines, enemies present, p10 fps >= MIN_FPS default 30). Max 5 physical runs/day.
- Phone A/B lab: build with `VITE_PERF_LAB=1`, run with `ROBO=tools/testlab-robo-battle-long.json TIMEOUT=600s`, read the `[lab]` lines.
- Play: `node tools/play.mjs <sa.json> tracks|promote <vc> "<notes>"`. Never while CI's upload is running.

Latest handoff: `docs/handoffs/HANDOFF_android-perf_11-04_19-40.md` (superseded by this file for numbers).
