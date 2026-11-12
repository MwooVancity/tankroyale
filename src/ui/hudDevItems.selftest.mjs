// node src/ui/hudDevItems.selftest.mjs: players never see developer items on the
// battle HUD by default (art critique 2026-11-11), and phone controls fade at rest.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REST_FADE_MS } from './touchControls.ts';

const read = (f) => readFile(new URL(f, import.meta.url), 'utf8');
const [input, hud, touch] = await Promise.all([read('../game/input.ts'), read('./hud.js'), read('./touchControls.ts')]);

// FPS/ping readout: off by default; the renamed key resets old default-on profiles.
assert.match(input, /showFpsReadout: false,/, 'FPS readout defaults off');
assert.doesNotMatch(input, /storedSettings\.showPerfMeter/, 'old key (stored true by default) is no longer read');
const update = /function updateNetReadout\(frame\) \{[\s\S]*?\n  \}/.exec(hud)?.[0] || '';
assert.ok(update, 'updateNetReadout found');
assert.match(update, /if \(!netOptIn\) return;/, 'every device follows the Interface switch');
assert.doesNotMatch(update, /cot-touch-layout/, 'phones no longer force the readout on');
assert.doesNotMatch(update, /'LOCAL'|'LINK'/, 'solo shows no "LOCAL LINK"');
assert.match(update, /netPingUnit\.style\.display = ping > 0 \? '' : 'none'/, 'ping shows only with a real network');

// Graphics quick button reads as a player setting, not a developer "PERF" button.
assert.doesNotMatch(touch, /\? 'Perf'/, 'no "Perf" label');
assert.match(touch, /'Performance' \? 'Low' : label === 'Balanced' \? 'Mid' :\s*label === 'Quality' \? 'High'/, 'Low/Mid/High labels');

// Fade at rest: opacity only (no size or position change), any touch restores.
assert.equal(REST_FADE_MS, 3000, 'fade after 3 s with no finger down');
const rest = /\.cot-touch\.rest \.joy,\.cot-touch\.rest \.round\{([^}]*)\}/.exec(touch)?.[1] || '';
assert.match(rest, /opacity:\.45/, 'resting controls fade');
assert.doesNotMatch(rest, /width|height|left|right|top|bottom|transform|scale/, 'resting controls keep size, place and hit area');
assert.match(touch, /addEventListener\('pointerdown', \(e\) => \{\s*touching\.add\(e\.pointerId\); clearTimeout\(restTimer\); root\.classList\.remove\('rest'\);/,
  'a touch anywhere restores the controls at once');
assert.match(touch, /if \(!touching\.size\) restTimer = window\.setTimeout/, 'no fade while a finger is still down');
console.log('hudDevItems.selftest: FPS readout off by default, no LOCAL LINK, Low/Mid/High button, controls fade at rest');
