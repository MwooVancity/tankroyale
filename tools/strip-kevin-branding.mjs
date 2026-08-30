import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';

const ROOT = 'C:/Users/mwoo7/Desktop/tank-royale';

// Files/dirs to skip entirely
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'android',
  'docs', '.github' // internal docs, not in APK
]);

// Extensions to process
const EXTS = new Set(['.html', '.ts', '.js', '.mjs', '.json', '.txt', '.md', '.yml', '.yaml']);

// Replacements — order matters (longer strings first)
const REPLACEMENTS = [
  ['Michael Woo', 'Michael Woo'],
  ['Michael Woo', 'Michael Woo'],
  ['Michael Woo', 'Michael Woo'],
  ['michael woo', 'michael woo'],
  ['MwooVancity/tankroyale', 'MwooVancity/tankroyale'],
  ['MwooVancity', 'MwooVancity'],
  ['mwoo-vancity', 'mwoo-vancity'],
  ['tankroyale.app', 'tankroyale.app'],
  ['cot.tankroyale.app', 'tankroyale.app'],
  ['tank-royale', 'tank-royale'],
  ['Tank-Royale', 'Tank-Royale'],
  ['Tank Royale', 'Tank Royale'],
  ['tank royale', 'tank royale'],
  ['TANK ROYALE', 'TANK ROYALE'],
  ['tank_royale', 'tank_royale'],
  ['TR', 'TR'],  // careful — only in identifiers
];

// For TR replacement, only do it in specific file types and contexts
const COT_SAFE_EXTS = new Set(['.ts', '.js', '.mjs']);

let totalFiles = 0;
let changedFiles = 0;

function walkDir(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.well-known') continue;
    const fullPath = join(dir, entry);
    const rel = relative(ROOT, fullPath);
    const topDir = rel.split(/[\/]/)[0];
    if (SKIP_DIRS.has(topDir)) continue;
    
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else {
      const ext = extname(entry).toLowerCase();
      if (EXTS.has(ext) || entry.endsWith('.txt')) {
        processFile(fullPath, ext);
      }
    }
  }
}

function processFile(path, ext) {
  totalFiles++;
  let content = readFileSync(path, 'utf8');
  let original = content;
  
  for (const [from, to] of REPLACEMENTS) {
    // Skip TR→TR replacement for non-code files (would corrupt CSS class names etc.)
    if (from === 'TR' && !COT_SAFE_EXTS.has(ext)) continue;
    // Don't replace TR in CSS class names like cot-boot-*
    if (from === 'TR') {
      content = content.replace(/\bCOT\b/g, to);
    } else {
      content = content.split(from).join(to);
    }
  }
  
  if (content !== original) {
    writeFileSync(path, content, 'utf8');
    console.log('CHANGED:', relative(ROOT, path));
    changedFiles++;
  }
}

// Also process public/ text files explicitly
const PUBLIC_TEXT_FILES = [
  'public/.well-known/security.txt',
  'public/humans.txt',
  'public/llms.txt',
  'public/llms-full.txt',
  'public/pricing.txt',
  'public/robots.txt',
  'public/docs/llms.txt',
];

walkDir(ROOT);

// Also do public/ text files (they might have been skipped)
for (const rel of PUBLIC_TEXT_FILES) {
  const fullPath = join(ROOT, rel.replace(/\//g, '/'));
  if (existsSync(fullPath)) {
    processFile(fullPath, '.txt');
  }
}

console.log(`\nDone. ${changedFiles}/${totalFiles} files changed.`);
