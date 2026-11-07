import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneNativeMedia } from './prune-native-media.mjs';

function fixture(js) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  fs.mkdirSync(path.join(d, 'assets'));
  for (const m of ['used', 'site-only', 'boot']) {
    fs.mkdirSync(path.join(d, 'media', m), { recursive: true });
    fs.writeFileSync(path.join(d, 'media', m, 'a.webp'), 'x');
  }
  fs.writeFileSync(path.join(d, 'index.html'), '<img src="/media/boot/a.webp">');
  fs.writeFileSync(path.join(d, 'assets', 'game.js'), js);
  return d;
}

let d = fixture('const u = "/media/used/a.webp";');
let r = pruneNativeMedia(d);
assert.deepEqual(r.removed, ['site-only']);
assert.ok(fs.existsSync(path.join(d, 'media', 'used', 'a.webp')), 'JS-referenced folder kept');
assert.ok(fs.existsSync(path.join(d, 'media', 'boot', 'a.webp')), 'index.html-referenced folder kept');
fs.rmSync(d, { recursive: true, force: true });

d = fixture('const u = `/media/${dir}/a.webp`;');
r = pruneNativeMedia(d);
assert.deepEqual(r.removed, [], 'dynamic media path keeps everything');
fs.rmSync(d, { recursive: true, force: true });
console.log('prune-native-media selftest ok');
