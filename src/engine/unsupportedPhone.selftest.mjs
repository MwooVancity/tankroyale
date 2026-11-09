// A2: no WebGL 2 (old Android System WebView) shows a fix-it message, not a blank screen.
import assert from 'node:assert/strict';

const appended = [];
const el = () => ({ style: {}, setAttribute() {}, getContext: () => null });
globalThis.document = { createElement: el, body: { appendChild: (n) => appended.push(n) } };
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'test' };
const { createRenderer } = await import('./renderer.ts');
const error = console.error; console.error = () => {};
assert.throws(() => createRenderer({}), /WebGL 2 unavailable/);
console.error = error;
assert.equal(appended.length, 1, 'the message is on screen');
assert.match(appended[0].textContent, /Android System WebView/, 'it says how to fix it');
console.log('unsupportedPhone.selftest: no WebGL 2 shows the update message');
