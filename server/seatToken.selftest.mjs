// Seat takeover: player ids are public, so a stranger with the room code and
// someone's id must not replace them. The real player (same token) still
// rejoins, and old clients without token support keep the id-only behaviour.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { SignalingRoomStore } from './roomStore.ts';
import { createSignalingServer } from './signalingServer.ts';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';

const store = new SignalingRoomStore();
const [hostConn, guestConn, attacker, rejoin, oldA, oldB] = [{}, {}, {}, {}, {}, {}];
const room = store.create(hostConn, { player: { id: 'host1', name: 'H' }, sessionId: 'sessionhost1', seatTokenCapable: true });
assert.ok(room.seatToken, 'capable creator gets a seat token');
const guest = store.join(guestConn, { roomCode: room.roomCode, player: { id: 'guest1', name: 'G' }, sessionId: 'sessionguest1', seatTokenCapable: true }).result;
assert.ok(guest.seatToken && guest.seatToken !== room.seatToken);
assert.ok(!JSON.stringify(guest.peers).includes(room.seatToken), 'tokens never reach other peers');

assert.throws(() => store.join(attacker, { roomCode: room.roomCode, player: { id: 'host1', name: 'X' }, sessionId: 'sessionhost1' }),
  (e) => e.code === 'seat_taken', 'id + public sessionId without token is refused');
assert.throws(() => store.join(attacker, { roomCode: room.roomCode, player: { id: 'guest1', name: 'X' }, sessionId: 'sessionattack', seatToken: 'guess', seatTokenCapable: true }),
  (e) => e.code === 'seat_taken', 'wrong token is refused');
store.detach(guestConn);
const back = store.join(rejoin, { roomCode: room.roomCode, player: { id: 'guest1', name: 'G' }, sessionId: 'sessionguest2', seatToken: guest.seatToken, seatTokenCapable: true }).result;
assert.equal(back.seatToken, guest.seatToken, 'real player rejoins with the same token');

// Build 77 style clients (no token support): unchanged behaviour.
const legacy = store.create(oldA, { player: { id: 'old1', name: 'O' }, sessionId: 'sessionold01' });
assert.equal(legacy.seatToken, undefined);
store.join(oldB, { roomCode: legacy.roomCode, player: { id: 'old1', name: 'O' }, sessionId: 'sessionold02' });

// Real client over a real server: token survives a client restart via storage.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const server = createSignalingServer({ host: '127.0.0.1', port: 0 });
const { port } = await server.listen();
const opts = { url: `ws://127.0.0.1:${port}/signal`, WebSocketImpl: WebSocket, eventPollIntervalMs: 50 };
const host = new RoomSignalingClient(opts);
const made = await host.createRoom({ player: { id: 'hh', name: 'Host' } });
const g1 = new RoomSignalingClient(opts);
await g1.joinRoom({ roomCode: made.roomCode, player: { id: 'gg', name: 'Guest' } });
mem.delete('tr-signal-seat');
const thief = new RoomSignalingClient(opts);
await assert.rejects(thief.joinRoom({ roomCode: made.roomCode, player: { id: 'gg', name: 'Thief' } }), (e) => e.code === 'seat_taken');
mem.set('tr-signal-seat', JSON.stringify({ roomCode: made.roomCode, token: g1.seatToken }));
const g2 = new RoomSignalingClient(opts); // app restarted on the same phone
await g2.joinRoom({ roomCode: made.roomCode, player: { id: 'gg', name: 'Guest' } });
console.log('seatToken selftest ok');
process.exit(0);
