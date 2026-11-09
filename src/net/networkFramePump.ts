import type { NetworkRecoveryOwner } from './connectionRecovery.ts';

export interface NetworkSnapshot {
  tick: number;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NetworkInputFrame {
  actionBits?: number;
  [key: string]: unknown;
}

export interface NetworkClientLike {
  closed: boolean;
  connected: boolean;
  lastSubmittedInputSeq: number | null;
  onConnection?(listener: (connected: boolean) => void): (() => void) | void;
  drainEventsThrough?(tick: number, target: unknown[]): void;
  getStats?(): Record<string, unknown> | null;
  readonly snapshotPacketsReceived?: number;
}

export interface NetworkMatchLike {
  role: string;
  client: NetworkClientLike;
  advance(dtMs: number, input: NetworkInputFrame | null): NetworkSnapshot | null;
  update(nowMs: number): NetworkSnapshot | null;
  submitInput(input: NetworkInputFrame): boolean;
}

export interface NetworkBridgeLike {
  apply(snapshot: NetworkSnapshot, dt: number, events?: unknown[]): void;
  recordInput(input: NetworkInputFrame, elapsedS: number, sequence: number | null): void;
  endDisconnected?(): void;
  getPredictionStats?(): Record<string, unknown> | null;
}

export interface NetworkStatusLike {
  readonly diagnosticsVisible?: boolean;
  set?(status: unknown): void;
  dispose?(): void;
  update(stats: Record<string, unknown> | null): void;
  /** Seconds since the host's last snapshot (0 = flowing again). */
  hostSilent?(seconds: number): void;
}

export interface NetworkInputRuntimeLike {
  frame(player: unknown): NetworkInputFrame | null;
  advance(dt: number): void;
  shouldSend(input: NetworkInputFrame): boolean;
  commit(input: NetworkInputFrame): number;
  acknowledge(actionBits: number): void;
  restore(actionBits: number): void;
  resetCadence(): void;
  reset(): void;
  queueAction(action: string): void;
  queueConsumable(slot: number): void;
}

interface NetworkFramePumpOptions {
  getMatch: () => NetworkMatchLike | null;
  getBridge: () => NetworkBridgeLike | null;
  getStatus: () => NetworkStatusLike | null;
  getPlayer: () => unknown;
  isBattleActive: () => boolean;
  shouldPresentDisconnect?: () => boolean;
  recovery: NetworkRecoveryOwner;
  nextFrame: () => Promise<unknown>;
  now?: () => number;
  onHostError?: (error: unknown) => void;
}

export interface NetworkFramePump {
  ensureInputRuntime(create: () => NetworkInputRuntimeLike): NetworkInputRuntimeLike;
  queueAction(action: string): void;
  queueConsumable(slot: number): void;
  pump(dt: number, nowMs: number): void;
  diagnostics(): Record<string, unknown> | null;
  waitForSnapshot(
    predicate: (snapshot: NetworkSnapshot) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<NetworkSnapshot>;
  clearRound(): void;
  dispose(): void;
  readonly latestSnapshot: NetworkSnapshot | null;
}

/**
 * D8: a host whose app goes to the background stops sending snapshots and
 * every guest freezes with no word why. Returns whole seconds of silence once
 * past `afterMs` (0 = snapshots flowing), from the guest's snapshot counter.
 */
export function createHostSilenceWatch(afterMs = 3000) {
  let count = -1;
  let at = 0;
  return (nowMs: number, received: number): number => {
    if (received !== count) { count = received; at = nowMs; return 0; }
    return received > 0 && nowMs - at > afterMs ? Math.floor((nowMs - at) / 1000) : 0;
  };
}

/** Own the complete per-frame browser match path and its reusable buffers. */
export function createNetworkFramePump({
  getMatch,
  getBridge,
  getStatus,
  getPlayer,
  isBattleActive,
  shouldPresentDisconnect = isBattleActive,
  recovery,
  nextFrame,
  now = () => performance.now(),
  onHostError = (error) => console.error('[network] host pump failed', error),
}: NetworkFramePumpOptions): NetworkFramePump {
  if ([getMatch, getBridge, getStatus, getPlayer, isBattleActive,
    shouldPresentDisconnect, nextFrame, now]
    .some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network frame pump requires runtime accessors');
  }

  let inputRuntime: NetworkInputRuntimeLike | null = null;
  let latestSnapshot: NetworkSnapshot | null = null;
  const hostSilence = createHostSilenceWatch();
  let shownSilentS = 0;
  const pendingEvents: unknown[] = [];

  const acceptSnapshot = (snapshot: NetworkSnapshot | null, dt: number) => {
    if (!snapshot) return;
    latestSnapshot = snapshot;
    const bridge = getBridge();
    if (!bridge) return;
    pendingEvents.length = 0;
    getMatch()?.client?.drainEventsThrough?.(snapshot.tick, pendingEvents);
    bridge.apply(snapshot, dt, pendingEvents);
  };

  const diagnostics = () => {
    const stats = getMatch()?.client?.getStats?.() || null;
    if (!stats) return null;
    return { ...stats, prediction: getBridge()?.getPredictionStats?.() || null };
  };

  return {
    ensureInputRuntime(create) {
      if (!inputRuntime) inputRuntime = create();
      inputRuntime.reset();
      return inputRuntime;
    },

    queueAction(action) { inputRuntime?.queueAction(action); },
    queueConsumable(slot) { inputRuntime?.queueConsumable(slot); },

    pump(dt, nowMs) {
      const match = getMatch();
      if (!match) return;
      if (match.client?.closed) {
        if (recovery.update(nowMs, true, shouldPresentDisconnect())) {
          getBridge()?.endDisconnected?.();
        }
        return;
      }

      const playerInput = isBattleActive() ? inputRuntime?.frame(getPlayer()) || null : null;
      const bridge = getBridge();
      if (match.role === 'host') {
        const submittedActionBits = playerInput?.actionBits || 0;
        if (submittedActionBits) inputRuntime?.acknowledge(submittedActionBits);
        try {
          const snapshot = match.advance(dt * 1000, playerInput);
          if (playerInput && match.client?.lastSubmittedInputSeq != null) {
            bridge?.recordInput(playerInput, dt, match.client.lastSubmittedInputSeq);
          }
          acceptSnapshot(snapshot, dt);
        } catch (error) {
          inputRuntime?.restore(submittedActionBits);
          onHostError(error);
        }
      } else {
        inputRuntime?.advance(dt);
        if (playerInput && match.client.connected && inputRuntime?.shouldSend(playerInput)) {
          if (match.submitInput(playerInput)) {
            const predictionElapsedS = inputRuntime.commit(playerInput);
            bridge?.recordInput(
              playerInput,
              predictionElapsedS,
              match.client.lastSubmittedInputSeq,
            );
          }
        } else if (!playerInput) {
          inputRuntime?.resetCadence();
        }
        acceptSnapshot(match.update(nowMs), dt);
        const received = match.client.snapshotPacketsReceived;
        if (typeof received === 'number') {
          const silentS = match.client.connected ? hostSilence(nowMs, received) : 0;
          if (silentS !== shownSilentS) { shownSilentS = silentS; getStatus()?.hostSilent?.(silentS); }
        }
      }

      const status = getStatus();
      if (status?.diagnosticsVisible) status.update(diagnostics());
    },

    diagnostics,

    async waitForSnapshot(predicate, timeoutMs, label) {
      if (typeof predicate !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
        throw new TypeError('snapshot wait requires a predicate and timeout');
      }
      const deadline = now() + timeoutMs;
      while (!latestSnapshot || !predicate(latestSnapshot)) {
        const match = getMatch();
        if (!match) {
          throw new Error('The match connection closed while loading.');
        }
        if (now() >= deadline) throw new Error(label);
        // A closed transport generation is recoverable: private-room and
        // dedicated clients retain the same MatchClientRuntime while their
        // session replaces the underlying RTC/WebSocket channel. Keep the
        // covered loading barrier alive until the match owner disappears,
        // authority arrives, or the existing bounded timeout expires.
        await nextFrame();
      }
      return latestSnapshot;
    },

    clearRound() {
      latestSnapshot = null;
      pendingEvents.length = 0;
    },

    dispose() {
      inputRuntime?.reset();
      latestSnapshot = null;
      pendingEvents.length = 0;
    },

    get latestSnapshot() { return latestSnapshot; },
  };
}
