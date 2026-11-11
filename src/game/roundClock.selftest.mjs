import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BATTLE_TIME_LIMIT_S } from './roundClock.ts';

assert.equal(BATTLE_TIME_LIMIT_S, 420, 'phone-length round: 7 minutes');
// One rule, one place: the sim and the HUD countdown both import it.
for (const file of ['src/game/state.ts', 'src/ui/hud.js']) {
  const src = await readFile(file, 'utf8');
  assert.match(src, /from '\.\.?\/(game\/)?roundClock\.ts'/, `${file} imports the shared round clock`);
  assert.doesNotMatch(src, /VITE_QA_ROUND_S\)\s*\|\|/, `${file} has no private round length`);
}
// Online authority too (it ran 900 s while the HUD showed 7:00; PM 2026-11-11: 420 s everywhere).
const online = await readFile(new URL('../sim/authoritativeMatch.ts', import.meta.url), 'utf8');
const lim = /const BATTLE_LIMIT_S = ([\d\s*]+);/.exec(online);
assert.ok(lim, 'online BATTLE_LIMIT_S found');
assert.equal(lim[1].split('*').reduce((p, x) => p * Number(x.trim()), 1), BATTLE_TIME_LIMIT_S, 'online round = solo round');
console.log('roundClock.selftest: one 7-minute round clock for sim, HUD and the online authority');
