// Google Play tracks. Read: node tools/play.mjs <sa.json> tracks
// Promote: node tools/play.mjs <sa.json> promote <versionCode> "<release notes>"
// Internal testing: node tools/play.mjs <sa.json> internal <versionCode> "<notes>" (internal track only)
// Promote = edits.insert, tracks.update production (status completed), commit.
// Play sends the change for review itself; never set changesNotSentForReview.
// Never run while CI's upload edit is in flight (a second edit expires it).
import fs from 'node:fs'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
import { findGatePass, promoteRefusal } from './releaseGate.mjs';

const [keyPath, cmd = 'tracks', vc, notes = ''] = process.argv.slice(2);
const PKG = 'app.tankroyale';
const k = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
const jwt = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: k.token_uri, iat: now, exp: now + 3600 });
const sig = crypto.sign('RSA-SHA256', Buffer.from(jwt), k.private_key).toString('base64url');
const tok = (await (await fetch(k.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}.${sig}` })).json()).access_token;
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/edits`;
async function api(path, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}
const edit = await api('', 'POST', {});
if (cmd === 'tracks') {
  const { tracks } = await api(`/${edit.id}/tracks`);
  for (const t of tracks) for (const r of t.releases || []) console.log(t.track.padEnd(12), r.status.padEnd(10), r.name, (r.versionCodes || []).join(','), r.userFraction ?? '');
  await api(`/${edit.id}`, 'DELETE');
} else if (cmd === 'promote') {
  if (!/^\d+$/.test(String(vc))) throw new Error('versionCode required');
  // Release gate: vc must be newer than production, and its CI commit must
  // have a real-phone Test Lab PASS (tools/releaseGate.mjs). No override flag.
  const { tracks } = await api(`/${edit.id}/tracks`);
  const prodMax = Math.max(0, ...(tracks.find((t) => t.track === 'production')?.releases || []).flatMap((r) => (r.versionCodes || []).map(Number)));
  const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', 'android.yml', '--limit', '200', '--json', 'number,headSha,conclusion'], { encoding: 'utf8' }));
  let refusal = promoteRefusal(Number(vc), prodMax, runs, findGatePass);
  // Only the fps gate can be waived, and only by the owner's own words, which
  // are printed (and go in PLAN.md). CI success and above-production still hold.
  if (refusal?.startsWith('no Test Lab gate PASS') && process.env.OWNER_OVERRIDE) {
    console.log(`gate waived by owner: "${process.env.OWNER_OVERRIDE}" (${refusal})`);
    refusal = null;
  }
  if (refusal) {
    await api(`/${edit.id}`, 'DELETE');
    console.error(`promote refused: ${refusal}`);
    process.exit(1);
  }
  const release = { versionCodes: [String(vc)], status: 'completed' };
  if (notes) release.releaseNotes = [{ language: 'en-US', text: notes.slice(0, 500) }];
  await api(`/${edit.id}/tracks/production`, 'PUT', { track: 'production', releases: [release] });
  const done = await api(`/${edit.id}:commit`, 'POST');
  console.log('committed edit', done.id, 'production ->', vc);
} else if (cmd === 'internal') {
  // Internal testing track only (owner's own phone; no store review, not public).
  // Never touches production: that path is `promote`, with its release gate.
  if (!/^\d+$/.test(String(vc))) throw new Error('versionCode required');
  const release = { versionCodes: [String(vc)], status: 'completed', name: `internal ${vc}` };
  if (notes) release.releaseNotes = [{ language: 'en-US', text: notes.slice(0, 500) }];
  await api(`/${edit.id}/tracks/internal`, 'PUT', { track: 'internal', releases: [release] });
  const done = await api(`/${edit.id}:commit`, 'POST');
  console.log('committed edit', done.id, 'internal ->', vc);
} else if (cmd === 'listings') {
  const { listings } = await api(`/${edit.id}/listings`);
  for (const l of listings || []) console.log(l.language, '|', l.title, '|', l.shortDescription, '|', l.fullDescription.split('\n')[0], '| ads line:', /ad may show/.test(l.fullDescription), '| "No ads":', /No ads/.test(l.fullDescription));
  await api(`/${edit.id}`, 'DELETE');
} else if (cmd === 'listing') {
  // Push title / short / full description from store-assets/play-store-listing.md
  // (sections "## App title", "## Short description", "## Full description" up to "---").
  const md = fs.readFileSync('store-assets/play-store-listing.md', 'utf8');
  const sec = (h) => { const i = md.indexOf('\n## ' + h); const rest = md.slice(md.indexOf('\n', i + 1) + 1); return rest.slice(0, rest.search(/\n## |\n---/)).trim(); };
  const body = { title: sec('App title'), shortDescription: sec('Short description'), fullDescription: sec('Full description') };
  if (body.title.length > 30 || body.shortDescription.length > 80 || body.fullDescription.length > 4000 || !body.fullDescription) throw new Error('listing too long or empty');
  const { listings } = await api(`/${edit.id}/listings`);
  for (const l of listings || []) console.log('before', l.language, '|', l.title, '|', l.shortDescription);
  const lang = (listings || [])[0]?.language || 'en-US';
  await api(`/${edit.id}/listings/${lang}`, 'PATCH', body);
  const done = await api(`/${edit.id}:commit`, 'POST');
  console.log('committed edit', done.id, 'listing', lang, '|', body.title, '|', body.shortDescription);
} else throw new Error('unknown command ' + cmd);
