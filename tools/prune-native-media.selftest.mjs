import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneNativeMedia } from './prune-native-media.mjs';

const has = (d, p) => fs.existsSync(path.join(d, 'media', p));
function fixture(gameJs, { siteJs = '', lazyJs = '' } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  fs.mkdirSync(path.join(d, 'assets'));
  for (const m of ['used', 'site-only', 'boot', 'partial', 'dyn', 'lazy']) {
    fs.mkdirSync(path.join(d, 'media', m, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(d, 'media', m, 'a.webp'), 'x');
    fs.writeFileSync(path.join(d, 'media', m, 'sub', 'b.webp'), 'x');
  }
  fs.writeFileSync(path.join(d, 'index.html'), '<img src="/media/boot/a.webp"><script src="/assets/game-A1b2C3d4.js"></script>');
  fs.writeFileSync(path.join(d, 'assets', 'game-A1b2C3d4.js'), gameJs);
  fs.writeFileSync(path.join(d, 'assets', 'lazy-Zz99Yy88.js'), lazyJs);
  // Website docs page chunk: NOT reachable from index.html.
  fs.writeFileSync(path.join(d, 'docs-page.html'), '<script src="/assets/docs-Q1w2E3r4.js"></script>');
  fs.writeFileSync(path.join(d, 'assets', 'docs-Q1w2E3r4.js'), siteJs);
  return d;
}

let d = fixture(
  'const u = "/media/used/a.webp", v = "/media/used/sub/b.webp", p = "/media/partial/a.webp"; const k = `/media/dyn/${id}.webp`; import("./lazy-Zz99Yy88.js");',
  { siteJs: 'const s = "/media/site-only/a.webp", t = "/media/partial/sub/b.webp";', lazyJs: 'const l = "/media/lazy/a.webp";' },
);
const r = pruneNativeMedia(d);
assert.equal(r.reason, 'ok');
assert.ok(has(d, 'used/a.webp') && has(d, 'used/sub/b.webp'), 'files the game names are kept');
assert.ok(has(d, 'boot/a.webp'), 'index.html-named file kept');
assert.ok(!has(d, 'boot/sub/b.webp'), 'unnamed file in a named folder removed');
assert.ok(!has(d, 'site-only'), 'folder only a website page names is removed');
assert.ok(has(d, 'partial/a.webp') && !has(d, 'partial/sub/b.webp'), 'partly used folder keeps only game files');
assert.ok(has(d, 'dyn/a.webp') && has(d, 'dyn/sub/b.webp'), 'runtime-built names keep the folder whole');
assert.ok(has(d, 'lazy/a.webp'), 'a lazily imported chunk counts as game code');
fs.rmSync(d, { recursive: true, force: true });

d = fixture('const m = "/media/used/list.json";');
fs.writeFileSync(path.join(d, 'media', 'used', 'list.json'), '{"items":["/media/site-only/sub/b.webp"]}');
pruneNativeMedia(d);
assert.ok(has(d, 'site-only/sub/b.webp'), 'a file listed by a game-named manifest is kept');
assert.ok(!has(d, 'site-only/a.webp'), 'unlisted siblings still go');
fs.rmSync(d, { recursive: true, force: true });

d = fixture('const u = `/media/${dir}/a.webp`;');
assert.deepEqual(pruneNativeMedia(d).removed, [], 'dynamic folder name keeps everything');
fs.rmSync(d, { recursive: true, force: true });
console.log('prune-native-media selftest ok');
