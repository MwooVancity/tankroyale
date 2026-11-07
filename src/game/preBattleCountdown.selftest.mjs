import assert from 'node:assert/strict';
import {
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
  MAX_COUNTDOWN_HOLD_S,
  nextCountdownHold,
} from './preBattleCountdown.ts';

// Warmup that never finishes must not hold "1" forever: countdown hits 0 by 6 s.
{
  let s = 5; let hold = 0; let t = 0;
  while (s > 0 && t < 60) {
    hold = nextCountdownHold(hold, s, 0.05);
    s = advancePreBattleCountdown(s, 0.05, hold < MAX_COUNTDOWN_HOLD_S);
    t += 0.05;
  }
  assert.equal(s, 0, 'countdown reaches 0 with warmup stuck');
  assert.ok(t <= 4 + MAX_COUNTDOWN_HOLD_S + 1.2, `hold capped (took ${t.toFixed(2)} s)`);
  assert.equal(nextCountdownHold(3, 4, 0.1), 0, 'hold resets while counting');
}

assert.equal(advancePreBattleCountdown(5, 0.25, false), 4.75);
assert.equal(advancePreBattleCountdown(1.1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, false), 0.75);
assert.equal(advancePreBattleCountdown(0.1, 0.25, false), 0);
assert.equal(advancePreBattleCountdown(Infinity, 1, true), Infinity);
assert.equal(advancePreBattleCountdown(2, -1, false), 2);

assert.equal(resolveVisiblePreBattleSeconds(5, 0), 5);
assert.equal(resolveVisiblePreBattleSeconds(5, 1), 4);
assert.equal(resolveVisiblePreBattleSeconds(5, 4.6), 2);
assert.equal(resolveVisiblePreBattleSeconds(5, 10), 2);
assert.equal(resolveVisiblePreBattleSeconds(1, 0.5, 2), 1);
assert.equal(resolveVisiblePreBattleSeconds(5, -1), 5);
assert.equal(resolveVisiblePreBattleSeconds(5, Number.NaN), 5);

console.log('preBattleCountdown.selftest: warm hold, loader credit, and rollout release passed');

// Keep the player-entry countdown and the intent-loading policy in the same
// normal npm-test gate: both determine what work may happen before rollout.
await import('./loadingIntent.selftest.mjs');
