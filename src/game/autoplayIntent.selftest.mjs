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
assert.match(java, /getCanonicalPath\(\)/, 'file paths canonicalised ("../" cannot climb back)');
for (const p of ['dataDir', '"/data/data/"', '"/data/user/"', '"/data/user_de/"']) assert.ok(java.includes(p), `private root ${p} refused`);
assert.match(java, /"content"\.equals\(scheme\)\) return !getContext\(\)\.getPackageName\(\)\.equals\(u\.getAuthority\(\)\)/,
  'content:// allowed except our own provider');

// Ads count every finished battle (wins and draws often end without a replay).
const es = await readFile(new URL('../ui/endScreen.ts', import.meta.url), 'utf8');
const ended = /bus\.on\('battle:ended', \(payload\) => \{[\s\S]*?\n  \}\);/.exec(es)?.[0] || '';
assert.match(ended, /takeAdTurn\(\)/, 'ad turn taken on battle:ended');
assert.doesNotMatch(es, /bus\.on\('killcam:done'[\s\S]{0,200}takeAdTurn/, 'not on killcam:done');
assert.match(es, /show\(result: EndScreenResult, sum: EndScreenSummary\): void \{[\s\S]{0,200}maybeAskReview\(\);/, 'rating ask when results show');
console.log('autoplayIntent.selftest: release autoplay needs TEST_LOOP, private files refused, every battle counts for ads');
