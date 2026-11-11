// node tools/frame-profile.mjs [maps=monsoon,winter] [seconds=6]: phone-tier battle, CDP CPU profile
// (4x CPU throttle), top self-time functions + scene graph counts. Finds what the main thread pays per frame.
// Headless desktop CPU, not a phone: use the ranking, not the absolute ms.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
const [MAPS = 'monsoon,winter', SECS = '6'] = process.argv.slice(2);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 6510, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'], protocolTimeout: 600000 });
try {
  for (const map of MAPS.split(',')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${server.config.server.port}/?nosplash=1&tier=mobile${process.env.LITE ? '&lite=1' : ''}${process.env.EMERGENCY ? '&emergency=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 240000 });
    await page.evaluate(async (m) => { await window.__DEBUG.startBattle('m1a2', m); window.__DEBUG.fastForward(6); }, map);
    await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 4) * 1000));
    const graph = await page.evaluate(() => {
      const s = window.__DEBUG.scene; let objs = 0, meshes = 0, vis = 0, auto = 0, casters = 0, inst = 0, lights = 0;
      s.traverse((o) => { objs++; if (o.matrixAutoUpdate) auto++; if (o.isLight) lights++;
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { meshes++; if (o.visible) vis++; if (o.castShadow) casters++; if (o.isInstancedMesh) inst++; } });
      const i = window.__DEBUG.renderer.info.render; return { objs, autoMatrix: auto, meshes, visible: vis, casters, instanced: inst, lights, calls: i.calls, tris: i.triangles };
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    const f0 = await page.evaluate(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); return performance.now(); });
    // TRACE=1: also a timeline trace; prints main-thread time per event type (Layout, style, paint, GC...).
    if (process.env.TRACE) await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8'] });
    await cdp.send('Profiler.start');
    await new Promise((r) => setTimeout(r, Number(SECS) * 1000));
    const { profile } = await cdp.send('Profiler.stop');
    if (process.env.TRACE) {
      const ev = JSON.parse(Buffer.from(await page.tracing.stop()).toString()).traceEvents;
      const mains = ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`);
      const load = new Map(); for (const e of ev) if (e.ph === 'X' && e.dur && mains.includes(`${e.pid}:${e.tid}`)) load.set(`${e.pid}:${e.tid}`, (load.get(`${e.pid}:${e.tid}`) || 0) + e.dur);
      const main = [...load].sort((a, b) => b[1] - a[1])[0]?.[0];
      const by = new Map();
      for (const e of ev) if (e.ph === 'X' && e.dur && `${e.pid}:${e.tid}` === main) by.set(e.name, (by.get(e.name) || 0) + e.dur);
      console.log('-- trace main thread (ms total, nested events overlap)');
      for (const [k, us] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${(us / 1000).toFixed(0).padStart(7)}  ${k}`);
    }
    const fr = await page.evaluate((t0) => ({ frames: window.__fc, ms: performance.now() - t0 }), f0);
    const dt = profile.timeDeltas; const hits = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, k) => hits.set(id, (hits.get(id) || 0) + (dt[k] || 0)));
    const agg = new Map(); let total = 0;
    for (const [id, us] of hits) { const n = byId.get(id); const cf = n.callFrame; total += us;
      const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; agg.set(key, (agg.get(key) || 0) + us); }
    const frames = fr.frames || 1;
    console.log(`\n== ${map}: ${frames} frames in ${(fr.ms / 1000).toFixed(1)} s (${(frames / fr.ms * 1000).toFixed(1)} fps, 4x throttle) graph ${JSON.stringify(graph)}`);
    for (const [k, us] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 30))) {
      console.log(`${(us / 1000 / frames).toFixed(2).padStart(7)} ms/frame ${(us / total * 100).toFixed(1).padStart(5)}%  ${k}`);
    }
    // FOCUS=name1,name2: who calls these (self time attributed to the 4-deep caller chain).
    if (process.env.FOCUS) {
      const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const nm = (id) => { const cf = byId.get(id).callFrame; return `${cf.functionName || '(anon)'}:${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; };
      for (const f of process.env.FOCUS.split(',')) {
        const chains = new Map();
        for (const [id, us] of hits) { if (byId.get(id).callFrame.functionName !== f) continue;
          const c = []; let p = parent.get(id); while (p && c.length < 5) { c.push(nm(p)); p = parent.get(p); }
          const k = c.join(' < '); chains.set(k, (chains.get(k) || 0) + us); }
        console.log(`-- callers of ${f}`);
        for (const [k, us] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`${(us / 1000 / frames).toFixed(2).padStart(7)}  ${k}`);
      }
    }
    if (process.env.EVAL) console.log('eval', JSON.stringify(await page.evaluate(process.env.EVAL)));
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
