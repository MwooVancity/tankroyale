# Graphics overhaul (owner 2026-11-11: "i want the complete refactoring of graphics. we need a 180 degree")

The look gets a full redesign; gameplay does not. On the look, this overrides "port, don't redesign". Sources: the second opinion the owner got (ChatGPT, 2026-11-11), the art-style dry run (calcscrape/reports/artstyle/: tweaks A/B/C barely changed the look, C cut 45-85 draws), the Unity dry run (calcscrape/reports/Tank Royale Unity port dry run.md) and docs/MASTER-PROMPT.md (still the performance order).

## Keep (do not touch)
Combat rules, the multiplayer server and protocol, the 123-tank lineup and its stats, combat anatomy (armour cells, module positions, hitboxes), map layouts and collision, touch controls, game modes. New visuals sit ON TOP of the combat model; the combat model never reads visual meshes.

## Order (each phase: phone-size before/after captures at identical camera + headless draws/tris + the next physical Test Lab run)
0. Baseline. One busiest-moment benchmark per map: draws (main + shadow), triangles, programs, p10/p50 on the real Pixel 6a and moto g05. Desktop/headless frame ms rank changes only; phone fps decide. 3D scale on the 6a is 915x412 = 0.38x per side (~14% of native pixels); record which.
1. Performance foundation (MASTER-PROMPT phase 1): tank-part merge per moving part with one shared material, static scenery merged per material per chunk (never merge destructibles), instanced vegetation/props, world shadows off (tanks only) + blob/contact shadows, far LOD for tanks and scenery, no per-frame allocations. Budgets: 6a <=150 draws, g05 <=80, high <=200; 6a p10 >=30 fps. A phase-1 change that breaks a budget is reverted.
2. Tank visuals, hybrid: a visual GLB per tank with named pivots (hull, turret, gun, tracks/wheels) bound to the existing articulation; the procedural tank stays as fallback and as the combat model. Pilot 3 representative tanks first. Sources: Sketchfab CC0/CC-BY (never CC-BY-NC, never ripped game assets), Quaternius/Kenney CC0 for parts. Every asset gets a row in docs/ATTRIBUTION.md: URL, author, licence, download date. Per-tank triangle budget and a 3-step LOD (near / mid / far 3-draw silhouette); g05 graphics chip tops out at ~2-4 M triangles per frame, so the scene total is budgeted too.
3. One map fully rebuilt first (monsoon, the slowest): PBR-lite ground (Poly Haven CC0, compressed), roads, instanced trees with billboard far LOD, modular buildings/rocks (Kenney/Quaternius CC0), layered distant mountains, sky gradient + haze, baked lighting/AO (baked at build or at map load from the seed; no live world shadows). Only after the owner sees it on a real phone: roll out to the other maps.
4. Lighting: baked world, tanks lit live, one sun, contact shadows, horizon fog, emissive muzzle flashes; no full-screen bloom/SSAO on phones; colour grade folded into the existing final pass.
5. Camera + combat effects: slightly lower third-person camera, tank fills more of the frame, smooth turret follow, small recoil kick, collision; pooled muzzle flash, smoke, tracer, sparks, ricochet/penetration effects, explosions, damage decals, wreck smoke. Controls unchanged.
6. HUD restyle: same layout and functions, new military typography, cleaner bars, minimap, fire/ammo emphasis, consistent icons, native resolution.
7. Quality tiers: Ultra Low / Low / Medium / High with device defaults and a manual choice (resolution, shadows, vegetation, draw distance, tank detail, effects).
8. Engine decision: after phases 1-3, build the Unity benchmark from the Unity dry run (same tanks via GLTFExporter, same monsoon load, 10 tanks) on Test Lab. Go only if 6a p10 >=45 and g05 >=20; below 35 / 12 = stay on three.js.

## Not in this project
Daily missions, mastery, progression, new modes. Parked until the overhaul ships.

## Rules
No superficial change called an overhaul. No gameplay change for looks. No asset without a verified commercial licence. No phone fps claim without a physical run. Pilot (3 tanks + monsoon) before mass conversion. Each phase is its own commit and can be rolled back. Report per phase: what changed, captures, draws/tris, phone fps.
