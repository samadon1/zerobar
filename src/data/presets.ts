import type { MeshNode } from '../types/mesh';

/**
 * Golden Gate Strait / Marin Headlands / Sausalito / Presidio / SF Bay Ridge
 * Chosen so x: 0..100, y: 0..100 maps cleanly onto the central coastal-mountain
 * corridor around [-122.472, 37.824] at zoom 12.1.
 */
export const MAP_GEO_BOUNDS = {
  minLng: -122.525,
  maxLng: -122.415,
  minLat: 37.795,
  maxLat: 37.85,
} as const;

export function xyToLngLat(x: number, y: number): [number, number] {
  const clampedX = Math.min(100, Math.max(0, x));
  const clampedY = Math.min(100, Math.max(0, y));
  const lng =
    MAP_GEO_BOUNDS.minLng +
    (clampedX / 100) * (MAP_GEO_BOUNDS.maxLng - MAP_GEO_BOUNDS.minLng);
  const lat =
    MAP_GEO_BOUNDS.maxLat -
    (clampedY / 100) * (MAP_GEO_BOUNDS.maxLat - MAP_GEO_BOUNDS.minLat);
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

export function lngLatToXy(
  lng: number,
  lat: number
): { x: number; y: number } {
  const rawX =
    ((lng - MAP_GEO_BOUNDS.minLng) /
      (MAP_GEO_BOUNDS.maxLng - MAP_GEO_BOUNDS.minLng)) *
    100;
  const rawY =
    ((MAP_GEO_BOUNDS.maxLat - lat) /
      (MAP_GEO_BOUNDS.maxLat - MAP_GEO_BOUNDS.minLat)) *
    100;
  return {
    x: Math.min(98, Math.max(2, Number(rawX.toFixed(3)))),
    y: Math.min(96, Math.max(4, Number(rawY.toFixed(3)))),
  };
}

export const INITIAL_MESH_NODES: MeshNode[] = [
  {
    id: 'node-alpha',
    callsign: 'CITIZEN-ALPHA',
    role: 'CITIZEN_OFFLINE',
    x: 27,
    y: 41,
    lng: -122.4953,
    lat: 37.8275,
    online: false,
    radioRange: 25,
    batteryPct: 41,
    sectorLabel: 'Sector 4 — Cedar St Overpass',
    beaconsHeld: [],
    directivesReceived: [],
  },
  {
    id: 'node-bravo',
    callsign: 'CITIZEN-BRAVO',
    role: 'CITIZEN_OFFLINE',
    x: 37,
    y: 23,
    lng: -122.4843,
    lat: 37.8374,
    online: false,
    radioRange: 25,
    batteryPct: 29,
    sectorLabel: 'Sector 4 — Oakview Clinic',
    beaconsHeld: [],
    directivesReceived: [],
  },
  {
    id: 'node-charlie',
    callsign: 'CITIZEN-CHARLIE',
    role: 'CITIZEN_OFFLINE',
    x: 45,
    y: 46,
    lng: -122.4755,
    lat: 37.8247,
    online: false,
    radioRange: 25,
    batteryPct: 63,
    sectorLabel: 'Sector 2 — Harbor Bridge North',
    beaconsHeld: [],
    directivesReceived: [],
  },
  {
    id: 'node-relay',
    callsign: 'RELAY-MULE-01',
    role: 'RELAY_MULE',
    x: 55,
    y: 60,
    lng: -122.4645,
    lat: 37.817,
    online: false, // Toggles online when entering Uplink Ridge (x >= 68)
    radioRange: 25,
    batteryPct: 84,
    sectorLabel: 'Mobile Responder Unit (Drag on Map)',
    beaconsHeld: [],
    directivesReceived: [],
  },
  {
    id: 'node-cmd',
    callsign: 'CLOUD-HQ-GATEWAY',
    role: 'COMMAND_GATEWAY',
    x: 70,
    y: 72,
    lng: -122.448,
    lat: 37.8104,
    online: true,
    radioRange: 24,
    batteryPct: 100,
    sectorLabel: 'Uplink Ridge — Cellular + Cloud Gemini',
    beaconsHeld: [],
    directivesReceived: [],
  },
];

export interface CrisisSamplePrompt {
  id: string;
  label: string;
  nodeId: string;
  rawText: string;
}

export const CRISIS_PRESETS: CrisisSamplePrompt[] = [
  {
    id: 'preset-insulin',
    label: 'Trapped Elderly + Insulin (PII Heavy)',
    nodeId: 'node-alpha',
    rawText:
      'Please help! My name is Eleanor Vance, SSN 441-88-2910, trapped on the 2nd floor of 412 Cedar Street with my husband Robert (age 82, non-ambulatory, Type-1 diabetic, out of insulin in 2 hours). The stairwell collapsed after the quake and we smell gas near the alley. No cell signal at all!',
  },
  {
    id: 'preset-bridge-1',
    label: 'Bridge Collapse Witness A (Spanish/English)',
    nodeId: 'node-charlie',
    rawText:
      'Soy Mateo Ruiz (tel 415-555-0194). Harbor Bridge north ramp cracked completely! At least 4 cars stuck, 2 people with bleeding leg injuries on the shoulder. Do NOT send ambulances from North Ave, concrete debris is blocking all lanes.',
  },
  {
    id: 'preset-bridge-2',
    label: 'Conflicting Report + Clinic Triage',
    nodeId: 'node-bravo',
    rawText:
      'Nurse Priya Patel at Oakview Clinic (Med ID #8821-CA). Backup generator died, 6 patients need oxygen within 90 minutes. Someone just yelled Harbor Bridge is totally impassable—can confirm south approach via Pine St is STILL CLEAR for emergency vans.',
  },
];

export function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
