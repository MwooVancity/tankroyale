// Native app build: drop dist/media/<folder> that no game file names.
// Website pages (home/docs) carry ~17 MB of stills the app never loads
// (2026-11-07: feature-loops-r1, home, landing-r1, modern, multiplayer-r1,
// promo-v13, web-video-r1). Reference-based, so a folder the game starts
// using is kept automatically. Aborts (keeps everything) if any file builds a
// media path from a variable, since then a name check cannot be trusted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function pruneNativeMedia(dist) {
  const mediaDir = path.join(dist, 'media');
  if (!fs.existsSync(mediaDir)) return { removed: [], reason: 'no media' };
  const assets = path.join(dist, 'assets');
  const files = [path.join(dist, 'index.html'),
    ...(fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => /\.(js|css)$/.test(f)).map((f) => path.join(assets, f)) : [])];
  const text = files.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  if (text.includes('media/${') || /media\/['"`]\s*\+/.test(text)) return { removed: [], reason: 'dynamic media path' };
  const removed = [];
  for (const entry of fs.readdirSync(mediaDir, { withFileTypes: true })) {
    const name = entry.name;
    if (text.includes(`media/${name}`)) continue;
    fs.rmSync(path.join(mediaDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return { removed, reason: 'ok' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = pruneNativeMedia(path.resolve(process.argv[2] || 'dist'));
  console.log(`prune-native-media: ${r.reason}; removed ${r.removed.length}: ${r.removed.join(', ')}`);
}
