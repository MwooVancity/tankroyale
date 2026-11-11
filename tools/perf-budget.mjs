// node tools/perf-budget.mjs [out=perf-log.json] [maps=winter,monsoon,skybridge] [secs=10]
// MASTER-PROMPT budget check, headless: phone tier (6a class) and Lite (g05 class), 4x CPU throttle.
// Per frame: draw calls (all passes, and the shadow pass alone), triangles, programs, frame ms p50/p95.
// Headless desktop GPU + throttled CPU: calls/tris/programs are exact; frame ms is a ranking, not phone ms.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
const [OUT = 'perf-log.json', MAPS = 'winter,monsoon,skybridge', SECS = '10'] = process.argv.slice(2);
const BUDGET = { phone: 150, lite: 80 };
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 6520, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'], protocolTimeout: 600000 });
const rows = [];
try {
  for (const tier of ['phone', 'lite']) for (const map of MAPS.split(',')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${server.config.server.port}/?nosplash=1&tier=mobile${tier === 'lite' ? '&lite=1' : ''}${process.env.EMERGENCY ? '&emergency=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 240000 });
    await page.evaluate(async (m) => { await window.__DEBUG.startBattle('m1a2', m); window.__DEBUG.fastForward(6); }, map);
    await new Promise((r) => setTimeout(r, 20000)); // past terrain streaming and shader warm-up
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const row = await page.evaluate(async (secs) => {
      const r = window.__DEBUG.renderer; const sm = r.shadowMap; const orig = sm.render.bind(sm);
      let shadow = 0; sm.render = (...a) => { const c0 = r.info.render.calls; orig(...a); shadow += r.info.render.calls - c0; };
      const calls = [], shadows = [], tris = [], dt = []; let last = 0;
      await new Promise((done) => { const t0 = performance.now(); const f = (now) => {
        // post.ts resets info at the start of each frame and accumulates every pass.
        if (last) { dt.push(now - last); calls.push(r.info.render.calls); tris.push(r.info.render.triangles); shadows.push(shadow); }
        shadow = 0; last = now; if (now - t0 < secs * 1000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
      sm.render = orig;
      const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
      const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
      return { frames: dt.length, callsAvg: Math.round(avg(calls)), callsP95: q(calls, 0.95), shadowCallsAvg: Math.round(avg(shadows)),
        trisAvgM: +(avg(tris) / 1e6).toFixed(2), programs: r.info.programs?.length ?? null,
        frameMsP50: +q(dt, 0.5).toFixed(1), frameMsP95: +q(dt, 0.95).toFixed(1) };
    }, Number(SECS));
    const out = { tier, map, ...row, budget: BUDGET[tier], overBudget: row.callsP95 > BUDGET[tier] };
    console.log(JSON.stringify(out));
    rows.push(out);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
let commit = ''; try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* no git */ }
const entry = { at: new Date().toISOString(), commit, throttle: '4x CPU, headless', rows };
const log = OUT.endsWith('baseline.json') || !existsSync(OUT) ? [] : JSON.parse(readFileSync(OUT, 'utf8'));
writeFileSync(OUT, JSON.stringify(OUT.endsWith('baseline.json') ? entry : [...log, entry], null, 1) + '\n');
