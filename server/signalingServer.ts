import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  SignalingRoomStore,
  type CreateRoomOptions,
  type JoinRoomOptions,
  type RelaySignalOptions,
  type SignalingConnection,
  type SignalingJoinResult,
  type SignalingMessage,
} from './roomStore.ts';

const MAX_PAYLOAD_BYTES = 128 * 1024;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 120;
// Match-traffic relay (WebRTC fallback, src/net/signalRelayChannel.ts). Its
// own budget, sized for the biggest room (7v7, all 13 guests relayed): guests
// send inputs at up to 60/s each (780/s) and the host sends 20 snapshots/s per
// guest (260/s). The old 1500/1200 caps dropped 44% of a 2v2 room's traffic
// (server/signalRelayRate.selftest.mjs). Over budget, data is dropped (state is
// lossy by design); a connection far over is closed.
export const RELAY_MAX_DATA_CHARS = 60_000; // same as src/net/signalRelayChannel.ts
export const RELAY_ROOM_MAX_MESSAGES = 15_000; // per room per RATE_WINDOW_MS (7v7 ~11k)
export const RELAY_ROOM_MAX_CHARS = 20_000_000; // per room per RATE_WINDOW_MS (~2 MB/s)
const RELAY_CONNECTION_MAX_MESSAGES = 4_000; // a 7v7 host sends ~2.6k snapshots
const RELAY_CONNECTION_CLOSE_MESSAGES = 10_000;

type MaybePromise<T> = T | Promise<T>;

interface StoreNotification {
  connection?: SignalingConnection | null;
  peerId?: string;
  message: SignalingMessage;
}

interface StoreJoinResponse {
  result: SignalingJoinResult;
  notify: StoreNotification[];
}

export interface SignalingStore {
  rooms?: Map<unknown, unknown>;
  create(connection: SignalingConnection, options?: CreateRoomOptions):
    MaybePromise<SignalingJoinResult>;
  join(connection: SignalingConnection, options?: JoinRoomOptions):
    MaybePromise<StoreJoinResponse>;
  relay(connection: SignalingConnection, options?: RelaySignalOptions):
    MaybePromise<StoreNotification>;
  leave(connection: SignalingConnection, reason?: string): MaybePromise<StoreNotification[]>;
  sweepExpired(): MaybePromise<StoreNotification[]>;
  detach?(connection: SignalingConnection, reason?: string): MaybePromise<StoreNotification[]>;
  poll?(connection: SignalingConnection): MaybePromise<StoreNotification[]>;
  deliver?(notification: StoreNotification): MaybePromise<boolean>;
  setDeliveryHandler?(
    handler: (connection: SignalingConnection, message: SignalingMessage) => boolean,
  ): void;
  health?(timeoutMs?: number): Promise<unknown>;
  start?(): Promise<void>;
  close?(): Promise<void>;
}

export interface SignalingServerOptions {
  host?: string;
  port?: number;
  allowedOrigins?: readonly string[] | null;
  webSocketPaths?: readonly string[];
  healthPaths?: readonly string[];
  store?: SignalingStore;
}

export interface SignalingServerService {
  server: http.Server;
  webSocketServer: WebSocketServer;
  store: SignalingStore;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

interface SignalingEnvelope extends Record<string, unknown> {
  type: string;
  requestId?: unknown;
  payload?: unknown;
}

interface RateWindow {
  start: number;
  count: number;
}

interface SignalingHealth {
  ok: boolean;
  rooms: number | null;
  distributed?: boolean;
  redis?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorCode(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.code === 'string' ? value.code : fallback;
}

function safeSend(connection: SignalingConnection | null | undefined, message: unknown): boolean {
  if (!connection) return false;
  const socket = connection as WebSocket;
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function errorMessage(error: unknown, requestId: unknown = null): SignalingMessage {
  return {
    type: 'error',
    ...(requestId ? { requestId: String(requestId) } : {}),
    payload: {
      code: errorCode(error, 'invalid_request'),
      message: error instanceof Error ? error.message : 'invalid request',
    },
  };
}

function validateSignal(signal: unknown): Record<string, unknown> {
  if (!isRecord(signal)) throw new Error('invalid RTC signal');
  if (signal.kind === 'restart') return { kind: 'restart' };
  if (signal.kind === 'data') {
    if (!['c', 's', 'h', 'x'].includes(String(signal.ch))) throw new Error('invalid relay channel');
    if (signal.d !== undefined && (typeof signal.d !== 'string' || signal.d.length > RELAY_MAX_DATA_CHARS)) {
      throw Object.assign(new Error('relay message too large'), { code: 'relay_too_large' });
    }
    return { kind: 'data', ch: signal.ch, ...(typeof signal.d === 'string' ? { d: signal.d } : {}), ...(signal.b ? { b: 1 } : {}) };
  }
  if (signal.kind === 'description') {
    const description = signal.description;
    if (!isRecord(description) || !['offer', 'answer'].includes(String(description.type)) ||
        typeof description.sdp !== 'string' || description.sdp.length > 96_000) {
      throw new Error('invalid RTC description');
    }
    return signal;
  }
  if (signal.kind === 'ice') {
    const candidate = signal.candidate;
    if (!isRecord(candidate) || typeof candidate.candidate !== 'string' ||
        candidate.candidate.length > 8_000) {
      throw new Error('invalid ICE candidate');
    }
    return signal;
  }
  throw new Error('unknown RTC signal');
}

function originAllowed(origin: unknown, allowedOrigins: readonly string[] | null): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

export function createSignalingServer({
  host = '127.0.0.1',
  port = 7777,
  allowedOrigins = null,
  webSocketPaths = ['/signal'],
  healthPaths = ['/healthz'],
  store = new SignalingRoomStore(),
}: SignalingServerOptions = {}): SignalingServerService {
  const allowedWebSocketPaths = new Set(webSocketPaths);
  const allowedHealthPaths = new Set(healthPaths);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const rate = new WeakMap<WebSocket, RateWindow>();
  const relayRate = new WeakMap<WebSocket, RateWindow>();
  const roomRelay = new Map<string, RateWindow & { chars: number }>();
  const windowed = <T extends RateWindow>(w: T, now: number, reset: (w: T) => void): T => {
    if (now - w.start >= RATE_WINDOW_MS) { w.start = now; w.count = 0; reset(w); }
    return w;
  };
  const server = http.createServer(async (request, response) => {
    let pathname = '';
    try { pathname = new URL(String(request.url || ''), 'http://localhost').pathname; }
    catch (_) { /* 404 below */ }
    if (allowedHealthPaths.has(pathname)) {
      const health: SignalingHealth = {
        ok: true,
        rooms: store.rooms instanceof Map ? store.rooms.size : null,
      };
      if (typeof store.deliver === 'function') health.distributed = true;
      if (typeof store.health === 'function') {
        try {
          const result = await store.health();
          health.redis = isRecord(result) ? result : { ok: false, code: 'redis_invalid_health' };
          health.ok = health.redis.ok === true;
        } catch (error: unknown) {
          health.ok = false;
          health.redis = {
            ok: false,
            code: errorCode(error, 'redis_unavailable'),
          };
        }
      }
      response.writeHead(health.ok ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  async function sendNotifications(notifications: StoreNotification[] | null | undefined): Promise<void> {
    for (const notification of notifications || []) {
      if (typeof store.deliver === 'function') await store.deliver(notification);
      else safeSend(notification.connection, notification.message);
    }
  }
  if (typeof store.setDeliveryHandler === 'function') {
    store.setDeliveryHandler((connection, message) => safeSend(connection, message));
  }

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(String(request.url || ''), 'http://localhost').pathname; }
    catch (_) { /* reject below */ }
    if (!allowedWebSocketPaths.has(pathname) || !originAllowed(request.headers.origin, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (connection: WebSocket) => {
      webSocketServer.emit('connection', connection, request);
    });
  });

  webSocketServer.on('connection', (connection: WebSocket) => {
    rate.set(connection, { start: Date.now(), count: 0 });
    relayRate.set(connection, { start: Date.now(), count: 0 });
    let messageChain: Promise<void> = Promise.resolve();
    connection.on('message', (data: RawData, isBinary: boolean) => {
      const limit = rate.get(connection);
      const relayLimit = relayRate.get(connection);
      if (!limit || !relayLimit) return;
      const now = Date.now();
      // Relay data rides its own bucket; anything claiming the data shape is
      // re-checked after parsing and rejected if it is not a relay signal.
      const relayData = !isBinary && data.toString().includes('"kind":"data"');
      const bucket = windowed(relayData ? relayLimit : limit, now, () => {});
      bucket.count++;
      if (relayData ? bucket.count > RELAY_CONNECTION_CLOSE_MESSAGES : bucket.count > RATE_MAX_MESSAGES) {
        connection.close(1008, 'rate_limit');
        return;
      }
      // Over budget, drop state snapshots ('s') but never the reliable control
      // channel ('c': welcome, ready, events), which is never re-sent.
      if (relayData && bucket.count > RELAY_CONNECTION_MAX_MESSAGES &&
          !data.toString().includes('"ch":"c"')) return; // drop
      messageChain = messageChain.then(async () => {
        if (isBinary) {
          safeSend(connection, errorMessage(Object.assign(new Error('binary signaling is unsupported'), {
            code: 'invalid_payload',
          })));
          return;
        }
        let message: SignalingEnvelope | null = null;
        try {
          const parsed: unknown = JSON.parse(data.toString());
          if (!isRecord(parsed) || typeof parsed.type !== 'string') {
            throw new Error('invalid message');
          }
          message = parsed as SignalingEnvelope;
          const requestId = message.requestId == null ? null : String(message.requestId);
          const payload = isRecord(message.payload) ? message.payload : {};
          switch (message.type) {
            case 'room_create': {
              const result = await store.create(connection, payload);
              safeSend(connection, { type: 'room_created', requestId, payload: result });
              break;
            }
            case 'room_join': {
              const joined = await store.join(connection, payload);
              safeSend(connection, { type: 'room_joined', requestId, payload: joined.result });
              await sendNotifications(joined.notify);
              break;
            }
            case 'room_signal': {
              const signal = validateSignal(payload.signal);
              if (relayData !== (signal.kind === 'data')) {
                throw Object.assign(new Error('invalid relay signal'), { code: 'invalid_payload' });
              }
              if (signal.kind === 'data') {
                const code = String(payload.roomCode || '');
                let room = roomRelay.get(code);
                if (!room) roomRelay.set(code, room = { start: now, count: 0, chars: 0 });
                windowed(room, now, (w) => { w.chars = 0; });
                room.count++;
                room.chars += typeof signal.d === 'string' ? signal.d.length : 0;
                if (signal.ch !== 'c' &&
                    (room.count > RELAY_ROOM_MAX_MESSAGES || room.chars > RELAY_ROOM_MAX_CHARS)) break; // drop
              }
              const notification = await store.relay(connection, {
                roomCode: payload.roomCode,
                toPeerId: payload.toPeerId,
                toSessionId: payload.toSessionId,
                signal,
              });
              await sendNotifications([notification]);
              break;
            }
            case 'room_poll':
              if (typeof store.poll === 'function') {
                await sendNotifications(await store.poll(connection));
              }
              // Browser WebSockets do not expose protocol ping/pong. Correlate
              // the durable-mailbox poll so the client can detect a silently
              // blackholed socket instead of waiting for an RTC rebuild to
              // discover that signaling disappeared minutes earlier.
              if (requestId) {
                safeSend(connection, {
                  type: 'room_polled',
                  requestId,
                  payload: { roomCode: String(payload.roomCode || '') },
                });
              }
              break;
            case 'room_leave':
              await sendNotifications(await store.leave(connection, 'client_leave'));
              break;
            default:
              if (relayData) throw Object.assign(new Error('invalid relay signal'), { code: 'invalid_payload' });
              throw Object.assign(new Error('unknown signaling message'), { code: 'unknown_message' });
          }
        } catch (error: unknown) {
          safeSend(connection, errorMessage(error, message?.requestId));
        }
      }).catch((error) => {
        safeSend(connection, errorMessage(Object.assign(new Error('signaling operation failed'), {
          code: 'signaling_store_unavailable', cause: error,
        })));
      });
    });
    connection.on('close', () => {
      messageChain.then(async () => {
        // A WebSocket is only the rendezvous transport. Mobile radio changes,
        // sleeping tabs, serverless recycling, and temporary Redis outages
        // must not destroy a healthy peer-to-peer room. Explicit room_leave
        // still performs the durable departure; an unclean socket close only
        // detaches this process-local connection so the stable player id can
        // resume the same membership on a replacement socket.
        if (typeof store.detach === 'function') await store.detach(connection, 'connection_closed');
        else await sendNotifications(await store.leave(connection, 'connection_closed'));
      }).catch((error) => console.error('[signal] Failed to close room membership', error));
    });
  });

  const sweepTimer: ReturnType<typeof setInterval> = setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [code, w] of roomRelay) if (w.start < cutoff) roomRelay.delete(code);
    Promise.resolve(store.sweepExpired()).then(sendNotifications)
      .catch((error) => console.error('[signal] Room sweep failed', error));
  }, 60_000);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  return {
    server,
    webSocketServer,
    store,
    async listen(): Promise<AddressInfo> {
      if (server.listening) {
        const listeningAddress = server.address();
        if (listeningAddress && typeof listeningAddress !== 'string') return listeningAddress;
        throw new Error('signaling server has no TCP address');
      }
      // A distributed store can serve durable REST-backed signaling while its
      // optional pub/sub accelerator reconnects in the background.
      if (typeof store.start === 'function') store.start().catch((error) => {
        console.warn('[signal] Redis subscriber unavailable; using mailbox polling', error?.code || error);
      });
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off('listening', onListen);
          reject(error);
        };
        const onListen = (): void => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListen);
        server.listen(port, host);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('signaling server did not bind a TCP address');
      }
      return address;
    },
    async close(): Promise<void> {
      clearInterval(sweepTimer);
      for (const connection of webSocketServer.clients) connection.close(1001, 'server_shutdown');
      await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (typeof store.close === 'function') await store.close();
    },
  };
}

function cliOptions(argv: string[]): SignalingServerOptions {
  const options: SignalingServerOptions & { host: string; port: number } = {
    host: process.env.COT_SIGNAL_HOST || '127.0.0.1',
    port: Number(process.env.COT_SIGNAL_PORT || 7777),
    allowedOrigins: process.env.COT_ALLOWED_ORIGINS
      ? process.env.COT_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
      : null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--host') options.host = argv[++i] || options.host;
    else if (argv[i] === '--port') options.port = Number(argv[++i]);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const signaling = createSignalingServer(cliOptions(process.argv.slice(2)));
  signaling.listen().then((address) => {
    const shownHost = address.address === '::' ? '0.0.0.0' : address.address;
    console.log(`Tank Royale signaling ready at ws://${shownHost}:${address.port}/signal`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
