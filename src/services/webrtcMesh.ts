import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseRuntime } from './firebase';
import { LocalMeshBus, type MeshSyncMessage } from './meshTransport';

export interface WebRTCTransportStatus {
  mode: 'WEBRTC_P2P' | 'SIGNALING' | 'FALLBACK';
  peerId: string;
  connectedPeers: number;
  packetsSentViaRtc: number;
  packetsRecvViaRtc: number;
  signalingBackend: 'BROADCAST_CHANNEL' | 'FIRESTORE_AND_BC' | 'NONE';
}

type SignalMessage =
  | {
      id: string;
      roomId: string;
      from: string;
      to?: string;
      kind: 'HELLO' | 'HELLO_ACK';
      ts: number;
    }
  | {
      id: string;
      roomId: string;
      from: string;
      to: string;
      kind: 'OFFER' | 'ANSWER';
      sdp: RTCSessionDescriptionInit;
      ts: number;
    }
  | {
      id: string;
      roomId: string;
      from: string;
      to: string;
      kind: 'ICE';
      candidate: RTCIceCandidateInit;
      ts: number;
    };

interface WireEnvelope {
  packetId: string;
  payload: MeshSyncMessage;
}

const SIGNAL_CHANNEL_NAME = 'zerobar-rtc-signal-v1';
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Real WebRTC P2P DataChannel transport for ZeroBar.
 * - Uses BroadcastChannel for instant local/offline multi-tab signaling (host ICE works offline!)
 * - Optionally mirrors signaling over Firestore (`rooms/{roomId}/rtcSignals`) for cross-device pairing
 * - Exchanges compact <400B Triage Beacons & Directives over real `RTCDataChannel`
 * - Gracefully falls back to `LocalMeshBus` if WebRTC is unavailable or no peer channel is open yet
 */
export class WebRTCMeshTransport {
  private readonly peerId: string;
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly channels = new Map<string, RTCDataChannel>();
  private readonly pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private readonly seenSignalIds = new Set<string>();
  private readonly seenPacketIds = new Set<string>();
  private readonly fallbackBus: LocalMeshBus;
  private signalChannel: BroadcastChannel | null = null;
  private unsubFirestoreSignal: (() => void) | null = null;
  private packetsSentViaRtc = 0;
  private packetsRecvViaRtc = 0;
  private closed = false;
  private rtcSupported: boolean;
  private signalingBackend: WebRTCTransportStatus['signalingBackend'] = 'NONE';

  constructor(
    private readonly roomId: string,
    private readonly onMessage: (msg: MeshSyncMessage) => void,
    private readonly onStatusChange?: (status: WebRTCTransportStatus) => void
  ) {
    this.peerId = `ZB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    this.rtcSupported = typeof RTCPeerConnection !== 'undefined';

    // Always keep LocalMeshBus ready as graceful fallback
    this.fallbackBus = new LocalMeshBus((msg) => {
      if (msg.roomId !== this.roomId) return;
      const sig = this.deriveMessageFingerprint(msg);
      if (this.seenPacketIds.has(sig)) return;
      this.rememberPacketId(sig);
      this.onMessage(msg);
    });

    if (this.rtcSupported) {
      this.initSignaling();
    }

    this.emitStatus();
  }

  private initSignaling() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.signalChannel = new BroadcastChannel(SIGNAL_CHANNEL_NAME);
      this.signalChannel.onmessage = (event: MessageEvent<SignalMessage>) => {
        if (event.data) {
          void this.handleSignal(event.data);
        }
      };
      this.signalingBackend = 'BROADCAST_CHANNEL';
    }

    // Optional Firestore signaling for cross-device WebRTC negotiation
    const { db } = getFirebaseRuntime();
    if (db) {
      try {
        const startedAt = Date.now() - 2000;
        const q = query(
          collection(db, 'rooms', this.roomId, 'rtcSignals'),
          orderBy('ts', 'desc'),
          limit(24)
        );
        this.unsubFirestoreSignal = onSnapshot(
          q,
          (snap) => {
            snap.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const sig = change.doc.data() as SignalMessage;
                if (sig && sig.ts >= startedAt) {
                  void this.handleSignal(sig);
                }
              }
            });
          },
          () => {
            // Silently ignore if offline or Firestore rules disallow signaling subcollection
          }
        );
        this.signalingBackend =
          this.signalingBackend === 'BROADCAST_CHANNEL'
            ? 'FIRESTORE_AND_BC'
            : 'BROADCAST_CHANNEL';
      } catch {
        // Stay on BroadcastChannel signaling
      }
    }

    // Announce presence to any paired tab/device in the same room
    this.sendSignal({
      id: `sig-${this.peerId}-${Date.now()}`,
      roomId: this.roomId,
      from: this.peerId,
      kind: 'HELLO',
      ts: Date.now(),
    });
  }

  private sendSignal(sig: SignalMessage) {
    if (this.closed) return;
    this.seenSignalIds.add(sig.id);

    try {
      this.signalChannel?.postMessage(sig);
    } catch {
      // Ignore if channel closed
    }

    const { db } = getFirebaseRuntime();
    if (db) {
      setDoc(doc(db, 'rooms', this.roomId, 'rtcSignals', sig.id), sig).catch(
        () => {}
      );
    }
  }

  private async handleSignal(sig: SignalMessage) {
    if (this.closed || !this.rtcSupported) return;
    if (sig.roomId !== this.roomId || sig.from === this.peerId) return;
    if (sig.to && sig.to !== this.peerId) return;
    if (this.seenSignalIds.has(sig.id)) return;
    this.seenSignalIds.add(sig.id);

    try {
      if (sig.kind === 'HELLO') {
        this.sendSignal({
          id: `sig-${this.peerId}-ack-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          roomId: this.roomId,
          from: this.peerId,
          to: sig.from,
          kind: 'HELLO_ACK',
          ts: Date.now(),
        });
        if (this.peerId > sig.from) {
          await this.initiatePeerConnection(sig.from);
        }
      } else if (sig.kind === 'HELLO_ACK') {
        if (this.peerId > sig.from && !this.peers.has(sig.from)) {
          await this.initiatePeerConnection(sig.from);
        }
      } else if (sig.kind === 'OFFER') {
        const pc = this.ensurePeerConnection(sig.from);
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        await this.flushPendingIce(sig.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal({
          id: `sig-${this.peerId}-ans-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          roomId: this.roomId,
          from: this.peerId,
          to: sig.from,
          kind: 'ANSWER',
          sdp: { type: answer.type, sdp: answer.sdp },
          ts: Date.now(),
        });
      } else if (sig.kind === 'ANSWER') {
        const pc = this.peers.get(sig.from);
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
          await this.flushPendingIce(sig.from, pc);
        }
      } else if (sig.kind === 'ICE') {
        const pc = this.peers.get(sig.from);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
        } else {
          const queue = this.pendingIce.get(sig.from) || [];
          queue.push(sig.candidate);
          this.pendingIce.set(sig.from, queue);
        }
      }
    } catch {
      // Graceful resilience on race/disconnect; LocalMeshBus remains active as fallback
    }
  }

  private async flushPendingIce(remoteId: string, pc: RTCPeerConnection) {
    const queue = this.pendingIce.get(remoteId);
    if (!queue?.length) return;
    this.pendingIce.delete(remoteId);
    for (const cand of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        // Ignore stale candidate
      }
    }
  }

  private ensurePeerConnection(remoteId: string): RTCPeerConnection {
    const existing = this.peers.get(remoteId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(remoteId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          id: `sig-${this.peerId}-ice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          roomId: this.roomId,
          from: this.peerId,
          to: remoteId,
          kind: 'ICE',
          candidate: event.candidate.toJSON(),
          ts: Date.now(),
        });
      }
    };

    pc.ondatachannel = (event) => {
      this.bindDataChannel(remoteId, event.channel);
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed' ||
        pc.connectionState === 'disconnected'
      ) {
        this.cleanupPeer(remoteId);
      }
      this.emitStatus();
    };

    return pc;
  }

  private async initiatePeerConnection(remoteId: string) {
    if (this.peers.has(remoteId)) return;
    const pc = this.ensurePeerConnection(remoteId);
    const dc = pc.createDataChannel('zerobar-p2p-mesh', { ordered: true });
    this.bindDataChannel(remoteId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal({
      id: `sig-${this.peerId}-off-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      roomId: this.roomId,
      from: this.peerId,
      to: remoteId,
      kind: 'OFFER',
      sdp: { type: offer.type, sdp: offer.sdp },
      ts: Date.now(),
    });
  }

  private bindDataChannel(remoteId: string, dc: RTCDataChannel) {
    this.channels.set(remoteId, dc);

    dc.onopen = () => {
      this.emitStatus();
    };

    dc.onclose = () => {
      this.channels.delete(remoteId);
      this.emitStatus();
    };

    dc.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as WireEnvelope;
        if (!envelope?.payload || envelope.payload.roomId !== this.roomId) return;
        const fp = this.deriveMessageFingerprint(envelope.payload);
        if (this.seenPacketIds.has(envelope.packetId) || this.seenPacketIds.has(fp)) {
          return;
        }
        this.rememberPacketId(envelope.packetId);
        this.rememberPacketId(fp);
        this.packetsRecvViaRtc += 1;
        this.emitStatus();
        this.onMessage(envelope.payload);
      } catch {
        // Ignore malformed frame
      }
    };
  }

  private cleanupPeer(remoteId: string) {
    const dc = this.channels.get(remoteId);
    if (dc) {
      try {
        dc.close();
      } catch {
        // ignore
      }
      this.channels.delete(remoteId);
    }
    const pc = this.peers.get(remoteId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // ignore
      }
      this.peers.delete(remoteId);
    }
    this.pendingIce.delete(remoteId);
  }

  private deriveMessageFingerprint(msg: MeshSyncMessage): string {
    if (msg.type === 'BEACON_CREATED') return `B:${msg.beacon.id}`;
    if (msg.type === 'BRIEF_UPDATED') return `BR:${msg.brief.id}`;
    return `P:${msg.nodeId}:${msg.callsign}`;
  }

  private rememberPacketId(id: string) {
    this.seenPacketIds.add(id);
    if (this.seenPacketIds.size > 200) {
      const first = this.seenPacketIds.values().next().value;
      if (first) this.seenPacketIds.delete(first);
    }
  }

  private getOpenChannelCount(): number {
    let count = 0;
    for (const dc of this.channels.values()) {
      if (dc.readyState === 'open') count++;
    }
    return count;
  }

  private emitStatus() {
    if (!this.onStatusChange) return;
    const connectedPeers = this.getOpenChannelCount();
    const mode: WebRTCTransportStatus['mode'] = !this.rtcSupported
      ? 'FALLBACK'
      : connectedPeers > 0
      ? 'WEBRTC_P2P'
      : 'SIGNALING';

    this.onStatusChange({
      mode,
      peerId: this.peerId,
      connectedPeers,
      packetsSentViaRtc: this.packetsSentViaRtc,
      packetsRecvViaRtc: this.packetsRecvViaRtc,
      signalingBackend: this.signalingBackend,
    });
  }

  publish(msg: MeshSyncMessage) {
    const packetId = `pkt-${this.peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const fp = this.deriveMessageFingerprint(msg);
    this.rememberPacketId(packetId);
    this.rememberPacketId(fp);

    const envelope: WireEnvelope = { packetId, payload: msg };
    const serialized = JSON.stringify(envelope);

    let sentOverRtc = 0;
    for (const dc of this.channels.values()) {
      if (dc.readyState === 'open') {
        try {
          dc.send(serialized);
          sentOverRtc++;
        } catch {
          // Will fall back below if none succeeded
        }
      }
    }

    if (sentOverRtc > 0) {
      this.packetsSentViaRtc += sentOverRtc;
      this.emitStatus();
    } else {
      // Graceful fallback to LocalMeshBus when no RTCDataChannel is open
      this.fallbackBus.publish(msg);
    }
  }

  close() {
    this.closed = true;
    for (const remoteId of Array.from(this.peers.keys())) {
      this.cleanupPeer(remoteId);
    }
    this.signalChannel?.close();
    this.unsubFirestoreSignal?.();
    this.fallbackBus.close();
  }
}
