// D8: guests are told when the host stops sending (app in the background).
import assert from 'node:assert/strict';
import { createHostSilenceWatch } from './networkFramePump.ts';

const watch = createHostSilenceWatch(3000);
assert.equal(watch(0, 0), 0, 'before the first snapshot: loading, not silence');
assert.equal(watch(5000, 0), 0, 'still loading');
assert.equal(watch(5000, 1), 0, 'first snapshot');
assert.equal(watch(7900, 1), 0, 'under 3 s: normal jitter');
assert.equal(watch(8100, 1), 3, 'over 3 s: guests see the waiting banner');
assert.equal(watch(20100, 1), 15, 'counts up while the host is away');
assert.equal(watch(20200, 2), 0, 'snapshots flow again: banner clears');
console.log('hostSilence.selftest: host silence over 3 s is reported to guests');
