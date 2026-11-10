# Tank Royale — Google Play Store Listing

Every claim below was checked against the code on 2026-11-09 (counts in brackets
say where). The old text said "No ads" and "no downloads": both were false
(AdMob interstitial every 3rd match; it is an installed app). Not pushed to Play:
a listing change is a public edit and needs the owner's OK (PLAN.md, D13).

## App title (max 30 chars)
Tank Royale: Tank Battle 3D

## Short description (max 80 chars)
Tank battle game: 5v5 vs bots offline or online. 130 tanks, 20 maps, free.

## Full description (max 4000 chars)

Pick a tank and fight a 5v5 tank battle in under a minute. No account, no sign-in.

**Play right away**
- Solo battles against bots: no waiting for a lobby, works without internet
- 5v5 team battles, 7-minute rounds sized for a phone
- Online rooms up to 5v5: share a room code and play with friends

**Real tank combat**
- Armor angle matters: every shot's penetration is calculated
- Hit modules and crew: tracks, engine, gun, ammo
- Kill camera replay after every kill
- 130 tanks to drive, 20 battlefields from city streets to snow and desert

**Built for phones**
- Touch controls: left stick drives, drag right side to aim, release to fire
- Graphics settings scale down for older phones

**Free**
- Free to play, no in-app purchases
- A short ad may show between battles (every 3rd match, never in your first session, never during a battle)

---

## Claim sources
- 5v5 (changed from 7v7 2026-11-10, owner): rosterState SOLO_TEAM_SIZE = 5; emulator Android 15 vc907+ battles log bots=5/5 (4 allies + player, 5 enemies). Online room menus offer 1-5 per side.
- 130 tanks: tankAssets.selftest ("130 tanks have tier, flag ...").
- 20 maps: src/world/maps/index.ts MAP_IDS (20).
- 7-minute rounds: src/game/roundClock.ts (420 s).
- No sign-in: no sign-in gate in src; Google sign-in is optional.
- Ads: src/auth/admob.ts MATCHES_PER_AD = 3, inFirstSession (30 min) skips ads; endScreen.ts shows the ad when the player leaves results. No purchases: no billing dependency.
- "Works without internet" for bots: assets ship inside the APK and boot makes
  no required request. NOT tested on Android in airplane mode yet.

## Category
Games > Action

## Content rating
Everyone 10+ (Fantasy Violence — tank combat, no blood)

## Tags
tank game, tank battle, offline, 5v5, war game, multiplayer, action, 3D

## Screenshots needed (Play Console upload)
- Phone: real in-game captures from the current build (Test Lab bluejay
  screenshots, 1080x2400 landscape), 4–8:
  1. Battle in progress, tanks in view (first: says what you do)
  2. Garage with a tank
  3. Kill camera replay
  4. End screen with the result
  5. Online room
- Tablet: optional.

## Feature graphic
1024x500 px — a tank in battle, "Tank Royale" wordmark, "5v5 tank battles". The current file (public/brand/store-assets/feature-graphic-1024x500.png) names no team size.

## App icon
512x512 px — see store-assets/icon-512.png (generate from icon.svg)
