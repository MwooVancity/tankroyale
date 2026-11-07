// Is the relay-capable signal server live? Creates a room on the real server,
// joins it, sends one relay 'data' signal and waits for delivery.
// Old server answers "unknown RTC signal". Usage: node tools/relay-live-check.mjs [wss url]
import { WebSocket } from 'ws';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';

const url = process.argv[2] || 'wss://tankroyale.onrender.com/api/signal';
class OriginWS extends WebSocket { constructor(u, p) { super(u, p, { headers: { origin: process.env.ORIGIN || 'http://localhost' } }); } }
const opts = { url, WebSocketImpl: OriginWS, eventPollIntervalMs: 500 };
const t0 = Date.now();
const host = new RoomSignalingClient(opts), guest = new RoomSignalingClient(opts);
const room = await host.createRoom({ player: { id: `chk-h-${Date.now()}`, name: 'Check' }, maxPlayers: 2 });
const joined = await guest.joinRoom({ roomCode: room.roomCode, player: { id: `chk-g-${Date.now()}`, name: 'Check' } });
const result = await new Promise((resolve) => {
  const t = setTimeout(() => resolve('timeout'), 15000);
  guest.onEvent((m) => { if (m.type === 'room_signal' && m.payload.signal?.kind === 'data') { clearTimeout(t); resolve(`delivered ${m.payload.signal.d}`); } });
  host.onEvent((m) => { if (m.type === 'error') { clearTimeout(t); resolve(`server error: ${m.payload?.message}`); } });
  host.sendSignal(joined.peerId, { kind: 'data', ch: 'c', d: 'relay-ok' }, guest.sessionId);
});
console.log(url, '->', result, `(${Date.now() - t0} ms incl. connect)`);
host.close?.(); guest.close?.();
process.exit(result.startsWith('delivered') ? 0 : 1);
