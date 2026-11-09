// D3: ICE connected when the relay timer fires = the direct link is about to
// open; switching now can split the two phones onto different paths.
import assert from 'node:assert/strict';
import { createWebRTCPeer } from './webrtcPeer.ts';

class IceUpRTC {
  constructor() { this.connectionState = 'connecting'; this.iceConnectionState = 'connected'; }
  createDataChannel(label) { return { label, readyState: 'connecting', addEventListener() {}, close() {}, send() {} }; }
  async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {}
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const peer = createWebRTCPeer({
  role: 'host', onSignal() {}, RTCPeerConnectionImpl: IceUpRTC, signalRelay: true,
  relayAfterMs: 40, relayGraceMs: 300, connectTimeoutMs: 5000, initialRecoveryDelayMs: 60_000,
});
peer.transportReady.catch(() => {});
await wait(150);
assert.equal(peer.relayed, false, 'ICE connected at the relay timer: wait for the direct link');
await wait(300);
assert.equal(peer.relayed, true, 'direct link never opened: relay after the grace');
peer.close();
console.log('relayGrace.selftest: relay waits once when ICE is already connected');
