// node src/net/signalingCancel.selftest.mjs (teardown 2026-11-10 repro, cancel during server wake)
// Hypothesis: player taps Cancel while the room request is in its wake-retry sleep
// (server cold start). close() sets manualClose, but the loop reconnects anyway,
// creates the room, and createRoom() resets manualClose=false and starts polling:
// an orphan client keeps a room alive and polls forever after the player cancelled.
import assert from 'node:assert/strict';
import { RoomSignalingClient } from './signalingClient.ts';

let sockets = 0, created = 0;
class FakeWS {
  constructor() {
    this.n = ++sockets; this.readyState = 0; this.l = {};
    setTimeout(() => {
      if (this.n === 1) { this.readyState = 3; this.emit('error'); this.emit('close'); return; } // server asleep
      this.readyState = 1; this.emit('open');
    }, 5);
  }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  removeEventListener(t, f) { this.l[t] = (this.l[t] || []).filter((x) => x !== f); }
  emit(t, e = {}) { for (const f of this.l[t] || []) f(e); }
  send(raw) {
    const m = JSON.parse(raw);
    if (m.type === 'room_create') created++;
    const payload = { roomCode: 'ABCDEF', peerId: 'p1', hostId: 'p1', mode: 'private' };
    setTimeout(() => this.emit('message', { data: JSON.stringify({ type: 'ok', requestId: m.requestId, payload }) }), 1);
  }
  close() { this.readyState = 3; }
}
const client = new RoomSignalingClient({ url: 'ws://x', WebSocketImpl: FakeWS, wakeBudgetMs: 60_000 });
const p = client.createRoom({ player: { id: 'p1', name: 'P' } }).catch((e) => 'rejected:' + e.code);
await new Promise((r) => setTimeout(r, 50)); // first attempt failed, now sleeping 250 ms
client.close('player_cancelled');
const outcome = await p;
assert.equal(created, 0, `cancelled player still created a room (outcome=${JSON.stringify(outcome)}, ` +
  `roomCode=${client.roomCode}, manualClose=${client.manualClose}, polling=${!!client.pollTimer})`);
