import React, { useEffect, useRef } from 'react';
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MeshNode, NodeRole, PacketFlight, TriageBeacon } from '../types/mesh';
import { distanceBetween, lngLatToXy, xyToLngLat } from '../data/presets';

interface SwarmMapCanvasProps {
  nodes: MeshNode[];
  beacons: TriageBeacon[];
  flights: PacketFlight[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
}

export const UPLINK_ZONE_X = 68;

const DEFAULT_CENTER: [number, number] = [-122.472, 37.824];
const DEFAULT_ZOOM = 12.1;
const DEFAULT_PITCH = 22;

/**
 * 6-vertex tactical polygon wrapping the Marin Headlands / Sausalito
 * Sector 4 0-Bar Blackout Zone (matches Flatkey's "Port Zone" lime geofence).
 */
const SECTOR_4_GEOFENCE_RING: [number, number][] = [
  [-122.5078, 37.8396], // NW Marin Ridge
  [-122.4882, 37.8424], // NE Sausalito Ridge
  [-122.4774, 37.8314], // Golden Gate North Vista
  [-122.4836, 37.8224], // Lime Point / Cavallo
  [-122.4998, 37.8218], // Hawk Hill / Point Bonita
  [-122.5096, 37.8308], // Rodeo Valley West
  [-122.5078, 37.8396], // Close ring
];

const GEOFENCE_CALLOUT_ANCHOR: [number, number] = [-122.5028, 37.8424];

interface MarkerVisualState {
  role: NodeRole;
  shortName: string;
  subTag: string;
  online: boolean;
  isSelected: boolean;
  heldCritical: boolean;
  beaconCount: number;
  directiveCount: number;
  accentVariant: 'coral' | 'amber' | 'light' | 'lime';
  headingDeg: number;
}

interface ManagedNodeMarker {
  marker: MapLibreMarker;
  rootEl: HTMLDivElement;
  glowEl: HTMLDivElement;
  selectRingEl: HTMLDivElement;
  discEl: HTMLDivElement;
  iconWrapEl: HTMLDivElement;
  badgeEl: HTMLSpanElement;
  dirBadgeEl: HTMLSpanElement;
  labelDotEl: HTMLSpanElement;
  labelNameEl: HTMLSpanElement;
  labelTagEl: HTMLSpanElement;
  labelWrapEl: HTMLDivElement;
  lastStateKey: string;
  lastLngLat: [number, number];
}

interface ManagedCalloutMarker {
  marker: MapLibreMarker;
  wrapperEl: HTMLDivElement;
  callsignEl: HTMLSpanElement;
  batteryWrapEl: HTMLSpanElement;
  batteryTextEl: HTMLSpanElement;
  radioEl: HTMLSpanElement;
  pktsEl: HTMLSpanElement;
  modeLabelEl: HTMLSpanElement;
  lastStateKey: string;
  lastLngLat: [number, number];
  lastOffsetY: number;
}

interface ActiveP2PLink {
  from: [number, number];
  to: [number, number];
  speed: number;
  phaseOffset: number;
  uplink: boolean;
}

/**
 * Centripetal Catmull-Rom spline segment (alpha = 0.5) guarantees C1 smoothness
 * with zero cusps, loops, or V-spike overshoots even across uneven node spacing.
 */
function catmullRomSegment(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  steps = 14,
  alpha = 0.5
): [number, number][] {
  const dist = (a: [number, number], b: [number, number]): number => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  };
  const eps = 1e-9;
  const t0 = 0;
  const t1 = t0 + Math.pow(Math.max(dist(p0, p1), eps), alpha);
  const t2 = t1 + Math.pow(Math.max(dist(p1, p2), eps), alpha);
  const t3 = t2 + Math.pow(Math.max(dist(p2, p3), eps), alpha);

  const out: [number, number][] = [];
  for (let s = 0; s <= steps; s++) {
    const t = t1 + ((t2 - t1) * s) / steps;
    const lerpPt = (
      a: [number, number],
      b: [number, number],
      ta: number,
      tb: number
    ): [number, number] => {
      const denom = tb - ta;
      if (Math.abs(denom) < eps) return a;
      const w = (t - ta) / denom;
      return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
    };
    const a1 = lerpPt(p0, p1, t0, t1);
    const a2 = lerpPt(p1, p2, t1, t2);
    const a3 = lerpPt(p2, p3, t2, t3);
    const b1 = lerpPt(a1, a2, t0, t2);
    const b2 = lerpPt(a2, a3, t1, t3);
    out.push(lerpPt(b1, b2, t1, t2));
  }
  return out;
}

/**
 * Generates a single C1-continuous centripetal Catmull-Rom spline through
 * ALPHA -> BRAVO -> CHARLIE -> RELAY-01 -> CLOUD-HQ, split cleanly at RELAY-01
 * into solid (behind/to relay) and dashed (relay to gateway) segments.
 */
function buildRouteSplines(
  solidWaypoints: [number, number][],
  cmdCoord: [number, number],
  stepsPerSegment = 14
): { solidCoords: [number, number][]; dashedCoords: [number, number][] } {
  const allPoints: [number, number][] = [...solidWaypoints, cmdCoord];
  const n = allPoints.length;
  if (n < 2) {
    return { solidCoords: solidWaypoints, dashedCoords: [cmdCoord] };
  }

  const relayIdx = solidWaypoints.length - 1;
  const solidCoords: [number, number][] = [];
  const dashedCoords: [number, number][] = [];

  for (let i = 0; i < n - 1; i++) {
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];
    const p0: [number, number] =
      i > 0 ? allPoints[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3: [number, number] =
      i + 2 < n ? allPoints[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];

    const seg = catmullRomSegment(p0, p1, p2, p3, stepsPerSegment);
    if (i < relayIdx) {
      if (solidCoords.length === 0) {
        solidCoords.push(...seg);
      } else {
        solidCoords.push(...seg.slice(1));
      }
    } else {
      if (dashedCoords.length === 0) {
        dashedCoords.push(...seg);
      } else {
        dashedCoords.push(...seg.slice(1));
      }
    }
  }

  return { solidCoords, dashedCoords };
}

function getNodeFlowRank(node: MeshNode): number {
  if (node.role === 'COMMAND_GATEWAY') return 4;
  if (node.role === 'RELAY_MULE') return 3;
  if (node.id === 'node-charlie') return 2;
  if (node.id === 'node-bravo') return 1;
  return 0;
}

function getNodeShortPlate(node: MeshNode): { shortName: string; subTag: string } {
  if (node.role === 'RELAY_MULE') {
    return {
      shortName: node.callsign.replace('RELAY-MULE-', 'RELAY-'),
      subTag: node.online ? 'UPLINK' : 'MULE',
    };
  }
  if (node.role === 'COMMAND_GATEWAY') {
    return {
      shortName: node.callsign === 'CLOUD-HQ-GATEWAY' ? 'CLOUD-HQ' : node.callsign,
      subTag: 'GATEWAY',
    };
  }
  return {
    shortName: node.callsign.replace(/^CITIZEN-/, ''),
    subTag: node.online ? '1-BAR' : '0-BAR',
  };
}

function createGeofenceTooltipElement(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col items-center pointer-events-none select-none';
  wrapper.style.zIndex = '5';
  wrapper.innerHTML = `
    <div style="
      background: rgba(20, 22, 25, 0.86);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 16px;
      padding: 10px 14px;
      min-width: 184px;
      box-shadow: 0 16px 38px rgba(0, 0, 0, 0.55);
    ">
      <div style="font-size: 11px; line-height: 1.2; color: #8A919E; font-weight: 400; letter-spacing: 0.01em;">
        Geofence
      </div>
      <div style="margin-top: 4px; display: flex; align-items: baseline; justify-content: space-between; gap: 14px;">
        <span style="font-size: 14px; line-height: 1.25; color: #F3F4F6; font-weight: 500; letter-spacing: -0.01em;">
          Sector 4 Blackout
        </span>
        <span style="font-size: 11px; line-height: 1.2; color: #8A919E; font-weight: 500;">
          0-Bar
        </span>
      </div>
    </div>
    <div style="width: 1px; height: 10px; background: linear-gradient(180deg, rgba(183,232,82,0.55), rgba(183,232,82,0.12));"></div>
  `;
  return wrapper;
}

function getNodeHybridStatusLabel(role: NodeRole): string {
  if (role === 'RELAY_MULE') return 'WebRTC DataMule';
  if (role === 'COMMAND_GATEWAY') return 'ONLY_IN_CLOUD Gemini';
  return 'ONLY_ON_DEVICE Vault';
}

function createSelectedCalloutDOM(): Omit<
  ManagedCalloutMarker,
  'marker' | 'lastStateKey' | 'lastLngLat' | 'lastOffsetY'
> {
  // Outer element owned by MapLibre (do NOT apply CSS transform on wrapperEl)
  const wrapperEl = document.createElement('div');
  wrapperEl.className = 'flex flex-col items-center pointer-events-none select-none';
  wrapperEl.style.zIndex = '80';

  const cardEl = document.createElement('div');
  cardEl.className =
    'bg-[#141619]/96 backdrop-blur-xl border border-white/15 rounded-xl px-3 py-2 shadow-[0_18px_42px_rgba(0,0,0,0.72)] min-w-[202px]';
  cardEl.style.backdropFilter = 'blur(20px)';
  (cardEl.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
    'blur(20px)';

  // Row 1: Callsign + Battery %
  const topRowEl = document.createElement('div');
  topRowEl.className = 'flex items-center justify-between gap-3';

  const callsignEl = document.createElement('span');
  callsignEl.className =
    'text-[11.5px] font-semibold tracking-tight text-[#F3F4F6] whitespace-nowrap';

  const batteryWrapEl = document.createElement('span');
  batteryWrapEl.className =
    'inline-flex items-center gap-1 text-[10.5px] font-medium tabular-nums shrink-0';
  batteryWrapEl.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="7" width="17" height="10" rx="2.2" stroke="currentColor" stroke-width="1.9"/>
      <path d="M21 10.5V13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <rect x="4.5" y="9.5" width="10" height="5" rx="1" fill="currentColor" fill-opacity="0.75"/>
    </svg>
  `;

  const batteryTextEl = document.createElement('span');
  batteryWrapEl.appendChild(batteryTextEl);

  topRowEl.appendChild(callsignEl);
  topRowEl.appendChild(batteryWrapEl);

  // Row 2: Radio status (0-Bar Mesh vs 1-Bar Cloud Uplink) + held packets (3 <305B pkts)
  const midRowEl = document.createElement('div');
  midRowEl.className =
    'mt-1 flex items-center justify-between gap-2 text-[10.5px] leading-tight';

  const radioEl = document.createElement('span');
  radioEl.className = 'font-medium whitespace-nowrap';

  const dotSepEl = document.createElement('span');
  dotSepEl.className = 'text-white/25';
  dotSepEl.textContent = '·';

  const pktsEl = document.createElement('span');
  pktsEl.className = 'font-medium text-[#D1D5DB] tabular-nums whitespace-nowrap';

  midRowEl.appendChild(radioEl);
  midRowEl.appendChild(dotSepEl);
  midRowEl.appendChild(pktsEl);

  // Row 3: Subtle #B7E852 status dot + hybrid role tag
  const botRowEl = document.createElement('div');
  botRowEl.className =
    'mt-1.5 pt-1.5 border-t border-white/[0.08] flex items-center gap-1.5';

  const statusDotEl = document.createElement('span');
  statusDotEl.className =
    'w-1.5 h-1.5 rounded-full bg-[#B7E852] shadow-[0_0_7px_rgba(183,232,82,0.75)] shrink-0';

  const modeLabelEl = document.createElement('span');
  modeLabelEl.className =
    'text-[10px] font-medium tracking-[0.01em] text-[#D1D5DB] whitespace-nowrap';

  botRowEl.appendChild(statusDotEl);
  botRowEl.appendChild(modeLabelEl);

  cardEl.appendChild(topRowEl);
  cardEl.appendChild(midRowEl);
  cardEl.appendChild(botRowEl);

  // Crisp 10px hairline anchor stem giving clean vertical clearance above selected & adjacent pucks
  const stemEl = document.createElement('div');
  stemEl.style.width = '1px';
  stemEl.style.height = '10px';
  stemEl.style.background =
    'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(183,232,82,0.65))';

  wrapperEl.appendChild(cardEl);
  wrapperEl.appendChild(stemEl);

  return {
    wrapperEl,
    callsignEl,
    batteryWrapEl,
    batteryTextEl,
    radioEl,
    pktsEl,
    modeLabelEl,
  };
}

function applySelectedCalloutState(
  entry: ManagedCalloutMarker,
  node: MeshNode
): void {
  const batteryRounded = Math.round(node.batteryPct);
  const pktCount = node.beaconsHeld.length;
  const stateKey = [
    node.id,
    node.callsign,
    node.role,
    batteryRounded,
    node.online ? 1 : 0,
    pktCount,
  ].join('|');

  if (entry.lastStateKey === stateKey) return;
  entry.lastStateKey = stateKey;

  entry.callsignEl.textContent = node.callsign;
  entry.batteryTextEl.textContent = `${batteryRounded}%`;
  entry.batteryWrapEl.style.color =
    batteryRounded <= 30
      ? '#F2B84B'
      : batteryRounded >= 80
      ? '#B7E852'
      : '#D1D5DB';

  entry.radioEl.textContent = node.online ? '1-Bar Cloud Uplink' : '0-Bar Mesh';
  entry.radioEl.style.color = node.online ? '#B7E852' : '#9CA3AF';

  entry.pktsEl.textContent = `${pktCount} <305B pkts`;
  entry.modeLabelEl.textContent = getNodeHybridStatusLabel(node.role);
}

function createNodeMarkerDOM(
  node: MeshNode,
  onClick: () => void
): Omit<ManagedNodeMarker, 'marker' | 'lastStateKey' | 'lastLngLat'> {
  const isDraggable = node.role === 'RELAY_MULE' || node.role === 'CITIZEN_OFFLINE';

  // Outer element owned by MapLibre (do NOT apply CSS transform on rootEl itself)
  const rootEl = document.createElement('div');
  rootEl.className = `group flex flex-col items-center select-none ${
    isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
  }`;
  rootEl.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  const stageSize =
    node.role === 'RELAY_MULE'
      ? 'w-[58px] h-[58px]'
      : node.role === 'COMMAND_GATEWAY'
      ? 'w-[44px] h-[44px]'
      : 'w-[42px] h-[42px]';

  const stageEl = document.createElement('div');
  stageEl.className = `relative ${stageSize} flex items-center justify-center`;

  const glowEl = document.createElement('div');
  glowEl.className = 'absolute inset-0 rounded-full pointer-events-none transition-opacity duration-300';

  const selectRingEl = document.createElement('div');
  selectRingEl.className =
    'absolute rounded-full pointer-events-none transition-all duration-200 opacity-0';

  const discEl = document.createElement('div');
  discEl.className =
    'relative rounded-full flex items-center justify-center transition-transform duration-150 group-hover:scale-105';

  const iconWrapEl = document.createElement('div');
  iconWrapEl.className = 'flex items-center justify-center pointer-events-none';
  discEl.appendChild(iconWrapEl);

  const badgeEl = document.createElement('span');
  badgeEl.className =
    'hidden absolute -top-0.5 -right-1 px-1.5 py-[1px] rounded-full text-[9.5px] font-semibold leading-tight shadow-md pointer-events-none';

  const dirBadgeEl = document.createElement('span');
  dirBadgeEl.className =
    'hidden absolute -top-0.5 -left-2 px-1.5 py-[1px] rounded-full bg-[#141619]/95 border border-[#B7E852]/55 text-[#B7E852] text-[8.5px] font-semibold leading-tight shadow pointer-events-none';
  dirBadgeEl.textContent = 'ACK';

  stageEl.appendChild(glowEl);
  stageEl.appendChild(selectRingEl);
  stageEl.appendChild(discEl);
  stageEl.appendChild(badgeEl);
  stageEl.appendChild(dirBadgeEl);

  const labelWrapEl = document.createElement('div');
  labelWrapEl.className =
    'mt-0.5 px-2 py-[2px] rounded-full bg-[#141619]/86 backdrop-blur-md border border-white/[0.08] shadow-[0_6px_16px_rgba(0,0,0,0.45)] flex items-center gap-1.5 pointer-events-none transition-colors duration-150';

  const labelDotEl = document.createElement('span');
  labelDotEl.className = 'w-1.5 h-1.5 rounded-full shrink-0';

  const labelNameEl = document.createElement('span');
  labelNameEl.className = 'text-[10.5px] font-medium text-[#F3F4F6] tracking-tight whitespace-nowrap';

  const labelTagEl = document.createElement('span');
  labelTagEl.className = 'text-[9.5px] font-medium text-[#8A919E] whitespace-nowrap';

  labelWrapEl.appendChild(labelDotEl);
  labelWrapEl.appendChild(labelNameEl);
  labelWrapEl.appendChild(labelTagEl);

  rootEl.appendChild(stageEl);
  rootEl.appendChild(labelWrapEl);

  return {
    rootEl,
    glowEl,
    selectRingEl,
    discEl,
    iconWrapEl,
    badgeEl,
    dirBadgeEl,
    labelDotEl,
    labelNameEl,
    labelTagEl,
    labelWrapEl,
  };
}

function applyMarkerVisualState(entry: ManagedNodeMarker, s: MarkerVisualState): void {
  const quantizedHeading = Math.round(s.headingDeg / 4) * 4;
  const stateKey = [
    s.role,
    s.shortName,
    s.subTag,
    s.online ? 1 : 0,
    s.isSelected ? 1 : 0,
    s.heldCritical ? 1 : 0,
    s.beaconCount,
    s.directiveCount,
    s.accentVariant,
    s.role === 'RELAY_MULE' ? quantizedHeading : 0,
  ].join('|');

  if (entry.lastStateKey === stateKey) return;
  entry.lastStateKey = stateKey;

  entry.labelNameEl.textContent = s.shortName;
  entry.labelTagEl.textContent = s.subTag;

  if (s.role === 'RELAY_MULE') {
    // Soft 58px radial #B7E852 glow + crisp 34px #B7E852 circle with dark navigation arrow SVG
    entry.glowEl.style.background = s.online
      ? 'radial-gradient(circle, rgba(183,232,82,0.44) 0%, rgba(183,232,82,0.18) 48%, rgba(183,232,82,0) 75%)'
      : 'radial-gradient(circle, rgba(183,232,82,0.28) 0%, rgba(183,232,82,0.11) 48%, rgba(183,232,82,0) 74%)';

    entry.selectRingEl.style.inset = '7px';
    entry.selectRingEl.style.border = '1.5px solid rgba(255,255,255,0.75)';
    entry.selectRingEl.style.opacity = s.isSelected ? '1' : '0';

    entry.discEl.style.width = '34px';
    entry.discEl.style.height = '34px';
    entry.discEl.style.background = '#B7E852';
    entry.discEl.style.border = '1.5px solid rgba(255,255,255,0.42)';
    entry.discEl.style.boxShadow =
      '0 6px 20px rgba(183, 232, 82, 0.42), 0 2px 6px rgba(0, 0, 0, 0.45)';

    entry.iconWrapEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="transform: rotate(${quantizedHeading}deg); transition: transform 140ms linear;">
        <path d="M12 2.5L19.2 20.2L12 16.6L4.8 20.2L12 2.5Z" fill="#111417" stroke="#111417" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
    `;

    entry.labelDotEl.style.backgroundColor = '#B7E852';
    entry.labelTagEl.style.color = s.online ? '#B7E852' : '#9CA3AF';
  } else if (s.role === 'COMMAND_GATEWAY') {
    // Clean #B7E852 / dark frosted 30px gateway ring on east Uplink Ridge
    entry.glowEl.style.background =
      'radial-gradient(circle, rgba(183,232,82,0.24) 0%, rgba(183,232,82,0.06) 54%, rgba(183,232,82,0) 76%)';

    entry.selectRingEl.style.inset = '3px';
    entry.selectRingEl.style.border = '1.5px solid rgba(255,255,255,0.75)';
    entry.selectRingEl.style.opacity = s.isSelected ? '1' : '0';

    entry.discEl.style.width = '30px';
    entry.discEl.style.height = '30px';
    entry.discEl.style.background = 'rgba(20, 22, 25, 0.92)';
    entry.discEl.style.border = '2px solid #B7E852';
    entry.discEl.style.boxShadow =
      '0 6px 20px rgba(0, 0, 0, 0.55), 0 0 16px rgba(183, 232, 82, 0.25)';

    entry.iconWrapEl.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3.2" fill="#B7E852"/>
        <path d="M7.2 16.8a6.8 6.8 0 0 1 0-9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" stroke="#B7E852" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;

    entry.labelDotEl.style.backgroundColor = '#B7E852';
    entry.labelTagEl.style.color = '#B7E852';
  } else {
    // CITIZEN_OFFLINE: 28px circular puck (#E85D4A coral if critical, #F2B84B amber or #E5E7EB)
    const bg =
      s.accentVariant === 'coral'
        ? '#E85D4A'
        : s.accentVariant === 'amber'
        ? '#F2B84B'
        : '#E5E7EB';
    const fg = s.accentVariant === 'coral' ? '#FFFFFF' : '#121519';
    const halo =
      s.accentVariant === 'coral'
        ? 'radial-gradient(circle, rgba(232,93,74,0.34) 0%, rgba(232,93,74,0.10) 52%, rgba(232,93,74,0) 76%)'
        : s.accentVariant === 'amber'
        ? 'radial-gradient(circle, rgba(242,184,75,0.28) 0%, rgba(242,184,75,0.08) 52%, rgba(242,184,75,0) 76%)'
        : 'radial-gradient(circle, rgba(229,231,235,0.22) 0%, rgba(229,231,235,0.06) 52%, rgba(229,231,235,0) 76%)';

    entry.glowEl.style.background = halo;

    entry.selectRingEl.style.inset = '3px';
    entry.selectRingEl.style.border = s.isSelected
      ? '1.5px solid rgba(255,255,255,0.88)'
      : '1px solid rgba(255,255,255,0.18)';
    entry.selectRingEl.style.opacity = '1';

    entry.discEl.style.width = '28px';
    entry.discEl.style.height = '28px';
    entry.discEl.style.background = bg;
    entry.discEl.style.border =
      s.accentVariant === 'coral'
        ? '1.5px solid rgba(255,255,255,0.32)'
        : '1.5px solid rgba(20,22,25,0.28)';
    entry.discEl.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.48)';

    if (s.accentVariant === 'coral') {
      // Crisp white flag icon inside coral puck (matches Flatkey coral flag puck)
      entry.iconWrapEl.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M5 21V4M5 4H14.5L13.2 8.5L16.5 13H5" stroke="${fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    } else {
      // Crisp target/pulse ring icon inside amber/light puck (matches Flatkey route waypoint puck)
      entry.iconWrapEl.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="6.5" stroke="${fg}" stroke-width="2.2"/>
          <circle cx="12" cy="12" r="2.2" fill="${fg}"/>
        </svg>
      `;
    }

    entry.labelDotEl.style.backgroundColor = bg;
    entry.labelTagEl.style.color = s.online ? '#B7E852' : '#8A919E';
  }

  entry.rootEl.style.zIndex = s.isSelected
    ? '20'
    : s.role === 'RELAY_MULE'
    ? '12'
    : '8';

  entry.labelWrapEl.style.borderColor = s.isSelected
    ? 'rgba(255, 255, 255, 0.28)'
    : 'rgba(255, 255, 255, 0.08)';

  if (s.beaconCount > 0) {
    entry.badgeEl.classList.remove('hidden');
    entry.badgeEl.textContent = `${s.beaconCount}`;
    if (s.role === 'RELAY_MULE') {
      entry.badgeEl.style.background = '#141619';
      entry.badgeEl.style.color = '#B7E852';
      entry.badgeEl.style.border = '1px solid rgba(183,232,82,0.65)';
    } else {
      entry.badgeEl.style.background = '#141619';
      entry.badgeEl.style.color = '#F3F4F6';
      entry.badgeEl.style.border = '1px solid rgba(255,255,255,0.28)';
    }
  } else {
    entry.badgeEl.classList.add('hidden');
  }

  if (s.directiveCount > 0 && s.role === 'CITIZEN_OFFLINE') {
    entry.dirBadgeEl.classList.remove('hidden');
  } else {
    entry.dirBadgeEl.classList.add('hidden');
  }
}

export const SwarmMapCanvas: React.FC<SwarmMapCanvasProps> = ({
  nodes,
  beacons,
  flights,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleLoadedRef = useRef<boolean>(false);
  const markersRef = useRef<Map<string, ManagedNodeMarker>>(new Map());
  const selectedCalloutRef = useRef<ManagedCalloutMarker | null>(null);
  const prevSelectedNodeIdRef = useRef<string>(selectedNodeId);
  const draggingNodeIdRef = useRef<string | null>(null);
  const relayHeadingRef = useRef<number>(124);
  const activeLinksRef = useRef<ActiveP2PLink[]>([]);
  const pulseRafRef = useRef<number | null>(null);

  // Keep latest callbacks & props in refs so MapLibre event listeners never go stale
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;

  const latestPropsRef = useRef({ nodes, beacons, flights, selectedNodeId });
  latestPropsRef.current = { nodes, beacons, flights, selectedNodeId };

  const syncSceneToMap = () => {
    const map = mapRef.current;
    if (!map) return;

    const {
      nodes: curNodes,
      beacons: curBeacons,
      flights: curFlights,
      selectedNodeId: curSelectedId,
    } = latestPropsRef.current;

    // 1. Update or create spatial puck markers at 60fps via marker.setLngLat(...)
    const seenIds = new Set<string>();
    for (const node of curNodes) {
      seenIds.add(node.id);
      const [lng, lat] = xyToLngLat(node.x, node.y);

      let entry = markersRef.current.get(node.id);
      if (!entry) {
        const isDraggable =
          node.role === 'RELAY_MULE' || node.role === 'CITIZEN_OFFLINE';
        const dom = createNodeMarkerDOM(node, () => {
          onSelectNodeRef.current(node.id);
        });

        const marker = new MapLibreMarker({
          element: dom.rootEl,
          draggable: isDraggable,
          anchor: 'center',
        })
          .setLngLat([lng, lat])
          .addTo(map);

        if (isDraggable) {
          marker.on('dragstart', () => {
            draggingNodeIdRef.current = node.id;
            onSelectNodeRef.current(node.id);
          });
          marker.on('drag', () => {
            const pos = marker.getLngLat();
            const xy = lngLatToXy(pos.lng, pos.lat);
            if (
              selectedCalloutRef.current &&
              latestPropsRef.current.selectedNodeId === node.id
            ) {
              selectedCalloutRef.current.marker.setLngLat([pos.lng, pos.lat]);
              selectedCalloutRef.current.lastLngLat = [pos.lng, pos.lat];
            }
            onMoveNodeRef.current(node.id, xy.x, xy.y);
          });
          marker.on('dragend', () => {
            const pos = marker.getLngLat();
            const xy = lngLatToXy(pos.lng, pos.lat);
            draggingNodeIdRef.current = null;
            onMoveNodeRef.current(node.id, xy.x, xy.y);
          });
        }

        entry = {
          ...dom,
          marker,
          lastStateKey: '',
          lastLngLat: [lng, lat],
        };
        markersRef.current.set(node.id, entry);
      } else {
        // Compute smooth heading if Relay Mule moved
        if (node.role === 'RELAY_MULE') {
          const dLng = lng - entry.lastLngLat[0];
          const dLat = lat - entry.lastLngLat[1];
          if (Math.abs(dLng) + Math.abs(dLat) > 0.00018) {
            const rad = Math.atan2(dLng * Math.cos((lat * Math.PI) / 180), dLat);
            relayHeadingRef.current = (rad * 180) / Math.PI;
            entry.lastLngLat = [lng, lat];
          }
        }
        if (draggingNodeIdRef.current !== node.id) {
          entry.marker.setLngLat([lng, lat]);
        }
      }

      const heldCritical = node.beaconsHeld.some((bid) => {
        const b = curBeacons.find((item) => item.id === bid);
        return b?.payload.sev === 'CRITICAL';
      });

      const accentVariant: MarkerVisualState['accentVariant'] =
        node.role === 'RELAY_MULE' || node.role === 'COMMAND_GATEWAY'
          ? 'lime'
          : heldCritical
          ? 'coral'
          : node.beaconsHeld.length > 0 || node.id === 'node-charlie'
          ? 'amber'
          : 'light';

      const { shortName, subTag } = getNodeShortPlate(node);

      applyMarkerVisualState(entry, {
        role: node.role,
        shortName,
        subTag,
        online: node.online,
        isSelected: node.id === curSelectedId,
        heldCritical,
        beaconCount: node.beaconsHeld.length,
        directiveCount: node.directivesReceived.length,
        accentVariant,
        headingDeg: relayHeadingRef.current,
      });
    }

    // Prune any removed markers
    for (const [id, entry] of markersRef.current.entries()) {
      if (!seenIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Sync floating glass spatial callout above whichever selectedNodeId is active
    const activeNode =
      curNodes.find((n) => n.id === curSelectedId) ?? curNodes[0] ?? null;
    const calloutEntry = selectedCalloutRef.current;
    if (calloutEntry) {
      if (!activeNode) {
        calloutEntry.wrapperEl.style.display = 'none';
      } else {
        calloutEntry.wrapperEl.style.display = 'flex';
        const activeMarkerEntry = markersRef.current.get(activeNode.id);
        const targetLngLat: [number, number] =
          draggingNodeIdRef.current === activeNode.id && activeMarkerEntry
            ? [
                activeMarkerEntry.marker.getLngLat().lng,
                activeMarkerEntry.marker.getLngLat().lat,
              ]
            : xyToLngLat(activeNode.x, activeNode.y);

        if (
          calloutEntry.lastLngLat[0] !== targetLngLat[0] ||
          calloutEntry.lastLngLat[1] !== targetLngLat[1]
        ) {
          calloutEntry.marker.setLngLat(targetLngLat);
          calloutEntry.lastLngLat = targetLngLat;
        }
        const targetOffsetY = activeNode.role === 'RELAY_MULE' ? -44 : -38;
        if (calloutEntry.lastOffsetY !== targetOffsetY) {
          calloutEntry.marker.setOffset([0, targetOffsetY]);
          calloutEntry.lastOffsetY = targetOffsetY;
        }

        applySelectedCalloutState(calloutEntry, activeNode);
      }
    }

    // 2. Update WebGL GeoJSON vector layers (routes, P2P mesh links, active packet flights)
    if (!styleLoadedRef.current) return;

    const alpha = curNodes.find((n) => n.id === 'node-alpha');
    const bravo = curNodes.find((n) => n.id === 'node-bravo');
    const charlie = curNodes.find((n) => n.id === 'node-charlie');
    const relay = curNodes.find((n) => n.role === 'RELAY_MULE');
    const cmd = curNodes.find((n) => n.role === 'COMMAND_GATEWAY');

    if (relay && cmd) {
      const relayCoord = xyToLngLat(relay.x, relay.y);
      const cmdCoord = xyToLngLat(cmd.x, cmd.y);

      const solidWaypoints: [number, number][] = [];
      if (alpha) solidWaypoints.push(xyToLngLat(alpha.x, alpha.y));
      if (bravo) solidWaypoints.push(xyToLngLat(bravo.x, bravo.y));
      if (charlie) solidWaypoints.push(xyToLngLat(charlie.x, charlie.y));
      solidWaypoints.push(relayCoord);

      const { solidCoords, dashedCoords } = buildRouteSplines(
        solidWaypoints,
        cmdCoord,
        14
      );

      const routeSolidSrc = map.getSource('route-solid-source') as
        | GeoJSONSource
        | undefined;
      routeSolidSrc?.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: solidCoords,
        },
      });

      const routeDashedSrc = map.getSource('route-dashed-source') as
        | GeoJSONSource
        | undefined;
      routeDashedSrc?.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: dashedCoords,
        },
      });
    }

    // Active P2P radio range links in #B7E852 lime + directed links for live signal pulses
    const linkFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const nextActiveLinks: ActiveP2PLink[] = [];
    let linkIdx = 0;
    for (let i = 0; i < curNodes.length; i++) {
      for (let j = i + 1; j < curNodes.length; j++) {
        const a = curNodes[i];
        const b = curNodes[j];
        if (distanceBetween(a, b) <= Math.max(a.radioRange, b.radioRange)) {
          const isUplink = a.online || b.online;
          const aCoord = xyToLngLat(a.x, a.y);
          const bCoord = xyToLngLat(b.x, b.y);
          linkFeatures.push({
            type: 'Feature',
            properties: {
              uplink: isUplink ? 1 : 0,
            },
            geometry: {
              type: 'LineString',
              coordinates: [aCoord, bCoord],
            },
          });

          // Orient pulse flow toward relay/gateway (ALPHA -> BRAVO -> CHARLIE -> RELAY-01 -> CLOUD-HQ)
          const aRank = getNodeFlowRank(a);
          const bRank = getNodeFlowRank(b);
          const [from, to] = aRank <= bRank ? [aCoord, bCoord] : [bCoord, aCoord];
          nextActiveLinks.push({
            from,
            to,
            speed: isUplink ? 0.48 : 0.36,
            phaseOffset: (linkIdx * 0.27) % 1,
            uplink: isUplink,
          });
          linkIdx += 1;
        }
      }
    }
    activeLinksRef.current = nextActiveLinks;

    const p2pSrc = map.getSource('p2p-links-source') as
      | GeoJSONSource
      | undefined;
    p2pSrc?.setData({
      type: 'FeatureCollection',
      features: linkFeatures,
    });

    // Active packet flight bursts
    const flightFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const f of curFlights) {
      const from = curNodes.find((n) => n.id === f.fromNodeId);
      const to = curNodes.find((n) => n.id === f.toNodeId);
      if (!from || !to) continue;
      flightFeatures.push({
        type: 'Feature',
        properties: {
          color:
            f.kind === 'UPLINK'
              ? '#B7E852'
              : f.kind === 'DIRECTIVE'
              ? '#FFFFFF'
              : '#F2B84B',
        },
        geometry: {
          type: 'LineString',
          coordinates: [xyToLngLat(from.x, from.y), xyToLngLat(to.x, to.y)],
        },
      });
    }

    const flightsSrc = map.getSource('flights-source') as
      | GeoJSONSource
      | undefined;
    flightsSrc?.setData({
      type: 'FeatureCollection',
      features: flightFeatures,
    });
  };

  // Initialize full-bleed MapLibre GL JS dark satellite coastal-mountain map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: 0,
      attributionControl: false,
      dragRotate: false,
      style: {
        version: 8,
        sources: {
          'esri-sat': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            maxzoom: 18,
          },
        },
        layers: [
          {
            id: 'zb-void-bg',
            type: 'background',
            paint: {
              'background-color': '#0D1013',
            },
          },
          {
            id: 'esri-sat-layer',
            type: 'raster',
            source: 'esri-sat',
            paint: {
              'raster-brightness-max': 0.48,
              'raster-brightness-min': 0.03,
              'raster-contrast': 0.32,
              'raster-saturation': -0.58,
              'raster-fade-duration': 200,
            },
          },
        ],
      },
    });

    mapRef.current = map;

    // Anchored frosted glass Geofence callout card (matches Flatkey "Port Zone" card)
    const geofenceTooltipMarker = new MapLibreMarker({
      element: createGeofenceTooltipElement(),
      anchor: 'bottom',
      offset: [0, -6],
    })
      .setLngLat(GEOFENCE_CALLOUT_ANCHOR)
      .addTo(map);

    // Floating glass spatial callout attached above whichever selectedNodeId is active
    const calloutDom = createSelectedCalloutDOM();
    const selectedCalloutMarker = new MapLibreMarker({
      element: calloutDom.wrapperEl,
      anchor: 'bottom',
      offset: [0, -38],
    })
      .setLngLat(DEFAULT_CENTER)
      .addTo(map);

    selectedCalloutRef.current = {
      ...calloutDom,
      marker: selectedCalloutMarker,
      lastStateKey: '',
      lastLngLat: [DEFAULT_CENTER[0], DEFAULT_CENTER[1]],
      lastOffsetY: -38,
    };

    map.on('load', () => {
      // 1. Sector 4 Blackout Lime Geofence Polygon (#B7E852)
      map.addSource('geofence-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [SECTOR_4_GEOFENCE_RING],
          },
        },
      });

      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: 'geofence-source',
        paint: {
          'fill-color': '#B7E852',
          'fill-opacity': 0.14,
        },
      });

      map.addLayer({
        id: 'geofence-line',
        type: 'line',
        source: 'geofence-source',
        paint: {
          'line-color': '#B7E852',
          'line-width': 1.8,
          'line-dasharray': [3, 2],
        },
      });

      // Tiny crisp lime vertex dots matching Flatkey's geofence corners
      map.addSource('geofence-vertices-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiPoint',
            coordinates: SECTOR_4_GEOFENCE_RING.slice(0, -1),
          },
        },
      });

      map.addLayer({
        id: 'geofence-vertices',
        type: 'circle',
        source: 'geofence-vertices-source',
        paint: {
          'circle-radius': 3,
          'circle-color': '#B7E852',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#121518',
        },
      });

      // Subtle Uplink Ridge threshold line at UPLINK_ZONE_X = 76%
      const [uplinkLng] = xyToLngLat(UPLINK_ZONE_X, 50);
      map.addSource('uplink-threshold-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [uplinkLng, 37.855],
              [uplinkLng, 37.79],
            ],
          },
        },
      });

      map.addLayer({
        id: 'uplink-threshold-line',
        type: 'line',
        source: 'uplink-threshold-source',
        paint: {
          'line-color': '#B7E852',
          'line-opacity': 0.16,
          'line-width': 1,
          'line-dasharray': [4, 4],
        },
      });

      // 2. Subtle #B7E852 P2P in-range mesh edges
      map.addSource('p2p-links-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'p2p-links-glow',
        type: 'line',
        source: 'p2p-links-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#B7E852',
          'line-width': 5,
          'line-opacity': 0.14,
          'line-blur': 2,
        },
      });

      map.addLayer({
        id: 'p2p-links-line',
        type: 'line',
        source: 'p2p-links-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#B7E852',
          'line-width': 1.5,
          'line-opacity': 0.62,
          'line-dasharray': [2, 2],
        },
      });

      // 3. Crisp White Vector Route (#FFFFFF solid behind Relay + dashed ahead to Uplink Ridge)
      map.addSource('route-solid-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });

      map.addLayer({
        id: 'route-solid-casing',
        type: 'line',
        source: 'route-solid-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0B0E11',
          'line-width': 5,
          'line-opacity': 0.55,
        },
      });

      map.addLayer({
        id: 'route-solid-line',
        type: 'line',
        source: 'route-solid-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 2.5,
          'line-opacity': 0.94,
        },
      });

      map.addSource('route-dashed-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });

      map.addLayer({
        id: 'route-dashed-casing',
        type: 'line',
        source: 'route-dashed-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0B0E11',
          'line-width': 4,
          'line-opacity': 0.45,
        },
      });

      map.addLayer({
        id: 'route-dashed-line',
        type: 'line',
        source: 'route-dashed-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 2,
          'line-opacity': 0.76,
          'line-dasharray': [2.5, 2.5],
        },
      });

      // 4. Active Packet Flight Bursts
      map.addSource('flights-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'flights-glow',
        type: 'line',
        source: 'flights-source',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 7,
          'line-opacity': 0.34,
          'line-blur': 3,
        },
      });

      map.addLayer({
        id: 'flights-core',
        type: 'line',
        source: 'flights-source',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 2.2,
          'line-opacity': 0.95,
        },
      });

      // 5. Live 60fps Animated P2P Signal Pulses (#B7E852 outer halo + #FFFFFF core)
      map.addSource('signal-pulses-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'signal-pulses-halo',
        type: 'circle',
        source: 'signal-pulses-source',
        paint: {
          'circle-radius': ['get', 'haloRadius'],
          'circle-color': '#B7E852',
          'circle-opacity': ['get', 'haloOpacity'],
          'circle-blur': 0.85,
        },
      });

      map.addLayer({
        id: 'signal-pulses-core',
        type: 'circle',
        source: 'signal-pulses-source',
        paint: {
          'circle-radius': ['get', 'coreRadius'],
          'circle-color': '#FFFFFF',
          'circle-opacity': ['get', 'coreOpacity'],
        },
      });

      styleLoadedRef.current = true;
      syncSceneToMap();

      // Start lightweight 60fps WebGL pulse animation loop along active in-range P2P links
      let hadPulses = false;
      const animatePulses = (now: number) => {
        if (!styleLoadedRef.current || mapRef.current !== map) return;
        const pulseSrc = map.getSource('signal-pulses-source') as
          | GeoJSONSource
          | undefined;
        const links = activeLinksRef.current;

        if (pulseSrc && links.length > 0) {
          const tSec = now * 0.001;
          const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

          for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const basePhase = (tSec * link.speed + link.phaseOffset) % 1;

            // Two evenly staggered pulses per active link for continuous live flow
            for (let p = 0; p < 2; p++) {
              const progress = (basePhase + p * 0.5) % 1;
              const lng = link.from[0] + (link.to[0] - link.from[0]) * progress;
              const lat = link.from[1] + (link.to[1] - link.from[1]) * progress;

              // Smooth fade-in/out near puck endpoints so pulses emerge and dock cleanly
              const edgeFade = Math.sin(progress * Math.PI);
              const alpha = Math.min(1, edgeFade * 2.4);

              features.push({
                type: 'Feature',
                properties: {
                  haloRadius: link.uplink ? 11 : 9,
                  haloOpacity: Number(((link.uplink ? 0.52 : 0.42) * alpha).toFixed(3)),
                  coreRadius: link.uplink ? 3.2 : 2.6,
                  coreOpacity: Number((0.96 * alpha).toFixed(3)),
                },
                geometry: {
                  type: 'Point',
                  coordinates: [lng, lat],
                },
              });
            }
          }

          pulseSrc.setData({
            type: 'FeatureCollection',
            features,
          });
          hadPulses = true;
        } else if (pulseSrc && hadPulses) {
          pulseSrc.setData({ type: 'FeatureCollection', features: [] });
          hadPulses = false;
        }

        pulseRafRef.current = window.requestAnimationFrame(animatePulses);
      };

      pulseRafRef.current = window.requestAnimationFrame(animatePulses);
    });

    // Place initial markers right away even before tiles finish
    syncSceneToMap();

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      if (pulseRafRef.current !== null) {
        window.cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      resizeObserver.disconnect();
      geofenceTooltipMarker.remove();
      selectedCalloutRef.current?.marker.remove();
      selectedCalloutRef.current = null;
      for (const entry of markersRef.current.values()) {
        entry.marker.remove();
      }
      markersRef.current.clear();
      styleLoadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth cinematic camera ease whenever selectedNodeId changes (unless dragging a marker)
  useEffect(() => {
    if (prevSelectedNodeIdRef.current === selectedNodeId) return;
    prevSelectedNodeIdRef.current = selectedNodeId;

    const map = mapRef.current;
    if (!map || draggingNodeIdRef.current !== null) return;

    const targetNode = latestPropsRef.current.nodes.find(
      (n) => n.id === selectedNodeId
    );
    if (!targetNode) return;

    const [nodeLng, nodeLat] = xyToLngLat(targetNode.x, targetNode.y);
    const containerWidth = mapContainerRef.current?.clientWidth ?? 1440;

    // Subtle corridor blend keeps both the selected puck + spatial callout and the
    // mesh corridor framed cleanly between the left (368px) and right (352px) glass panels
    const blend = containerWidth < 1200 ? 0.82 : 0.66;
    const framedCenter: [number, number] = [
      Number(
        (DEFAULT_CENTER[0] + (nodeLng - DEFAULT_CENTER[0]) * blend).toFixed(6)
      ),
      Number(
        (DEFAULT_CENTER[1] + (nodeLat - DEFAULT_CENTER[1]) * blend).toFixed(6)
      ),
    ];

    const corridorOffsetX =
      containerWidth >= 1024
        ? 8 // (368px left sidebar - 352px right sidebar) / 2
        : containerWidth >= 720
        ? Math.min(168, Math.round((368 - 16) / 2))
        : 0;

    map.easeTo({
      center: framedCenter,
      offset: [corridorOffsetX, 28],
      zoom: 12.35,
      pitch: 24,
      bearing: selectedNodeId === 'node-cmd' ? 6 : 0,
      duration: 900,
    });
  }, [selectedNodeId]);

  // Sync markers & WebGL GeoJSON layers smoothly whenever state updates (including 60fps rAF patrol)
  useEffect(() => {
    syncSceneToMap();
  });

  const handleZoomIn = () => {
    mapRef.current?.zoomIn({ duration: 240 });
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut({ duration: 240 });
  };

  const handleRecenter = () => {
    mapRef.current?.easeTo({
      center: DEFAULT_CENTER,
      offset: [0, 0],
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: 0,
      duration: 520,
    });
  };

  return (
    <div className="relative w-full h-full min-h-[520px] bg-[#0D1013] overflow-hidden select-none">
      {/* Full-bleed MapLibre GL Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full outline-none" />

      {/* Subtle cinematic vignette around frame perimeter (matches Flatkey dark terrain falloff) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 53% 50%, rgba(13,16,19,0) 46%, rgba(10,12,15,0.56) 100%)',
        }}
      />

      {/* Minimal Flatkey Bottom-Left Floating Frosted Map Controls */}
      <div className="absolute left-[388px] bottom-5 z-10 hidden lg:flex items-center gap-1.5">
        <div className="flex items-center bg-[#141619]/86 backdrop-blur-xl border border-white/[0.08] rounded-xl p-0.5 shadow-[0_12px_28px_rgba(0,0,0,0.48)]">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom in"
            aria-label="Zoom in"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#D1D5DB] hover:text-white hover:bg-white/[0.07] text-sm font-medium transition cursor-pointer"
          >
            +
          </button>
          <span className="w-px h-3.5 bg-white/[0.08]" />
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom out"
            aria-label="Zoom out"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#D1D5DB] hover:text-white hover:bg-white/[0.07] text-sm font-medium transition cursor-pointer"
          >
            −
          </button>
        </div>

        <button
          type="button"
          onClick={handleRecenter}
          title="Recenter Golden Gate Sector"
          aria-label="Recenter map"
          className="h-8 px-2.5 rounded-xl bg-[#141619]/86 backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.16] text-[#D1D5DB] hover:text-white text-[11.5px] font-medium flex items-center gap-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.48)] transition cursor-pointer"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="2" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
          </svg>
          <span>Recenter</span>
        </button>
      </div>
    </div>
  );
};
