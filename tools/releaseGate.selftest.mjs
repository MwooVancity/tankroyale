import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findGatePass, promoteRefusal } from './releaseGate.mjs';

const runs = [
  { number: 90, headSha: 'aaa111', conclusion: 'success' },
  { number: 91, headSha: 'bbb222', conclusion: 'failure' },
  { number: 92, headSha: 'ccc333', conclusion: 'success' },
];
const passFor = (ok) => (sha) => (ok.includes(sha) ? { sha } : null);

assert.match(promoteRefusal(87, 87, runs, passFor(['aaa111'])), /not above production/);
assert.match(promoteRefusal(93, 87, runs, passFor([])), /no Android Build run/);
assert.match(promoteRefusal(91, 87, runs, passFor(['bbb222'])), /did not succeed/);
assert.match(promoteRefusal(92, 87, runs, passFor(['aaa111'])), /no Test Lab gate PASS/);
assert.equal(promoteRefusal(90, 87, runs, passFor(['aaa111'])), null);

// A pass carries over only across docs-only commits.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gates-'));
fs.writeFileSync(path.join(dir, 'aaa111.json'), JSON.stringify({ sha: 'aaa111' }));
const diffs = { ccc333: ['PLAN.md', 'docs/x.md'], ddd444: ['PLAN.md', 'src/main.ts'], eee555: ['.github/workflows/android.yml'] };
const opts = { dir, diffFiles: (_a, b) => diffs[b] };
assert.ok(findGatePass('aaa111', opts), 'exact commit');
assert.ok(findGatePass('ccc333', opts), 'docs-only on top of a pass');
assert.equal(findGatePass('ddd444', opts), null, 'game code changed since the pass');
assert.equal(findGatePass('eee555', opts), null, 'packaging changed since the pass');
fs.rmSync(dir, { recursive: true, force: true });
console.log('releaseGate selftest ok');
