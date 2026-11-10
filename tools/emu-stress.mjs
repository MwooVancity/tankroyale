// Android emulator/phone stress run (owner 2026-11-09: "stop fucking up on phone").
// The game drives itself (src/game/autoplay.ts, started with --ez autoplay true):
// 3 Bots battles to the end screen. adb adds what in-game code cannot: cold
// start, home + back and screen off/on and rotation mid-battle 1, airplane
// mode from battle 2, memory (PSS) every minute. Writes logcat + summary.txt to
// testlab-results/emu-<serial>/.  Usage: node tools/emu-stress.mjs <apk> [serial]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';

const [APK, SERIAL] = process.argv.slice(2);
const ADB = path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe');
const PKG = 'app.tankroyale';
const adb = (...a) => execFileSync(ADB, [...(SERIAL ? ['-s', SERIAL] : []), ...a], { maxBuffer: 1 << 28 }).toString();
const sh = (cmd) => { try { return adb('shell', cmd); } catch (e) { return String(e.stdout || ''); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.resolve('testlab-results', `emu-${(SERIAL || 'default').replace(/\W/g, '_')}`);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now(), log = [];
const note = (s) => { const l = `${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s ${s}`; log.push(l); console.log(l); };
const pssMB = () => Math.round(Number(/TOTAL(?: PSS)?:?\s+(\d+)/.exec(sh(`dumpsys meminfo ${PKG}`))?.[1] || 0) / 1024);
const alive = () => sh(`pidof ${PKG}`).trim() !== '';
let seen = '';
const grab = () => { seen += sh('logcat -d -v time'); sh('logcat -c'); return seen; };
async function until(re, maxMs) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { if (re.test(grab())) return true; if (!alive()) return false; await wait(5000); }
  return false;
}

if (APK) { note('install ' + APK); adb('install', '-r', '-g', APK); }
sh('svc power stayon true'); sh('settings put system screen_off_timeout 1800000');
sh(`am force-stop ${PKG}`); sh('logcat -G 16M'); sh('logcat -c');
const start = sh(`am start -W -n ${PKG}/.MainActivity --ez autoplay true --ei scenario 1`);
note(`cold start: ${/TotalTime: (\d+)/.exec(start)?.[1] ?? '?'} ms (native activity)`);
const mem = [];
const sampler = setInterval(() => { mem.push(pssMB()); }, 60000);
mem.push(pssMB());

note(`autoplay started: ${await until(/\[autoplay\] scenario 1 start/, 120000)}`);
const loaded = await until(/\[battle-load\] done/, 240000);
note(`battle 1 loaded: ${loaded}`);
if (loaded) {
  await wait(30000);
  sh('input keyevent KEYCODE_HOME'); note('home'); await wait(10000);
  sh(`am start -n ${PKG}/.MainActivity`); note(`back to app, alive: ${alive()}`); await wait(15000);
  sh('input keyevent KEYCODE_POWER'); note('screen off'); await wait(10000);
  sh('input keyevent KEYCODE_WAKEUP'); sh('wm dismiss-keyguard'); note(`screen on, alive: ${alive()}`); await wait(15000);
  sh('settings put system accelerometer_rotation 0');
  for (const r of [1, 0, 3, 1]) { sh(`settings put system user_rotation ${r}`); await wait(4000); }
  note(`rotated 4 times, alive: ${alive()}`);
  // On the device then pull: `exec-out screencap` knocked the emulator's adb offline (2026-11-10).
  sh('screencap -p /sdcard/mid.png');
  try { adb('pull', '/sdcard/mid.png', path.join(OUT, 'mid-battle.png')); } catch { note('screenshot pull failed'); }
}
if (await until(/\[autoplay\] battle 1 /, 12 * 60000)) { sh('cmd connectivity airplane-mode enable'); note('battle 1 done; airplane mode ON'); }
const done = await until(/\[autoplay\] result /, 30 * 60000);
note(`autoplay result: ${done}, alive: ${alive()}`);
clearInterval(sampler); mem.push(pssMB());
sh('cmd connectivity airplane-mode disable');
fs.writeFileSync(path.join(OUT, 'logcat.txt'), grab());

const lines = seen.split('\n');
const pick = (re) => lines.filter((l) => re.test(l));
const fatal = pick(/FATAL EXCEPTION|ANR in app\.tankroyale|Process app\.tankroyale .*has died|renderer.*(crash|gone)|Fatal signal/i);
const auto = pick(/\[autoplay\] (battle|result|resume|pressed)/).map((l) => l.replace(/^.*\[autoplay\]/, '[autoplay]').slice(0, 400));
const skipped = pick(/Skipped \d+ frames/).map((l) => Number(/Skipped (\d+)/.exec(l)[1]));
const sum = [
  `device: ${sh('getprop ro.product.model').trim()} Android ${sh('getprop ro.build.version.release').trim()} WebView ${/versionName=(\S+)/.exec(sh('dumpsys package com.google.android.webview'))?.[1]}`,
  `crash/ANR lines: ${fatal.length}`, ...fatal.slice(0, 5).map((l) => '  ' + l.slice(0, 200)),
  ...auto,
  `main-thread "Skipped frames" worst: ${skipped.length ? Math.max(...skipped) : 0}`,
  `memory PSS MB each minute: ${mem.join(' ')}`,
];
fs.writeFileSync(path.join(OUT, 'summary.txt'), [...log, '', ...sum].join('\n') + '\n');
console.log('\n' + sum.join('\n'));
