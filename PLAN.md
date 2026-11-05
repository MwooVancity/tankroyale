# Tank Royale plan

**Goal:** a playable Android game on Google Play (app.tankroyale) that lifts the 2.25-star rating ("couldn't even play").
**Reader:** a phone player starting a Bots battle.

## Numbers (dated)
- 2026-11-04: Production = build 77 (in Google review). Previous production: 67.
- 2026-11-04: Bots battle runs, 0 crashes: Pixel 6a Android 12 and Nothing Phone (4a) Android 16 (Test Lab).
- 2026-11-04: Pixel 6a battle fps: 7 (Balanced, build 77), 9 (Performance, build 79). Target: 60.
- 2026-11-04: local probe (4x CPU): main render 50 ms / 646 draws, AI tanks ~480 of them; JS ~30 ms.

## Next
1. Merge AI tank sub-meshes per material (probe `tools/mobile-frame-probe.mjs`).
2. Cut per-frame JS (sim/AI/HUD).
3. Confirm fps on Pixel 6a (Test Lab, `MODEL=bluejay`).
4. Review replies + in-app review prompt.

## Owner-only
- Cloudflare API token: add "Realtime: Edit" (online relay for mobile data).
- Play Console: declare Trader status; confirm "Contains ads" and advertising ID in Data safety.

Latest handoff: `docs/handoffs/HANDOFF_android-perf_11-04_19-40.md`.
