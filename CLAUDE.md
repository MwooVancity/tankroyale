# Tank Royale

Capacitor Android game, live on Google Play as `app.tankroyale`. Players are on real Android phones.

## #1: the best game for someone who loves tank games (HARD, owner 2026-11-09)
Every change answers one question first: does this make the game better for a person who loves tank games, playing on a normal Android phone? Fail = don't build it; an existing part that fails = cut it. In this order:
1. It plays: no crash, no lag in a fight (slowest moments 30 fps or more on a mid-range phone), into a battle fast.
2. It feels like a tank: weight, turret turn, armor angle and hit feedback the player can read.
3. Reasons to come back: tanks to unlock, maps, fair bot and online matches.
4. Player words decide: every new Play review and Play vitals number is read and answered with a fix; "lags" and "couldn't play" outrank anything new.
Each change gets one report line: "Tank fan: ..." saying what that player gets.

## Master prompt, not piecemeal (HARD, owner 2026-11-10: "I keep asking u to make this #1 but we keep doing piecemeal")
`docs/MASTER-PROMPT.md` is the work order: audit every item (EXISTS / PARTIAL / GAP), hold the hard budgets (draw calls per frame: Pixel 6a <=150, moto g05 <=80; 6a p95 <=33.3 ms), then work phases 1-4 in order without stopping, one report line per item. A change that breaks a budget is reverted. New work not on the list goes onto the list first.

## Unity rebuild; this game is in maintenance (HARD, owner 2026-11-11: "We for sure will go unity")
The game is being rebuilt in Unity in C:/Users/mwoo7/Desktop/tank-royale-unity (its own session and its own writer). This three.js game gets only real bug fixes and Play review/vitals fixes, plus exports and spec answers for the Unity session. No new performance or graphics work here; `docs/GRAPHICS-OVERHAUL.md` is superseded and kept as art reference only. Releases still need the owner's own yes.

## Port, don't redesign (HARD, owner 2026-11-10: "already a great GitHub repo game. It just sucked for Android")
The game design is good; the job is whatever makes it worse on a phone than on desktop. No new systems unless autoplay shows a measured problem. Edge cases first, each with its test: fps per map and phone tier, load time, download size, touch (dead zone, thumb aim, button size, drive+aim+fire at once), HUD at 6", app switch/call/screen off, renderer killed, 2-hour heat and memory, old WebView, edge-to-edge, ads, mobile network, battery. Autoplay targets: time to battle <30 s, first contact <20 s, 2-hour run with 0 crashes.

## Real Android or it is not tested (HARD, owner 2026-10-26)
Reviewers said they "couldn't even play" a build that was called bug free after desktop-browser testing only.
- Desktop Chrome, a resized window, or `?debug=1` in a browser is NOT Android. Never call a build working, fixed or bug free from those.
- A release counts as tested only after it ran on a real Android device or a real Android emulator: Firebase Test Lab (real phones), an Android emulator (needs CPU virtualization on in BIOS), or the owner's phone over USB (`adb` + `chrome://inspect`).
- The report names the device, the Android version, what was played (boot, solo round to the end screen, next round, online room join + match) and the crash log result.
- Anything not run on Android is listed as "not tested on Android", never left out.
