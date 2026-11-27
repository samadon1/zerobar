import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  RotateCcw,
  Plus,
  X,
  Send,
  Camera,
  QrCode,
  Layers,
  Smartphone,
  Map as MapIcon,
  LayoutGrid,
  Sparkles,
  AlertTriangle,
  HeartPulse,
  Flame,
  Route,
  Lock,
  CheckCircle2,
  Activity,
  ArrowRight,
  Bell,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  INITIAL_MESH_NODES,
  CRISIS_PRESETS,
  distanceBetween,
  xyToLngLat,
} from './data/presets';
import type {
  CloudIncidentBrief,
  MeshNode,
  PacketFlight,
  TelemetryRecord,
  TriageBeacon,
} from './types/mesh';
import {
  detectDeviceCapabilities,
  processCitizenDistress,
  runCloudSwarmCommander,
  type DeviceCapabilityStatus,
} from './services/hybridEngine';
import {
  saveBriefToFirestore,
  subscribeToRoomBeacons,
  syncBeaconToFirestore,
} from './services/firebase';
import {
  WebRTCMeshTransport,
  type WebRTCTransportStatus,
} from './services/webrtcMesh';
import { SwarmMapCanvas, UPLINK_ZONE_X } from './components/SwarmMapCanvas';
import { InferenceBadge, TelemetryStrip } from './components/TelemetryStrip';
import { MobileFieldView } from './components/MobileFieldView';
import { ArchitectureModal } from './components/ArchitectureModal';
import { SurgeBenchmarksModal } from './components/SurgeBenchmarksModal';
import {
  estimateDataUrlBytes,
  generateSampleHazardReconDataUrl,
} from './utils/crisisPhotoSample';
import {
  GuidedTourBar,
  STORY_TOUR_CHAPTERS,
  type TourStepIndex,
} from './components/GuidedTourBar';

type QueueTab = 'all' | 'vault' | 'telemetry';

const PRESET_SHORT_LABELS: Record<string, string> = {
  'preset-insulin': 'Insulin + Gas',
  'preset-bridge-1': 'Bridge North',
  'preset-bridge-2': 'Clinic O2',
};

function getRoomIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'CASCADIA-01';
}

function getInitialMobileMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'mobile';
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeBeaconRiskScore(b: TriageBeacon): number {
  let score =
    b.payload.sev === 'CRITICAL'
      ? 84
      : b.payload.sev === 'HIGH'
      ? 72
      : b.payload.sev === 'MODERATE'
      ? 58
      : 42;
  if (b.payload.med.includes('INSULIN_URGENT')) score += 7;
  if (b.payload.haz.includes('GAS_LEAK')) score += 5;
  if (b.payload.med.includes('TRAUMA_BLEEDING')) score += 5;
  if (b.payload.med.includes('OXYGEN_DEPLETION')) score += 4;
  if (b.payload.ppl >= 4) score += 2;
  return Math.min(98, score);
}

function formatBeaconHeadline(b: TriageBeacon): {
  title: string;
  subtitle: string;
} {
  const cleanSector = b.payload.loc
    .replace(/^Sector\s*\d+\s*[\u2014-]\s*/i, '')
    .replace(/\u2014/g, '·')
    .replace(/\bSt\s+Overpass\b/i, 'Overpass')
    .replace(/\bBridge\s+(?:North|South)\b/i, 'Bridge')
    .trim();
  const shortCall = b.originCallsign.replace(/^CITIZEN-/i, '');

  const tags: string[] = [];
  if (b.payload.med.includes('INSULIN_URGENT')) {
    tags.push(b.payload.haz.includes('GAS_LEAK') ? 'Insulin' : 'Insulin urgent');
  }
  if (b.payload.haz.includes('GAS_LEAK')) tags.push('Gas leak');
  if (b.payload.med.includes('TRAUMA_BLEEDING')) tags.push('Bridge trauma');
  if (b.payload.med.includes('OXYGEN_DEPLETION')) tags.push('O2 reserve low');
  if (tags.length === 0 && b.payload.haz.includes('ROUTE_BLOCKED')) {
    tags.push('Corridor blocked');
  }

  const tagSummary =
    tags.length > 0
      ? tags.slice(0, 2).join(' + ')
      : b.payload.sum.replace(/\u2014/g, '·').slice(0, 28);

  return {
    title: `${shortCall} · ${cleanSector || b.payload.loc.replace(/\u2014/g, '·')}`,
    subtitle: `${tagSummary} · ${b.beaconBytes}B`,
  };
}

/**
 * Visually strikes through PII tokens in the Local-Only Raw Input panel
 * so judges immediately see what ONLY_ON_DEVICE scrubbed before broadcast.
 */
function renderRedactedPiiText(raw: string): React.ReactNode[] {
  const piiRegex =
    /(\b\d{3}-\d{2}-\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|Med(?:ical)?\s*ID\s*#?\s*[\w-]+|\b\d{2,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd)\b|(?:my name is|soy|nurse|husband)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = piiRegex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(raw.slice(lastIndex, match.index));
    }
    const token = match[0];
    const prefixMatch = token.match(/^(my name is|soy|nurse|husband)\s+(.+)$/i);
    if (prefixMatch) {
      nodes.push(`${prefixMatch[1]} `);
      nodes.push(
        <span
          key={`${match.index}-${token}`}
          className="line-through decoration-[#E85D4A] text-[#F5A396] bg-[#E85D4A]/15 px-1 rounded"
        >
          {prefixMatch[2]}
        </span>
      );
    } else {
      nodes.push(
        <span
          key={`${match.index}-${token}`}
          className="line-through decoration-[#E85D4A] text-[#F5A396] bg-[#E85D4A]/15 px-1 rounded"
        >
          {token}
        </span>
      );
    }
    lastIndex = piiRegex.lastIndex;
  }

  if (lastIndex < raw.length) {
    nodes.push(raw.slice(lastIndex));
  }

  return nodes;
}

export default function App() {
  const [roomId] = useState<string>(getRoomIdFromUrl);
  const [mobileMode, setMobileMode] = useState<boolean>(getInitialMobileMode);
  const [queueTab, setQueueTab] = useState<QueueTab>('all');
  const [showComposer, setShowComposer] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showArchModal, setShowArchModal] = useState(false);
  const [showBenchmarksModal, setShowBenchmarksModal] = useState(false);
  const [swRegistered, setSwRegistered] = useState(false);

  const [rtcStatus, setRtcStatus] = useState<WebRTCTransportStatus>({
    mode: 'SIGNALING',
    peerId: '',
    connectedPeers: 0,
    packetsSentViaRtc: 0,
    packetsRecvViaRtc: 0,
    signalingBackend: 'NONE',
  });

  const [capabilities, setCapabilities] =
    useState<DeviceCapabilityStatus | null>(null);
  const [nodes, setNodes] = useState<MeshNode[]>(INITIAL_MESH_NODES);
  const [beacons, setBeacons] = useState<TriageBeacon[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
  const [flights, setFlights] = useState<PacketFlight[]>([]);
  const [brief, setBrief] = useState<CloudIncidentBrief | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-alpha');
  const [distressInput, setDistressInput] = useState<string>(
    CRISIS_PRESETS[0].rawText
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>();

  const [isProcessingEdge, setIsProcessingEdge] = useState(false);
  const [isRunningCloud, setIsRunningCloud] = useState(false);
  const [isSimulatingQuake, setIsSimulatingQuake] = useState(false);
  const [isPatrolling, setIsPatrolling] = useState(false);

  const [tourStep, setTourStep] = useState<TourStepIndex | null>(null);
  const [tourChapterStartedAt, setTourChapterStartedAt] = useState<number>(0);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState<boolean>(false);

  const busRef = useRef<WebRTCMeshTransport | null>(null);
  const patrolRafRef = useRef<number | null>(null);
  const tourTimeoutRef = useRef<number | null>(null);
  const tourRunIdRef = useRef<number>(0);
  const seedCancelRef = useRef<boolean>(false);
  const hasSeededRef = useRef<boolean>(false);
  const nodesRef = useRef<MeshNode[]>(nodes);
  nodesRef.current = nodes;
  const beaconsRef = useRef<TriageBeacon[]>(beacons);
  beaconsRef.current = beacons;
  const briefRef = useRef<CloudIncidentBrief | null>(brief);
  briefRef.current = brief;

  // Detect Chrome Gemini Nano + Firebase App Check capabilities & Service Worker status
  useEffect(() => {
    detectDeviceCapabilities().then(setCapabilities);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) =>
          setSwRegistered(Boolean(reg || navigator.serviceWorker.controller))
        )
        .catch(() => setSwRegistered(false));
    }
  }, []);

  // Cancel any active rAF glide, tour timer, or speech on unmount
  useEffect(() => {
    return () => {
      if (patrolRafRef.current !== null) {
        cancelAnimationFrame(patrolRafRef.current);
      }
      if (tourTimeoutRef.current !== null) {
        window.clearTimeout(tourTimeoutRef.current);
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Pre-seed initial Cascadia 7.2 Quake scenario cleanly on first load so the HUD is alive immediately
  useEffect(() => {
    if (hasSeededRef.current) return;
    hasSeededRef.current = true;
    seedCancelRef.current = false;

    const seedInitialState = async () => {
      try {
        const seededBeacons: TriageBeacon[] = [];
        const seededTelemetry: TelemetryRecord[] = [];

        for (const preset of CRISIS_PRESETS) {
          if (seedCancelRef.current) return;
          const originNode =
            INITIAL_MESH_NODES.find((n) => n.id === preset.nodeId) ||
            INITIAL_MESH_NODES[0];
          const { beacon, telemetryEvents } = await processCitizenDistress(
            originNode,
            preset.rawText
          );
          const syncedBeacon: TriageBeacon = {
            ...beacon,
            syncedToCloud: true,
            syncedAt: Date.now(),
            hops: [originNode.id, 'node-relay', 'node-cmd'],
          };
          seededBeacons.push(syncedBeacon);
          seededTelemetry.push(...telemetryEvents);
        }

        if (seedCancelRef.current) return;
        const generatedBrief = await runCloudSwarmCommander(seededBeacons);
        if (seedCancelRef.current) return;

        const allBeaconIds = seededBeacons.map((b) => b.id);
        setBeacons(seededBeacons);
        setTelemetry([generatedBrief.telemetry, ...seededTelemetry.reverse()]);
        setBrief(generatedBrief);
        setNodes(
          INITIAL_MESH_NODES.map((n) => {
            const ownBeacons = seededBeacons
              .filter((b) => b.originNodeId === n.id)
              .map((b) => b.id);
            const held =
              n.role === 'RELAY_MULE' || n.role === 'COMMAND_GATEWAY'
                ? allBeaconIds
                : ownBeacons;
            const deliveredDirs = generatedBrief.directives
              .filter((d) => d.targetNodeId === n.id)
              .map((d) => ({ ...d, deliveredViaRelay: true }));
            return {
              ...n,
              beaconsHeld: held,
              directivesReceived: deliveredDirs,
            };
          })
        );
      } catch {
        // Non-fatal if user interrupts seed
      }
    };

    void seedInitialState();
  }, []);

  // Real WebRTC P2P DataChannel + BroadcastChannel/Firestore signaling + fallback sync
  useEffect(() => {
    const bus = new WebRTCMeshTransport(
      roomId,
      (msg) => {
        if (msg.roomId !== roomId) return;
        if (msg.type === 'BEACON_CREATED') {
          setBeacons((prev) =>
            prev.some((b) => b.id === msg.beacon.id)
              ? prev
              : [msg.beacon, ...prev]
          );
          setNodes((prev) =>
            prev.map((n) =>
              n.id === msg.beacon.originNodeId &&
              !n.beaconsHeld.includes(msg.beacon.id)
                ? { ...n, beaconsHeld: [...n.beaconsHeld, msg.beacon.id] }
                : n
            )
          );
        } else if (msg.type === 'BRIEF_UPDATED') {
          setBrief(msg.brief);
        }
      },
      setRtcStatus
    );
    busRef.current = bus;

    const unsubFirestore = subscribeToRoomBeacons(roomId, (remoteBeacons) => {
      if (remoteBeacons.length === 0) return;
      setBeacons((prev) => {
        const merged = [...prev];
        for (const rb of remoteBeacons) {
          if (!merged.some((x) => x.id === rb.id)) {
            merged.push(rb);
          }
        }
        return merged;
      });
    });

    return () => {
      bus.close();
      unsubFirestore();
    };
  }, [roomId]);

  // Clear expired packet flight animations
  useEffect(() => {
    if (flights.length === 0) return;
    const t = window.setTimeout(() => {
      const now = Date.now();
      setFlights((prev) => prev.filter((f) => now - f.createdAt < 1400));
    }, 600);
    return () => window.clearTimeout(t);
  }, [flights]);

  // P2P Gossip & Opportunistic Cloud Uplink Engine
  useEffect(() => {
    if (beacons.length === 0) return;

    let changed = false;
    const nextNodes = nodes.map((n) => ({
      ...n,
      beaconsHeld: [...n.beaconsHeld],
      directivesReceived: [...n.directivesReceived],
    }));
    const newlySyncedBeaconIds = new Set<string>();
    const newFlights: PacketFlight[] = [];

    for (let i = 0; i < nextNodes.length; i++) {
      for (let j = i + 1; j < nextNodes.length; j++) {
        const a = nextNodes[i];
        const b = nextNodes[j];
        const dist = distanceBetween(a, b);
        if (dist > Math.max(a.radioRange, b.radioRange)) continue;

        for (const bid of a.beaconsHeld) {
          if (!b.beaconsHeld.includes(bid)) {
            b.beaconsHeld.push(bid);
            changed = true;
            newFlights.push({
              id: `fl-${Date.now()}-${Math.random()}`,
              fromNodeId: a.id,
              toNodeId: b.id,
              beaconId: bid,
              kind: b.online ? 'UPLINK' : 'GOSSIP',
              createdAt: Date.now(),
            });
            if (b.online) newlySyncedBeaconIds.add(bid);
          }
        }
        for (const bid of b.beaconsHeld) {
          if (!a.beaconsHeld.includes(bid)) {
            a.beaconsHeld.push(bid);
            changed = true;
            newFlights.push({
              id: `fl-${Date.now()}-${Math.random()}`,
              fromNodeId: b.id,
              toNodeId: a.id,
              beaconId: bid,
              kind: a.online ? 'UPLINK' : 'GOSSIP',
              createdAt: Date.now(),
            });
            if (a.online) newlySyncedBeaconIds.add(bid);
          }
        }

        if (brief) {
          for (const dir of brief.directives) {
            if (
              (a.online || a.role === 'RELAY_MULE') &&
              b.id === dir.targetNodeId &&
              !b.directivesReceived.some((d) => d.id === dir.id)
            ) {
              b.directivesReceived.push({ ...dir, deliveredViaRelay: true });
              changed = true;
              newFlights.push({
                id: `fl-dir-${Date.now()}-${Math.random()}`,
                fromNodeId: a.id,
                toNodeId: b.id,
                beaconId: dir.id,
                kind: 'DIRECTIVE',
                createdAt: Date.now(),
              });
            }
            if (
              (b.online || b.role === 'RELAY_MULE') &&
              a.id === dir.targetNodeId &&
              !a.directivesReceived.some((d) => d.id === dir.id)
            ) {
              a.directivesReceived.push({ ...dir, deliveredViaRelay: true });
              changed = true;
              newFlights.push({
                id: `fl-dir-${Date.now()}-${Math.random()}`,
                fromNodeId: b.id,
                toNodeId: a.id,
                beaconId: dir.id,
                kind: 'DIRECTIVE',
                createdAt: Date.now(),
              });
            }
          }
        }
      }
    }

    for (const n of nextNodes) {
      if (n.online) {
        for (const bid of n.beaconsHeld) {
          const existing = beacons.find((b) => b.id === bid);
          if (existing && !existing.syncedToCloud) {
            newlySyncedBeaconIds.add(bid);
          }
        }
      }
    }

    if (changed) {
      setNodes(nextNodes);
    }
    if (newFlights.length > 0) {
      setFlights((prev) => [...prev.slice(-12), ...newFlights]);
    }
    if (newlySyncedBeaconIds.size > 0) {
      setBeacons((prev) =>
        prev.map((b) => {
          if (!newlySyncedBeaconIds.has(b.id)) return b;
          const updated = {
            ...b,
            syncedToCloud: true,
            syncedAt: Date.now(),
            hops: b.hops.includes('node-cmd')
              ? b.hops
              : [...b.hops, 'node-relay', 'node-cmd'],
          };
          syncBeaconToFirestore(roomId, updated).catch(() => {});
          return updated;
        })
      );
    }
  }, [nodes, beacons, brief, roomId]);

  const syncedBeacons = useMemo(
    () => beacons.filter((b) => b.syncedToCloud),
    [beacons]
  );

  const sortedBeacons = useMemo(
    () =>
      [...beacons].sort(
        (a, b) => computeBeaconRiskScore(b) - computeBeaconRiskScore(a)
      ),
    [beacons]
  );

  const avgBeaconBytes = useMemo(() => {
    if (beacons.length === 0) return 291;
    return Math.round(
      beacons.reduce((sum, b) => sum + b.beaconBytes, 0) / beacons.length
    );
  }, [beacons]);

  const totalPiiScrubbed = useMemo(
    () => beacons.reduce((sum, b) => sum + b.piiRedactedTypes.length, 0),
    [beacons]
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || nodes[0],
    [nodes, selectedNodeId]
  );

  const citizenNodes = useMemo(
    () => nodes.filter((n) => n.role === 'CITIZEN_OFFLINE'),
    [nodes]
  );

  const deliveredDirectivesCount = useMemo(() => {
    if (!brief) return 0;
    return brief.directives.filter((d) =>
      nodes
        .find((n) => n.id === d.targetNodeId)
        ?.directivesReceived.some((x) => x.id === d.id)
    ).length;
  }, [brief, nodes]);

  const corridorStage = useMemo<'blackout' | 'uplink' | 'downlink'>(() => {
    if (brief && deliveredDirectivesCount > 0) return 'downlink';
    if (syncedBeacons.length > 0) return 'uplink';
    return 'blackout';
  }, [brief, deliveredDirectivesCount, syncedBeacons.length]);

  const handleMoveNode = useCallback((nodeId: string, x: number, y: number) => {
    const [lng, lat] = xyToLngLat(x, y);
    setNodes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== nodeId) return n;
        const isOnlineNow =
          n.role === 'COMMAND_GATEWAY' ? true : x >= UPLINK_ZONE_X;
        return { ...n, x, y, lng, lat, online: isOnlineNow };
      });
      nodesRef.current = next;
      return next;
    });
  }, []);

  const stopRelayGlide = useCallback(() => {
    if (patrolRafRef.current !== null) {
      cancelAnimationFrame(patrolRafRef.current);
      patrolRafRef.current = null;
    }
  }, []);

  const glideNodeAlongWaypoints = useCallback(
    (
      nodeId: string,
      waypoints: Array<{ x: number; y: number }>,
      segmentDurationMs = 900
    ): Promise<void> => {
      stopRelayGlide();

      const startNode = nodesRef.current.find((n) => n.id === nodeId);
      if (!startNode || waypoints.length === 0) return Promise.resolve();

      const path = [{ x: startNode.x, y: startNode.y }, ...waypoints];

      return new Promise((resolve) => {
        let segmentIdx = 0;
        let segmentStart = performance.now();

        const tick = (now: number) => {
          const from = path[segmentIdx];
          const to = path[segmentIdx + 1];
          if (!from || !to) {
            patrolRafRef.current = null;
            resolve();
            return;
          }

          const rawT = Math.min(1, (now - segmentStart) / segmentDurationMs);
          const eased = easeInOutCubic(rawT);
          const x = from.x + (to.x - from.x) * eased;
          const y = from.y + (to.y - from.y) * eased;
          handleMoveNode(nodeId, x, y);

          if (rawT >= 1) {
            segmentIdx += 1;
            segmentStart = now;
            if (segmentIdx >= path.length - 1) {
              patrolRafRef.current = null;
              resolve();
              return;
            }
          }

          patrolRafRef.current = requestAnimationFrame(tick);
        };

        patrolRafRef.current = requestAnimationFrame(tick);
      });
    },
    [handleMoveNode, stopRelayGlide]
  );

  // Compute dynamic patrol waypoints from INITIAL_MESH_NODES so relay visits every sector cleanly
  const buildCorridorWaypoints = useCallback(() => {
    const alpha = INITIAL_MESH_NODES.find((n) => n.id === 'node-alpha') || {
      x: 24,
      y: 34,
    };
    const bravo = INITIAL_MESH_NODES.find((n) => n.id === 'node-bravo') || {
      x: 34,
      y: 58,
    };
    const charlie = INITIAL_MESH_NODES.find((n) => n.id === 'node-charlie') || {
      x: 52,
      y: 42,
    };
    const cmd = INITIAL_MESH_NODES.find((n) => n.id === 'node-cmd') || {
      x: 84,
      y: 30,
    };
    const relayHome = INITIAL_MESH_NODES.find((n) => n.id === 'node-relay') || {
      x: 62,
      y: 48,
    };

    const blackoutHub = {
      x: Math.round((alpha.x + bravo.x) / 2),
      y: Math.round((alpha.y + bravo.y) / 2),
    };
    const bridgeMid = {
      x: charlie.x,
      y: charlie.y,
    };
    const ridgeUplink = {
      x: Math.max(UPLINK_ZONE_X + 6, cmd.x - 4),
      y: cmd.y + 4,
    };

    return { blackoutHub, bridgeMid, ridgeUplink, alpha, bravo, relayHome };
  }, []);

  const handleEmitBeacon = async (
    targetNodeId: string,
    rawText: string,
    attachedPhoto?: string
  ) => {
    const node = nodes.find((n) => n.id === targetNodeId);
    if (!node || !rawText.trim()) return;
    setIsProcessingEdge(true);
    try {
      const { beacon, telemetryEvents } = await processCitizenDistress(
        node,
        rawText.trim(),
        attachedPhoto
      );
      setBeacons((prev) => [beacon, ...prev]);
      setTelemetry((prev) => [...telemetryEvents.reverse(), ...prev]);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? { ...n, beaconsHeld: [...n.beaconsHeld, beacon.id] }
            : n
        )
      );
      setShowComposer(false);
      setQueueTab('vault');
      busRef.current?.publish({
        type: 'BEACON_CREATED',
        roomId,
        beacon,
      });
    } finally {
      setIsProcessingEdge(false);
    }
  };

  const handleRunCloudCommander = async (overrideBeacons?: TriageBeacon[]) => {
    const target = overrideBeacons || syncedBeacons;
    if (target.length === 0 || isRunningCloud) return;
    setIsRunningCloud(true);
    try {
      const generated = await runCloudSwarmCommander(target);
      setBrief(generated);
      setTelemetry((prev) => [generated.telemetry, ...prev]);
      saveBriefToFirestore(roomId, generated).catch(() => {});
      busRef.current?.publish({
        type: 'BRIEF_UPDATED',
        roomId,
        brief: generated,
      });
    } finally {
      setIsRunningCloud(false);
    }
  };

  const activeReconBeacon = useMemo(
    () =>
      beacons.find(
        (b) =>
          Boolean(b.photoDataUrl) &&
          (b.originNodeId === 'node-charlie' ||
            b.originCallsign === 'CITIZEN-CHARLIE')
      ) || beacons.find((b) => Boolean(b.photoDataUrl)),
    [beacons]
  );

  const handleTriggerCloudReconVision = async () => {
    if (isRunningCloud) return;
    const reconUrl = generateSampleHazardReconDataUrl();
    if (!reconUrl) return;

    let currentList = beaconsRef.current;

    if (currentList.length === 0) {
      const charlieNode =
        nodesRef.current.find((n) => n.id === 'node-charlie') ||
        INITIAL_MESH_NODES.find((n) => n.id === 'node-charlie') ||
        INITIAL_MESH_NODES[0];
      const bridgePreset =
        CRISIS_PRESETS.find((p) => p.nodeId === 'node-charlie') ||
        CRISIS_PRESETS[0];
      const { beacon, telemetryEvents } = await processCitizenDistress(
        charlieNode,
        bridgePreset.rawText,
        reconUrl
      );
      const syncedCharlie: TriageBeacon = {
        ...beacon,
        photoDataUrl: reconUrl,
        syncedToCloud: true,
        syncedAt: Date.now(),
        hops: ['node-charlie', 'node-relay', 'node-cmd'],
      };
      beaconsRef.current = [syncedCharlie];
      setBeacons([syncedCharlie]);
      setTelemetry((prev) => [...telemetryEvents.reverse(), ...prev]);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === charlieNode.id ||
          n.role === 'RELAY_MULE' ||
          n.role === 'COMMAND_GATEWAY'
            ? {
                ...n,
                beaconsHeld: Array.from(
                  new Set([...n.beaconsHeld, syncedCharlie.id])
                ),
              }
            : n
        )
      );
      setSelectedNodeId('node-charlie');
      syncBeaconToFirestore(roomId, syncedCharlie).catch(() => {});
      await handleRunCloudCommander([syncedCharlie]);
      return;
    }

    const charlieCandidate =
      currentList.find(
        (b) =>
          b.originNodeId === 'node-charlie' ||
          b.originCallsign === 'CITIZEN-CHARLIE'
      ) || currentList[0];

    const updatedList = currentList.map((b) => {
      if (b.id !== charlieCandidate.id) return b;
      const updatedBeacon: TriageBeacon = {
        ...b,
        photoDataUrl: b.photoDataUrl || reconUrl,
        syncedToCloud: true,
        syncedAt: b.syncedAt || Date.now(),
        hops: b.hops.includes('node-cmd')
          ? b.hops
          : [...b.hops, 'node-relay', 'node-cmd'],
      };
      syncBeaconToFirestore(roomId, updatedBeacon).catch(() => {});
      return updatedBeacon;
    });

    beaconsRef.current = updatedList;
    setBeacons(updatedList);
    setSelectedNodeId(charlieCandidate.originNodeId);

    const fusionTargets = updatedList.filter((b) => b.syncedToCloud);
    await handleRunCloudCommander(
      fusionTargets.length > 0 ? fusionTargets : updatedList
    );
  };

  const endStoryTour = useCallback(
    (options?: { keepMobileMode?: boolean }) => {
      tourRunIdRef.current += 1;
      if (tourTimeoutRef.current !== null) {
        window.clearTimeout(tourTimeoutRef.current);
        tourTimeoutRef.current = null;
      }
      stopRelayGlide();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setTourStep(null);
      if (!options?.keepMobileMode) {
        setMobileMode(false);
      }
    },
    [stopRelayGlide]
  );

  const ensureBlackoutBeaconsForTour = useCallback(
    async (runId: number): Promise<TriageBeacon[] | null> => {
      if (beaconsRef.current.length >= 3) {
        return beaconsRef.current.map((b) => ({
          ...b,
          syncedToCloud: false,
          syncedAt: undefined,
          hops: [b.originNodeId],
        }));
      }

      const freshBeacons: TriageBeacon[] = [];
      const freshTelemetry: TelemetryRecord[] = [];

      for (const preset of CRISIS_PRESETS) {
        if (tourRunIdRef.current !== runId) return null;
        const originNode =
          INITIAL_MESH_NODES.find((n) => n.id === preset.nodeId) ||
          INITIAL_MESH_NODES[0];
        const { beacon, telemetryEvents } = await processCitizenDistress(
          originNode,
          preset.rawText
        );
        freshBeacons.push({
          ...beacon,
          syncedToCloud: false,
          syncedAt: undefined,
          hops: [originNode.id],
        });
        freshTelemetry.push(...telemetryEvents);
      }

      if (tourRunIdRef.current !== runId) return null;
      setTelemetry((prev) => [...freshTelemetry.reverse(), ...prev]);
      return freshBeacons;
    },
    []
  );

  const executeTourChapter = useCallback(
    async (step: TourStepIndex) => {
      const runId = ++tourRunIdRef.current;
      if (tourTimeoutRef.current !== null) {
        window.clearTimeout(tourTimeoutRef.current);
        tourTimeoutRef.current = null;
      }

      seedCancelRef.current = true;
      stopRelayGlide();
      setIsPatrolling(false);
      setShowComposer(false);
      setShowArchModal(false);
      setShowBenchmarksModal(false);
      setShowQrModal(false);

      const chapterMeta = STORY_TOUR_CHAPTERS[step];
      const chapterStart = Date.now();
      setTourStep(step);
      setTourChapterStartedAt(chapterStart);

      const scheduleNext = (nextFn: () => void, minDurationMs: number) => {
        if (tourRunIdRef.current !== runId) return;
        const elapsed = Date.now() - chapterStart;
        const remaining = Math.max(400, minDurationMs - elapsed);
        tourTimeoutRef.current = window.setTimeout(() => {
          if (tourRunIdRef.current !== runId) return;
          nextFn();
        }, remaining);
      };

      // CHAPTER 1 (~8s): Focus node-alpha + switch Triage Queue to PII Vault (ONLY_ON_DEVICE proof)
      if (step === 0) {
        setMobileMode(false);
        const unsyncedBeacons = await ensureBlackoutBeaconsForTour(runId);
        if (!unsyncedBeacons || tourRunIdRef.current !== runId) return;

        const [relayLng, relayLat] = xyToLngLat(63, 28);
        const stagedNodes = INITIAL_MESH_NODES.map((n) => {
          if (n.role === 'RELAY_MULE') {
            return {
              ...n,
              x: 63,
              y: 28,
              lng: relayLng,
              lat: relayLat,
              online: false,
              beaconsHeld: [],
              directivesReceived: [],
            };
          }
          if (n.role === 'COMMAND_GATEWAY') {
            return { ...n, beaconsHeld: [], directivesReceived: [] };
          }
          const ownIds = unsyncedBeacons
            .filter((b) => b.originNodeId === n.id)
            .map((b) => b.id);
          return {
            ...n,
            beaconsHeld: ownIds,
            directivesReceived: [],
          };
        });

        nodesRef.current = stagedNodes;
        beaconsRef.current = unsyncedBeacons;
        briefRef.current = null;

        setBrief(null);
        setFlights([]);
        setBeacons(unsyncedBeacons);
        setNodes(stagedNodes);
        setSelectedNodeId('node-alpha');
        setQueueTab('vault');

        scheduleNext(() => {
          void executeTourChapter(1);
        }, chapterMeta.durationMs);
        return;
      }

      // CHAPTER 2 (~10s): Switch tab to All + smoothly glide RELAY-MULE-01 across Golden Gate blackout sector
      if (step === 1) {
        setMobileMode(false);
        setQueueTab('all');

        if (beaconsRef.current.length < 3) {
          const unsyncedBeacons = await ensureBlackoutBeaconsForTour(runId);
          if (!unsyncedBeacons || tourRunIdRef.current !== runId) return;
          const [relayLng, relayLat] = xyToLngLat(63, 28);
          const stagedNodes = INITIAL_MESH_NODES.map((n) => {
            if (n.role === 'RELAY_MULE') {
              return {
                ...n,
                x: 63,
                y: 28,
                lng: relayLng,
                lat: relayLat,
                online: false,
                beaconsHeld: [],
                directivesReceived: [],
              };
            }
            const ownIds = unsyncedBeacons
              .filter((b) => b.originNodeId === n.id)
              .map((b) => b.id);
            return { ...n, beaconsHeld: ownIds, directivesReceived: [] };
          });
          nodesRef.current = stagedNodes;
          beaconsRef.current = unsyncedBeacons;
          setBeacons(unsyncedBeacons);
          setNodes(stagedNodes);
        }

        setSelectedNodeId('node-relay');
        void glideNodeAlongWaypoints(
          'node-relay',
          [
            { x: 38, y: 25 }, // Oakview Clinic (CITIZEN-BRAVO)
            { x: 29, y: 40 }, // Cedar St Overpass (CITIZEN-ALPHA)
            { x: 45, y: 46 }, // Harbor Bridge North (CITIZEN-CHARLIE)
          ],
          2400
        );

        scheduleNext(() => {
          void executeTourChapter(2);
        }, chapterMeta.durationMs);
        return;
      }

      // CHAPTER 3 (~11s): Glide across Uplink Ridge (x = 72), fire real runCloudSwarmCommander, & downlink directives
      if (step === 2) {
        setMobileMode(false);
        setQueueTab('all');

        let activeBeacons = beaconsRef.current;
        if (activeBeacons.length < 3) {
          const generated = await ensureBlackoutBeaconsForTour(runId);
          if (!generated || tourRunIdRef.current !== runId) return;
          activeBeacons = generated;
          beaconsRef.current = activeBeacons;
          setBeacons(activeBeacons);
        }

        const allIds = activeBeacons.map((b) => b.id);
        const preRidgeNodes = nodesRef.current.map((n) =>
          n.role === 'RELAY_MULE'
            ? {
                ...n,
                beaconsHeld: Array.from(new Set([...n.beaconsHeld, ...allIds])),
              }
            : n
        );
        nodesRef.current = preRidgeNodes;
        setNodes(preRidgeNodes);

        setSelectedNodeId('node-relay');
        await glideNodeAlongWaypoints(
          'node-relay',
          [{ x: 72, y: 68 }],
          2000
        );
        if (tourRunIdRef.current !== runId) return;

        const syncedList: TriageBeacon[] = activeBeacons.map((b) => ({
          ...b,
          syncedToCloud: true,
          syncedAt: Date.now(),
          hops: b.hops.includes('node-cmd')
            ? b.hops
            : [b.originNodeId, 'node-relay', 'node-cmd'],
        }));
        beaconsRef.current = syncedList;
        setBeacons(syncedList);
        setSelectedNodeId('node-cmd');

        setIsRunningCloud(true);
        try {
          const fusedBrief = await runCloudSwarmCommander(syncedList);
          if (tourRunIdRef.current !== runId) return;
          briefRef.current = fusedBrief;
          setBrief(fusedBrief);
          setTelemetry((prev) => [fusedBrief.telemetry, ...prev]);
          saveBriefToFirestore(roomId, fusedBrief).catch(() => {});
          busRef.current?.publish({
            type: 'BRIEF_UPDATED',
            roomId,
            brief: fusedBrief,
          });
        } finally {
          setIsRunningCloud(false);
        }

        if (tourRunIdRef.current !== runId) return;
        setSelectedNodeId('node-relay');
        await glideNodeAlongWaypoints(
          'node-relay',
          [
            { x: 45, y: 46 },
            { x: 33, y: 34 },
          ],
          1950
        );
        if (tourRunIdRef.current !== runId) return;

        scheduleNext(() => {
          void executeTourChapter(3);
        }, chapterMeta.durationMs);
        return;
      }

      // CHAPTER 4 (~9s): Switch to Field SOS (Dual-iPhone 16 Pro Radar + 12-tile SOS Grid), then return cleanly
      if (step === 3) {
        setMobileMode(true);
        scheduleNext(() => {
          setMobileMode(false);
          setSelectedNodeId('node-alpha');
          setQueueTab('all');
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          setTourStep(null);
        }, chapterMeta.durationMs);
      }
    },
    [
      ensureBlackoutBeaconsForTour,
      glideNodeAlongWaypoints,
      roomId,
      stopRelayGlide,
    ]
  );

  const startStoryTour = useCallback(() => {
    void executeTourChapter(0);
  }, [executeTourChapter]);

  const advanceStoryTour = useCallback(() => {
    if (tourStep === null) return;
    if (tourStep < 3) {
      void executeTourChapter((tourStep + 1) as TourStepIndex);
    } else {
      endStoryTour();
      setSelectedNodeId('node-alpha');
      setQueueTab('all');
    }
  }, [endStoryTour, executeTourChapter, tourStep]);

  const toggleRelayPatrol = () => {
    if (tourStep !== null) {
      endStoryTour({ keepMobileMode: true });
    }
    if (isPatrolling) {
      stopRelayGlide();
      setIsPatrolling(false);
      return;
    }

    setIsPatrolling(true);
    const { blackoutHub, bridgeMid, ridgeUplink, alpha, relayHome } =
      buildCorridorWaypoints();
    const waypoints = [
      blackoutHub,
      bridgeMid,
      ridgeUplink,
      bridgeMid,
      { x: alpha.x + 8, y: alpha.y + 8 },
      relayHome,
    ];

    void glideNodeAlongWaypoints('node-relay', waypoints, 950).then(() => {
      setIsPatrolling(false);
    });
  };

  const runOneClickQuakeDemo = async () => {
    if (isSimulatingQuake) return;
    if (tourStep !== null) {
      endStoryTour({ keepMobileMode: true });
    }
    seedCancelRef.current = true;
    stopRelayGlide();
    setIsPatrolling(false);
    setIsSimulatingQuake(true);
    setShowComposer(false);
    setBeacons([]);
    setTelemetry([]);
    setBrief(null);
    setNodes(INITIAL_MESH_NODES);
    setQueueTab('all');

    try {
      const emitted: TriageBeacon[] = [];
      for (const preset of CRISIS_PRESETS) {
        const node =
          INITIAL_MESH_NODES.find((n) => n.id === preset.nodeId) ||
          INITIAL_MESH_NODES[0];
        const { beacon, telemetryEvents } = await processCitizenDistress(
          node,
          preset.rawText
        );
        emitted.push(beacon);
        setBeacons((prev) => [beacon, ...prev]);
        setTelemetry((prev) => [...telemetryEvents.reverse(), ...prev]);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id
              ? { ...n, beaconsHeld: [...n.beaconsHeld, beacon.id] }
              : n
          )
        );
        await new Promise((r) => setTimeout(r, 320));
      }

      const { blackoutHub, bridgeMid, ridgeUplink, alpha, bravo } =
        buildCorridorWaypoints();

      // Smoothly glide Relay Mule through Blackout Zone and across Uplink Ridge
      await glideNodeAlongWaypoints(
        'node-relay',
        [blackoutHub, bridgeMid, ridgeUplink],
        780
      );

      // Fuse multi-node beacons via Cloud Copilot
      const synced = emitted.map((b) => ({
        ...b,
        syncedToCloud: true,
        syncedAt: Date.now(),
        hops: [b.originNodeId, 'node-relay', 'node-cmd'],
      }));
      setBeacons(synced);
      await handleRunCloudCommander(synced);

      // Glide Relay Mule back into Blackout Zone to deliver <1KB directives
      await new Promise((r) => setTimeout(r, 200));
      await glideNodeAlongWaypoints(
        'node-relay',
        [
          bridgeMid,
          { x: bravo.x + 6, y: bravo.y - 6 },
          { x: alpha.x + 8, y: alpha.y + 6 },
        ],
        760
      );
    } finally {
      setIsSimulatingQuake(false);
    }
  };

  const handleReset = () => {
    if (tourStep !== null) {
      endStoryTour({ keepMobileMode: true });
    }
    seedCancelRef.current = true;
    stopRelayGlide();
    setIsPatrolling(false);
    nodesRef.current = INITIAL_MESH_NODES;
    beaconsRef.current = [];
    briefRef.current = null;
    setNodes(INITIAL_MESH_NODES);
    setBeacons([]);
    setTelemetry([]);
    setBrief(null);
    setFlights([]);
    setPhotoDataUrl(undefined);
    setQueueTab('all');
  };

  const mobileJoinUrl = `${window.location.origin}${window.location.pathname}?mode=mobile&room=${encodeURIComponent(
    roomId
  )}`;

  const mobileDirectives = brief?.directives || [];

  return (
    <>
      {mobileMode ? (
        <MobileFieldView
          roomId={roomId}
          onExitMobile={() => {
            if (tourStep === 3) {
              endStoryTour();
            } else {
              setMobileMode(false);
            }
          }}
          onBeaconCreated={(beacon) => {
            setBeacons((prev) => [beacon, ...prev]);
            busRef.current?.publish({
              type: 'BEACON_CREATED',
              roomId,
              beacon,
            });
          }}
          receivedDirectives={mobileDirectives}
        />
      ) : (
        <div className="relative w-screen h-screen overflow-hidden bg-[#0D1013] text-[#F3F4F6]">
      {/* LAYER 0: Full-Bleed Spatial Coastal Terrain Map */}
      <div className="absolute inset-0 z-0">
        <SwarmMapCanvas
          nodes={nodes}
          beacons={beacons}
          flights={flights}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
          }}
          onMoveNode={handleMoveNode}
        />
      </div>

      {/* LAYER 1: Top Floating Frosted Nav Bar (Exact Flatkey Nav Bar) */}
      <header className="absolute top-0 inset-x-0 z-20 h-14 px-5 flex items-center justify-between gap-4 bg-[#101215]/78 backdrop-blur-xl border-b border-white/[0.06]">
        {/* Left: Brand Mark + Nav Pills */}
        <div className="flex items-center gap-6 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.09] flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 5.5L11.2 4v14.2L4 14.5V5.5Z"
                  fill="#F3F4F6"
                />
                <path
                  d="M20 5.5L12.8 4v14.2l7.2-3.7V5.5Z"
                  fill="#B7E852"
                />
              </svg>
            </div>
            <span className="text-[16px] font-semibold tracking-tight text-[#F3F4F6]">
              ZeroBar
            </span>
          </div>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-1"
          >
            <button
              type="button"
              data-testid="open-overview-benchmarks"
              onClick={() => {
                setShowComposer(false);
                setShowBenchmarksModal((v) => !v);
              }}
              className={`px-3 py-1.5 rounded-xl text-[13px] flex items-center gap-2 transition cursor-pointer ${
                showBenchmarksModal
                  ? 'bg-white/[0.09] text-white font-medium'
                  : 'text-[#8A919E] hover:text-[#F3F4F6] hover:bg-white/[0.04]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="bg-white/[0.09] border border-white/[0.06] text-white px-3.5 py-1.5 rounded-xl text-[13px] font-medium flex items-center gap-2 cursor-pointer"
            >
              <MapIcon className="w-3.5 h-3.5 text-[#B7E852]" strokeWidth={1.75} />
              <span>Live Map</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMode(true)}
              className="px-3 py-1.5 rounded-xl text-[13px] text-[#8A919E] hover:text-[#F3F4F6] hover:bg-white/[0.04] flex items-center gap-2 transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Field SOS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowArchModal(true)}
              className="px-3 py-1.5 rounded-xl text-[13px] text-[#8A919E] hover:text-[#F3F4F6] hover:bg-white/[0.04] flex items-center gap-2 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Blueprint</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="px-3 py-1.5 rounded-xl text-[13px] text-[#8A919E] hover:text-[#F3F4F6] hover:bg-white/[0.04] flex items-center gap-2 transition cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Pair QR</span>
            </button>
          </nav>
        </div>

        {/* Right: Story Tour Pill + Simulate 7.2 Quake Pill + Flatkey Segmented Live | Patrol Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (tourStep !== null) {
                endStoryTour();
              } else {
                startStoryTour();
              }
            }}
            className={`h-9 px-3.5 rounded-xl border text-[13px] font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              tourStep !== null
                ? 'bg-[#B7E852] text-[#0D1013] border-[#B7E852] shadow-[0_0_22px_rgba(183,232,82,0.38)]'
                : 'bg-[#B7E852]/14 hover:bg-[#B7E852]/24 border-[#B7E852]/40 text-[#B7E852] shadow-[0_0_18px_rgba(183,232,82,0.14)]'
            }`}
          >
            <span aria-hidden="true" className="text-[13px] leading-none">
              ✦
            </span>
            <span>
              {tourStep !== null
                ? `Story Tour (${tourStep + 1}/4)`
                : 'Story Tour'}
            </span>
          </button>

          <button
            type="button"
            onClick={runOneClickQuakeDemo}
            disabled={isSimulatingQuake}
            className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] disabled:opacity-60 border border-white/[0.09] text-[13px] font-medium text-[#F3F4F6] flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 text-[#B7E852] fill-[#B7E852]" />
            <span>
              {isSimulatingQuake ? 'Simulating 7.2 Quake…' : 'Simulate 7.2 Quake'}
            </span>
          </button>

          {/* Flatkey Signature ● Live | Patrol Segmented Pill */}
          <div className="bg-[#181B20]/90 border border-white/[0.07] rounded-xl p-1 flex items-center text-[12px]">
            <button
              type="button"
              onClick={() => {
                if (isPatrolling) {
                  stopRelayGlide();
                  setIsPatrolling(false);
                }
              }}
              className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition cursor-pointer ${
                !isPatrolling
                  ? 'bg-white/[0.09] text-[#F3F4F6]'
                  : 'text-[#8A919E] hover:text-[#F3F4F6]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E85D4A] animate-pulse" />
              <span>Live</span>
            </button>
            <button
              type="button"
              onClick={toggleRelayPatrol}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                isPatrolling
                  ? 'bg-[#B7E852]/18 text-[#B7E852]'
                  : 'text-[#8A919E] hover:text-[#F3F4F6]'
              }`}
              title="Toggle 60fps Relay Mule Patrol"
            >
              Patrol
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            title={`Reset simulation · Room ${roomId} (${rtcStatus.mode})`}
            aria-label="Reset simulation"
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-[#8A919E] hover:text-[#F3F4F6] flex items-center justify-center transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* LAYER 2: Floating Left Sidebar · "Swarm Overview" + Bottom "Active Mesh" Card */}
      <aside
        aria-label="Swarm Overview"
        className="absolute left-4 top-[70px] bottom-4 w-[352px] max-w-[calc(100vw-32px)] z-20 flex flex-col gap-3 pointer-events-none"
      >
        {/* Top Main Frosted Glass Card */}
        <div
          className={`pointer-events-auto flex-1 min-h-0 flex flex-col bg-[#141619]/86 backdrop-blur-2xl rounded-[22px] p-4 overflow-hidden relative transition-all duration-300 ${
            tourStep === 0
              ? 'border border-[#B7E852]/50 shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_28px_rgba(183,232,82,0.16)]'
              : 'border border-white/[0.07] shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
          }`}
        >
          {/* Card Header */}
          <div className="flex items-center justify-between gap-2 mb-3.5 shrink-0">
            <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[#F3F4F6]">
              Swarm Overview
            </h1>
            <button
              type="button"
              onClick={() => setShowComposer((v) => !v)}
              title="Compose offline SOS distress beacon"
              aria-label="Compose offline SOS distress beacon"
              className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                showComposer
                  ? 'bg-[#B7E852]/18 border-[#B7E852]/40 text-[#B7E852]'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.07] text-[#8A919E] hover:text-[#F3F4F6]'
              }`}
            >
              {showComposer ? (
                <X className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Slide-Over SOS Beacon Composer (Toggled via + button) */}
          {showComposer && (
            <div className="mb-3 rounded-2xl bg-[#1A1D22] border border-white/[0.09] p-3.5 space-y-2.5 shrink-0 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-[#F3F4F6]">
                  Emit Offline SOS Beacon
                </span>
                <select
                  aria-label="Origin Citizen Node"
                  value={
                    selectedNode.role === 'CITIZEN_OFFLINE'
                      ? selectedNode.id
                      : citizenNodes[0]?.id || 'node-alpha'
                  }
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                  className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-[#D1D5DB] focus:outline-none"
                >
                  {citizenNodes.map((cn) => (
                    <option key={cn.id} value={cn.id} className="bg-[#141619]">
                      {cn.callsign}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CRISIS_PRESETS.map((p) => {
                  const active = distressInput === p.rawText;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(p.nodeId);
                        setDistressInput(p.rawText);
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] border transition cursor-pointer ${
                        active
                          ? 'bg-[#B7E852]/15 border-[#B7E852]/40 text-[#B7E852] font-medium'
                          : 'bg-white/[0.03] border-white/[0.06] text-[#8A919E] hover:text-[#F3F4F6]'
                      }`}
                    >
                      {PRESET_SHORT_LABELS[p.id] || p.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={3}
                value={distressInput}
                onChange={(e) => setDistressInput(e.target.value)}
                placeholder="Type citizen SOS (names, SSN, address scrubbed strictly ONLY_ON_DEVICE)…"
                className="w-full rounded-xl bg-black/35 border border-white/[0.07] px-3 py-2 text-[12px] text-[#F3F4F6] placeholder:text-[#6B7280] focus:outline-none focus:border-[#B7E852]/50 resize-none leading-relaxed"
              />

              <div className="flex items-center gap-1.5">
                <label
                  className={`cursor-pointer h-8 px-2.5 rounded-xl border text-[11px] font-medium inline-flex items-center gap-1.5 transition shrink-0 ${
                    photoDataUrl
                      ? 'bg-[#B7E852]/15 border-[#B7E852]/35 text-[#B7E852]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07] text-[#D1D5DB]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{photoDataUrl ? 'Photo Ready' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () =>
                        typeof r.result === 'string' && setPhotoDataUrl(r.result);
                      r.readAsDataURL(f);
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  data-testid="attach-sample-recon"
                  onClick={() => {
                    const sampleUrl = generateSampleHazardReconDataUrl();
                    if (sampleUrl) {
                      setPhotoDataUrl(sampleUrl);
                    }
                  }}
                  className="flex-1 h-8 px-2.5 rounded-xl bg-[#F2B84B]/14 hover:bg-[#F2B84B]/24 border border-[#F2B84B]/38 text-[#F2B84B] text-[11px] font-medium inline-flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                >
                  <span>⚡ Attach Drone Hazard Recon</span>
                </button>
              </div>

              {photoDataUrl && (
                <div className="rounded-xl bg-black/40 border border-[#B7E852]/30 p-2 flex items-center gap-2.5">
                  <img
                    src={photoDataUrl}
                    alt="Attached hazard recon preview"
                    className="w-16 h-10 rounded-lg object-cover border border-white/12 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono font-medium text-[#B7E852] leading-tight">
                      Multimodal InlineDataPart Ready · ONLY_IN_CLOUD
                    </div>
                    <div className="text-[10.5px] text-[#8A919E] truncate mt-0.5 tabular-nums">
                      ~{Math.max(1, Math.round(estimateDataUrlBytes(photoDataUrl) / 1024))} KB image/jpeg · Sector 2 FLIR
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl(undefined)}
                    aria-label="Remove attached hazard photo"
                    className="p-1 rounded-lg text-[#8A919E] hover:text-[#F3F4F6] hover:bg-white/[0.08] cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const originId =
                    selectedNode.role === 'CITIZEN_OFFLINE'
                      ? selectedNode.id
                      : citizenNodes[0]?.id || 'node-alpha';
                  void handleEmitBeacon(originId, distressInput, photoDataUrl);
                }}
                disabled={isProcessingEdge || !distressInput.trim()}
                className="w-full h-8 px-3.5 rounded-xl bg-[#B7E852] hover:bg-[#c5f069] disabled:opacity-40 text-[#0D1013] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>{isProcessingEdge ? 'Scrubbing…' : 'Emit Beacon'}</span>
              </button>
            </div>
          )}

          {/* 2 Side-by-Side Dot-Matrix KPI Micro-Cards */}
          <TelemetryStrip
            capabilities={capabilities}
            telemetry={telemetry}
            beacons={beacons}
          />

          {/* Triage Queue Section (Matches Flatkey "Risk Queue") */}
          <div className="mt-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#D1D5DB]">
                <Bell className="w-3.5 h-3.5 text-[#8A919E]" strokeWidth={1.75} />
                <span>Triage Queue</span>
              </span>
              <span className="text-[11px] text-[#6B7280]">
                Sorted by severity
              </span>
            </div>

            {/* Segmented Pill Bar */}
            <div className="mt-2.5 bg-white/[0.04] border border-white/[0.04] rounded-xl p-1 grid grid-cols-3 text-[12px] shrink-0">
              <button
                type="button"
                onClick={() => setQueueTab('all')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  queueTab === 'all'
                    ? 'bg-white/[0.09] text-[#F3F4F6] font-medium shadow-sm'
                    : 'text-[#8A919E] hover:text-[#D1D5DB]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('vault')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  queueTab === 'vault'
                    ? 'bg-white/[0.09] text-[#F3F4F6] font-medium shadow-sm'
                    : 'text-[#8A919E] hover:text-[#D1D5DB]'
                }`}
              >
                PII Vault
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('telemetry')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  queueTab === 'telemetry'
                    ? 'bg-white/[0.09] text-[#F3F4F6] font-medium shadow-sm'
                    : 'text-[#8A919E] hover:text-[#D1D5DB]'
                }`}
              >
                Telemetry
              </button>
            </div>

            {/* Queue Scrollable List */}
            <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto pr-0.5 space-y-1.5">
              {queueTab === 'all' && (
                <>
                  {sortedBeacons.length === 0 ? (
                    <div className="h-full min-h-[170px] flex flex-col items-center justify-center text-center px-4 gap-2.5">
                      <p className="text-[13px] font-medium text-[#D1D5DB]">
                        No active triage beacons
                      </p>
                      <p className="text-[12px] text-[#8A919E] leading-relaxed">
                        Trigger the 7.2 Cascadia Quake scenario or compose a custom offline SOS report.
                      </p>
                      <button
                        type="button"
                        onClick={runOneClickQuakeDemo}
                        disabled={isSimulatingQuake}
                        className="mt-1 h-8 px-3.5 rounded-xl bg-[#B7E852] hover:bg-[#c5f069] text-[#0D1013] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Load 7.2 Quake Scenario</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {sortedBeacons.map((b) => {
                        const score = computeBeaconRiskScore(b);
                        const { title, subtitle } = formatBeaconHeadline(b);
                        const isSelected = selectedNodeId === b.originNodeId;
                        const isCritical = score >= 88;
                        const hasGas = b.payload.haz.includes('GAS_LEAK');
                        const hasBridge = b.payload.haz.includes('ROUTE_BLOCKED');

                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedNodeId(b.originNodeId)}
                            className={`group rounded-2xl px-2.5 py-2.5 flex items-center gap-3 cursor-pointer border transition ${
                              isSelected
                                ? 'bg-white/[0.06] border-white/[0.09]'
                                : 'bg-transparent hover:bg-white/[0.04] border-transparent'
                            }`}
                          >
                            {/* 36px Sector Avatar Badge */}
                            <div
                              className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center border relative ${
                                isCritical
                                  ? 'bg-[#E85D4A]/14 border-[#E85D4A]/25 text-[#E85D4A]'
                                  : 'bg-[#F2B84B]/14 border-[#F2B84B]/25 text-[#F2B84B]'
                              }`}
                            >
                              {hasGas ? (
                                <Flame className="w-4 h-4" strokeWidth={1.9} />
                              ) : hasBridge ? (
                                <AlertTriangle
                                  className="w-4 h-4"
                                  strokeWidth={1.9}
                                />
                              ) : (
                                <HeartPulse
                                  className="w-4 h-4"
                                  strokeWidth={1.9}
                                />
                              )}
                              {b.syncedToCloud && (
                                <span
                                  title="Synced via Relay Mule"
                                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#B7E852] border-2 border-[#141619]"
                                />
                              )}
                            </div>

                            {/* Clean Proportional Title + Muted Summary */}
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[#F3F4F6] leading-snug whitespace-nowrap">
                                {title}
                              </div>
                              <div className="text-[11.5px] text-[#8A919E] leading-snug mt-0.5 whitespace-nowrap">
                                {subtitle}
                              </div>
                            </div>

                            {/* Flatkey Right Severity Dot + Score */}
                            <div className="shrink-0 flex items-center gap-1.5 text-[13px] font-medium tabular-nums text-[#F3F4F6]">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isCritical ? 'bg-[#E85D4A]' : 'bg-[#F2B84B]'
                                }`}
                              />
                              <span>{score}</span>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}

              {queueTab === 'vault' && (
                <>
                  {sortedBeacons.length === 0 ? (
                    <div className="h-full min-h-[160px] flex items-center justify-center text-center px-4 text-[12px] text-[#8A919E]">
                      Emit or simulate an SOS beacon to inspect on-device PII redaction and offline survival coaching.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {sortedBeacons.map((b) => {
                        const shortCall = b.originCallsign.replace(
                          /^CITIZEN-/i,
                          ''
                        );
                        const piiCount = b.piiRedactedTypes.length;
                        return (
                          <div
                            key={b.id}
                            className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#F3F4F6] shrink-0">
                                <Lock className="w-3.5 h-3.5 text-[#E85D4A]" />
                                <span>{shortCall}</span>
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#B7E852]/10 border border-[#B7E852]/25 text-[10.5px] text-[#B7E852] tabular-nums font-medium whitespace-nowrap">
                                {b.beaconBytes}B beacon · {piiCount} PII scrubbed
                              </span>
                            </div>

                            {/* Struck-through local PII proof */}
                            <p className="text-[11.5px] text-[#8A919E] leading-relaxed">
                              {renderRedactedPiiText(b.rawInputLocalOnly)}
                            </p>

                            {/* Compact <350B JSON mesh payload */}
                            <div className="rounded-xl bg-black/35 border border-white/[0.05] px-2.5 py-1.5 font-mono text-[10px] text-[#D1D5DB] break-all leading-relaxed">
                              {JSON.stringify(b.payload)}
                            </div>

                            {/* Immediate Offline First-Aid */}
                            {b.localSurvivalSteps.length > 0 && (
                              <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                                <div className="text-[11px] font-medium text-[#B7E852]">
                                  Immediate Offline First-Aid
                                </div>
                                <ul className="space-y-1 text-[11.5px] text-[#D1D5DB] leading-snug">
                                  {b.localSurvivalSteps.map((step, idx) => (
                                    <li
                                      key={idx}
                                      className="flex items-start gap-2"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#B7E852] shrink-0 mt-[5px]" />
                                      <span>{step}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {queueTab === 'telemetry' && (
                <>
                  {telemetry.length === 0 ? (
                    <div className="h-full min-h-[160px] flex items-center justify-center text-center px-4 text-[12px] text-[#8A919E]">
                      Hybrid AI dispatches stream here with mode &amp; latency.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {telemetry.map((t) => {
                        const opTitle =
                          t.operation === 'PII_SCRUB_VAULT'
                            ? 'ONLY_ON_DEVICE · PII Scrub'
                            : t.operation === 'TRIAGE_COMPRESS'
                            ? 'PREFER_ON_DEVICE · Triage'
                            : t.operation === 'CLOUD_SWARM_FUSION'
                            ? 'ONLY_IN_CLOUD · Fusion'
                            : t.operation;
                        return (
                          <div
                            key={t.id}
                            className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-medium text-[#F3F4F6] truncate">
                                {opTitle}
                              </span>
                              <InferenceBadge
                                mode={t.modeConfigured}
                                source={t.inferenceSource}
                                latencyMs={t.latencyMs}
                              />
                            </div>
                            {t.note && (
                              <div className="text-[11px] text-[#8A919E] truncate">
                                {t.note}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Subtle Flatkey Bottom Queue Footer */}
            {queueTab === 'all' && sortedBeacons.length > 0 && (
              <div className="pt-2.5 mt-2 border-t border-white/[0.06] flex items-center justify-between text-[12px] shrink-0">
                <span className="text-[#8A919E]">
                  Scrubbed in RAM ·{' '}
                  <strong className="text-[#F3F4F6] font-medium tabular-nums">
                    {totalPiiScrubbed}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setQueueTab('vault')}
                  className="inline-flex items-center gap-1 text-[#D1D5DB] hover:text-[#B7E852] transition cursor-pointer"
                >
                  <span>PII Proof</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Frosted Mini-Card · "Active Mesh" Spline Card (Matches Flatkey "Active fleet 120") */}
        <div className="pointer-events-auto h-[136px] shrink-0 bg-[#141619]/86 backdrop-blur-2xl border border-white/[0.07] rounded-[22px] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#D1D5DB] font-medium">
              <Activity className="w-3.5 h-3.5 text-[#8A919E]" strokeWidth={1.75} />
              <span>Active Mesh</span>
            </span>
            <span className="text-[11px] text-[#6B7280] tabular-nums">
              &lt;400B P2P budget
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[24px] font-medium tracking-tight text-[#F3F4F6] tabular-nums leading-none">
              {avgBeaconBytes} B
            </span>
            <span className="text-[11px] font-medium text-[#B7E852] tabular-nums">
              ↓68%
            </span>
            <span className="text-[12px] text-[#8A919E]">avg packet</span>
          </div>

          {/* Smooth Glowing #B7E852 Lime Spline Chart */}
          <svg
            viewBox="0 0 310 44"
            className="w-full h-[44px] overflow-visible"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="zbLimeArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B7E852" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#B7E852" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="zbFocusBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Subtle vertical column grid + highlighted band */}
            <rect x="88" y="0" width="38" height="42" fill="url(#zbFocusBand)" rx="4" />
            {[44, 88, 132, 176, 220, 264].map((x) => (
              <line
                key={x}
                x1={x}
                y1="2"
                x2={x}
                y2="42"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            ))}

            <path
              d="M 2 28 C 24 32, 42 18, 66 15 C 84 13, 94 18, 107 20 C 126 23, 140 33, 162 27 C 184 21, 204 28, 228 29 C 252 30, 278 24, 308 27 L 308 43 L 2 43 Z"
              fill="url(#zbLimeArea)"
            />
            <path
              d="M 2 28 C 24 32, 42 18, 66 15 C 84 13, 94 18, 107 20 C 126 23, 140 33, 162 27 C 184 21, 204 28, 228 29 C 252 30, 278 24, 308 27"
              stroke="#B7E852"
              strokeWidth="1.75"
              strokeLinecap="round"
            />

            {/* Active focal pulse point */}
            <circle cx="107" cy="20" r="6" fill="#B7E852" fillOpacity="0.25" />
            <circle cx="107" cy="20" r="2.75" fill="#F3F4F6" stroke="#B7E852" strokeWidth="1.5" />
          </svg>
        </div>
      </aside>

      {/* LAYER 3: Floating Right Cards · "✦ Cloud Copilot" + "Relay Corridors" */}
      <aside
        aria-label="Cloud Copilot and Relay Corridors"
        className="hidden lg:flex absolute right-4 top-[70px] w-[336px] max-h-[calc(100vh-86px)] z-20 flex-col gap-3 pointer-events-none"
      >
        {/* Card 1: ✦ Cloud Copilot (Exact Flatkey "Copilot" Card) */}
        <div
          className={`pointer-events-auto bg-[#141619]/86 backdrop-blur-2xl rounded-[22px] p-4 flex flex-col max-h-[58%] overflow-hidden transition-all duration-300 ${
            tourStep === 2
              ? 'border border-[#B7E852]/55 shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_28px_rgba(183,232,82,0.18)]'
              : 'border border-white/[0.07] shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 mb-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#F3F4F6] whitespace-nowrap">
              <Sparkles
                className={`w-4 h-4 ${
                  tourStep === 2 ? 'text-[#B7E852]' : 'text-[#F3F4F6]'
                }`}
                strokeWidth={1.75}
              />
              <span>Cloud Copilot</span>
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="cloud-recon-vision"
                onClick={() => void handleTriggerCloudReconVision()}
                disabled={isRunningCloud}
                title="Attach FLIR Drone Hazard Recon to CITIZEN-CHARLIE & fuse via Gemini 2.5 Flash Vision (ONLY_IN_CLOUD)"
                className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                  activeReconBeacon
                    ? 'bg-[#B7E852]/14 hover:bg-[#B7E852]/24 border-[#B7E852]/40 text-[#B7E852]'
                    : 'bg-[#F2B84B]/12 hover:bg-[#F2B84B]/22 border-[#F2B84B]/35 text-[#F2B84B]'
                }`}
              >
                📷 Recon Vision
              </button>

              <button
                type="button"
                onClick={() => void handleRunCloudCommander()}
                disabled={syncedBeacons.length === 0 || isRunningCloud}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-40 border border-white/[0.08] text-[11px] font-medium text-[#D1D5DB] transition cursor-pointer whitespace-nowrap"
              >
                {isRunningCloud
                  ? 'Fusing…'
                  : syncedBeacons.length > 0
                  ? `Fuse (${syncedBeacons.length})`
                  : 'Standby'}
              </button>
            </div>
          </div>

          {activeReconBeacon?.photoDataUrl && (
            <div
              data-testid="cloud-recon-verified-strip"
              className="mb-2.5 rounded-xl bg-black/35 border border-[#B7E852]/30 p-2 flex items-center gap-2.5 shrink-0"
            >
              <img
                src={activeReconBeacon.photoDataUrl}
                alt="FLIR Drone Recon of Sector 2 Harbor Bridge North Ramp"
                className="w-16 h-10 rounded-lg object-cover border border-white/12 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-semibold text-[#B7E852] truncate">
                    Multimodal Recon Verified
                  </span>
                  <span className="px-1.5 py-[1px] rounded bg-[#B7E852]/14 text-[#B7E852] text-[9.5px] font-mono shrink-0">
                    ONLY_IN_CLOUD
                  </span>
                </div>
                <div className="text-[10.5px] text-[#D1D5DB] truncate mt-0.5">
                  FLIR Drone Frame · North Span Blocked · Pine St Clear
                </div>
              </div>
            </div>
          )}

          {!brief ? (
            <div className="py-5 px-2 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#8A919E] shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#D1D5DB]">
                  Awaiting relay uplink on Ridge...
                </div>
                <div className="text-[12px] text-[#8A919E] mt-0.5">
                  Patrol Relay Mule east to fuse beacons
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-0.5">
              {brief.incidents.map((inc, idx) => {
                const isCoral = inc.severity === 'CRITICAL' && idx === 0;
                return (
                  <div key={inc.id} className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border mt-0.5 ${
                        isCoral
                          ? 'bg-[#E85D4A]/15 border-[#E85D4A]/25 text-[#E85D4A]'
                          : 'bg-[#F2B84B]/15 border-[#F2B84B]/25 text-[#F2B84B]'
                      }`}
                    >
                      {idx === 0 ? (
                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                      ) : (
                        <Route className="w-3.5 h-3.5" strokeWidth={2} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[#F3F4F6] leading-snug">
                        {inc.title.replace(/\u2014/g, '·')}
                      </div>
                      <p className="text-[12px] text-[#8A919E] leading-relaxed mt-0.5">
                        {inc.actionPlan}
                      </p>
                      {inc.contradictionResolved && (
                        <div className="mt-1.5 rounded-xl bg-[#B7E852]/[0.08] border border-[#B7E852]/25 px-2.5 py-1.5 text-[11px] text-[#D9F59B] leading-snug">
                          <span className="font-medium text-[#B7E852]">
                            Contradiction Resolved:{' '}
                          </span>
                          {inc.contradictionResolved}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Card 2: Relay Corridors (Exact Flatkey "All Trips" Lime Timeline Card) */}
        <div
          className={`pointer-events-auto bg-[#141619]/86 backdrop-blur-2xl rounded-[22px] p-4 flex flex-col transition-all duration-300 ${
            tourStep === 2
              ? 'border border-[#B7E852]/55 shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_28px_rgba(183,232,82,0.16)]'
              : 'border border-white/[0.07] shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-[14px] font-medium text-[#F3F4F6]">
              <Route className="w-4 h-4 text-[#8A919E]" strokeWidth={1.75} />
              <span>Relay Corridors</span>
            </span>
            <span className="text-[11px] font-medium text-[#B7E852] tabular-nums">
              {corridorStage === 'downlink'
                ? `${deliveredDirectivesCount}/${brief?.directives.length || 0} Delivered`
                : corridorStage === 'uplink'
                ? 'Ridge Synced'
                : '0-Bar Mesh'}
            </span>
          </div>

          {/* Horizontal Glowing #B7E852 Lime Progress Track */}
          <div className="mt-4 px-1">
            <div className="relative h-1.5 rounded-full bg-white/[0.09] flex items-center">
              <div
                className="h-full rounded-full bg-[#B7E852] transition-all duration-500"
                style={{
                  width:
                    corridorStage === 'downlink'
                      ? '100%'
                      : corridorStage === 'uplink'
                      ? '50%'
                      : '14%',
                  boxShadow: '0 0 14px rgba(183, 232, 82, 0.55)',
                }}
              />

              {/* Stop 1: Blackout */}
              <div
                className={`absolute left-0 -translate-x-1/2 rounded-full flex items-center justify-center ${
                  corridorStage === 'blackout'
                    ? 'w-5 h-5 bg-[#B7E852]/25 border border-[#B7E852]'
                    : 'w-2.5 h-2.5 bg-[#B7E852]'
                }`}
              >
                {corridorStage === 'blackout' && (
                  <span className="w-2 h-2 rounded-full bg-[#F3F4F6]" />
                )}
              </div>

              {/* Stop 2: Uplink */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 rounded-full flex items-center justify-center ${
                  corridorStage === 'uplink'
                    ? 'w-5 h-5 bg-[#B7E852]/25 border border-[#B7E852]'
                    : corridorStage === 'downlink'
                    ? 'w-2.5 h-2.5 bg-[#B7E852]'
                    : 'w-2.5 h-2.5 bg-[#2A2F37] border border-white/20'
                }`}
              >
                {corridorStage === 'uplink' && (
                  <span className="w-2 h-2 rounded-full bg-[#F3F4F6]" />
                )}
              </div>

              {/* Stop 3: Downlink */}
              <div
                className={`absolute right-0 translate-x-1/2 rounded-full flex items-center justify-center ${
                  corridorStage === 'downlink'
                    ? 'w-5 h-5 bg-[#B7E852]/25 border border-[#B7E852]'
                    : 'w-2.5 h-2.5 bg-[#2A2F37] border border-white/20'
                }`}
              >
                {corridorStage === 'downlink' && (
                  <span className="w-2 h-2 rounded-full bg-[#F3F4F6]" />
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[12px]">
              <span
                className={
                  corridorStage === 'blackout'
                    ? 'text-[#F3F4F6] font-medium'
                    : 'text-[#8A919E]'
                }
              >
                Blackout
              </span>
              <span
                className={
                  corridorStage === 'uplink'
                    ? 'text-[#F3F4F6] font-medium'
                    : 'text-[#8A919E]'
                }
              >
                Uplink
              </span>
              <span
                className={
                  corridorStage === 'downlink'
                    ? 'text-[#F3F4F6] font-medium'
                    : 'text-[#8A919E]'
                }
              >
                Downlink
              </span>
            </div>
          </div>

          {/* Compact <1KB Downlink Directives List */}
          {brief && brief.directives.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-white/[0.06] space-y-1.5 max-h-[132px] overflow-y-auto pr-0.5">
              {brief.directives.map((d) => {
                const delivered = nodes
                  .find((n) => n.id === d.targetNodeId)
                  ?.directivesReceived.some((x) => x.id === d.id);
                return (
                  <div
                    key={d.id}
                    className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11.5px]"
                    title={d.message}
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-medium text-[#F3F4F6] mr-1.5">
                        {d.targetCallsign}
                      </span>
                      <span className="text-[#8A919E]">{d.message}</span>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${
                        delivered ? 'text-[#B7E852]' : 'text-[#F2B84B]'
                      }`}
                    >
                      {delivered && <CheckCircle2 className="w-3 h-3" />}
                      <span>
                        {d.bytes}B {delivered ? 'Delivered' : 'Queued'}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* LAYER 4: Floating Bottom-Center Status Dock (Flatkey Balance) */}
      <div
        role="status"
        aria-label="ZeroBar Security and Quick SOS Dock"
        className="hidden lg:flex absolute bottom-4 right-4 w-[336px] z-20 items-center justify-between gap-2 px-3.5 py-2.5 rounded-[18px] bg-[#141619]/86 backdrop-blur-xl border border-white/[0.08] shadow-[0_12px_28px_rgba(0,0,0,0.48)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] shrink-0"
            aria-hidden="true"
          />
          <span className="text-[11.5px] font-medium text-[#D1D5DB] truncate">
            {capabilities?.appCheckActive ? 'App Check Live' : 'App Check'}
          </span>
          <span className="w-px h-3 bg-white/[0.1] shrink-0" aria-hidden="true" />
          <span className="text-[11.5px] text-[#8A919E] truncate">
            Zero PII Egress
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#B7E852]/15 hover:bg-[#B7E852]/25 border border-[#B7E852]/35 text-[#B7E852] text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
          <span>Emit SOS</span>
        </button>
      </div>

      {/* Frosted QR Pair Phone Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="bg-[#141619]/95 backdrop-blur-2xl border border-white/[0.09] rounded-[24px] max-w-sm w-full p-5 space-y-4 relative shadow-[0_24px_70px_rgba(0,0,0,0.65)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-[#8A919E] hover:text-[#F3F4F6] hover:bg-white/[0.06] cursor-pointer"
              aria-label="Close QR Modal"
            >
              <X className="w-4 h-4" />
            </button>
            <div>
              <h3 className="text-[16px] font-medium text-[#F3F4F6]">
                Pair Live Field SOS Node
              </h3>
              <p className="text-[12px] text-[#8A919E] mt-1 leading-relaxed">
                Scan on a phone or open in a second tab to exchange real WebRTC P2P beacons in room{' '}
                <code className="text-[#B7E852] font-mono">{roomId}</code>.
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl flex items-center justify-center">
              <QRCodeSVG value={mobileJoinUrl} size={180} />
            </div>
            <div className="flex gap-2">
              <a
                href={mobileJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 h-9 rounded-xl bg-[#B7E852] hover:bg-[#c5f069] text-[#0D1013] font-semibold text-[12px] flex items-center justify-center transition"
              >
                Open Field SOS Tab
              </a>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="h-9 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[#D1D5DB] text-[12px] font-medium cursor-pointer transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

          {/* Surge Economics & Live Benchmarks Modal */}
          <SurgeBenchmarksModal
            open={showBenchmarksModal}
            onClose={() => setShowBenchmarksModal(false)}
            beacons={beacons}
            telemetry={telemetry}
            capabilities={capabilities}
            swRegistered={swRegistered}
          />

          {/* Hybrid Architecture Modal */}
          <ArchitectureModal
            open={showArchModal}
            onClose={() => setShowArchModal(false)}
            capabilities={capabilities}
            rtcStatus={rtcStatus}
            swRegistered={swRegistered}
            roomId={roomId}
          />
        </div>
      )}

      {/* Floating Lower-Third Cinematic Story Tour Bar (Visible on Live Map & Field SOS) */}
      <GuidedTourBar
        tourStep={tourStep}
        chapterStartedAt={tourChapterStartedAt}
        voiceoverEnabled={voiceoverEnabled}
        onToggleVoiceover={() => setVoiceoverEnabled((v) => !v)}
        onSelectStep={(step) => void executeTourChapter(step)}
        onNextStep={advanceStoryTour}
        onEndTour={() => endStoryTour()}
      />
    </>
  );
}
