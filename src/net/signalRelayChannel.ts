// Fallback transport when WebRTC cannot connect (carrier NAT, no TURN): the
// two match channels are tunneled through the signal-server WebSocket both
// peers already hold, as RTC signals of kind 'data'. Each channel quacks like
// an RTCDataChannel, so createWebRTCSplitTransport (and all game code) is
// unchanged. The server rate- and size-caps these per room.

export type RelayChannelId = 'c' | 's';
// h = hello (switch to relay), x = closed; c/s carry one channel message.
export type RelayDataSignal = { kind: 'data'; ch: RelayChannelId | 'h' | 'x'; d?: string; b?: 1 };

type Listener = (event: { data?: unknown; error?: unknown }) => void;

export const RELAY_MAX_DATA_CHARS = 60_000; // signalingClient caps a frame at ~64K chars; server rejects larger

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(s);
}

function fromBase64(text: string): ArrayBuffer {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

export interface RelayChannel {
  readonly label: string;
  readyState: 'open' | 'closed';
  readonly bufferedAmount: number;
  readonly ordered: boolean;
  readonly maxRetransmits: number | null;
  readonly maxPacketLifeTime: null;
  binaryType: string;
  send(value: unknown): void;
  close(): void;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  deliver(signal: RelayDataSignal): void;
  remoteClosed(): void;
}

export function createRelayChannel(
  ch: RelayChannelId,
  sendSignal: (signal: RelayDataSignal) => void,
  // The signal WebSocket's real send backlog: channelTransport skips state
  // snapshots on a busy link only when this is non-zero.
  bufferedAmount: () => number = () => 0,
): RelayChannel {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (type: string, event: { data?: unknown; error?: unknown }) => {
    for (const listener of [...(listeners.get(type) || [])]) listener(event);
  };
  const channel: RelayChannel = {
    label: ch === 'c' ? 'relay-control' : 'relay-state',
    readyState: 'open',
    get bufferedAmount() { return Number(bufferedAmount()) || 0; },
    // control = ordered + reliable (WebSocket is both); state = "unordered,
    // zero retransmits" contract, which an ordered reliable pipe satisfies.
    ordered: ch === 'c',
    maxRetransmits: ch === 'c' ? null : 0,
    maxPacketLifeTime: null,
    binaryType: 'arraybuffer',
    send(value: unknown) {
      if (channel.readyState !== 'open') throw new Error('relay channel is closed');
      let signal: RelayDataSignal;
      if (typeof value === 'string') signal = { kind: 'data', ch, d: value };
      else if (value instanceof ArrayBuffer) signal = { kind: 'data', ch, d: toBase64(new Uint8Array(value)), b: 1 };
      else if (ArrayBuffer.isView(value)) {
        signal = { kind: 'data', ch, d: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)), b: 1 };
      } else throw new TypeError('relay channel sends strings or bytes');
      if (signal.d!.length > RELAY_MAX_DATA_CHARS) throw new RangeError('relay message too large');
      sendSignal(signal);
    },
    close() {
      if (channel.readyState === 'closed') return;
      channel.readyState = 'closed';
      emit('close', {});
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    deliver(signal) {
      if (channel.readyState !== 'open' || typeof signal.d !== 'string') return;
      emit('message', { data: signal.b ? fromBase64(signal.d) : signal.d });
    },
    remoteClosed() { channel.close(); },
  };
  return channel;
}
