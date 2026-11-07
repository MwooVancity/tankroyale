// One bot's visual build throwing must not leave every later bot invisible,
// and the loader must not spin forever on the failed one.
import assert from 'node:assert/strict';
import { ensureStagedVisuals, nextStagedBake } from './rosterState.ts';

const added = [];
const okVisual = () => ({ specId: 'ok', root: { userData: {} }, setVisible() {}, dispose() {} });
const ent = (id, specId) => ({ id, specId, team: 'b', isPlayer: false, state: null, visual: null });
const bad = ent('bot-1', 'definitely-not-a-tank');
const later = [ent('bot-2', 'ok'), ent('bot-3', 'ok')];
const game = {
  tanks: [ent('player', 'ok'), bad, ...later],
  _engineCtx: { scene: { add: (o) => added.push(o) } },
  _battleVisualPool: { take: (specId) => (specId === 'ok' ? okVisual() : null) },
};
game.tanks[0].visual = okVisual(); // player built elsewhere

const warn = console.warn;
console.warn = () => {};
try {
  let guard = 0;
  while (!ensureStagedVisuals(game, 1)) assert.ok(++guard < 10, 'loader loop must end');
} finally { console.warn = warn; }

assert.equal(bad.visual, null, 'the broken bot has no visual');
for (const e of later) assert.ok(e.visual, `${e.id} still gets a visual after the failure`);
assert.equal(nextStagedBake(game), null, 'the failed bot is not offered again');
console.log('rosterVisualFailure selftest ok');
