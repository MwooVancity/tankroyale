// Release gate records. testlab.mjs writes one per PASS (real phone, battle
// reached, enemies, p10 fps >= MIN_FPS, 0 crashes, not a perf-lab build), keyed
// by the commit the APK was built from. play.mjs promote refuses a versionCode
// whose CI commit has no pass, or only differs from a passed commit in more
// than docs. ponytail: records are local files (promote runs on this laptop);
// the APK commit is APK_SHA or HEAD at run time, so build and test in one go.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.resolve('tools/.gates');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const GAME_PATHS = ['src', 'server', 'android', 'public', 'index.html', 'vite.config.ts', 'package.json'];
// Paths that cannot change what a phone runs (tools/ and .github/ can: the
// workflow prunes and packages the app).
export const isDocsOnly = (file) => /\.md$/i.test(file) || file.startsWith('docs/');

export function recordGatePass(result, sha = process.env.APK_SHA || git('rev-parse', 'HEAD')) {
  const dirty = git('status', '--porcelain', '--', ...GAME_PATHS);
  if (dirty) {
    console.log('  gate pass NOT recorded: uncommitted game files, so the APK is not a commit');
    return null;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, '.gitignore'), '*\n'); // local records, never committed
  const file = path.join(DIR, `${sha}.json`);
  fs.writeFileSync(file, JSON.stringify({ sha, at: new Date().toISOString(), ...result }, null, 1));
  console.log(`  gate pass recorded for ${sha.slice(0, 8)}`);
  return file;
}

/** Why a production promote of `vc` must not happen, or null when it may. */
export function promoteRefusal(vc, productionMax, runs, findPass = findGatePass) {
  if (!(vc > productionMax)) return `versionCode ${vc} is not above production ${productionMax}`;
  const run = runs.find((r) => r.number === vc);
  if (!run) return `no Android Build run #${vc} found`;
  if (run.conclusion !== 'success') return `Android Build run #${vc} did not succeed (${run.conclusion})`;
  if (!findPass(run.headSha)) return `no Test Lab gate PASS for commit ${run.headSha.slice(0, 8)} (run tools/testlab.mjs on an APK of it)`;
  return null;
}

/** Passed commit that `sha` equals or only adds docs/tooling on top of; else null. */
export function findGatePass(sha, { dir = DIR, diffFiles = (a, b) => git('diff', '--name-only', a, b).split('\n').filter(Boolean) } = {}) {
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const pass = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (pass.sha === sha) return pass;
    try {
      if (diffFiles(pass.sha, sha).every(isDocsOnly)) return pass;
    } catch { /* unknown commit */ }
  }
  return null;
}
