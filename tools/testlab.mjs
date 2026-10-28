// Real-Android test: run the exact APK Google Play generates for a version code
// on real phones in Firebase Test Lab (Robo crawl), then pull logcat, the
// WebView console errors, screenshots and video.
// Usage: node tools/testlab.mjs <service-account.json> <versionCode> [project=tanks-dbd56]
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { execFileSync } from 'node:child_process';

// Optional 4th arg: an existing matrix id, to only collect its results.
const [keyPath, VC, PROJECT = 'tanks-dbd56', RESUME] = process.argv.slice(2);
const PKG = 'app.tankroyale', OUT = path.resolve('testlab-results', `vc${VC}`);
const k = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

async function token(scope) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const u = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: k.client_email, scope, aud: k.token_uri, iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(u), k.private_key).toString('base64url');
  const r = await fetch(k.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${u}.${sig}` });
  return (await r.json()).access_token;
}
const playT = await token('https://www.googleapis.com/auth/androidpublisher');
const gcpT = await token('https://www.googleapis.com/auth/cloud-platform');
// Storage calls go without x-goog-user-project: the project has no billing and
// Test Lab's default bucket is free; a billing tag makes Storage refuse (403).
const gcp = { authorization: 'Bearer ' + gcpT, 'x-goog-user-project': PROJECT };
const store = { authorization: 'Bearer ' + gcpT };
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...(url.includes('storage.googleapis') ? store : gcp),'content-type': 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}
fs.mkdirSync(OUT, { recursive: true });

// Tokens last an hour; the upload alone can take most of it.
const refresh = async () => { gcp.authorization = store.authorization = 'Bearer ' + await token('https://www.googleapis.com/auth/cloud-platform'); };
let BUCKET, picked = [], matrix;
if (RESUME) {
  BUCKET = (await api(`https://toolresults.googleapis.com/toolresults/v1beta3/projects/${PROJECT}:initializeSettings`, { method: 'POST' })).defaultBucket;
  matrix = { testMatrixId: RESUME };
} else {
// 1. The universal APK Play builds from our AAB = what users install.
// APK=<file> tests that file instead: Play's universal APK carries Play's
// license check, which closes the app when Test Lab installs it outside Play.
const apkFile = process.env.APK ? path.resolve(process.env.APK) : path.join(OUT, 'app.apk');
if (!fs.existsSync(apkFile)) {
  const play = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/generatedApks/${VC}`;
  const list = await (await fetch(play, { headers: { authorization: 'Bearer ' + playT } })).json();
  const id = list.generatedApks?.[0]?.generatedUniversalApk?.downloadId;
  if (!id) throw new Error('No Play universal APK for version ' + VC + ': ' + JSON.stringify(list).slice(0, 300));
  const r = await fetch(`${play}/downloads/${encodeURIComponent(id)}:download?alt=media`, { headers: { authorization: 'Bearer ' + playT } });
  if (!r.ok) throw new Error('APK download ' + r.status);
  fs.writeFileSync(apkFile, Buffer.from(await r.arrayBuffer()));
}
console.log('APK', VC, fs.statSync(apkFile).size, 'bytes');

// 2. Upload to Test Lab's free default bucket (a new bucket needs billing).
BUCKET = (await api(`https://toolresults.googleapis.com/toolresults/v1beta3/projects/${PROJECT}:initializeSettings`, { method: 'POST' })).defaultBucket;
console.log('Bucket', BUCKET);
const obj = `vc${VC}/app.apk`;
// curl, not fetch: fetch's 5-minute headers timeout kills a 200 MB upload.
const code = execFileSync('curl', ['-s', '-o', path.join(OUT, 'upload.json'), '-w', '%{http_code}', '-X', 'POST',
  '-H', `authorization: Bearer ${gcpT}`, '-H', 'content-type: application/vnd.android.package-archive',
  '--data-binary', '@' + apkFile,
  `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(obj)}`]).toString();
if (code !== '200') throw new Error('upload ' + code + ' ' + fs.readFileSync(path.join(OUT, 'upload.json'), 'utf8').slice(0, 300));
console.log('Uploaded', obj);

// 3. Pick real phones: a low, a mid and a recent Android, different makers.
const cat = await api(`https://testing.googleapis.com/v1/testEnvironmentCatalog/ANDROID?projectId=${PROJECT}`);
// FORM=VIRTUAL uses Test Lab's Android emulators (a separate free daily quota).
const FORM = process.env.FORM || 'PHYSICAL';
const models = cat.androidDeviceCatalog.models.filter((m) => m.form === FORM &&m.formFactor === 'PHONE' && m.supportedVersionIds?.length);
const want = [[24, 28], [29, 32], [33, 99]], makers = new Set();
for (const [lo, hi] of want) {
  for (const m of models) {
    // Only versions with phones actually in the lab (a NONE/LOW pick was never run).
    // Emulators carry no capacity info: any supported version is available.
    const v = (FORM === 'VIRTUAL' ? m.supportedVersionIds : (m.perVersionInfo || [])
      .filter((p) => p.deviceCapacity === 'DEVICE_CAPACITY_HIGH' || p.deviceCapacity === 'DEVICE_CAPACITY_MEDIUM').map((p) => p.versionId))
      .map(Number).filter((x) => x >= lo && x <= hi).sort((a, b) => a - b).at(-1);
    if (v && !makers.has(FORM === 'VIRTUAL' ? m.id : m.manufacturer)) { picked.push({ androidModelId: m.id, androidVersionId: String(v), locale: 'en', orientation: 'landscape', name: `${m.manufacturer} ${m.name} / API ${v}` }); makers.add(FORM === 'VIRTUAL' ? m.id : m.manufacturer); break; }
  }
}
console.log('Devices:', picked.map((d) => d.name).join(' | '));

// 4. Robo crawl: boots the app, taps through screens, records video + logcat.
await refresh();
matrix = await api(`https://testing.googleapis.com/v1/projects/${PROJECT}/testMatrices`, {
  method: 'POST',
  body: JSON.stringify({
    testSpecification: { testTimeout: '420s', androidRoboTest: { appApk: { gcsPath: `gs://${BUCKET}/${obj}` }, appPackageId: PKG } },
    environmentMatrix: { androidDeviceList: { androidDevices: picked.map(({ name, ...d }) => d) } },
    resultStorage: { googleCloudStorage: { gcsPath: `gs://${BUCKET}/vc${VC}/results/${Date.now()}` } },
  }),
});
}
console.log('Matrix', matrix.testMatrixId);
let m = matrix;
while (!['FINISHED', 'ERROR', 'INVALID'].includes(m.state)) {
  if (m.state) await new Promise((r) => setTimeout(r, 30_000));
  await refresh();
  m = await api(`https://testing.googleapis.com/v1/projects/${PROJECT}/testMatrices/${matrix.testMatrixId}`);
}
console.log('Matrix state', m.state, m.invalidMatrixDetails || '', 'outcome', m.outcomeSummary || '');

// 5. Per device: outcome, crashes, WebView console errors, artifacts.
const prefix = m.resultStorage.googleCloudStorage.gcsPath.replace(`gs://${BUCKET}/`, '');
const objs = (await api(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`)).items || [];
const get = async (name) => Buffer.from(await (await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media`, { headers: store })).arrayBuffer());
if (!m.testExecutions) process.exit(1);
for (const ex of m.testExecutions) {
  const dev = picked.find((d) => d.androidModelId === ex.environment.androidDevice.androidModelId && d.androidVersionId === ex.environment.androidDevice.androidVersionId);
  console.log(`\n== ${dev?.name || ex.environment.androidDevice.androidModelId + ' / API ' + ex.environment.androidDevice.androidVersionId} ::${ex.state} ${ex.testDetails?.errorMessage || ''}`);
  const dir = `${ex.environment.androidDevice.androidModelId}-${ex.environment.androidDevice.androidVersionId}`;
  const mine = objs.filter((o) => o.name.includes(`/${dir}-`) || o.name.includes(`/${dir}/`));
  const local = path.join(OUT, dir); fs.mkdirSync(local, { recursive: true });
  for (const o of mine.filter((o) => /logcat$|video\.mp4$|\.png$/.test(o.name)).slice(0, 40)) {
    fs.writeFileSync(path.join(local, o.name.split('/').slice(-2).join('_')), await get(o.name));
  }
  const logcat = mine.find((o) => /logcat$/.test(o.name));
  if (!logcat) { console.log('  no logcat'); continue; }
  const lines = (await get(logcat.name)).toString('utf8').split('\n');
  const pick = (re) => lines.filter((l) => re.test(l));
  const fatal = pick(/FATAL EXCEPTION|ANR in app\.tankroyale|Process app\.tankroyale .*has died|renderer.*(crash|gone)/i);
  const consoleErr = pick(/chromium.*CONSOLE.*(Error|Uncaught|failed|rejection)|Capacitor.*(Error|error)/);
  const boot = pick(/__GAME_READY|bootRecovery|preloadError|did not load/i);
  console.log(`  crashes/ANR: ${fatal.length}`); fatal.slice(0, 5).forEach((l) => console.log('   ', l.slice(0, 220)));
  console.log(`  WebView console errors: ${consoleErr.length}`); [...new Set(consoleErr.map((l) => l.replace(/^.*CONSOLE/, '').slice(0, 200)))].slice(0, 12).forEach((l) => console.log('   ', l));
  console.log(`  boot markers: ${boot.length}`); boot.slice(0, 5).forEach((l) => console.log('   ', l.slice(0, 200)));
  console.log(`  saved: ${local}`);
}
