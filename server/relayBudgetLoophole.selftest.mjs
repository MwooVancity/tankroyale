// D11: the relay budget (4,000/10 s) is for room_signal data only. A room_create
// carrying the '"kind":"data"' marker used to skip the 120/10 s control limit.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalingServer } from './signalingServer.ts';

const server = createSignalingServer({ host: '127.0.0.1', port: 0 });
const { port } = await server.listen();
const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
const replies = [];
ws.on('message', (d) => replies.push(JSON.parse(d.toString())));
ws.send(JSON.stringify({ type: 'room_create', requestId: 'x', payload: { player: { id: 'p', name: 'P' }, maxPlayers: 2, note: { kind: 'data' } } }));
await new Promise((r) => setTimeout(r, 500));
const reply = replies.find((m) => m.requestId === 'x') || replies[0];
assert.ok(reply, 'server answered');
assert.notEqual(reply.type, 'room_created', 'a room_create with the relay marker is not served');
ws.close();
await server.close();
console.log('relayBudgetLoophole.selftest: relay budget only serves room_signal data');
