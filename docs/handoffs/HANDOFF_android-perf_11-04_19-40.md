# Handoff: Tank Royale Android: 60 fps + release (2026-11-04 19:40)

Branch `tank-royale-main`, HEAD `16a7a9f7`. Repo `C:\Users\mwoo7\Desktop\tank-royale` (GitHub MwooVancity/tankroyale). The session ran from `calcscrape`; start the next one IN the tank-royale folder.

## Summary
The Android game now provably reaches and runs a Bots battle on real phones (Test Lab). Build 77 was promoted to Production at the owner's order and is in Google review. The owner wants **60 fps minimum**: the Pixel 6a runs a battle at 7 fps (Balanced) / 9 fps (Performance). Root cause was measured locally: AI tanks are drawn as 20-79 sub-meshes each. The next job is merging AI tank sub-meshes.

## Work order position
No `docs/WORK-ORDER.md` or `state/grind-active.json` in this repo (those are calcscrape's). Live state is in `PLAN.md` (created this session).

## Work completed (all committed + pushed)
- [x] `tools/dvh-fallback.mjs` + `vite.config.js` (`dvhFallbackPlugin`, `build.cssTarget: 'chrome94'`): vh copy before every dvh/svh rule (WebView <108 dropped them). Built CSS 31/35 covered; the 4 left are web-only gallery/home pages.
- [x] `src/engine/frameLoopScheduler.ts` `restart()` no-op before boot completes (root cause of the early-frame `studio` crash); selftest fails on old code.
- [x] `src/ui/playMenu.ts` `defaultIceUrl()`: the app asks the signal server's `/api/ice` (localhost/api/ice = index.html).
- [x] `src/net/iceConfig.ts:163` AbortError counts as timeout. `index.html` structuredClone polyfill copies bare ArrayBuffers.
- [x] `src/ui/nativeApp.ts` shared `isNativeApp()` (uses `globalThis`, Node tests import it) used by garage.js, studioPanel.ts, githubStars.ts, playMenu.ts.
- [x] Stale `capgo-capacitor-updater` removed from `android/capacitor.settings.gradle` + `android/app/capacitor.build.gradle`.
- [x] `src/engine/quality.ts`: `MOBILE_DEFAULT_PRESET = 'mobile-low'`; `reportSustainedOverload()` steps phones down (was `return false`). `src/ui/settings.ts` reset uses it. `quality.selftest.mjs` updated.
- [x] `server-render.ts`: static STUN list only when `COT_CLOUDFLARE_TURN_KEY_ID` unset; `render.yaml` declares both TURN env vars `sync: false`.
- [x] `src/world/propsModelStore.ts`: sniff gzip magic bytes, not Content-Encoding (Vite preview sent `gzip` + undecoded bytes; battle entry threw `invalid prop archive signature`).
- [x] `src/engine/post.ts` (late-FX pass ~line 1600): `shadowMap.autoUpdate=false` during the layer-30 render (shadow cascades were redrawn there).
- [x] `tools/mobile-frame-probe.mjs` (new), `tools/testlab.mjs` (`ROBO=`, `MODEL=`/`API=` single phone), `tools/testlab-robo-battle.json` (waits 45 s, taps WebView, taps BATTLE, waits 120 s).

| Decision | Why | Alternative rejected |
|---|---|---|
| Fix dvh in the build plugin, not per rule | covers all ~40 rules and future ones | hand-editing CSS |
| Promote 77 before device proof | owner: "push 77 first live" | waiting for the Test Lab result |
| Phones default to Performance | Balanced = 7 fps on Pixel 6a | keep Balanced |
| Measure locally with headed Chrome + 4x CPU throttle | matches phone (11 fps vs 9 real); no Test Lab quota | more Test Lab runs (5 physical/day) |
| Merge AI tank sub-meshes next | 9 tanks ~480 draws vs world 185 | cutting bot count (gameplay change) |
| Refused: posting own 5-star rating | Play rating manipulation = account ban | n/a; offered in-app review API + review replies |

## Files affected
Modified/created: listed above. Uncommitted and NOT this session's (leave alone): `.gitignore` (adds research_notes/ reports/ is calcscrape's? no: tank-royale `.gitignore` diff predates; check before committing), `docs/HANDOFF-2026-09-22.md`, `graphify-out/`, `src/graphify-out/`, `public/brand/store-assets/`, `tools/gen-store-assets*.mjs`, `tools/resize-icon.mjs`.

## Technical context
- Probe: `npm run build:mobile && node tools/mobile-frame-probe.mjs 4` (headed Chrome window opens; headless falls back to software GL and stalls). Enters battle via `window.__DEBUG.startBattle('m1a2')` (the real BATTLE button opens the play menu; a JS `.click()` does not start). `NOSHADOW=1` freezes shadow updates.
- Last measurements (4x CPU, 915x412 @ DPR 2.625, `?tier=mobile`): ~11 fps, frame gap median 90 ms; main world render 50 ms with 646 draw calls; shadows ~227 calls / ~7 ms; late-FX pass 2.6 ms; JS outside render ~30 ms; post passes <2 ms total.
- Visible meshes: `world-verdant` 185 (102 instanced); tanks: k2b 79, m1a2_tusk 71, type10 65, challenger2e 62, ua_challenger2 60, m1a2 59, m1a1 39, merkava4b 23, t84 20.
- Test Lab: `APK=<debug apk> ROBO=tools/testlab-robo-battle.json MODEL=bluejay API=32 node tools/testlab.mjs <sa.json> <label>`; key `C:/Users/mwoo7/Downloads/asmr-directory-497009-6bf09abb9247.json` (never commit). Debug APK: `gh run download <run id> -n tank-royale-debug`. The FPS badge in the screenshots is the measurement. CPU metrics: calcscrape scratchpad `perfmetrics.mjs` (toolresults perfSampleSeries).
- Play scripts (scratchpad, not in repo): `playpromote.mjs <sa> <versionCode> "<notes>"`, `playtracks.mjs <sa>` (read-only).

## Things to know
- AI tank detail: vehicles have high/preview/AI tiers (`src/engine/quality.ts` `vehicleTextureScale`, materials.js). Turrets/barrels/tracks animate and damage may hide parts: merge static parts per moving node and per material, never across moving nodes.
- CI Play upload: first step auto-submits; fallback adds `changesNotSentForReview`, which Play now REFUSES ("Changes are sent for review automatically..."). Builds 79/80 failed only because the auto step hit "This edit has expired" (my concurrent promote). If it recurs without a concurrent edit, make the fallback retry auto-submit instead.
- Selftests failing before this session's changes (not caused by them): `tools/attribution-audit.mjs` (LICENSE says "Kevin B. Liu", test expects "alice B. Liu"), `src/presentation/publicNav.selftest.mjs` (home.html repository controls).
- `tools/mobilelap.mjs` (existing perf lap) is broken: its BATTLE click never enters battle.
- Fujitsu F-01L ships WebView 70, so it gets the "Update needed" gate (correct).
- Capacitor logs "Error injecting safe area CSS: TypeError ... 'style'" ~6x at boot on Pixel 6a; harmless so far.

## Current state
- Verified this session (named device): Bots battle running, 0 crashes: Pixel 6a Android 12 (builds 77 and 79), Nothing Phone (4a) Android 16 (build 77). Update gate on Fujitsu F-01L Android 8.1 (WebView 70).
- Run this session: `tsc --noEmit` exit 0; `npm run build:mobile` exit 0; quality, frameLoopScheduler, dvh-fallback, propsModelStore, iceConfig, settings*/touchControls* selftests pass; pre/core suites ran with only the 2 pre-existing failures above.
- Not tested on Android: online play, ads, sign-in, Back on every screen, WebView 94-107, builds 78+ (only 79 on Pixel 6a).
- Play: production `1.77.0 [77]` committed and sent for review; alpha `1.77.0 [77]`. CI build 81 (HEAD) in progress.

## Next steps
1. Merge AI tank sub-meshes (start: `grep -rn "createTank\|tankFactory" src/vehicles src/game | head`; check `src/vehicles/tankFactoryCore.js`). Target: tank draw calls 480 -> <60. Measure with the probe before and after.
2. Then JS ~30 ms: profile with Chrome performance trace in the probe (sim, AI, HUD).
3. Confirm on Pixel 6a via Test Lab (`MODEL=bluejay`), read FPS from screenshot.
4. Reply drafts for the bad Play reviews (owner approves before posting); consider the Play In-App Review API after a won battle.
5. BLOCKED (owner): Cloudflare dashboard -> My Profile -> API Tokens -> add "Realtime: Edit" to the calcscrape token. Then create TURN key via `POST /accounts/{id}/calls/turn_keys` (script: calcscrape scratchpad `cf-turn.mjs <env> <outfile>`), host /api/ice on a Cloudflare Worker (no Render login available), set `VITE_ICE_CONFIG_URL`.

## Open questions
- Owner: "I want 60fps" / "Minimum". 60 on every phone is not promised; state the measured number per device.
- Owner said "push 77 first live"; done.
- Trader status: told the owner to declare Trader (ads = trader); owner must fill it in Play Console.

## Session notes
- Owner is injured, can't use hands; non-coder; wants everything done without questions.
- The built-in browser tool is denied by the app; the Chrome extension is disconnected.
