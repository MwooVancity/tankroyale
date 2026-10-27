# Tank Royale

Capacitor Android game, live on Google Play as `app.tankroyale`. Players are on real Android phones.

## Real Android or it is not tested (HARD, owner 2026-10-26)
Reviewers said they "couldn't even play" a build that was called bug free after desktop-browser testing only.
- Desktop Chrome, a resized window, or `?debug=1` in a browser is NOT Android. Never call a build working, fixed or bug free from those.
- A release counts as tested only after it ran on a real Android device or a real Android emulator: Firebase Test Lab (real phones), an Android emulator (needs CPU virtualization on in BIOS), or the owner's phone over USB (`adb` + `chrome://inspect`).
- The report names the device, the Android version, what was played (boot, solo round to the end screen, next round, online room join + match) and the crash log result.
- Anything not run on Android is listed as "not tested on Android", never left out.
