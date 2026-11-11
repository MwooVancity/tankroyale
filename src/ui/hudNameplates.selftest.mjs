// node src/ui/hudNameplates.selftest.mjs: clustered far tanks keep one readable name each, the rest show HP bars only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./hud.js', import.meta.url), 'utf8');
const body = (name, args) => new RegExp(`function ${name}\\(${args}\\) \\{([\\s\\S]*?)\\n\\}`).exec(src)[1];
const setClass = new Function('el', 'name', 'on', body('setClass', 'el, name, on'));
const W = Number(/export const COMPACT_PLATE_W = (\d+);/.exec(src)[1]);
const placeHpBars = new Function('setClass', 'COMPACT_PLATE_W', `return function (bars) {${body('placeHpBars', 'bars')}}`)(setClass, W);

const plate = (sx, sy, dist, layoutW = 140) => {
  const cls = new Set();
  return { sx, sy, dist, layoutW, root: { style: {}, classList: { contains: (c) => cls.has(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } }, cls };
};
// Winter case: 5 enemies 20-60 px apart on one line far away, one ally close.
const far = [0, 1, 2, 3, 4].map((i) => plate(400 + i * 30, 120, 300 + i * 10));
const near = plate(700, 260, 60);
const bars = [...far, near];
placeHpBars(bars);
const full = bars.filter((b) => !b.cls.has('compact'));
assert.ok(full.includes(near), 'the close tank keeps its name');
assert.equal(far.filter((b) => !b.cls.has('compact')).length, 1, 'one readable name in the far cluster, not a strip');
assert.equal(far[0].cls.has('compact'), false, 'the nearest of the cluster is the one named');
for (const b of bars) assert.match(b.root.style.transform, /^translate3d\(/, 'every tank keeps a marker');
// Spread-out tanks are untouched.
const spread = [plate(100, 100, 200), plate(500, 100, 210), plate(300, 300, 220)];
placeHpBars(spread);
assert.ok(spread.every((b) => !b.cls.has('compact')), 'no overlap, all names shown');
assert.match(src, /\.cot-hpb\.compact \.nm\{display:none;\}/);
console.log('hudNameplates.selftest: far clusters show one name + HP bars, spread tanks unchanged passed');
