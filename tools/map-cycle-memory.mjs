// node tools/map-cycle-memory.mjs [count=12]: phone tier, one battle per different map back to back (headless).
// Prints three's live GPU resource counts after each map. Teardown 2026-11-10: the WebView renderer was
// OOM-killed on the ~12th new map because each map's terrain textures stayed resident. Exit 1 if textures climb.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
const COUNT = Number(process.argv[2] || 12);
const MAPS = ['verdant', 'desert', 'winter', 'urban', 'monsoon', 'skybridge', 'coastal', 'autumn', 'steppe', 'delta', 'alpine', 'badlands', 'frontier', 'fjord'];
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 6540, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--js-flags=--expose-gc'], protocolTimeout: 900000 });
const rows = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash=1&tier=mobile`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 240000 });
  for (const map of MAPS.slice(0, COUNT)) {
    const row = await page.evaluate(async (m) => {
      await window.__DEBUG.startBattle('m1a2', m); window.__DEBUG.fastForward(3);
      await new Promise((r) => setTimeout(r, 4000));
      globalThis.gc?.();
      const mem = window.__DEBUG.renderer.info.memory;
      return { map: m, textures: mem.textures, geometries: mem.geometries, programs: window.__DEBUG.renderer.info.programs?.length ?? null,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    }, map);
    console.log(JSON.stringify(row));
    rows.push(row);
  }
} finally { await browser.close(); await server.close(); }
// Resident world cache keeps a few recent maps: judge growth over the second half only.
const half = rows.slice(Math.floor(rows.length / 2));
const grow = half[half.length - 1].textures - half[0].textures;
console.log(`textures second half: ${half[0].textures} -> ${half[half.length - 1].textures} (${grow >= 0 ? '+' : ''}${grow})`);
process.exit(grow > 12 ? 1 : 0);
