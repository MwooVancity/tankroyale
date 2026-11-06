// WebRTC fallback: when the peer connection never connects, match traffic
// runs through the signal server. Real server + real signaling clients; the
// RTCPeerConnection is a stub that never connects (carrier NAT, no TURN).
// Without signalRelay the same setup rejects (proved below).
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalingServer, RELAY_ROOM_MAX_MESSAGES } from './signalingServer.ts';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';
import { createWebRTCPeer } from '../src/net/webrtcPeer.ts';
import { createRelayChannel } from '../src/net/signalRelayChannel.ts';

class DeadRTC {
  constructor() { this.connectionState = 'new'; this.localDescription = null; this.remoteDescription = null; }
  createDataChannel(label) {
    return { label, readyState: 'connecting', addEventListener() {}, close() {}, send() {} };
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0 stub' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0 stub' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate() {}
  close() { this.connectionState = 'closed'; }
}

const server = createSignalingServer({ host: '127.0.0.1', port: 0 });
const { port } = await server.listen();
const url = `ws://127.0.0.1:${port}/signal`;
const opts = { url, WebSocketImpl: WebSocket, eventPollIntervalMs: 50, reconnectDelaysMs: [10, 20] };
const hostSig = new RoomSignalingClient(opts);
const guestSig = new RoomSignalingClient(opts);
const room = await hostSig.createRoom({ player: { id: 'h', name: 'Host' }, maxPlayers: 2 });
const joined = await guestSig.joinRoom({ roomCode: room.roomCode, player: { id: 'g', name: 'Guest' } });
const hostSession = joined.peers.find((p) => p.peerId === room.peerId).sessionId;

function pair(signalRelay) {
  const common = { RTCPeerConnectionImpl: DeadRTC, signalRelay, relayAfterMs: 80, connectTimeoutMs: 400, initialRecoveryDelayMs: 10_000 };
  const host = createWebRTCPeer({ ...common, role: 'host', onSignal: (s) => hostSig.sendSignal(joined.peerId, s, guestSig.sessionId) });
  const guest = createWebRTCPeer({ ...common, role: 'client', onSignal: (s) => guestSig.sendSignal(room.peerId, s, hostSession) });
  const offH = hostSig.onEvent((m) => { if (m.type === 'room_signal' && m.payload.fromPeerId === joined.peerId) host.handleSignal(m.payload.signal).catch(() => {}); });
  const offG = guestSig.onEvent((m) => { if (m.type === 'room_signal' && m.payload.fromPeerId === room.peerId) guest.handleSignal(m.payload.signal).catch(() => {}); });
  return { host, guest, off() { offH(); offG(); } };
}

// 1. Without the fallback the dead peer connection never yields a transport.
{
  const p = pair(false);
  const hostDone = p.host.transportReady.catch((e) => e);
  await p.host.start();
  await assert.rejects(p.guest.transportReady, /could not connect/);
  assert.match(String((await hostDone).message), /could not connect/);
  p.host.close(); p.guest.close(); p.off();
}

// 2. With it, both sides get a working transport through the server.
{
  const p = pair(true);
  await p.host.start();
  const [ht, gt] = await Promise.all([p.host.transportReady, p.guest.transportReady]);
  assert(p.host.relayed && p.guest.relayed, 'both peers report relay');
  assert.equal(p.guest.connectionState, 'connected', 'relayed peer reports connected (no rebuild loop)');
  const got = new Promise((resolve) => gt.onMessage(resolve));
  ht.send({ type: 'relay-test', n: 7 });
  assert.deepEqual(await got, { type: 'relay-test', n: 7 }, 'control message host -> guest');
  const back = new Promise((resolve) => ht.onMessage(resolve));
  gt.send({ type: 'relay-test', n: 8 });
  assert.deepEqual(await back, { type: 'relay-test', n: 8 }, 'control message guest -> host');

  // Closing one side closes the other.
  const closed = new Promise((resolve) => gt.onClose(resolve));
  p.host.close('test_done');
  await closed;
  p.guest.close(); p.off();
}

// 3. Binary (state channel) bytes survive the base64 hop.
{
  let sent = null;
  const a = createRelayChannel('s', (s) => { sent = s; });
  const b = createRelayChannel('s', () => {});
  let rx = null;
  b.addEventListener('message', (e) => { rx = new Uint8Array(e.data); });
  a.send(new Uint8Array([0, 1, 254, 255, 128]));
  b.deliver(sent);
  assert.deepEqual([...rx], [0, 1, 254, 255, 128], 'binary round trip');
}

// 4. Server caps: oversize rejected; per-room message budget drops the excess
//    without closing the socket (data does not count toward the 120/10 s cap).
{
  const errors = [];
  const offErr = hostSig.onEvent((m) => { if (m.type === 'error') errors.push(m.payload.code); });
  // raw frame: the client already refuses this size, a modified client may not
  hostSig.socket.send(JSON.stringify({ type: 'room_signal', payload: { roomCode: room.roomCode, toPeerId: joined.peerId,
    toSessionId: guestSig.sessionId, signal: { kind: 'data', ch: 'c', d: 'x'.repeat(61_000) } } }));
  let received = 0;
  const offRx = guestSig.onEvent((m) => { if (m.type === 'room_signal' && m.payload.signal?.kind === 'data') received++; });
  const burst = RELAY_ROOM_MAX_MESSAGES + 200;
  for (let i = 0; i < burst; i++) hostSig.sendSignal(joined.peerId, { kind: 'data', ch: 's', d: 'p' }, guestSig.sessionId);
  await new Promise((r) => setTimeout(r, 1500));
  assert(errors.includes('relay_too_large'), 'oversize relay message rejected');
  assert(received > 0 && received <= RELAY_ROOM_MAX_MESSAGES, `room budget caps relay (${received} of ${burst})`);
  assert.equal(hostSig.socket.readyState, WebSocket.OPEN, 'burst under the hard cap keeps the socket');
  offErr(); offRx();
}

hostSig.close?.(); guestSig.close?.();
await server.close();
console.log('signalRelay.selftest: WebRTC failure falls back to the signal-server relay; caps hold');
