import assert from 'node:assert/strict';
import { pauseOnBackground } from './backgroundPause.ts';

let open = false, opens = 0, active = true;
const onBackground = pauseOnBackground({ isOpen: () => open, open: () => { open = true; opens++; } }, () => active);

assert.equal(onBackground(true), true, 'backgrounding a live battle opens the pause menu');
assert.equal(opens, 1);
assert.equal(onBackground(true), false, 'already paused: no second open (visibility + appState both fire)');
open = false;
assert.equal(onBackground(false), false, 'coming back never opens it by itself');
active = false;
assert.equal(onBackground(true), false, 'garage, result screen or dead player: no pause');
assert.equal(opens, 1);
console.log('backgroundPause.selftest: background opens pause once, only in a live battle');
