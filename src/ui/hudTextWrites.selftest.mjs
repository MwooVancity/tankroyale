// HUD text writes only when the value changes (an equal write re-lays out the HUD).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile('src/ui/hud.js', 'utf8');
const direct = src.split('\n').filter((l) => /^\s*[\w$.]+(\.querySelector\('[^']+'\))?\.textContent = (?!'';)/.test(l));
assert.deepEqual(direct, [], 'per-frame HUD text goes through setText');

let writes = 0, text = '';
const el = { get textContent() { return text; }, set textContent(v) { writes++; text = v; } };
const setText = new Function('el', 'value', /function setText\(el, value\) \{([\s\S]*?)\n\}/.exec(src)[1]);
setText(el, 5); setText(el, '5'); setText(el, 5);
assert.equal(writes, 1, 'equal values do not touch the DOM');
setText(el, null);
assert.equal(text, '', 'null clears like textContent = null');
console.log('hudTextWrites.selftest: HUD text written on change only');
