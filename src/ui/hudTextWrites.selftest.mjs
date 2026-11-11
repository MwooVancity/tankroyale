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
// Same for attributes and classes (an equal setAttribute / classList.add still mutates).
const attrs = new Map(); let muts = 0;
const ae = { getAttribute: (n) => attrs.has(n) ? attrs.get(n) : null, hasAttribute: (n) => attrs.has(n),
  setAttribute: (n, v) => { muts++; attrs.set(n, String(v)); }, removeAttribute: (n) => { muts++; attrs.delete(n); } };
const setAttr = new Function('el', 'name', 'value', /function setAttr\(el, name, value\) \{([\s\S]*?)\n\}/.exec(src)[1]);
setAttr(ae, 'aria-pressed', 'true'); setAttr(ae, 'aria-pressed', 'true'); setAttr(ae, 'aria-hidden', null);
assert.equal(muts, 1, 'equal or absent attribute: no write');
setAttr(ae, 'aria-pressed', null); assert.equal(ae.hasAttribute('aria-pressed'), false, 'null removes');
const cls = new Set(); let cm = 0;
const ce = { classList: { contains: (c) => cls.has(c), toggle: (c, on) => { cm++; if (on) cls.add(c); else cls.delete(c); } } };
const setClass = new Function('el', 'name', 'on', /function setClass\(el, name, on\) \{([\s\S]*?)\n\}/.exec(src)[1]);
setClass(ce, 'cooling', false); setClass(ce, 'cooling', true); setClass(ce, 'cooling', true);
assert.equal(cm, 1, 'class toggled only on change');
console.log('hudTextWrites.selftest: HUD text, attributes and classes written on change only');
