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
console.log('roundClock.selftest: one 7-minute round clock for sim and HUD');
