// Read-only Play health: Android vitals (crash, ANR, slow frames) and recent reviews.
// node tools/play-health.mjs <sa.json>
// Opens NO edit, so it is safe while CI's upload edit is in flight.
// Bad-behavior bars (Play hides apps above them): user-perceived crash 1.09%, ANR 0.47%.
import fs from 'node:fs'; import crypto from 'node:crypto';

const PKG = 'app.tankroyale';
const k = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
async function token(scope) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const jwt = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: k.client_email, scope, aud: k.token_uri, iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(jwt), k.private_key).toString('base64url');
  const r = await fetch(k.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}.${sig}` });
  return (await r.json()).access_token;
}
async function call(tok, url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: `${r.status} ${JSON.stringify(j).slice(0, 300)}` };
  return j;
}

// Vitals: last 28 days, daily, by versionCode.
const rep = await token('https://www.googleapis.com/auth/playdeveloperreporting');
const end = new Date(Date.now() - 2 * 864e5), start = new Date(end.getTime() - 28 * 864e5);
const d = (t) => ({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() });
const sets = {
  crashRateMetricSet: ['crashRate', 'userPerceivedCrashRate', 'distinctUsers'],
  anrRateMetricSet: ['anrRate', 'userPerceivedAnrRate', 'distinctUsers'],
  slowRenderingRateMetricSet: ['slowRenderingRate30Fps', 'distinctUsers'],
};
for (const [set, metrics] of Object.entries(sets)) {
  const j = await call(rep, `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${PKG}/${set}:query`, {
    timelineSpec: { aggregationPeriod: 'DAILY', startTime: d(start), endTime: d(end) },
    metrics,
  });
  if (j.error) { console.log(set, 'ERROR', j.error); continue; }
  const byVc = {};
  for (const row of j.rows || []) {
    const vc = row.dimensions?.[0]?.stringValue ?? '?';
    const o = (byVc[vc] ||= { days: 0 });
    o.days++;
    for (const m of row.metrics || []) {
      const v = Number(m.decimalValue?.value ?? m.decimalValueConfidenceInterval?.lowerBound?.value ?? NaN);
      if (Number.isFinite(v)) (o[m.metric] ||= []).push(v);
    }
  }
  for (const [vc, o] of Object.entries(byVc)) {
    const parts = Object.entries(o).filter(([key]) => key !== 'days').map(([m, v]) => {
      const avg = v.reduce((a, x) => a + x, 0) / v.length;
      return `${m} ${m === 'distinctUsers' ? Math.round(avg) : (avg * 100).toFixed(2) + '%'}`;
    });
    console.log(set.replace('MetricSet', '').padEnd(20), 'vc' + vc, `${o.days}d`, parts.join('  '));
  }
  if (!(j.rows || []).length) console.log(set, 'no rows (too few users for Play to report)');
}

// Error clusters (top crash/ANR causes).
const issues = await call(rep, `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${PKG}/errorIssues:search?pageSize=10`);
if (issues.error) console.log('errorIssues ERROR', issues.error);
for (const i of issues.errorIssues || []) console.log('issue', i.type, i.errorReportCount, i.distinctUsers, (i.cause || '').slice(0, 120), '|', (i.location || '').slice(0, 120));

// Reviews (Play API returns the last 7 days with text).
const pub = await token('https://www.googleapis.com/auth/androidpublisher');
const rv = await call(pub, `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/reviews?maxResults=100`);
if (rv.error) console.log('reviews ERROR', rv.error);
for (const r of rv.reviews || []) {
  const c = r.comments?.[0]?.userComment || {};
  const replied = r.comments?.some((x) => x.developerComment) ? 'replied' : 'no-reply';
  console.log('review', c.starRating, 'vc' + (c.appVersionCode ?? '?'), c.device ?? '', `android${c.androidOsVersion ?? '?'}`, replied, r.reviewId, '|', (c.text || '').replace(/\s+/g, ' ').trim());
}
if (!rv.error && !(rv.reviews || []).length) console.log('reviews: none with text in the last 7 days');
