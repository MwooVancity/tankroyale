// node src/game/autoplayIntent.selftest.mjs: another app cannot start autoplay
// in a release build or make the game write into its own private files
// (RC3 QA blocker 2026-11-12: `am start ... --ez autoplay true -d file:///data/user/0/app.tankroyale/...`).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const java = await readFile(new URL('../../android/app/src/main/java/app/tankroyale/AutoplayPlugin.java', import.meta.url), 'utf8');
assert.match(java, /TEST_LOOP\.equals\(i\.getAction\(\)\)\s*\|\| \(debuggable\(\) && i\.getBooleanExtra\("autoplay", false\)\)/,
  'plain autoplay extra only in debuggable builds; release needs the Game Loop action');
assert.match(java, /FLAG_DEBUGGABLE/, 'debuggable from the manifest flag (no BuildConfig in AGP 8)');
assert.match(java, /Uri out = i == null \|\| !TEST_LOOP\.equals\(i\.getAction\(\)\) \? null : i\.getData\(\);/,
  'results are written only for a Game Loop launch');
assert.match(java, /if \(out != null && !safeResultsUri\(out\)\)/, 'every results address is checked');
const safe = /boolean safeResultsUri\(Uri u\) \{([\s\S]*?)\r?\n {4}\}/.exec(java)?.[1] || '';
assert.match(safe, /"content"\.equals\(u\.getScheme\(\)\)/, 'content:// results only (file:// refused)');
assert.doesNotMatch(safe, /"file"/, 'no file:// path');
assert.match(safe, /!u\.getAuthority\(\)\.startsWith\(getContext\(\)\.getPackageName\(\)\)/, 'our own provider refused');
// map, lite and battles extras only when debuggable.
assert.match(java, /boolean dbg = debuggable\(\);/);
assert.match(java, /String map = i == null \|\| !dbg \? null/, 'map extra debug only');
assert.match(java, /if \(dbg && scenario > 0 && i\.getBooleanExtra\("lite", false\)\)/, 'lite extra debug only');
assert.match(java, /int battles = i == null \|\| !dbg \? 0/, 'battles extra debug only');

// Test ads: debug builds, autoplay runs and Test Lab / pre-launch devices never load the live unit.
assert.match(java, /r\.put\("debug", dbg\);/, 'plugin reports debuggable');
assert.match(java, /"firebase\.test\.lab"/, 'plugin reports Test Lab devices (Robo crawls too)');
const ap = await readFile(new URL('./autoplay.ts', import.meta.url), 'utf8');
assert.match(ap, /if \(got\.debug \|\| got\.testLab \|\| scenario > 0\) useTestAds\(\);/, 'autoplay switches to demo ads');

// Ads count every finished battle (wins and draws often end without a replay).
const es = await readFile(new URL('../ui/endScreen.ts', import.meta.url), 'utf8');
const ended = /bus\.on\('battle:ended', \(payload\) => \{[\s\S]*?\n  \}\);/.exec(es)?.[0] || '';
assert.match(ended, /takeAdTurn\(\)/, 'ad turn taken on battle:ended');
assert.doesNotMatch(es, /bus\.on\('killcam:done'[\s\S]{0,200}takeAdTurn/, 'not on killcam:done');
assert.match(es, /show\(result: EndScreenResult, sum: EndScreenSummary\): void \{[\s\S]{0,200}maybeAskReview\(\);/, 'rating ask when results show');
console.log('autoplayIntent.selftest: release autoplay needs TEST_LOOP, private files refused, every battle counts for ads');
