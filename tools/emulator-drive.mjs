// Drive the installed debug app inside an Android emulator over the WebView
// DevTools protocol: wait for boot, start a Bots battle, play ~60 s, and save
// screenshots + every JS error. Exit 1 if boot or battle entry fails.
// Usage (after `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`):
//   node tools/emulator-drive.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'emulator-results');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pages = [];
for (let i = 0; i < 60 && !pages.length; i++) {
  try { pages = (await (await fetch('http://127.0.0.1:9222/json')).json()).filter((p) => p.type === 'page'); } catch { /* not up yet */ }
  if (!pages.length) await sleep(2000);
}
if (!pages.length) { console.log('FAIL no WebView page to debug'); process.exit(1); }
let id = 0; const pending = new Map(); const errors = []; const log = []; const events = [];
let ws;
// The page can reload or its renderer can die mid-boot: reconnect instead of hanging.
async function connect() {
  let list = [];
  for (let i = 0; i < 30 && !list.length; i++) {
    try { list = (await (await fetch('http://127.0.0.1:9222/json')).json()).filter((p) => p.type === 'page'); } catch { /* gone */ }
    if (!list.length) await sleep(2000);
  }
  if (!list.length) return false;
  ws = new WebSocket(list[0].webSocketDebuggerUrl);
  const ok = await new Promise((r) => { ws.onopen = () => r(true); ws.onerror = () => r(false); setTimeout(() => r(false), 10000); });
  if (!ok) return false;
  ws.onclose = () => { events.push(`devtools closed at ${new Date().toISOString()}`); for (const f of pending.values()) f({}); pending.clear(); };
  ws.onmessage = onMessage;
  await send('Runtime.enable'); await send('Page.enable');
  return true;
}
const onMessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    log.push(`${m.params.type}: ${text}`);
    if (m.params.type === 'error') errors.push(text);
  }
};
const send = (method, params = {}) => new Promise((r) => {
  if (!ws || ws.readyState !== 1) return r({});
  const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params }));
  setTimeout(() => { if (pending.delete(n)) r({}); }, 20000); // never hang on a dead page
});
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
if (!(await connect())) { console.log('FAIL cannot attach to WebView'); process.exit(1); }

const result = { booted: false, bootSeconds: null, battleStarted: false, errors };
const t0 = Date.now();
while (Date.now() - t0 < 240_000) {
  if (!ws || ws.readyState !== 1) await connect();
  if (await evalJs('!!window.__GAME_READY')) { result.booted = true; break; }
  await sleep(2000);
}
result.bootSeconds = Math.round((Date.now() - t0) / 1000);
await shot('1-boot');
if (result.booted) {
  // Dismiss the "press any key" gate, then press BATTLE (Bots).
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(4000);
  await shot('2-garage');
  result.battleClicked = await evalJs("(() => { const b = document.querySelector('.cot-battle'); if (!b) return false; b.click(); return true; })()");
  for (let s = 15; s <= 75; s += 15) {
    await sleep(15000);
    await shot(`3-battle-${s}s`);
  }
  result.battleStarted = result.battleClicked && !errors.some((e) => /entry failed/i.test(e));
  result.battleHud = await evalJs("!!document.querySelector('#hud, .hud, [data-hud]') && getComputedStyle(document.querySelector('#hud, .hud, [data-hud]')).display !== 'none'");
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ ...result, events, log: log.slice(-200) }, null, 2));
console.log(JSON.stringify({ ...result, events, errors: errors.slice(0, 20) }, null, 2));
ws?.close();
process.exit(result.booted && result.battleStarted ? 0 : 1);
