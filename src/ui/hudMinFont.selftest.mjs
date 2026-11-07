// Battle HUD text on a 412-CSS-px-tall phone was 6.5-9 px (~1 mm). Every
// literal HUD/touch font size must be at least 11 CSS px.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const MIN = 11;
const re = /(font-size:\s*|\bfont:\s*\d{3}\s+|\.font = `\d{3}\s+)(\d+(?:\.\d+)?)px/g;
for (const f of ['src/ui/hud.js', 'src/ui/touchControls.ts']) {
  const text = fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const small = [...text.matchAll(re)].filter((m) => Number(m[2]) < MIN).map((m) => m[0]);
  assert.deepEqual(small, [], `${f} has HUD text below ${MIN}px: ${small.join(', ')}`);
}
console.log('hudMinFont selftest ok');
