import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Native app build: drop dist/media files the GAME never names.
// 2026-11-07: folder-level, scanning every JS chunk (removed 7 website folders).
// 2026-11-09: only chunks reachable from index.html count (the website's docs
// pages ship their own chunks that named 28+ MB of site-only media), and
// pruning is per file: a folder the game names only partly keeps just those
// files. A folder whose file names are built at runtime (`media/<dir>/${x}` or
// `media/<dir>/' + x`) is kept whole; a dynamic folder name (`media/${x}`)
// keeps everything.

/** Text of index.html plus every assets/*.js|css it reaches, transitively. */
export function appReachableText(dist) {
  const assets = path.join(dist, 'assets');
  const have = new Set(fs.existsSync(assets) ? fs.readdirSync(assets) : []);
  const seen = new Set();
  const parts = [];
  const scan = (text) => {
    parts.push(text);
    for (const m of text.matchAll(/[\w.-]+\.(?:js|css)\b/g)) {
      const f = m[0];
      if (!have.has(f) || seen.has(f)) continue;
      seen.add(f);
      scan(fs.readFileSync(path.join(assets, f), 'utf8'));
    }
  };
  const index = path.join(dist, 'index.html');
  if (fs.existsSync(index)) scan(fs.readFileSync(index, 'utf8'));
  return parts.join('\n');
}

const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]);

export function pruneNativeMedia(dist) {
  const mediaDir = path.join(dist, 'media');
  if (!fs.existsSync(mediaDir)) return { removed: [], reason: 'no media' };
  let text = appReachableText(dist);
  // Media JSON the game names (manifests, capture recipes) lists more media
  // that is fetched at runtime: its contents count as game references too.
  for (const rel of walk(mediaDir).filter((f) => f.endsWith('.json'))) {
    if (text.includes(`media/${rel}`)) text += '\n' + fs.readFileSync(path.join(mediaDir, rel), 'utf8');
  }
  if (text.includes('media/${') || /media\/['"`]\s*\+/.test(text)) return { removed: [], reason: 'dynamic media path' };
  const removed = [];
  for (const entry of fs.readdirSync(mediaDir, { withFileTypes: true })) {
    const name = entry.name;
    const full = path.join(mediaDir, name);
    if (!text.includes(`media/${name}`)) { fs.rmSync(full, { recursive: true, force: true }); removed.push(name); continue; }
    if (!entry.isDirectory()) continue;
    // Runtime-built file names inside this folder: keep it whole.
    if (text.includes(`media/${name}/\${`) || new RegExp(`media/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/['"\`]\\s*\\+`).test(text)) continue;
    for (const rel of walk(full)) {
      if (text.includes(`media/${name}/${rel}`)) continue;
      fs.rmSync(path.join(full, rel), { force: true });
      removed.push(`${name}/${rel}`);
    }
  }
  return { removed, reason: 'ok' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = pruneNativeMedia(path.resolve(process.argv[2] || 'dist'));
  const folders = r.removed.filter((x) => !x.includes('/'));
  console.log(`prune-native-media: ${r.reason}; removed ${folders.length} folders (${folders.join(', ')}) + ${r.removed.length - folders.length} files`);
}
