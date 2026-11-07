// Cold start: the signal server is down for ~7 s (Render free tier waking).
// With the wake budget, createRoom keeps retrying, reports "waking", and
// succeeds once the server is up. Without it, the old client gives up first.
import assert from 'node:assert/strict';
import net from 'node:net';
import { WebSocket } from 'ws';
import { createSignalingServer } from './signalingServer.ts';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';

const port = await new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const opts = { url: `ws://127.0.0.1:${port}/signal`, WebSocketImpl: WebSocket, connectTimeoutMs: 2_000, eventPollIntervalMs: 50 };
const player = { id: 'h', name: 'Host' };

// Old behaviour: no budget, the server never comes up in time -> rejects.
{
  const t0 = Date.now();
  await assert.rejects(new RoomSignalingClient(opts).createRoom({ player }), /signaling/i);
  assert.ok(Date.now() - t0 < 7_000, 'no-budget client gives up within its 4 quick retries');
}

// Wake budget: server appears after 7 s; the client waits, reports, joins.
const waking = [];
const client = new RoomSignalingClient({ ...opts, wakeBudgetMs: 20_000, onWaking: (ms) => waking.push(ms) });
let server;
setTimeout(async () => { server = createSignalingServer({ host: '127.0.0.1', port }); await server.listen(); }, 7_000);
const room = await client.createRoom({ player });
assert.match(room.roomCode, /^[A-Z0-9]{6}$/);
assert.ok(waking.length >= 1, 'player was told the server is waking');
client.close?.();
await server.close?.();
console.log(`signalWake selftest ok (waking reported ${waking.length}x, last ${waking.at(-1)} ms)`);
process.exit(0);
