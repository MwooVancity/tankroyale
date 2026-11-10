// Before/after evidence for a visible change: start autoplay on one map on the
// running emulator, screenshot 10 s into the battle, then read the [perf] draw
// counts for 40 s. Usage: node tools/emu-shot.mjs <apk> <tag> [map=monsoon]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';

const [APK, TAG, MAP = 'monsoon'] = process.argv.slice(2);
const ADB = path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe');
const adb = (...a) => execFileSync(ADB, a, { maxBuffer: 1 << 28 }).toString();
const sh = (c) => { try { return adb('shell', c); } catch (e) { return String(e.stdout || ''); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.resolve('testlab-results', 'shots'); fs.mkdirSync(OUT, { recursive: true });

adb('install', '-r', '-d', '-g', APK); // -d: before/after builds go back and forth in version
sh('settings put secure immersive_mode_confirmations confirmed');
sh('am force-stop app.tankroyale'); sh('logcat -c');
sh(`am start -n app.tankroyale/.MainActivity --ez autoplay true --ei scenario 1 --es map ${MAP}`);
for (let i = 0; i < 60 && !/\[battle-load\] done/.test(sh('logcat -d -s Capacitor/Console:I')); i++) await wait(3000);
await wait(10000);
sh('screencap -p /sdcard/shot.png'); adb('pull', '/sdcard/shot.png', path.join(OUT, `${MAP}-${TAG}.png`));
await wait(40000);
const perf = sh('logcat -d -s Capacitor/Console:I').split('\n').filter((l) => /\[perf\] .*bots=/.test(l));
const n = (k) => perf.map((l) => Number(new RegExp(`${k}=([\\d.]+)`).exec(l)?.[1])).filter(Number.isFinite);
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : '-');
console.log(`${MAP} ${TAG}: ${perf.length} perf lines, tris avg ${avg(n('tris'))}, calls avg ${avg(n('calls'))}, shot ${path.join(OUT, `${MAP}-${TAG}.png`)}`);
