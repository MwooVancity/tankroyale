// Where does a phone battle frame go? Headless Chrome, phone viewport,
// ?tier=mobile, CPU throttled (default 4x), Bots battle, then 10 s of samples:
// frame interval, time inside renderer.render (GL submission), draw calls,
// triangles. Usage: npm run build:mobile && node tools/mobile-frame-probe.mjs [cpuRate]
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const RATE = Number(process.argv[2] || 4);
const server = await preview({ root: process.cwd(), logLevel: 'error', preview: { host: '127.0.0.1', port: 5790, strictPort: false } });
const url = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({ headless: false, protocolTimeout: 600000, args: ['--ignore-gpu-blocklist', '--window-size=960,480'] }) // headed: headless Chrome falls back to software GL and stalls;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  page.on('response', (r) => { if (r.url().includes('props-models')) console.log('props response:', r.status(), r.url().replace(url, '/'), r.headers()['content-type'], r.headers()['content-encoding']); });
  await page.goto(`${url}?tier=mobile`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME_READY === true, { timeout: 180000, polling: 500 });
  console.log('props fetch:', await page.evaluate(async () => {
    const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('props-models')) || '';
    if (!u) return 'not requested yet';
    const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer());
    return `${r.status} enc=${r.headers.get('content-encoding')} type=${r.headers.get('content-type')} len=${b.length} first=${[...b.slice(0, 4)]}`;
  }));
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2')); // same entry the other probes use
  await page.waitForFunction(() => window.__DEBUG?.game?.phase === 'battle' && !(window.__DEBUG.game.preBattleS > 0), { timeout: 240000, polling: 500 })
    .catch(async (e) => {
      console.log('not in battle:', JSON.stringify(await page.evaluate(() => ({ debug: !!window.__DEBUG, phase: window.__DEBUG?.game?.phase,
        pre: window.__DEBUG?.game?.preBattleS, battleBtn: !!document.querySelector('.cot-battle'), text: document.body.innerText.slice(0, 300) }))));
      throw e;
    });
  await new Promise((r) => setTimeout(r, 5000)); // let warm-up and governor settle
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  // Visible meshes per top-level scene group, captured from the next world render.
  console.log('scene meshes by group:', JSON.stringify(await page.evaluate(() => new Promise((done) => {
    const r = window.__DEBUG.renderer, orig = r.render.bind(r);
    r.render = (s, c) => {
      if (s.children.length > 3) {
        r.render = orig;
        const out = [];
        for (const ch of s.children) {
          let n = 0, inst = 0;
          ch.traverseVisible((o) => { if (o.isMesh) { n++; if (o.isInstancedMesh) inst++; } });
          if (n) out.push([ch.name || ch.type, n, inst]);
        }
        done(out.sort((a, b) => b[1] - a[1]).slice(0, 15));
      }
      orig(s, c);
    };
  }))));
  if (process.env.NOSHADOW) await page.evaluate(() => { window.__probeNoShadow = true; });
  const res = await page.evaluate(() => new Promise((done) => {
    const D = window.__DEBUG, r = D.renderer, orig = r.render.bind(r);
    if (window.__probeNoShadow) r.shadowMap.autoUpdate = false; // experiment: frozen shadows
    let renderMs = 0, renders = 0, calls = 0, tris = 0;
    const passes = {};
    r.render = (s, c) => {
      const t = performance.now(); const pre = r.info.render.calls; orig(s, c); const ms = performance.now() - t; void pre;
      renderMs += ms; renders++; calls += r.info.render.calls; tris += r.info.render.triangles;
      const rt = r.getRenderTarget();
      const key = `${s.name || s.type}${s.children.length > 3 ? '(world)' : ''} ${c.type} mask${c.layers.mask} sh${r.shadowMap.autoUpdate ? 1 : 0} -> ${rt ? `${rt.width}x${rt.height}${rt.depthTexture ? ' depth' : ''}` : 'screen'}`;
      const p = passes[key] || (passes[key] = { n: 0, ms: 0, calls: 0 });
      p.n++; p.ms += ms; p.calls += r.info.render.calls;
    };
    window.__probePasses = passes;
    const gaps = []; let last = performance.now(); const t0 = last;
    const step = (now) => { gaps.push(now - last); last = now; if (now - t0 < 10000) requestAnimationFrame(step); else finish(); };
    const finish = () => {
      r.render = orig;
      gaps.sort((a, b) => a - b);
      done({ frames: gaps.length, fps: +(gaps.length / 10).toFixed(1), gapMedianMs: +gaps[gaps.length >> 1].toFixed(1), gapP95Ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1),
        renderCallsPerFrame: renders, renderMsPerFrame: +(renderMs / gaps.length).toFixed(1), drawCallsPerRender: Math.round(calls / Math.max(1, renders)), trianglesPerRender: Math.round(tris / Math.max(1, renders)),
        tanks: D.game?.tanks?.length ?? null,
        passes: Object.entries(passes).map(([k, p]) => [k, +(p.n / gaps.length).toFixed(2), +(p.ms / gaps.length).toFixed(2), Math.round(p.calls / p.n)]).sort((a, b) => b[2] - a[2]) });
    };
    requestAnimationFrame(step);
  }));
  res.renderCallsPerFrame = +(res.renderCallsPerFrame / res.frames).toFixed(1);
  console.log(JSON.stringify({ cpuRate: RATE, ...res, errors: errors.slice(0, 5) }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
