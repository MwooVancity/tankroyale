#!/usr/bin/env bash
# Runs inside android-emulator-runner: install the debug APK, open the app,
# attach to its WebView DevTools socket and drive a battle (emulator-drive.mjs).
set -u
OUT=emulator-results
mkdir -p "$OUT"
adb install -r apk/app-debug.apk
adb shell input keyevent 82 || true
adb logcat -c
adb shell am start -n app.tankroyale/.MainActivity
sleep 15
PID=$(adb shell pidof app.tankroyale | tr -d '\r')
echo "app pid: $PID"
SOCK=$(adb shell cat /proc/net/unix | grep -o "webview_devtools_remote_$PID" | head -1)
[ -n "$SOCK" ] || SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
echo "devtools socket: $SOCK"
adb forward tcp:9222 "localabstract:$SOCK"
node tools/emulator-drive.mjs "$OUT"; CODE=$?
adb shell screencap -p /sdcard/final.png && adb pull /sdcard/final.png "$OUT/4-final-device.png"
adb logcat -d > "$OUT/logcat.txt"
grep -E "FATAL EXCEPTION|ANR in app.tankroyale|Renderer process .*crash" "$OUT/logcat.txt" | head -20
exit $CODE
