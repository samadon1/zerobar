export type InferenceSource = 'ON_DEVICE' | 'IN_CLOUD' | 'SANDBOX_SIM';

export type HybridModeTag =
  | 'ONLY_ON_DEVICE'
  | 'PREFER_ON_DEVICE'
  | 'PREFER_IN_CLOUD'
  | 'ONLY_IN_CLOUD';

export type Severity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export type NodeRole = 'CITIZEN_OFFLINE' | 'RELAY_MULE' | 'COMMAND_GATEWAY';

export interface TelemetryRecord {
  id: string;
  operation:
    | 'PII_SCRUB_VAULT'
    | 'TRIAGE_COMPRESS'
    | 'OFFLINE_SURVIVAL_COACH'
    | 'CLOUD_SWARM_FUSION';
  modeConfigured: HybridModeTag;
  inferenceSource: InferenceSource;
  latencyMs: number;
  rawBytes?: number;
  compressedBytes?: number;
  privacyPreserved: boolean;
  timestamp: number;
  note?: string;
}

export interface CompactBeaconPayload {
  sev: Severity;
  cat:
    | 'MEDICAL'
    | 'TRAPPED'
    | 'INFRASTRUCTURE'
    | 'FIRE_HAZARD'
    | 'WATER_FOOD'
    | 'OTHER';
  ppl: number;
  med: string[]; // anonymized medical tags e.g. ["INSULIN", "NON_AMBULATORY"]
  haz: string[]; // hazard tags e.g. ["BRIDGE_OUT", "GAS_LEAK"]
  loc: string; // coarse sector/landmark
  sum: string; // ultra-short PII-free summary (<120 chars)
  ts: number;
}

export interface TriageBeacon {
  id: string;
  originNodeId: string;
  originCallsign: string;
  /** Raw input stays STRICTLY local on the origin node — never sent over mesh or cloud */
  rawInputLocalOnly: string;
  rawBytes: number;
  piiRedactedTypes: string[];
  payload: CompactBeaconPayload;
  beaconBytes: number;
  localSurvivalSteps: string[];
  hops: string[]; // node IDs traversed
  syncedToCloud: boolean;
  syncedAt?: number;
  photoDataUrl?: string; // optional multimodal photo escalated ONLY to cloud
  telemetry: TelemetryRecord;
}

export interface MeshNode {
  id: string;
  callsign: string;
  role: NodeRole;
  /** Normalized map coordinates 0..100 */
  x: number;
  y: number;
  lat: number;
  lng: number;
  online: boolean;
  /** Local P2P radio range in map units (0..100) */
  radioRange: number;
  batteryPct: number;
  sectorLabel: string;
  isLiveMobile?: boolean;
  beaconsHeld: string[];
  directivesReceived: TacticalDirective[];
}

export interface DeduplicatedIncident {
  id: string;
  title: string;
  severity: Severity;
  mergedBeaconIds: string[];
  estimatedPeople: number;
  sector: string;
  actionPlan: string;
  contradictionResolved?: string;
}

export interface TacticalDirective {
  id: string;
  targetNodeId: string;
  targetCallsign: string;
  message: string;
  bytes: number;
  issuedAt: number;
  deliveredViaRelay: boolean;
}

export interface CloudIncidentBrief {
  id: string;
  generatedAt: number;
  beaconsFusedCount: number;
  executiveSummary: string;
  incidents: DeduplicatedIncident[];
  directives: TacticalDirective[];
  telemetry: TelemetryRecord;
}

export interface PacketFlight {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  beaconId: string;
  kind: 'GOSSIP' | 'UPLINK' | 'DIRECTIVE';
  createdAt: number;
}
