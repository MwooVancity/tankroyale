// node tools/look-shot.mjs <tag> [maps=winter,desert,verdant]: headless phone-tier (Performance) battle captures.
// Run from the repo root. Same shaders as the phone; not a speed measure.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
const [TAG = 'x', MAPS = 'winter,desert,verdant'] = process.argv.slice(2);
const OUT = resolve('testlab-results', 'look'); mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 6500, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'], protocolTimeout: 600000 });
try {
  for (const map of MAPS.split(',')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${server.config.server.port}/?nosplash=1&tier=${process.env.TIER || 'mobile'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 240000 });
    await page.evaluate(async (m) => { await window.__DEBUG.startBattle('m1a2', m); window.__DEBUG.fastForward(6); }, map);
    await new Promise((r) => setTimeout(r, 6000));
    await page.screenshot({ path: resolve(OUT, `${map}-${TAG}.png`) });
    console.log('shot', map, TAG);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
