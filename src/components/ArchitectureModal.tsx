import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  Lock,
  Radio,
  Smartphone,
  Cpu,
  Globe,
  WifiOff,
  Loader2,
} from 'lucide-react';
import {
  runLivePrivacyFirewallAudit,
  type FirewallAuditResult,
} from '../services/firebase';
import type { DeviceCapabilityStatus } from '../services/hybridEngine';
import type { WebRTCTransportStatus } from '../services/webrtcMesh';

export interface ArchitectureModalProps {
  open: boolean;
  onClose: () => void;
  capabilities: DeviceCapabilityStatus | null;
  rtcStatus: WebRTCTransportStatus;
  swRegistered: boolean;
  roomId?: string;
}

function resolveActiveRoomId(propRoomId?: string): string {
  if (propRoomId && /^[A-Za-z0-9_-]{3,64}$/.test(propRoomId)) {
    return propRoomId;
  }
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('room');
    if (param && /^[A-Za-z0-9_-]{3,64}$/.test(param)) {
      return param;
    }
  }
  return 'CASCADIA-01';
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  open,
  onClose,
  capabilities,
  rtcStatus,
  swRegistered,
  roomId,
}) => {
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<FirewallAuditResult | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleRunFirewallAudit = useCallback(async () => {
    if (auditRunning) return;
    setAuditRunning(true);
    try {
      const targetRoom = resolveActiveRoomId(roomId);
      const res = await runLivePrivacyFirewallAudit(targetRoom);
      setAuditResult(res);
    } finally {
      setAuditRunning(false);
    }
  }, [auditRunning, roomId]);

  if (!open) return null;

  const cloudModel = capabilities?.cloudModel || 'gemini-2.5-flash';
  const edgeAiLabel =
    capabilities?.chromeBuiltInAI === 'AVAILABLE'
      ? 'Chrome Nano HW Ready'
      : capabilities?.chromeBuiltInAI === 'DOWNLOADABLE'
      ? 'Local Vault Active (Nano Downloadable)'
      : 'Local Vault Active (Nano Flag Optional)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ZeroBar Hybrid Inference Architecture"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-[24px] bg-[#141619]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] text-[#8A919E]">
              <span className="inline-flex items-center gap-1.5 text-[#B7E852] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B7E852]" />
                System Blueprint
              </span>
              <span className="text-white/20">·</span>
              <span>Firebase AI Logic Hybrid Inference</span>
            </div>
            <h2 className="text-[18px] font-medium text-[#F3F4F6] tracking-tight mt-0.5">
              ZeroBar Off-Grid Crisis Mesh Architecture
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close architecture blueprint"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.09] text-[#8A919E] hover:text-[#F3F4F6] text-[12px] transition cursor-pointer"
          >
            <span>Esc</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* 3-Step Horizontal Pipeline */}
          <div>
            <div className="text-[13px] font-medium text-[#D1D5DB] mb-3">
              Hybrid Inference Pipeline · Blackout Zone to Uplink Ridge
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-2.5">
              {/* Step 01 */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#B7E852]/12 text-[#B7E852] text-[11px] font-mono font-medium">
                      ONLY_ON_DEVICE
                    </span>
                    <Lock className="w-4 h-4 text-[#B7E852]" />
                  </div>
                  <div className="text-[14px] font-medium text-[#F3F4F6]">
                    Local Privacy Vault
                  </div>
                  <p className="text-[12px] leading-relaxed text-[#8A919E] mt-1.5">
                    Scrubs names, SSNs, phone numbers, exact addresses, and medical IDs strictly in device RAM before any packet touches the radio.
                  </p>
                </div>
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-[#8A919E]">Gemini Nano / Apple FM</span>
                  <span className="text-[#B7E852] font-medium tabular-nums">
                    0 B PII Egress
                  </span>
                </div>
              </div>

              {/* Arrow 1 -> 2 */}
              <div className="hidden md:flex items-center justify-center text-[#6B7280] px-0.5">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Step 02 */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#F2B84B]/12 text-[#F2B84B] text-[11px] font-mono font-medium">
                      PREFER_ON_DEVICE
                    </span>
                    <Radio className="w-4 h-4 text-[#F2B84B]" />
                  </div>
                  <div className="text-[14px] font-medium text-[#F3F4F6]">
                    Edge Triage &amp; P2P Gossip
                  </div>
                  <p className="text-[12px] leading-relaxed text-[#8A919E] mt-1.5">
                    Compresses redacted SOS into a compact JSON beacon and emits instant offline survival steps. Hops peer-to-peer over WebRTC DataChannel.
                  </p>
                </div>
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-[#8A919E]">RTCDataChannel</span>
                  <span className="text-[#F2B84B] font-medium tabular-nums">
                    &lt;300 B Beacon
                  </span>
                </div>
              </div>

              {/* Arrow 2 -> 3 */}
              <div className="hidden md:flex items-center justify-center text-[#6B7280] px-0.5">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Step 03 */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#E85D4A]/15 text-[#E85D4A] text-[11px] font-mono font-medium">
                      ONLY_IN_CLOUD
                    </span>
                    <ShieldCheck className="w-4 h-4 text-[#E85D4A]" />
                  </div>
                  <div className="text-[14px] font-medium text-[#F3F4F6]">
                    Cloud Copilot Fusion
                  </div>
                  <p className="text-[12px] leading-relaxed text-[#8A919E] mt-1.5">
                    When a relay reaches 1-bar uplink, fuses multi-node beacons &amp; hazard photos, resolves route contradictions, and queues downlink directives.
                  </p>
                </div>
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-[#8A919E] truncate max-w-[125px] font-mono">
                    {cloudModel}
                  </span>
                  <span className="text-[#F3F4F6] font-medium tabular-nums">
                    &lt;1 KB Directive
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* App Check + Firestore Privacy Invariant + Live Firewall Verification */}
          <div className="rounded-2xl bg-[#B7E852]/[0.06] border border-[#B7E852]/20 p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-2 h-2 rounded-full bg-[#B7E852] shrink-0 mt-1.5 sm:mt-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[#F3F4F6]">
                      App Check + Firestore Privacy Invariant
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#B7E852]/15 border border-[#B7E852]/30 text-[10.5px] font-medium text-[#B7E852]">
                      Zero Raw PII
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8A919E] mt-0.5 leading-relaxed">
                    <code className="text-[#D1D5DB]">rawInputLocalOnly</code> is never serialized to network or Firestore.{' '}
                    <code className="text-[#D1D5DB]">rooms/&#123;roomId&#125;/beacons</code> enforces schema-validated, PII-free payloads gated by ReCaptchaEnterprise, App Attest &amp; Play Integrity.
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="run-firewall-audit"
                onClick={() => void handleRunFirewallAudit()}
                disabled={auditRunning}
                className="shrink-0 self-start sm:self-center h-9 px-3.5 rounded-xl bg-[#B7E852] hover:bg-[#c5f069] disabled:opacity-70 text-[#0D1013] text-[12px] font-semibold inline-flex items-center gap-1.5 shadow-[0_0_20px_rgba(183,232,82,0.22)] transition cursor-pointer whitespace-nowrap"
              >
                {auditRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Probing Rules...</span>
                  </>
                ) : (
                  <span>⚡ Test Live DB Firewall</span>
                )}
              </button>
            </div>

            {/* Live Zero-PII Security Rules Verification Subpanel */}
            <div className="pt-3 border-t border-[#B7E852]/15 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#D1D5DB]">
                  Live Zero-PII Security Rules Verification
                </span>
                {auditResult ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/35 border border-white/[0.08] font-mono text-[10.5px] text-[#B7E852]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B7E852]" />
                    <span>{auditResult.mode}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-[#8A919E]">
                    Click to fire real adversary SSN write vs sanitized beacon write against deployed rules
                  </span>
                )}
              </div>

              {auditResult && (
                <div
                  data-testid="firewall-audit-results"
                  className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
                >
                  {/* Adversary Attack Card */}
                  <div className="rounded-xl bg-[#0E1013]/85 border border-[#E85D4A]/35 p-3 flex flex-col justify-between gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#F3F4F6]">
                        <ShieldAlert className="w-4 h-4 text-[#E85D4A] shrink-0" />
                        <span>
                          Adversary Raw SSN +{' '}
                          <code className="text-[#F5A396] font-mono text-[11px]">
                            rawInputLocalOnly
                          </code>{' '}
                          Write
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#E85D4A]/18 border border-[#E85D4A]/40 font-mono text-[10.5px] font-semibold text-[#F5A396]">
                        {auditResult.attackBlocked
                          ? `BLOCKED · ${auditResult.attackErrorCode}`
                          : `UNBLOCKED · ${auditResult.attackErrorCode}`}
                      </span>
                      <span className="font-mono text-[11px] text-[#8A919E] tabular-nums">
                        {auditResult.attackLatencyMs} ms
                      </span>
                    </div>
                  </div>

                  {/* Valid Sanitized Beacon Card */}
                  <div className="rounded-xl bg-[#0E1013]/85 border border-[#B7E852]/35 p-3 flex flex-col justify-between gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#F3F4F6]">
                        <CheckCircle2 className="w-4 h-4 text-[#B7E852] shrink-0" />
                        <span>
                          Redacted &lt;300B{' '}
                          <code className="text-[#D9F59B] font-mono text-[11px]">
                            CompactBeaconPayload
                          </code>{' '}
                          Write
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#B7E852]/16 border border-[#B7E852]/40 font-mono text-[10.5px] font-semibold text-[#B7E852]">
                        {auditResult.validAccepted
                          ? 'ACCEPTED · 200 OK'
                          : 'REJECTED'}
                      </span>
                      <span className="font-mono text-[11px] text-[#D1D5DB] tabular-nums">
                        {auditResult.validBytes} B · {auditResult.validLatencyMs} ms
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Platform Matrix */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#8A919E]">
                MULTI-PLATFORM SWARM MATRIX
              </div>
              <span className="text-[11px] font-mono text-[#6B7280]">
                4 Verified Runtime Surfaces
              </span>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 flex flex-col justify-between gap-2.5 border-b border-white/[0.06] lg:border-b-0 sm:border-r">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#F3F4F6]">
                    <Globe className="w-4 h-4 text-[#B7E852] shrink-0" />
                    <span>Web Command</span>
                  </div>
                  <p className="text-[12px] text-[#8A919E] leading-relaxed">
                    React 19 + Chrome Gemini Nano + MapLibre GL + WebRTC P2P gossip.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.05] text-[10.5px] font-mono text-[#6B7280]">
                  src/ · ReCaptchaEnterprise
                </div>
              </div>

              <div className="p-4 flex flex-col justify-between gap-2.5 border-b border-white/[0.06] lg:border-b-0 lg:border-r">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#F3F4F6]">
                    <Smartphone className="w-4 h-4 text-[#F2B84B] shrink-0" />
                    <span>iOS SwiftUI</span>
                  </div>
                  <p className="text-[12px] text-[#8A919E] leading-relaxed">
                    <code className="text-[#D1D5DB]">FirebaseAI</code> + Apple Foundation Models + App Attest.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.05] text-[10.5px] font-mono text-[#6B7280]">
                  ios/ZeroBarField
                </div>
              </div>

              <div className="p-4 flex flex-col justify-between gap-2.5 border-b border-white/[0.06] sm:border-b-0 sm:border-r">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#F3F4F6]">
                    <Cpu className="w-4 h-4 text-[#38BDF8] shrink-0" />
                    <span>Android Compose</span>
                  </div>
                  <p className="text-[12px] text-[#8A919E] leading-relaxed">
                    <code className="text-[#D1D5DB]">firebase-ai-ondevice</code> + AICore Gemini Nano + Play Integrity.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.05] text-[10.5px] font-mono text-[#6B7280]">
                  android/ZeroBarField
                </div>
              </div>

              <div className="p-4 flex flex-col justify-between gap-2.5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#F3F4F6]">
                    <WifiOff className="w-4 h-4 text-[#E85D4A] shrink-0" />
                    <span>Offline PWA</span>
                  </div>
                  <p className="text-[12px] text-[#8A919E] leading-relaxed">
                    Service Worker cached shell + Airplane Mode reload resilience.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.05] text-[10.5px] font-mono text-[#6B7280]">
                  public/sw.js · 0-Bar
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Runtime Status Footer */}
        <div className="px-6 py-3.5 bg-black/25 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] text-[#8A919E] tabular-nums">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  capabilities?.chromeBuiltInAI === 'AVAILABLE'
                    ? 'bg-[#B7E852]'
                    : 'bg-[#F2B84B]'
                }`}
              />
              <span>Edge AI:</span>
              <span className="text-[#F3F4F6] font-medium">{edgeAiLabel}</span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  capabilities?.firebaseConnected
                    ? 'bg-[#B7E852]'
                    : 'bg-white/30'
                }`}
              />
              <span>Firebase:</span>
              <span className="text-[#F3F4F6] font-medium">
                {capabilities?.firebaseConnected ? 'Live' : 'Sandbox'}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  capabilities?.appCheckActive ? 'bg-[#B7E852]' : 'bg-white/30'
                }`}
              />
              <span>App Check:</span>
              <span className="text-[#F3F4F6] font-medium">
                {capabilities?.appCheckActive ? 'Enforced' : 'Standby'}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  rtcStatus.mode === 'WEBRTC_P2P'
                    ? 'bg-[#B7E852]'
                    : rtcStatus.mode === 'SIGNALING'
                    ? 'bg-[#F2B84B]'
                    : 'bg-white/30'
                }`}
              />
              <span>WebRTC:</span>
              <span className="text-[#F3F4F6] font-medium">
                {rtcStatus.mode} ({rtcStatus.connectedPeers}P ·{' '}
                {rtcStatus.packetsSentViaRtc}↑/{rtcStatus.packetsRecvViaRtc}↓)
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  swRegistered ? 'bg-[#B7E852]' : 'bg-white/30'
                }`}
              />
              <span>PWA Cache:</span>
              <span className="text-[#F3F4F6] font-medium">
                {swRegistered ? 'Active' : 'Standby'}
              </span>
            </span>
          </div>

          <span className="font-mono text-[#6B7280]">
            Room {rtcStatus.peerId ? `· ${rtcStatus.peerId}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
