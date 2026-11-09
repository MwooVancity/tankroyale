import assert from 'node:assert/strict';
import { shouldAskReview, REVIEW_GAP_MS } from './reviewPrompt.ts';

const now = 1_800_000_000_000;
const base = { result: 'victory', online: false, errored: false, lastAskMs: 0, nowMs: now };
assert.equal(shouldAskReview(base), true, 'first solo win asks');
for (const result of ['defeat', 'draw', '', null]) assert.equal(shouldAskReview({ ...base, result }), false, `no ask on ${result}`);
assert.equal(shouldAskReview({ ...base, online: true }), false, 'no ask online');
assert.equal(shouldAskReview({ ...base, errored: true }), false, 'no ask after an error');
assert.equal(shouldAskReview({ ...base, lastAskMs: now - REVIEW_GAP_MS + 1 }), false, 'no ask within 30 days');
assert.equal(shouldAskReview({ ...base, lastAskMs: now - REVIEW_GAP_MS }), true, 'asks again after 30 days');
assert.equal(shouldAskReview({ ...base, lastAskMs: now + 864e5 }), false, 'clock set back: stays quiet');
assert.equal(shouldAskReview({ ...base, lastAskMs: NaN }), true, 'corrupt stored value: treated as never asked');
console.log('reviewPrompt.selftest: win-only, solo-only, no-error, 30-day rule passed');
