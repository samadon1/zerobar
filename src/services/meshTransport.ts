import type { CloudIncidentBrief, TriageBeacon } from '../types/mesh';

export type MeshSyncMessage =
  | { type: 'BEACON_CREATED'; roomId: string; beacon: TriageBeacon }
  | { type: 'BRIEF_UPDATED'; roomId: string; brief: CloudIncidentBrief }
  | { type: 'PING_MOBILE_JOIN'; roomId: string; callsign: string; nodeId: string };

const CHANNEL_NAME = 'zerobar-mesh-v1';

/**
 * Local zero-latency BroadcastChannel bus for multi-tab / same-device testing,
 * paired with Firestore real-time sync in firebase.ts for cross-device mobile QR pairing.
 */
export class LocalMeshBus {
  private channel: BroadcastChannel | null = null;

  constructor(private onMessage: (msg: MeshSyncMessage) => void) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<MeshSyncMessage>) => {
        if (event.data) {
          this.onMessage(event.data);
        }
      };
    }
  }

  publish(msg: MeshSyncMessage) {
    try {
      this.channel?.postMessage(msg);
    } catch {
      // Ignore if channel closed
    }
  }

  close() {
    this.channel?.close();
  }
}
