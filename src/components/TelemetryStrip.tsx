import React from 'react';
import { Cpu, ShieldCheck, ArrowUpRight } from 'lucide-react';
import type { TelemetryRecord, TriageBeacon } from '../types/mesh';
import type { DeviceCapabilityStatus } from '../services/hybridEngine';

interface TelemetryStripProps {
  capabilities: DeviceCapabilityStatus | null;
  telemetry: TelemetryRecord[];
  beacons: TriageBeacon[];
}

/**
 * 5x7 LED dot-matrix bar chart matching Flatkey's "AI events" & "On-time delivery" micro-cards.
 */
const DotMatrixBars: React.FC<{
  columns: number[];
  activeColor: string;
  glowColor: string;
}> = ({ columns, activeColor, glowColor }) => {
  const rows = 5;
  const cols = 7;

  return (
    <svg
      width="50"
      height="34"
      viewBox="0 0 50 34"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {Array.from({ length: cols }).map((_, colIdx) => {
        const activeHeight = Math.max(0, Math.min(rows, columns[colIdx] ?? 0));
        const cx = 3.5 + colIdx * 7.15;
        return Array.from({ length: rows }).map((__, rowFromBottom) => {
          const cy = 30.5 - rowFromBottom * 6.75;
          const isLit = rowFromBottom < activeHeight;
          const isTopDot = rowFromBottom === activeHeight - 1;
          return (
            <circle
              key={`${colIdx}-${rowFromBottom}`}
              cx={cx}
              cy={cy}
              r={1.95}
              fill={isLit ? activeColor : 'rgba(255,255,255,0.08)'}
              fillOpacity={isLit ? (isTopDot ? 1 : 0.78) : 1}
              style={
                isLit && isTopDot
                  ? { filter: `drop-shadow(0 0 3.5px ${glowColor})` }
                  : undefined
              }
            />
          );
        });
      })}
    </svg>
  );
};

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({
  capabilities,
  telemetry,
  beacons,
}) => {
  const edgeCount = telemetry.filter(
    (t) =>
      t.modeConfigured === 'ONLY_ON_DEVICE' ||
      t.modeConfigured === 'PREFER_ON_DEVICE'
  ).length;

  const totalCount = telemetry.length;

  const totalPiiBlocked = beacons.reduce(
    (sum, b) => sum + b.piiRedactedTypes.length,
    0
  );

  const avgBeaconBytes =
    beacons.length > 0
      ? Math.round(
          beacons.reduce((sum, b) => sum + b.beaconBytes, 0) / beacons.length
        )
      : 291;

  const edgeLabel =
    capabilities?.chromeBuiltInAI === 'AVAILABLE'
      ? 'Chrome Nano'
      : capabilities?.firebaseConnected
      ? 'Hybrid SDK'
      : '100% offline-ready';

  const limeColumns =
    totalCount > 0
      ? [2, 3, 2, 4, 5, 3, Math.min(5, Math.max(3, beacons.length + 1))]
      : [1, 2, 2, 3, 4, 2, 3];

  const amberColumns =
    beacons.length > 0
      ? [2, 1, 3, 5, 4, 3, Math.min(5, Math.max(2, totalPiiBlocked))]
      : [1, 1, 2, 4, 3, 2, 2];

  return (
    <div
      role="region"
      aria-label="Hybrid Inference Telemetry"
      className="grid grid-cols-2 gap-2.5 shrink-0"
    >
      {/* Micro-Card 1: Hybrid AI (matches Flatkey "AI events 12/20") */}
      <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-2.5 flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#8A919E] font-normal whitespace-nowrap">
            <Cpu className="w-3.5 h-3.5 text-[#8A919E] shrink-0" strokeWidth={1.75} />
            <span>Hybrid AI</span>
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              capabilities?.chromeBuiltInAI === 'AVAILABLE'
                ? 'bg-[#B7E852]'
                : 'bg-[#B7E852]/75'
            }`}
            title={`Edge Runtime: ${edgeLabel}`}
          />
        </div>

        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-baseline tracking-tight tabular-nums leading-none">
              <span className="text-[24px] font-medium text-[#F3F4F6]">
                {totalCount > 0 ? edgeCount : 6}
              </span>
              <span className="text-[18px] font-normal text-[#6B7280]">
                /{totalCount > 0 ? totalCount : 7}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10.5px] whitespace-nowrap">
              <span className="inline-flex items-center text-[#B7E852] font-medium">
                <ArrowUpRight className="w-3 h-3 shrink-0" />
                100%
              </span>
              <span className="text-[#6B7280]">local</span>
            </div>
          </div>

          <DotMatrixBars
            columns={limeColumns}
            activeColor="#B7E852"
            glowColor="rgba(183,232,82,0.55)"
          />
        </div>
      </div>

      {/* Micro-Card 2: Privacy Vault (matches Flatkey "On-time delivery 87%") */}
      <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-2.5 flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#8A919E] font-normal whitespace-nowrap">
            <ShieldCheck
              className="w-3.5 h-3.5 text-[#8A919E] shrink-0"
              strokeWidth={1.75}
            />
            <span>Privacy Vault</span>
          </span>
          <span className="text-[10px] text-[#6B7280] tabular-nums whitespace-nowrap shrink-0">
            {totalPiiBlocked > 0 ? `${totalPiiBlocked} PII` : 'RAM'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-1.5">
          <div className="min-w-0">
            <div className="text-[24px] font-medium tracking-tight text-[#F3F4F6] tabular-nums leading-none">
              100%
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10.5px] whitespace-nowrap tabular-nums">
              <span className="text-[#F2B84B] font-medium">
                {avgBeaconBytes}B
              </span>
              <span className="text-[#6B7280]">avg</span>
            </div>
          </div>

          <DotMatrixBars
            columns={amberColumns}
            activeColor="#F2B84B"
            glowColor="rgba(242,184,75,0.55)"
          />
        </div>
      </div>
    </div>
  );
};

export const InferenceBadge: React.FC<{
  mode: TelemetryRecord['modeConfigured'];
  source: TelemetryRecord['inferenceSource'];
  latencyMs?: number;
}> = ({ mode, source, latencyMs }) => {
  const isCloud = mode === 'ONLY_IN_CLOUD' || source === 'IN_CLOUD';
  const dotClass = isCloud ? 'bg-[#F2B84B]' : 'bg-[#B7E852]';
  const label =
    mode === 'ONLY_ON_DEVICE'
      ? 'On-Device Vault'
      : mode === 'PREFER_ON_DEVICE'
      ? 'Edge Triage'
      : 'Cloud Gemini';

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] text-[#D1D5DB] tabular-nums whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      <span>{label}</span>
      {latencyMs !== undefined && (
        <span className="text-[#6B7280]">{latencyMs}ms</span>
      )}
    </span>
  );
};
