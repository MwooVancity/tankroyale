import assert from 'node:assert/strict';
import { addVhFallback } from './dvh-fallback.mjs';

assert.equal(addVhFallback('.a{max-height:calc(100dvh - 16px)}'),
  '.a{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px)}');
assert.equal(addVhFallback('.b{width:100vw;height:64svh;min-height:520px}'),
  '.b{width:100vw;height:64vh;height:64svh;min-height:520px}');
assert.equal(addVhFallback('.c{max-height:62dvh!important;overflow:auto}'),
  '.c{max-height:62vh!important;max-height:62dvh!important;overflow:auto}');
assert.equal(addVhFallback('.d{\n  height:min(720px,78dvh);'),
  '.d{\n  height:min(720px,78vh);height:min(720px,78dvh);');
// Untouched: no dvh, plain vh, media queries.
for (const keep of ['.e{height:100vh}', '@media (max-height:600px){.f{top:0}}', 'const n = 5;'])
  assert.equal(addVhFallback(keep), keep);
console.log('dvh-fallback selftest PASS');
