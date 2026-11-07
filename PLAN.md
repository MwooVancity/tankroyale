# Tank Royale plan

**Goal:** a playable Android game on Google Play (app.tankroyale) that lifts the 2.25-star rating ("couldn't even play").
**Reader:** a phone player starting a Bots battle.

## Numbers (dated)
- 2026-11-07: PRODUCTION = 1.87.0 [87] (promoted via tools/play.mjs, notes "smoother and sharper", sent for Google review). Evidence: vc874 (87's code, Pixel 6a Android 12) fps p10 20.6 / p50 26.9 / p90 29.9, bots 7/7, 0 crashes; end screen proven on vc878 (same end-screen code, 4-min QA round).
- 2026-11-07: vc878 (commit 92ee4b8c code: + Lambert terrain and leaves, Pixel 6a): fps p10 14.6 / p50 20.2 / p90 27.3; 25-30 fps for the first ~2 min, 17-20 in heavy combat with the main thread at 40-50 ms. The combat frame is now main-thread bound. [round] end "defeat", 0 crashes. Not clearly better than vc874 (different battle each run).
- 2026-11-07: FINAL clean build (commit 9e3838ab, debug APK, Test Lab vc874, Pixel 6a Android 12, Bots battle, 102 [perf] samples): fps p10 20.6 / p50 26.9 / p90 29.9 (build-86 equivalent vc871: 10.1 / 10.5 / 12.3). Canvas 1372x618 (1.5x), HUD 'ALLIES 6 / ENEMY 6', bots=7/7 at start, 0 crashes. Release gate FAILS the 30 fps bar: pushed to alpha only, NOT promoted to production. Round end not reached (the Robo player sits idle). Online two-phone test NOT done on Android.
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

## Edge cases (written 2026-11-07, before the next batch; each gets a check that fails without its guard)
- A. CI Play upload, two pushes close together: FOUND. Pushes 92ee4b8c and 40be663b, 2 min apart, both failed with "This edit has expired". Build 88 never reached alpha; alpha is still 87. Breaks at any 2 pushes inside one ~4 min build. A `tools/play.mjs` edit during a CI upload breaks it the same way. Guard: a workflow `concurrency` queue (never cancel). Proof: the next push's run is green and `tracks` shows the new vc.
- B. Phone-only lite materials, garage repaint: on Performance, the 1 s lite scan also runs in the garage/studio (`post.render`). The Lambert copy took a copy of the color, so a camo or paint change (`retintEntryFittings` sets `rec.m.color`) does not reach the wheels and fittings on screen. Map textures are shared, so camo itself does update. Guard: the copy shares the source's Color objects. Check: a selftest that recolors the source and reads the copy.
- C. Lite scan cost grows with the scene: one full scene traverse per second. Late battle has more wrecks and debris; at about 20k objects it is roughly a 2 ms hitch once a second on a Pixel 6a (estimate, unmeasured). Guard: lab #4 `split` shows it; skip meshes already scanned if it shows up.
- D. Perf lab code must never ship: `VITE_PERF_LAB` is set only by the local lab build. CI never sets it, so the lab is skipped. Check: grep the workflow env.
- E. Lab measurements are noisy: each Test Lab run plays a different battle (±3 fps). Only A/B rows inside one run are compared; cross-run claims say "not clearly better". Quota is 5 physical runs a day; virtual devices are too slow for battles.
- F. Main-thread fix (unknown until lab #4): any change to sim or AI timing must keep online host/client states in step. HUD DOM writes every frame force layout; write only on change. Breaks at the largest battle (16 tanks plus a late-battle FX peak).
- G. Online Wi-Fi to LTE mid-match: the ICE path dies, and the relay must take over without duplicate or reordered inputs, even when both phones switch at once. Render free tier sleeps after 15 min idle (the keep-awake job covers it). Per-connection cap is 4,000 messages per window; a 15-minute match at game rates must stay under it (the selftest covers the 2v2 rate).
- H. Seat takeover by a known player id: the guard must still let the real player reconnect after a drop (same device, new socket). Needs a per-seat secret, not just the id.
- I. Bundle prune: deleting a file the app loads gives a missing texture or sound at runtime. Guard: build the list of files the app references, and delete only files nobody references.
- J. Budget phones (Galaxy A13 class): may not be in the Test Lab catalog; check the catalog before planning around it.

## Next
0. Lab #4 is built and waiting (Test Lab quota exceeded 2026-11-07): `VITE_PERF_LAB=1` build. It reads the new `[perf] split=sim,cam,world,fx,hud,light,render` and tests hiding the reticle or the whole HUD, shadows off, and 1.0x output. Fix the biggest main-thread part next.
1. Late-battle cost: smoke and fire overdraw plus the LateFx pass (4 full-screen passes while any FX is alive), and main-thread JS (35-55 ms). Measure with perfLab configs.
2. (Done in 92ee4b8c: Lambert terrain and leaves on Performance.)
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
