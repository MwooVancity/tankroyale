#!/usr/bin/env bash
# Runs inside android-emulator-runner: install the debug APK, open the app,
# attach to its WebView DevTools socket and drive a battle (emulator-drive.mjs).
# Every adb call is time-limited: a hung emulator must not eat the whole job.
set -u
OUT=emulator-results
mkdir -p "$OUT"
A() { timeout 60 adb "$@"; }
A install -r apk/app-debug.apk
A shell input keyevent 82 || true
A logcat -c
A shell am start -n app.tankroyale/.MainActivity
# Device screenshots every 20 s, independent of the WebView (survive a page hang).
( for i in $(seq -w 1 20); do sleep 20; timeout 20 adb exec-out screencap -p > "$OUT/device-$i.png" 2>/dev/null || true; done ) &
SHOTS=$!
sleep 15
PID=$(A shell pidof app.tankroyale | tr -d '\r')
echo "app pid: $PID"
SOCK=$(A shell cat /proc/net/unix | grep -o "webview_devtools_remote_$PID" | head -1)
[ -n "$SOCK" ] || SOCK=$(A shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
echo "devtools socket: $SOCK"
A forward tcp:9222 "localabstract:$SOCK"
timeout 600 node tools/emulator-drive.mjs "$OUT"; CODE=$?
kill $SHOTS 2>/dev/null
A logcat -d > "$OUT/logcat.txt"
grep -E "FATAL EXCEPTION|ANR in app.tankroyale|Renderer process .*crash|has died" "$OUT/logcat.txt" | grep -i "tankroyale\|renderer" | head -20
exit $CODE
