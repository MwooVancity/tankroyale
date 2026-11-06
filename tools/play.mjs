// Google Play tracks. Read: node tools/play.mjs <sa.json> tracks
// Promote: node tools/play.mjs <sa.json> promote <versionCode> "<release notes>"
// Promote = edits.insert, tracks.update production (status completed), commit.
// Play sends the change for review itself; never set changesNotSentForReview.
// Never run while CI's upload edit is in flight (a second edit expires it).
import fs from 'node:fs'; import crypto from 'node:crypto';

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
  const release = { versionCodes: [String(vc)], status: 'completed' };
  if (notes) release.releaseNotes = [{ language: 'en-US', text: notes.slice(0, 500) }];
  await api(`/${edit.id}/tracks/production`, 'PUT', { track: 'production', releases: [release] });
  const done = await api(`/${edit.id}:commit`, 'POST');
  console.log('committed edit', done.id, 'production ->', vc);
} else throw new Error('unknown command ' + cmd);
