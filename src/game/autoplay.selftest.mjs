import assert from 'node:assert/strict';
import { summarizeFrames, AUTOPLAY_WATCHDOG_MS } from './autoplay.ts';

// Watchdog: after 3 capped battles (10 min each) + loads, before Test Lab's 60 min virtual cap.
assert.ok(AUTOPLAY_WATCHDOG_MS > 33 * 60000 && AUTOPLAY_WATCHDOG_MS < 55 * 60000, 'watchdog window');

// 60 s at a steady 33.3 ms = 30 fps.
let s = summarizeFrames(Array(1800).fill(1000 / 30));
assert.equal(s.fpsP50, 30, 'steady 30 fps');
assert.equal(s.freezes, 0, 'no freeze');
// One 3 s freeze is counted once and not averaged into fps.
s = summarizeFrames([...Array(300).fill(20), 3000, ...Array(300).fill(20)]);
assert.equal(s.freezes, 1, 'freeze counted');
assert.equal(s.fpsP50, 50, 'freeze kept out of fps');
assert.equal(s.worstFrameMs, 3000, 'worst frame kept');
// A 2.0 s frame is not a freeze (> 2 s only).
assert.equal(summarizeFrames([2000]).freezes, 0, 'exactly 2 s is not a freeze');
// Slow seconds land in p10.
s = summarizeFrames([...Array(200).fill(100), ...Array(2700).fill(1000 / 30)]);
assert.equal(s.fpsP10, 10, 'slowest 10% of seconds');
// No frames (battle never shown): nulls, not NaN or 0.
s = summarizeFrames([]);
assert.equal(s.fpsP10, null, 'empty p10 null');
assert.equal(s.worstFrameMs, 0, 'empty worst 0');
console.log('autoplay.selftest: per-second fps, freeze > 2 s, empty battle passed');
