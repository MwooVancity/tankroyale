import assert from 'node:assert/strict';
import { watchLoadStall } from './loadStallWatchdog.ts';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A step that never resolves: progress frozen, the watchdog fires once with the stage.
{
  const mark = { at: performance.now(), stage: 'Painting vehicles' };
  const fired = [];
  const stop = watchLoadStall(() => mark, (stage) => fired.push(stage), { stallMs: 60, everyMs: 10 });
  await wait(150);
  stop();
  assert.deepEqual(fired, ['Painting vehicles'], 'stalled load reports its stage once');
}

// A slow but moving load never fires.
{
  const mark = { at: performance.now(), stage: 'Loading battlefield' };
  let fired = 0;
  const stop = watchLoadStall(() => mark, () => fired++, { stallMs: 60, everyMs: 10 });
  for (let i = 0; i < 10; i++) { await wait(20); mark.at = performance.now(); }
  stop();
  assert.equal(fired, 0, 'moving load is left alone');
}
console.log('loadStallWatchdog selftest ok');
