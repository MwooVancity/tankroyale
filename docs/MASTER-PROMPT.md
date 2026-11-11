# Master prompt (owner 2026-11-10: "I keep asking u to make this #1 but we keep doing piecemeal")

Source research: calcscrape/reports/Top tank game tricks master prompt.md


```
GOAL. Make Tank Royale the best tank game on Android for someone who loves tanks: 30+ fps in the slowest moments on a Pixel 6a, playable on a moto g05, a sharp readable picture, and 5-star reviews earned honestly. PORT, DON'T REDESIGN: build no new big system unless a measured number demands it. Honest only: bots labelled "BOT" everywhere, no pay-to-win, every tank earnable, Google Play policy (no rating incentives, real screenshots, the in-app review prompt shown as-is after a win).

STEP 0, AUDIT FIRST. Before any code, read the codebase and mark every item below EXISTS / PARTIAL / GAP with file:line. Measure the baseline with one headless script on the busiest replay or bot match: renderer.info.render.calls (main pass + shadow pass), triangles, programs, p50/p95 frame ms. Save it to perf-baseline.json. Skip any EXISTS item that already passes its test.

HARD BUDGETS (worst 10 s of a 5v5 fight, all passes counted):
- Draw calls/frame: Pixel 6a <=150; moto g05 tier <=80; high tier <=200.
- Frame time: 6a p95 <=33.3 ms after 10 min of play (thermal); g05 p50 <=50 ms, p95 <=66 ms.
- Load: cold start to menu <=5 s on 6a, <=10 s on g05; install to first battle <=60 s.
- No per-frame allocations in the battle loop (heap sawtooth flat in a 60 s trace).
A change that breaks a budget is reverted.

PHASE 1, PERFORMANCE (draw-call cuts first, in this order):
1. Static world merge. BufferGeometryUtils.mergeGeometries per material per map chunk (about a 4x4 grid), matrixAutoUpdate=false, one updateMatrix(). Test: headless calls drop; map looks identical in a screenshot diff. Edge: a destructible prop merged into a chunk cannot vanish; keep it out of the merge.
2. Instancing. One InstancedMesh per prop type, per tank part across all tanks (hull, turret, barrel, tracks), and per projectile, spark and decal type, pooled with .count. Team color via setColorAt. Test: tank draws stay flat from 2 to 10 tanks. Edge: set an explicit boundingSphere or culling hides whole sets; a dead tank's instance must hide the same frame.
3. Shadow pass. Only tanks cast; shadowMap.autoUpdate=false with needsUpdate on a timer; instanced multiply-blended blob quads under every unit; no shadow map on the g05 tier. Test: shadow-pass calls counted and inside budget. Edge: blob on a slope must not float; offset it by the terrain normal.
4. Far LOD and cutoff: single-mesh far tanks, sprite trees past a distance, a hard draw cutoff. Test: calls at the far camera <= near camera. Edge: never LOD the tank the player is aiming at.
5. Locked 30 fps when rolling p90 >20 ms, gated on rAF timestamps with 2 ms tolerance; fixed-timestep logic; never switch back up mid-match. Test: frame-interval histogram shows two vsyncs. Edge: a tab-resume giant delta must not teleport tanks (clamp dt).
6. Stay on WebGLRenderer. Try BatchedMesh only if a measured case beats instancing on the 6a.
Pass: Firebase Test Lab run on a Pixel 6a and a g05-class device logs fps from the game to a file; budgets met.

PHASE 2, LOOK (sharp and readable):
7. Full-size canvas via devicePixelContentBoxSize (cap 4 MP); the upscaler writes into it; HUD as HTML or drawn last at native. Test: canvas.width equals real device pixels.
8. Raise 3D scale back up from 0.38x. Because the game is CPU-bound, step to 0.67 linear and keep each step that holds the budget; dynamic scale from rAF deltas (1 s median), drop only under load. Edge: never resize buffers per frame; allocate max once, draw a sub-rect.
9. Remove FXAA and post blurs; anisotropy max; MSAA only if the 6a measures it inside budget.
10. Enemy outline: stencil or inverted hull in team color, x-ray through cover only for spotted enemies; no OutlinePass. Edge: colour-blind players need a shape cue too (outline thickness or icon).
11. Baked world light (lightmap or vertex color AO), live DirectionalLight on tanks only; horizon-matched fog; fake glow (emissive mask + additive sprite), no UnrealBloomPass below high tier.
12. Four named tiers (Ultra Low / Low / Medium / High) auto-picked by a 3 s benchmark; the player can override.

PHASE 3, FEEL:
13. Shot verdict: reticle colour + shape predicts pen/no-pen; after impact a distinct VFX + text/voice + pooled armor decal for PEN / RICOCHET / NO PEN. Test: selftest fires each case and asserts the right cue. Edge: cues never cover the reticle.
14. Weight: turret traverse capped in deg/s, recoil kick + camera shake scaled to caliber (3D camera only, never the HUD), 40-80 ms hit stop on penetration, layered gun sound with distance delay; every audio cue has a visual twin. Edge: shake off in a settings toggle.
15. Aim assist: target score (distance, HP, crosshair offset, cover, sticky while firing), pulls only while the player is steering, lock at centre mass only, no lock beyond a long-range cutoff; opt-out in settings. Test: selftest on scripted targets.
16. Short skippable death cam showing where the shell hit.

PHASE 4, FIRST SESSION AND COMING BACK:
17. Install to first battle <=60 s: no login, no store, no notification prompt before match 1; one guided battle, then labelled bot matches tapering as the player levels.
18. End screen: damage, pens, ricochets, a tank mastery bar, "Battle again" as the biggest button; rewarded x2 coins is optional and never blocks a reward already won; no interstitial in session 1.
19. Return hooks from existing play: daily missions, login streak, per-tank mastery; ask for notifications only after a win in session 2+.
20. In-app review prompt after a win, a few sessions in. Store listing screenshots from real gameplay.

RULES OF WORK. Work the whole list in order without stopping or asking. Each item lists its edge cases before code and is DONE only when its test passes and the number is written to perf-log.json. Re-run the headless budget script after every item; commit and push after each phase. Report one line per item: ID, EXISTS/GAP, what changed, before -> after number, test name. Say "unverified" for anything not run on a physical device.
```
