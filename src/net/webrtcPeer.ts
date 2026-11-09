import {
  createWebRTCSplitTransport,
  type ChannelTransport,
} from './channelTransport.ts';
import { createRelayChannel, type RelayChannel, type RelayDataSignal } from './signalRelayChannel.ts';

export type RtcSignal =
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'description'; description: RTCSessionDescriptionInit }
  | { kind: 'restart' }
  | RelayDataSignal;

export type MatchTransport = ChannelTransport;

export interface WebRtcPeerSession {
  readonly role: 'host' | 'client';
  readonly peerConnection: RTCPeerConnection;
  readonly transportReady: Promise<MatchTransport>;
  readonly connectionState: RTCPeerConnectionState;
  readonly recoveryAttempts: number;
  /** true once match traffic runs through the signal-server relay */
  readonly relayed: boolean;
  start(): Promise<void>;
  handleSignal(signal: RtcSignal): Promise<void>;
  close(reason?: string): void;
  restartIce(): void;
}

export interface WebRtcPeerOptions {
  role: 'host' | 'client';
  onSignal: (signal: RtcSignal) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  iceServers?: RTCIceServer[];
  relayOnly?: boolean;
  RTCPeerConnectionImpl?: typeof RTCPeerConnection | null;
  transportOptions?: Record<string, unknown>;
  recoveryDelaysMs?: number[];
  disconnectGraceMs?: number;
  initialRecoveryDelayMs?: number;
  connectTimeoutMs?: number;
  /**
   * Fall back to tunneling the match channels through signaling (onSignal /
   * handleSignal 'data' signals) when WebRTC fails, times out, or has not
   * connected within relayAfterMs.
   */
  signalRelay?: boolean;
  /** send backlog of the signaling socket the relay rides on */
  relayBufferedAmount?: () => number;
  relayAfterMs?: number;
  /** extra wait when ICE is already connected as the relay timer fires (D3) */
  relayGraceMs?: number;
}

export const MATCH_CONTROL_CHANNEL_LABEL = 'cot-match-v1';
export const MATCH_STATE_CHANNEL_LABEL = 'cot-state-v1';
// Kept as an import-compatible alias for existing tooling and tests.
export const MATCH_CHANNEL_LABEL = MATCH_CONTROL_CHANNEL_LABEL;

function rtcConstructor(injected: typeof RTCPeerConnection | null | undefined) {
  const Ctor = injected || globalThis.RTCPeerConnection;
  if (typeof Ctor !== 'function') {
    throw new Error('RTCPeerConnection is unavailable in this browser');
  }
  return Ctor;
}

function validateIceConfig(iceServers: RTCIceServer[], relayOnly: boolean) {
  if (!Array.isArray(iceServers)) throw new TypeError('iceServers must be an array');
  if (relayOnly) {
    const hasTurn = iceServers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
    });
    if (!hasTurn) throw new Error('relay-only WebRTC requires a TURN server');
  }
}

function signalCandidate(candidate: RTCIceCandidate): RTCIceCandidateInit {
  return candidate && typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate;
}

function signalDescription(
  description: RTCSessionDescription | RTCSessionDescriptionInit | null,
): RTCSessionDescriptionInit {
  if (!description) throw new Error('local RTC description is unavailable');
  return typeof (description as RTCSessionDescription).toJSON === 'function'
    ? (description as RTCSessionDescription).toJSON()
    : { type: description.type, sdp: description.sdp };
}

/**
 * Create one WebRTC peer. Signaling is injected and may be backed by a LAN
 * rendezvous server, production WebSocket service, or manual debug exchange.
 */
export function createWebRTCPeer({
  role,
  onSignal,
  onConnectionStateChange = () => {},
  iceServers = [],
  relayOnly = false,
  RTCPeerConnectionImpl = null,
  transportOptions = {},
  recoveryDelaysMs = [0, 3_000, 7_000, 15_000, 30_000],
  disconnectGraceMs = 4_000,
  initialRecoveryDelayMs = 15_000,
  connectTimeoutMs = 60_000,
  signalRelay = false,
  relayBufferedAmount = () => 0,
  relayAfterMs = 15_000,
  relayGraceMs = 3_000,
}: WebRtcPeerOptions): WebRtcPeerSession {
  if (role !== 'host' && role !== 'client') throw new TypeError('role must be host or client');
  if (typeof onSignal !== 'function') throw new TypeError('onSignal callback is required');
  if (typeof onConnectionStateChange !== 'function') {
    throw new TypeError('onConnectionStateChange must be a function');
  }
  validateIceConfig(iceServers, relayOnly);
  if (!Array.isArray(recoveryDelaysMs) || recoveryDelaysMs.length === 0 ||
      recoveryDelaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new TypeError('RTC recovery delays must be a non-empty array of milliseconds');
  }
  if (!Number.isFinite(initialRecoveryDelayMs) || initialRecoveryDelayMs < 0 ||
      !Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
    throw new TypeError('RTC recovery and connection timeouts must be valid milliseconds');
  }
  const Ctor = rtcConstructor(RTCPeerConnectionImpl);
  const peerConnection = new Ctor({
    iceServers,
    iceTransportPolicy: relayOnly ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
    iceCandidatePoolSize: 4,
  });
  const pendingCandidates: RTCIceCandidateInit[] = [];
  const channels = new Map<string, RTCDataChannel>();
  let remoteDescriptionSet = false;
  let closed = false;
  let transport: MatchTransport | null = null;
  let settleTransport!: (transport: MatchTransport) => void;
  let rejectTransport!: (error: Error) => void;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryAttempts = 0;
  let negotiationChain: Promise<unknown> = Promise.resolve();
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let relayTimer: ReturnType<typeof setTimeout> | null = null;
  let relayChannels: Record<'c' | 's', RelayChannel> | null = null;
  let relayRemoteClosed = false;
  const transportReady = new Promise<MatchTransport>((resolve, reject) => {
    settleTransport = resolve;
    rejectTransport = reject;
  });

  // Switch to the signaling relay. Called once per session, before any RTC
  // transport exists; tells the remote peer so both sides use the relay.
  function activateRelay() {
    if (!signalRelay || transport || closed || relayChannels) return false;
    const send = (signal: RelayDataSignal) => onSignal(signal);
    relayChannels = { c: createRelayChannel('c', send, relayBufferedAmount), s: createRelayChannel('s', send, relayBufferedAmount) };
    for (const channel of channels.values()) channel.close();
    channels.clear();
    clearRecovery();
    if (connectTimer) clearTimeout(connectTimer);
    if (relayTimer) clearTimeout(relayTimer);
    connectTimer = relayTimer = null;
    peerConnection.onicecandidate = null;
    peerConnection.ondatachannel = null;
    peerConnection.onconnectionstatechange = null;
    try { peerConnection.close(); } catch { /* already closed */ }
    onSignal({ kind: 'data', ch: 'h' });
    transport = createWebRTCSplitTransport(relayChannels.c, relayChannels.s, transportOptions);
    transport.onClose(() => {
      if (!relayRemoteClosed) onSignal({ kind: 'data', ch: 'x' });
    });
    onConnectionStateChange('connected');
    settleTransport(transport);
    return true;
  }

  function settleIfReady() {
    if (transport || closed) return;
    const control = channels.get(MATCH_CONTROL_CHANNEL_LABEL);
    const state = channels.get(MATCH_STATE_CHANNEL_LABEL);
    if (!control || !state || control.readyState !== 'open' || state.readyState !== 'open') return;
    transport = createWebRTCSplitTransport(control, state, transportOptions);
    if (connectTimer) clearTimeout(connectTimer);
    if (relayTimer) clearTimeout(relayTimer);
    connectTimer = relayTimer = null;
    clearRecovery();
    settleTransport(transport);
  }

  function attachChannel(channel: RTCDataChannel) {
    if (closed) {
      if (channel && typeof channel.close === 'function') channel.close();
      return;
    }
    if (channel.label !== MATCH_CONTROL_CHANNEL_LABEL && channel.label !== MATCH_STATE_CHANNEL_LABEL) {
      channel.close();
      rejectTransport(new Error(`unexpected data channel: ${channel.label}`));
      return;
    }
    const existing = channels.get(channel.label);
    if (existing && existing !== channel) existing.close();
    if (channel.label === MATCH_STATE_CHANNEL_LABEL) channel.binaryType = 'arraybuffer';
    channels.set(channel.label, channel);
    if (channel.readyState === 'open') settleIfReady();
    else channel.addEventListener('open', settleIfReady, { once: true });
  }

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || closed) return;
    onSignal({ kind: 'ice', candidate: signalCandidate(event.candidate) });
  };
  function clearRecovery() {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  function queueNegotiation(task: () => Promise<void>): Promise<void> {
    const pending = negotiationChain.then(task);
    negotiationChain = pending.catch(() => {});
    return pending;
  }

  function sameDescription(
    left: RTCSessionDescription | RTCSessionDescriptionInit | null,
    right: RTCSessionDescriptionInit,
  ) {
    return !!left && left.type === right.type && left.sdp === right.sdp;
  }

  function scheduleRecovery(initialDelay: number | null = null) {
    if (closed || recoveryTimer || peerConnection.connectionState === 'connected') return;
    const delay = initialDelay == null
      ? recoveryDelaysMs[Math.min(recoveryAttempts, recoveryDelaysMs.length - 1)]
      : initialDelay;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (closed || peerConnection.connectionState === 'connected') return;
      recoveryAttempts++;
      const local = peerConnection.localDescription;
      const remote = peerConnection.remoteDescription;
      // Slow first-time browsers can receive the offer or answer after the
      // watchdog fires. Replay the exact pending description once instead of
      // replacing it with a glare-prone ICE-restart offer. Signaling delivery
      // is durable and duplicate descriptions are handled idempotently below.
      if (recoveryAttempts === 1 && local?.type === 'offer' && !remote) {
        onSignal({ kind: 'description', description: signalDescription(local) });
      } else if (recoveryAttempts === 1 && local?.type === 'answer' && remote) {
        onSignal({ kind: 'description', description: signalDescription(local) });
      } else if (role === 'host') {
        queueNegotiation(async () => {
          if (typeof peerConnection.restartIce === 'function') peerConnection.restartIce();
          const offer = await peerConnection.createOffer({ iceRestart: true });
          await peerConnection.setLocalDescription(offer);
          onSignal({
            kind: 'description',
            description: signalDescription(peerConnection.localDescription),
          });
        }).catch(() => {});
      } else {
        // The host remains the offerer, avoiding glare while still letting a
        // client whose ICE agent noticed the failure first request recovery.
        onSignal({ kind: 'restart' });
      }
      scheduleRecovery();
    }, delay);
    if (typeof recoveryTimer.unref === 'function') recoveryTimer.unref();
  }

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    onConnectionStateChange(state);
    if (state === 'connected') {
      clearRecovery();
      recoveryAttempts = 0;
    } else if (state === 'disconnected') {
      scheduleRecovery(disconnectGraceMs);
    } else if (state === 'failed') {
      if (!transport && activateRelay()) return;
      clearRecovery();
      scheduleRecovery(0);
    } else if (state === 'closed') session.close('rtc_closed');
  };
  if (role === 'client') {
    peerConnection.ondatachannel = (event) => attachChannel(event.channel);
  }

  async function drainCandidates() {
    while (pendingCandidates.length) {
      await peerConnection.addIceCandidate(pendingCandidates.shift());
    }
  }

  function start(): Promise<void> {
    return queueNegotiation(async () => {
      if (role !== 'host') return;
      const controlChannel = peerConnection.createDataChannel(MATCH_CONTROL_CHANNEL_LABEL, {
        ordered: true,
      });
      const stateChannel = peerConnection.createDataChannel(MATCH_STATE_CHANNEL_LABEL, {
        ordered: false,
        maxRetransmits: 0,
      });
      attachChannel(controlChannel);
      attachChannel(stateChannel);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      onSignal({
        kind: 'description',
        description: signalDescription(peerConnection.localDescription),
      });
      scheduleRecovery(initialRecoveryDelayMs);
    });
  }

  function handleSignal(signal: RtcSignal): Promise<void> {
    if (signal && typeof signal === 'object' && signal.kind === 'data') {
      // Relay traffic never waits behind SDP negotiation.
      if (closed) return Promise.resolve();
      if (!relayChannels && !activateRelay() && transport) {
        console.warn('[rtc] relay data arrived on a direct-link session (D3 split paths)');
      }
      if (relayChannels) {
        if (signal.ch === 'c' || signal.ch === 's') relayChannels[signal.ch].deliver(signal);
        else if (signal.ch === 'x') {
          relayRemoteClosed = true;
          relayChannels.c.remoteClosed();
          relayChannels.s.remoteClosed();
        }
      }
      return Promise.resolve();
    }
    return queueNegotiation(async () => {
      if (closed) return;
      if (!signal || typeof signal !== 'object') throw new TypeError('invalid RTC signal');
      if ((signal as { kind: string }).kind === 'data') return; // handled before the negotiation queue
      if (signal.kind === 'restart') {
        if (role !== 'host') throw new Error('only the host accepts RTC restart requests');
        clearRecovery();
        scheduleRecovery(0);
        return;
      }
      if (signal.kind === 'ice') {
        if (!signal.candidate) return;
        if (remoteDescriptionSet) await peerConnection.addIceCandidate(signal.candidate);
        else pendingCandidates.push(signal.candidate);
        return;
      }
      if (signal.kind !== 'description' || !signal.description) {
        throw new TypeError('unknown RTC signal');
      }
      const description = signal.description;
      if (role === 'host' && description.type !== 'answer') {
        throw new Error('host expected an answer');
      }
      if (role === 'client' && description.type !== 'offer') {
        throw new Error('client expected an offer');
      }
      if (sameDescription(peerConnection.remoteDescription, description)) {
        // A durable-mailbox replay is an acknowledgement opportunity, not a
        // second negotiation. Clients resend the already-created answer so a
        // dropped answer cannot strand a fresh host behind the loading UI.
        if (role === 'client' && peerConnection.localDescription?.type === 'answer') {
          onSignal({
            kind: 'description',
            description: signalDescription(peerConnection.localDescription),
          });
        }
        return;
      }
      await peerConnection.setRemoteDescription(description);
      remoteDescriptionSet = true;
      await drainCandidates();
      if (role === 'client') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        onSignal({
          kind: 'description',
          description: signalDescription(peerConnection.localDescription),
        });
        scheduleRecovery(initialRecoveryDelayMs);
      }
    });
  }

  const session: WebRtcPeerSession = {
    role,
    peerConnection,
    transportReady,
    start,
    handleSignal,
    close(reason = 'rtc_closed') {
      if (closed) return;
      closed = true;
      clearRecovery();
      if (connectTimer) clearTimeout(connectTimer);
      if (relayTimer) clearTimeout(relayTimer);
      connectTimer = relayTimer = null;
      pendingCandidates.length = 0;
      if (transport) transport.close(reason);
      else {
        for (const channel of channels.values()) channel.close();
        rejectTransport(new Error(reason));
      }
      channels.clear();
      peerConnection.onicecandidate = null;
      peerConnection.ondatachannel = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    },
    restartIce() {
      if (relayChannels) return;
      clearRecovery();
      scheduleRecovery(0);
    },
    get connectionState() { return relayChannels ? 'connected' : peerConnection.connectionState; },
    get relayed() { return !!relayChannels; },
    get recoveryAttempts() { return recoveryAttempts; },
  };
  if (signalRelay) {
    // D3: if ICE already connected, the direct channel is seconds from open;
    // the remote side may open it first and stay direct while this side would
    // switch to the relay (split paths, both frozen). Wait once more first.
    let graceUsed = false;
    const onRelayTimer = () => {
      relayTimer = null;
      const ice = peerConnection.iceConnectionState;
      if (!graceUsed && (ice === 'connected' || ice === 'completed')) {
        graceUsed = true;
        relayTimer = setTimeout(onRelayTimer, relayGraceMs);
        if (typeof relayTimer.unref === 'function') relayTimer.unref();
        return;
      }
      activateRelay();
    };
    relayTimer = setTimeout(onRelayTimer, relayAfterMs);
    if (typeof relayTimer.unref === 'function') relayTimer.unref();
  }
  connectTimer = setTimeout(() => {
    if (closed || transport) return;
    if (activateRelay()) return;
    const seconds = Math.max(1, Math.ceil(connectTimeoutMs / 1_000));
    const error = Object.assign(new Error(`WebRTC could not connect within ${seconds} seconds.`), {
      code: 'rtc_connect_timeout',
    });
    rejectTransport(error);
    session.close('rtc_connect_timeout');
  }, connectTimeoutMs);
  return session;
}
