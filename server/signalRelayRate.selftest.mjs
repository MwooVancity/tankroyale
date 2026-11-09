// Relay at real match rates. Phones on mobile data sit behind carrier NAT, so
// with STUN only most online matches run through the signal-server relay.
// Rates (src/net/protocol.ts + inputCadence.ts): each guest sends inputs at up
// to 60/s, the host sends 20 snapshots/s to every guest. A 5v5 host feeds 9
// guests = 180 msgs/s; a 2v2 room's three guests send 180 inputs/s together.
// The old caps (room 1500 / connection 1200 per 10 s) dropped a third of this.
// Real server + real signaling clients, 11 s of traffic (crosses a 10 s window).
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalingServer } from './signalingServer.ts';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';

const server = createSignalingServer({ host: '127.0.0.1', port: 0 });
const { port } = await server.listen();
const opts = { url: `ws://127.0.0.1:${port}/signal`, WebSocketImpl: WebSocket, eventPollIntervalMs: 50 };
const host = new RoomSignalingClient(opts);
const room = await host.createRoom({ player: { id: 'h', name: 'Host' }, maxPlayers: 4 });
const guests = [];
for (let i = 0; i < 3; i++) {
  const sig = new RoomSignalingClient(opts);
  const joined = await sig.joinRoom({ roomCode: room.roomCode, player: { id: `g${i}`, name: `G${i}` } });
  guests.push({ sig, peerId: joined.peerId, hostSession: joined.peers.find((p) => p.peerId === room.peerId).sessionId });
}

const SNAPSHOT = 'S'.repeat(2400); // ~1.8 KB binary snapshot, base64
const INPUT = 'I'.repeat(80);
let sent = 0, got = 0;
for (const g of guests) g.sig.onEvent((m) => { if (m.type === 'room_signal' && m.payload.signal?.kind === 'data') got++; });
host.onEvent((m) => { if (m.type === 'room_signal' && m.payload.signal?.kind === 'data') got++; });

const SECONDS = 11, STEP_MS = 50; // 20 steps/s
const until = Date.now() + SECONDS * 1000;
while (Date.now() < until) {
  // host: 9 snapshots per step = 180/s (a 5v5 host); spread over the 3 real guests
  for (let k = 0; k < 9; k++) { const g = guests[k % 3]; host.sendSignal(g.peerId, { kind: 'data', ch: 's', d: SNAPSHOT }, g.sig.sessionId); sent++; }
  // each guest: 3 inputs per step = 60/s
  for (const g of guests) for (let k = 0; k < 3; k++) { g.sig.sendSignal(room.peerId, { kind: 'data', ch: 'c', d: INPUT }, g.hostSession); sent++; }
  await new Promise((r) => setTimeout(r, STEP_MS));
}
// Drain: wait until deliveries stop growing (a busy CI box delivers late, not never).
for (let last = -1, t = 0; got !== last && t < 10; t++) { last = got; await new Promise((r) => setTimeout(r, 500)); }
const loss = 1 - got / sent;
console.log(`signalRelayRate: sent ${sent}, delivered ${got}, loss ${(loss * 100).toFixed(1)}%`);
// ponytail: 3% bound. The guard catches budget caps (old caps dropped 33-44%);
// a loaded 2-core CI runner loses 0.8% to timing alone (runs #91, #93).
assert(loss < 0.03,`relay drops match traffic at real rates: ${(loss * 100).toFixed(1)}% lost`);
assert.equal(host.socket.readyState, WebSocket.OPEN, 'host socket survives a 5v5 snapshot rate');
// Over budget, snapshots drop but control messages ('c') never do.
{
  const g = guests[0];
  let ctl = 0;
  const off = g.sig.onEvent((m) => { if (m.type === 'room_signal' && m.payload.signal?.ch === 'c') ctl++; });
  for (let i = 0; i < 5000; i++) {
    host.sendSignal(g.peerId, { kind: 'data', ch: 's', d: 's' }, g.sig.sessionId);
    if (i % 100 === 0) host.sendSignal(g.peerId, { kind: 'data', ch: 'c', d: 'ctl' }, g.sig.sessionId);
  }
  await new Promise((r) => setTimeout(r, 2000));
  off();
  assert.equal(ctl, 50, `control messages survive a snapshot flood (${ctl}/50)`);
}
host.close?.(); for (const g of guests) g.sig.close?.();
await server.close();
console.log('signalRelayRate.selftest: 2v2 inputs + 5v5 host snapshot rate relay without loss');
