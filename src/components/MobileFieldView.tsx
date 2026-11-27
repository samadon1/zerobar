import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  ChevronsDown,
  Construction,
  Droplets,
  Flame,
  HeartPulse,
  LayoutGrid,
  Lock,
  MapPin,
  Mic,
  MicOff,
  Radio,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Syringe,
  Users,
  Waves,
  Wifi,
  WifiOff,
  Wind,
} from 'lucide-react';
import type { MeshNode, TacticalDirective, TriageBeacon } from '../types/mesh';
import { processCitizenDistress } from '../services/hybridEngine';
import { syncBeaconToFirestore } from '../services/firebase';

interface MobileFieldViewProps {
  roomId: string;
  onExitMobile?: () => void;
  onBeaconCreated: (beacon: TriageBeacon) => void;
  receivedDirectives: TacticalDirective[];
}

type RightPhoneTab = 'grid' | 'vault' | 'directives';
type MobilePhonePane = 'radar' | 'dispatch';

interface SosCategoryTile {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badgeBg: string;
  badgeText: string;
  phrase: string;
}

const SOS_CATEGORIES: SosCategoryTile[] = [
  {
    id: 'medical',
    label: 'Medical',
    icon: HeartPulse,
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-600',
    phrase: 'severe trauma bleeding injury needing urgent paramedic care',
  },
  {
    id: 'trapped',
    label: 'Trapped',
    icon: Users,
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-600',
    phrase: '2 people trapped under collapsed stairwell, non-ambulatory',
  },
  {
    id: 'gas',
    label: 'Gas Leak',
    icon: Flame,
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-600',
    phrase: 'ruptured gas main hissing loudly in rear alley',
  },
  {
    id: 'bridge',
    label: 'Bridge',
    icon: Construction,
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-600',
    phrase:
      'Cedar St Overpass north bridge ramp blocked by collapse (south Pine St approach clear)',
  },
  {
    id: 'insulin',
    label: 'Insulin',
    icon: Syringe,
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-600',
    phrase:
      '2 trapped residents with diabetic emergency critically low on cold-chain insulin',
  },
  {
    id: 'oxygen',
    label: 'Oxygen',
    icon: Wind,
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-600',
    phrase: 'portable medical oxygen reserve below 15% after generator failure',
  },
  {
    id: 'fire',
    label: 'Fire',
    icon: Flame,
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-600',
    phrase: 'active electrical structure fire & heavy smoke near corridor',
  },
  {
    id: 'flood',
    label: 'Flood',
    icon: Waves,
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-600',
    phrase: 'rapidly rising storm-surge floodwater blocking ground exit',
  },
  {
    id: 'aftershock',
    label: 'Quake',
    icon: Activity,
    badgeBg: 'bg-yellow-50',
    badgeText: 'text-amber-600',
    phrase: 'violent 5.9 aftershock cracked load-bearing masonry wall',
  },
  {
    id: 'debris',
    label: 'Debris',
    icon: AlertTriangle,
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
    phrase: 'heavy concrete roadway debris blocking North Ave ambulance lane',
  },
  {
    id: 'water',
    label: 'Water',
    icon: Droplets,
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-600',
    phrase: 'ruptured potable water main, 4 sheltering seniors dehydrated',
  },
  {
    id: 'hazmat',
    label: 'Hazmat',
    icon: ShieldAlert,
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-600',
    phrase: 'industrial chemical hazmat leak downwind of substation',
  },
];

const CITIZEN_PII_PREAMBLE =
  'My name is Elena Vance (SSN 419-28-9014, Tel 415-890-2319, Med ID #ZB-8842) residing at 412 Cedar Street Apt 4B.';

function buildSosMessageFromCategories(categoryIds: string[]): string {
  if (categoryIds.length === 0) return '';
  const phrases = SOS_CATEGORIES.filter((c) => categoryIds.includes(c.id)).map(
    (c) => c.phrase
  );
  return `${CITIZEN_PII_PREAMBLE} Urgent Sector 4 SOS: ${phrases.join(
    '; '
  )}. Zero cell signal, requesting immediate mesh relay extraction!`;
}

/**
 * Visually strikes through local PII spans so judges can verify at a glance
 * what ONLY_ON_DEVICE scrubbed locally before P2P broadcast.
 */
function renderStruckThroughPii(raw: string): React.ReactNode[] {
  const piiRegex =
    /(\b\d{3}-\d{2}-\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|Med(?:ical)?\s*ID\s*#?\s*[\w-]+|\b\d{2,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd)(?:\s+Apt\s+[\w-]+)?|(?:my name is|soy|nurse)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = piiRegex.exec(raw)) !== null) {
    if (match.index > lastIdx) {
      parts.push(raw.slice(lastIdx, match.index));
    }
    const full = match[0];
    const prefixMatch = full.match(/^(my name is|soy|nurse)\s+(.+)$/i);
    if (prefixMatch) {
      parts.push(`${prefixMatch[1]} `);
      parts.push(
        <span
          key={`${match.index}-name`}
          className="line-through decoration-[#D9383A] decoration-2 bg-[#D9383A]/12 text-[#991B1B] font-semibold px-1 rounded"
        >
          {prefixMatch[2]}
        </span>
      );
    } else {
      parts.push(
        <span
          key={`${match.index}-pii`}
          className="line-through decoration-[#D9383A] decoration-2 bg-[#D9383A]/12 text-[#991B1B] font-semibold px-1 rounded"
        >
          {full}
        </span>
      );
    }
    lastIdx = piiRegex.lastIndex;
  }

  if (lastIdx < raw.length) {
    parts.push(raw.slice(lastIdx));
  }
  return parts;
}

export const MobileFieldView: React.FC<MobileFieldViewProps> = ({
  roomId,
  onExitMobile,
  onBeaconCreated,
  receivedDirectives,
}) => {
  const [callsign] = useState(
    () => `MOBILE-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
  );
  const [offlineMode, setOfflineMode] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'insulin',
  ]);
  const [input, setInput] = useState<string>(() =>
    buildSosMessageFromCategories(['insulin'])
  );
  const [manualOverride, setManualOverride] = useState(false);

  const [listening, setListening] = useState(false);
  const [holdingMic, setHoldingMic] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [lastBeacon, setLastBeacon] = useState<TriageBeacon | null>(null);

  const [rightTab, setRightTab] = useState<RightPhoneTab>('grid');
  const [vaultBadge, setVaultBadge] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePhonePane>('radar');

  const holdTimerRef = useRef<number | null>(null);
  const prevDirectivesCountRef = useRef<number>(receivedDirectives.length);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (receivedDirectives.length > prevDirectivesCountRef.current) {
      setRightTab('directives');
    }
    prevDirectivesCountRef.current = receivedDirectives.length;
  }, [receivedDirectives.length]);

  const handleToggleCategory = (catId: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.includes(catId);
      const next = exists ? prev.filter((id) => id !== catId) : [...prev, catId];

      if (!manualOverride || !input.trim()) {
        setInput(buildSosMessageFromCategories(next));
        setManualOverride(false);
      } else {
        const tile = SOS_CATEGORIES.find((c) => c.id === catId);
        if (tile && !exists && !input.includes(tile.phrase)) {
          setInput((curr) => `${curr.trim()} Also: ${tile.phrase}.`);
        }
      }
      return next;
    });
  };

  const toggleVoice = () => {
    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            onresult: (e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
            }) => void;
            onerror?: () => void;
            onend: () => void;
            start: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            onresult: (e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
            }) => void;
            onerror?: () => void;
            onend: () => void;
            start: () => void;
          };
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            onresult: (e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
            }) => void;
            onerror?: () => void;
            onend: () => void;
            start: () => void;
          };
        }
      ).webkitSpeechRecognition;

    if (!SpeechRec) {
      setListening(true);
      window.setTimeout(() => {
        const voiceTranscript =
          'My name is Alex Rivera (SSN 512-40-8821, Tel 415-392-7740) at 88 Pine Street Apt 3B. Roof collapsed after aftershock, gas leak hissing, 2 people trapped needing insulin - zero cell bars!';
        setManualOverride(true);
        setSelectedCategories(['trapped', 'gas', 'insulin']);
        setInput(voiceTranscript);
        setListening(false);
        void handleSendSos(voiceTranscript);
      }, 650);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = false;
      setListening(true);
      rec.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript;
        if (transcript) {
          const combined = input.trim()
            ? `${input.trim()} ${transcript}`
            : transcript;
          setManualOverride(true);
          setInput(combined);
          setListening(false);
          void handleSendSos(combined);
        }
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const handleMicPointerDown = () => {
    if (busy || listening) return;
    setHoldingMic(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      toggleVoice();
    }, 260);
  };

  const handleMicPointerUp = () => {
    setHoldingMic(false);
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (!listening && !busy) {
        toggleVoice();
      }
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSendSos = async (overrideMessage?: string) => {
    const candidate =
      typeof overrideMessage === 'string' ? overrideMessage : input;
    const messageToSend =
      candidate.trim() || buildSosMessageFromCategories(['insulin', 'gas']);
    if (busy) return;
    setBusy(true);
    try {
      const virtualMobileNode: MeshNode = {
        id: 'node-alpha',
        callsign,
        role: 'CITIZEN_OFFLINE',
        x: 24,
        y: 48,
        lat: 37.7749,
        lng: -122.4194,
        online: !offlineMode,
        radioRange: 26,
        batteryPct: 84,
        sectorLabel: `Marin Sector 4 (${callsign})`,
        isLiveMobile: true,
        beaconsHeld: [],
        directivesReceived: [],
      };

      const [{ beacon }] = await Promise.all([
        processCitizenDistress(virtualMobileNode, messageToSend, photoDataUrl),
        new Promise<void>((resolve) => window.setTimeout(resolve, 420)),
      ]);
      setLastBeacon(beacon);
      onBeaconCreated(beacon);
      if (!offlineMode) {
        syncBeaconToFirestore(roomId, beacon).catch(() => {});
      }
      setVaultBadge(true);
      setRightTab('vault');
      setMobilePane('dispatch');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111317] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-x-hidden selection:bg-[#D9383A]/25">
      {/* Keyframes for smooth spatial radar sweep & active sonar rings */}
      <style>{`
        @keyframes zbRadarSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes zbSonarPulse {
          0% {
            transform: scale(0.86);
            opacity: 0.8;
          }
          65% {
            opacity: 0.3;
          }
          100% {
            transform: scale(1.18);
            opacity: 0;
          }
        }
      `}</style>

      {/* Subtle Studio Backdrop Ambient Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#9FE6B8]/[0.06] blur-[110px]" />
        <div className="absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#D9383A]/[0.05] blur-[120px]" />
      </div>

      {/* 1. Top Floating Studio Bar */}
      <header className="w-full max-w-[1080px] flex items-center justify-between gap-3 mb-4 lg:mb-6 z-20">
        <div className="flex items-center gap-2">
          {onExitMobile ? (
            <button
              onClick={onExitMobile}
              className="h-8 px-3.5 rounded-full bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.1] text-slate-200 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer backdrop-blur-md shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Live Map</span>
            </button>
          ) : (
            <div className="h-8 px-3.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-slate-300 text-xs font-mono inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9FE6B8]" />
              <span>ZeroBar · {roomId}</span>
            </div>
          )}
        </div>

        {/* Studio Caption (Desktop) */}
        <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-[11px] text-slate-400 tracking-tight">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-slate-200 font-medium">ZeroBar Field SOS</span>
          <span className="text-slate-600">·</span>
          <span>Apple Foundation Models / Gemini Nano Offline Node</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-[10px] text-slate-400">
            {callsign}
          </span>
        </div>

        {/* 0-BAR OFFLINE / 1-BAR UPLINK Pill Toggle */}
        <button
          onClick={() => setOfflineMode((v) => !v)}
          className={`h-8 px-3.5 rounded-full text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 border transition cursor-pointer backdrop-blur-md shadow-sm ${
            offlineMode
              ? 'bg-[#D9383A]/15 border-[#D9383A]/40 text-[#FF8082]'
              : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
          }`}
        >
          {offlineMode ? (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>0-BAR OFFLINE</span>
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span>1-BAR UPLINK</span>
            </>
          )}
        </button>
      </header>

      {/* Compact Single-Phone Switcher for Small Mobile Viewports (< lg) */}
      <div className="lg:hidden w-full max-w-[350px] mb-4 z-20">
        <div className="bg-[#1B1F26] border border-white/[0.09] rounded-2xl p-1 grid grid-cols-2 gap-1 shadow-lg">
          <button
            onClick={() => setMobilePane('radar')}
            className={`py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mobilePane === 'radar'
                ? 'bg-[#CCF3D6] text-[#0B1310] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice &amp; Radar</span>
          </button>
          <button
            onClick={() => setMobilePane('dispatch')}
            className={`py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 relative ${
              mobilePane === 'dispatch'
                ? 'bg-white text-[#111827] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[#D9383A]" />
            <span>Alert Grid &amp; Vault</span>
            {(vaultBadge || receivedDirectives.length > 0) && (
              <span className="w-2 h-2 rounded-full bg-[#D9383A]" />
            )}
          </button>
        </div>
      </div>

      {/* Studio Dual-iPhone 16 Pro Dynamic Island Showcase */}
      <main className="flex flex-col lg:flex-row gap-10 items-center justify-center z-10 w-full max-w-[1080px]">
        {/* ===================================================================
            2. LEFT iPHONE — Spatial Radar & Voice SOS (Mint-to-Sage Gradient)
           =================================================================== */}
        <section
          aria-label="Spatial Radar and Voice SOS iPhone"
          style={{
            background: 'linear-gradient(180deg, #CCF3D6 0%, #9FE6B8 100%)',
          }}
          className={`w-[350px] max-w-full h-[720px] rounded-[48px] border-[8px] border-[#1F2329] ring-1 ring-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden relative flex-col justify-between p-6 text-[#0F172A] shrink-0 ${
            mobilePane === 'radar' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Soft luminous mint center highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[270px] h-[270px] rounded-full bg-white/30 blur-2xl"
          />

          {/* Top Group: iOS Status Bar + Slide Pill + Sector Header + Frosted Input */}
          <div className="relative z-10 space-y-3.5">
            {/* iOS 18 Status Bar + Dynamic Island */}
            <div className="flex items-center justify-between px-1 pt-0.5">
              <span className="text-[13px] font-semibold tracking-tight text-[#0B1310] tabular-nums w-14">
                9:41
              </span>

              {/* Dynamic Island */}
              <div className="w-24 h-6 rounded-full bg-black flex items-center justify-end px-2.5 shadow-inner">
                <span
                  className={`w-2 h-2 rounded-full transition-colors ${
                    listening
                      ? 'bg-[#EF4444] animate-ping'
                      : busy
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-[#171B26]'
                  }`}
                />
              </div>

              {/* Right 0-Bar SOS Status */}
              <div className="flex items-center justify-end gap-1 w-14 text-[#0B1310]">
                {offlineMode ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 stroke-[2.2]" />
                    <span className="text-[9px] font-bold tracking-tight px-1 py-0.2 rounded bg-[#0B1310]/12">
                      SOS
                    </span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 stroke-[2.2]" />
                    <span className="text-[9px] font-bold tracking-tight">
                      1B
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Slide / Tap to Live Map Pill (matches Dribbble "Slide to exit" pill) */}
            {onExitMobile ? (
              <button
                type="button"
                onClick={onExitMobile}
                className="mx-auto w-[212px] h-11 rounded-full bg-white/40 hover:bg-white/55 backdrop-blur-md border border-white/55 p-1 flex items-center gap-2 transition cursor-pointer group shadow-[0_4px_16px_rgba(11,19,16,0.06)]"
              >
                <span className="w-9 h-9 rounded-full bg-[#0B1310] text-white flex items-center justify-center shadow-md group-hover:translate-x-0.5 transition-transform shrink-0">
                  <ChevronRight className="w-4 h-4 stroke-[2.4]" />
                </span>
                <span className="text-[11.5px] font-semibold text-[#0F172A] flex-1 text-center pr-2.5 tracking-tight">
                  Slide / Tap to Live Map
                </span>
              </button>
            ) : (
              <div className="mx-auto w-[212px] h-11 rounded-full bg-white/40 backdrop-blur-md border border-white/55 p-1 flex items-center gap-2 shadow-[0_4px_16px_rgba(11,19,16,0.06)]">
                <span className="w-9 h-9 rounded-full bg-[#0B1310] text-[#9FE6B8] flex items-center justify-center shadow-md shrink-0">
                  <Radio className="w-4 h-4" />
                </span>
                <span className="text-[11.5px] font-semibold text-[#0F172A] flex-1 text-center pr-2.5 tracking-tight">
                  Room {roomId}
                </span>
              </div>
            )}

            {/* Bold Centered Sector Header */}
            <div className="text-center pt-0.5">
              <h1 className="text-[28px] leading-[1.1] font-bold text-[#0B1310] tracking-tight">
                Marin Sector 4
              </h1>
              <p className="text-[11.5px] font-medium text-[#0F172A]/75 mt-1 tracking-tight">
                0-Bar Mesh Active · 100% On-Device Privacy
              </p>
            </div>

            {/* Frosted White Input Pill */}
            <div className="bg-white/65 backdrop-blur-md border border-white/75 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
              <Search className="w-4 h-4 text-[#0F172A]/55 shrink-0" />
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setManualOverride(true);
                  setInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && input.trim()) {
                    void handleSendSos();
                  }
                }}
                placeholder="Speak or type emergency SOS…"
                aria-label="Emergency SOS voice or text input"
                className="flex-1 min-w-0 bg-transparent text-[12px] font-medium text-[#0F172A] placeholder:text-[#0F172A]/45 focus:outline-none"
              />
              <button
                type="button"
                onClick={toggleVoice}
                title="Voice SOS"
                aria-label="Toggle Voice SOS"
                className={`w-6 h-6 rounded-full flex items-center justify-center transition cursor-pointer shrink-0 ${
                  listening
                    ? 'bg-[#D9383A] text-white animate-pulse'
                    : 'text-[#0F172A]/70 hover:text-[#0B1310] hover:bg-black/5'
                }`}
              >
                {listening ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>
              {input.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSendSos()}
                  disabled={busy}
                  title="Broadcast SOS Beacon"
                  aria-label="Broadcast SOS Beacon"
                  className={`w-6 h-6 rounded-full bg-[#0B1310] hover:bg-[#1E293B] text-white flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-60 ${
                    busy ? 'scale-95 ring-2 ring-emerald-500/60' : ''
                  }`}
                >
                  <Send className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Centerpiece: 224px Circular Sweeping Spatial Radar Lens + Live Peer Pill */}
          <div className="relative z-10 flex flex-col items-center justify-center my-0.5">
            <div className="relative w-[248px] h-[248px] flex items-center justify-center">
              {/* Expanding Emerald / Crimson Sonar Ring Pulse when active */}
              {(listening || holdingMic || busy) && (
                <>
                  <span
                    aria-hidden="true"
                    style={{
                      animation:
                        'zbSonarPulse 1.5s cubic-bezier(0.16, 1, 0.3, 1) infinite',
                    }}
                    className={`pointer-events-none absolute inset-2 rounded-full border-2 ${
                      listening || holdingMic
                        ? 'border-[#D9383A]/70 bg-[#D9383A]/[0.08]'
                        : 'border-emerald-600/75 bg-emerald-500/[0.1]'
                    }`}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      animation:
                        'zbSonarPulse 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.55s infinite',
                    }}
                    className={`pointer-events-none absolute inset-2 rounded-full border-2 ${
                      listening || holdingMic
                        ? 'border-[#D9383A]/45'
                        : 'border-emerald-500/50'
                    }`}
                  />
                </>
              )}

              {/* Extended Outer Emerald Radar Wedge (echoing SM Rubel Dribbble shot) */}
              <div
                aria-hidden="true"
                style={{
                  background:
                    'conic-gradient(from 15deg, rgba(22,163,74,0) 0deg, rgba(22,163,74,0) 275deg, rgba(34,197,94,0.16) 320deg, rgba(22,163,74,0.44) 358deg, rgba(22,163,74,0) 360deg)',
                  animation: `zbRadarSweep ${
                    listening || holdingMic || busy ? '1.8s' : '5s'
                  } linear infinite`,
                }}
                className="pointer-events-none absolute inset-0 rounded-full"
              />

              {/* Subtle outer boundary ring */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-1 rounded-full border border-[#0B1310]/[0.06]"
              />

              {/* 224px Spatial Map & Radar Lens */}
              <div className="w-[224px] h-[224px] rounded-full bg-[#ECF9EF]/90 border-[3px] border-white/85 shadow-[0_16px_38px_rgba(11,19,16,0.13),inset_0_2px_10px_rgba(255,255,255,0.95)] relative overflow-hidden flex items-center justify-center">
                {/* Faint Street & Topographic Vector Map SVG */}
                <svg
                  viewBox="0 0 224 224"
                  className="absolute inset-0 w-full h-full"
                  aria-hidden="true"
                >
                  {/* Soft topographic park & harbor water shapes */}
                  <path
                    d="M0 150 Q65 132 118 164 T224 148 L224 224 L0 224 Z"
                    fill="#D4F3DD"
                    opacity="0.7"
                  />
                  <path
                    d="M142 0 Q168 48 156 96 T224 118 L224 0 Z"
                    fill="#C6EED3"
                    opacity="0.55"
                  />
                  {/* Faint topographic contour curves */}
                  <path
                    d="M18 52 C62 34, 114 48, 168 28"
                    fill="none"
                    stroke="#0F172A"
                    strokeOpacity="0.07"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <path
                    d="M12 182 C72 158, 136 176, 206 146"
                    fill="none"
                    stroke="#0F172A"
                    strokeOpacity="0.08"
                    strokeWidth="1"
                  />
                  {/* Street network (Cedar St Overpass & Pine St Corridor) */}
                  <g
                    stroke="#FFFFFF"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    opacity="0.92"
                  >
                    <line x1="22" y1="88" x2="204" y2="66" />
                    <line x1="36" y1="142" x2="198" y2="118" />
                    <line x1="78" y1="16" x2="96" y2="208" />
                    <line x1="144" y1="14" x2="128" y2="210" />
                  </g>
                  <g
                    stroke="#0F172A"
                    strokeOpacity="0.08"
                    strokeWidth="1"
                    fill="none"
                  >
                    <line x1="22" y1="88" x2="204" y2="66" />
                    <line x1="36" y1="142" x2="198" y2="118" />
                    <line x1="78" y1="16" x2="96" y2="208" />
                    <line x1="144" y1="14" x2="128" y2="210" />
                    {/* Concentric radar range rings */}
                    <circle cx="112" cy="112" r="84" />
                    <circle cx="112" cy="112" r="56" />
                    <line x1="112" y1="12" x2="112" y2="212" strokeOpacity="0.05" />
                    <line x1="12" y1="112" x2="212" y2="112" strokeOpacity="0.05" />
                  </g>
                </svg>

                {/* Nearby P2P Mesh Node Blips */}
                <span
                  title="RELAY-MULE-01 in P2P range"
                  className="absolute top-[58px] right-[54px] w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-emerald-500/25 animate-pulse"
                />
                <span
                  title="PEER-NODE-04"
                  className="absolute bottom-[62px] left-[58px] w-2 h-2 rounded-full bg-[#0F172A]/45 ring-2 ring-white/80"
                />

                {/* Rotating Emerald/Mint Conic-Gradient Radar Sweep */}
                <div
                  aria-hidden="true"
                  style={{
                    background:
                      'conic-gradient(from 15deg, rgba(34,197,94,0) 0deg, rgba(34,197,94,0.02) 265deg, rgba(34,197,94,0.28) 338deg, rgba(21,128,61,0.52) 359deg, rgba(34,197,94,0) 360deg)',
                    animation: `zbRadarSweep ${
                      listening || holdingMic || busy ? '1.8s' : '5s'
                    } linear infinite`,
                  }}
                  className="pointer-events-none absolute inset-0 rounded-full"
                />

                {/* Tactile 60px Pure White Circular Voice SOS Mic Button */}
                <div className="relative z-10 flex items-center justify-center">
                  {(listening || holdingMic) && (
                    <span className="absolute w-[78px] h-[78px] rounded-full bg-[#D9383A]/25 animate-ping" />
                  )}
                  {busy && !listening && (
                    <span className="absolute w-[78px] h-[78px] rounded-full bg-emerald-500/25 animate-ping" />
                  )}
                  <div className="w-[74px] h-[74px] rounded-full bg-white/55 backdrop-blur-xs border border-white/80 flex items-center justify-center shadow-sm">
                    <button
                      type="button"
                      onPointerDown={handleMicPointerDown}
                      onPointerUp={handleMicPointerUp}
                      onPointerCancel={() => setHoldingMic(false)}
                      aria-label="Tap or hold for Voice SOS"
                      className={`w-[60px] h-[60px] rounded-full bg-white shadow-lg flex items-center justify-center transition-transform cursor-pointer ${
                        listening || holdingMic
                          ? 'scale-105 ring-2 ring-[#D9383A]'
                          : busy
                          ? 'scale-95 ring-2 ring-emerald-500'
                          : 'hover:scale-105 active:scale-95'
                      }`}
                    >
                      <Mic
                        className={`w-6 h-6 transition-colors ${
                          listening
                            ? 'text-[#D9383A] animate-pulse'
                            : busy
                            ? 'text-emerald-600 animate-pulse'
                            : 'text-[#0B1310]'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Subtle Frosted Live Peer Count & Status Pill */}
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/45 backdrop-blur-md border border-white/65 shadow-[0_2px_10px_rgba(11,19,16,0.06)] text-[10.5px] font-semibold text-[#0B1310]/85 tracking-tight">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  listening || holdingMic
                    ? 'bg-[#D9383A] animate-pulse'
                    : busy
                    ? 'bg-emerald-600 animate-ping'
                    : 'bg-emerald-600 animate-pulse'
                }`}
              />
              <span>
                {busy
                  ? 'Scrubbing PII on-device...'
                  : listening || holdingMic
                  ? 'Capturing Voice SOS · On-Device'
                  : `2 P2P Relays in Range · ${
                      offlineMode ? '0-Bar Mesh' : '1-Bar Uplink'
                    }`}
              </span>
            </div>
          </div>

          {/* Bottom Prompt */}
          <div className="relative z-10 text-center space-y-1">
            <div className="text-[12px] font-bold tracking-widest text-[#0B1310] uppercase">
              {listening
                ? 'LISTENING ON DEVICE…'
                : busy
                ? 'SCRUBBING PII ON-DEVICE...'
                : 'TAP OR HOLD FOR SOS'}
            </div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-[#0F172A]/65 uppercase">
              ZERO RAW PII LEAVES DEVICE
            </div>
            <ChevronsDown className="w-3.5 h-3.5 text-[#0B1310]/45 mx-auto pt-0.5" />
            <div className="w-28 h-1 rounded-full bg-[#0B1310]/20 mx-auto mt-1.5" />
          </div>
        </section>

        {/* ===================================================================
            3. RIGHT iPHONE — Tactile Dispatch Grid, PII Vault & Directives
           =================================================================== */}
        <section
          aria-label="Tactile Dispatch Grid, PII Vault and Directives iPhone"
          className={`w-[350px] max-w-full h-[720px] rounded-[48px] border-[8px] border-[#1F2329] ring-1 ring-white/15 bg-[#F5F6F8] text-[#111827] shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden relative flex-col p-5 shrink-0 ${
            mobilePane === 'dispatch' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Top iOS Status Bar + Dynamic Island */}
          <div className="flex items-center justify-between px-1 pt-1 shrink-0">
            <span className="text-[13px] font-semibold tracking-tight text-[#111827] tabular-nums w-14">
              9:41
            </span>

            <div className="w-24 h-6 rounded-full bg-black flex items-center justify-end px-2.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  receivedDirectives.length > 0
                    ? 'bg-sky-400 animate-pulse'
                    : 'bg-[#171B26]'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-1.5 w-14 text-[#111827]">
              <Radio className="w-3.5 h-3.5 text-[#D9383A]" />
              <div className="w-5 h-2.5 rounded-[3px] border border-[#111827]/70 p-[1.5px] flex items-center">
                <div className="w-3 h-full rounded-[1px] bg-[#111827]" />
              </div>
            </div>
          </div>

          {/* White Pill Segmented Nav */}
          <nav
            aria-label="Field Node Dispatch Views"
            className="bg-white rounded-2xl p-1.5 shadow-sm grid grid-cols-3 text-xs font-medium mt-3 shrink-0"
          >
            <button
              type="button"
              onClick={() => setRightTab('grid')}
              className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                rightTab === 'grid'
                  ? 'bg-[#D9383A]/[0.08] text-[#D9383A] font-semibold'
                  : 'text-slate-500 hover:text-[#111827]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-[10.5px] leading-none">Alert Grid</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRightTab('vault');
                setVaultBadge(false);
              }}
              className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer relative ${
                rightTab === 'vault'
                  ? 'bg-[#D9383A]/[0.08] text-[#D9383A] font-semibold'
                  : 'text-slate-500 hover:text-[#111827]'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10.5px] leading-none">PII Vault</span>
              {vaultBadge && (
                <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#D9383A] animate-ping" />
              )}
              {lastBeacon && (
                <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#10B981]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRightTab('directives')}
              className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer relative ${
                rightTab === 'directives'
                  ? 'bg-[#D9383A]/[0.08] text-[#D9383A] font-semibold'
                  : 'text-slate-500 hover:text-[#111827]'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span className="text-[10.5px] leading-none">
                Directives ({receivedDirectives.length})
              </span>
            </button>
          </nav>

          {/* TAB 1: ALERT GRID VIEW (Default — Matches Right Phone of Dribbble Shot) */}
          {rightTab === 'grid' && (
            <div className="flex-1 flex flex-col justify-between mt-2.5 min-h-0">
              {/* Clean White Location & SOS Preview Card + Crimson CTA */}
              <div className="bg-white rounded-2xl p-3 shadow-sm space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#F5F6F8] border border-slate-200/70 flex items-center justify-center text-[#111827] shrink-0">
                      <MapPin className="w-4 h-4 text-[#D9383A]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-[#111827] truncate leading-tight">
                        Cedar St Overpass
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {callsign} · On-Device Vault Active
                      </div>
                    </div>
                  </div>

                  {/* Photo Attach Trigger */}
                  <label
                    title={
                      photoDataUrl
                        ? 'Hazard photo attached (cloud-only escalation)'
                        : 'Attach hazard photo'
                    }
                    className={`w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition shrink-0 ${
                      photoDataUrl
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                        : 'bg-[#F5F6F8] hover:bg-slate-200/70 border-slate-200/80 text-slate-600'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Editable Distress Preview */}
                <textarea
                  rows={3}
                  value={input}
                  onChange={(e) => {
                    setManualOverride(true);
                    setInput(e.target.value);
                  }}
                  placeholder="Tap emergency tiles below or describe situation…"
                  aria-label="Editable SOS distress preview"
                  className="w-full rounded-xl bg-[#F8F9FB] border border-slate-200/80 px-2.5 py-1.5 text-[11px] text-[#1F2937] placeholder:text-slate-400 leading-[1.4] focus:outline-none focus:border-[#D9383A]/50 resize-none overflow-y-auto"
                />

                {/* Full-Width Tactile Crimson "Broadcast SOS Beacon" Rounded-Full CTA */}
                <button
                  type="button"
                  onClick={() => void handleSendSos()}
                  disabled={busy || !input.trim()}
                  className={`w-full rounded-full py-2.5 px-4 text-white text-[12.5px] font-semibold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 ${
                    busy
                      ? 'bg-[#0F172A] scale-[0.985] ring-2 ring-emerald-400/50'
                      : 'bg-[#D9383A] hover:bg-[#C32E30] active:scale-[0.985]'
                  }`}
                >
                  {busy ? (
                    <Lock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {busy
                      ? 'Scrubbing PII on-device...'
                      : 'Broadcast SOS Beacon'}
                  </span>
                </button>
              </div>

              {/* 4x3 Tactile Squircle Category Grid */}
              <div className="bg-white rounded-3xl p-3 shadow-sm grid grid-cols-4 gap-2 mt-2.5">
                {SOS_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleToggleCategory(cat.id)}
                      aria-pressed={isSelected}
                      className={`rounded-2xl py-2 px-1 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-[#D9383A] border-[#D9383A] text-white shadow-[0_6px_16px_rgba(217,56,58,0.34)] scale-[1.02]'
                          : 'bg-[#F8F9FB] hover:bg-[#EFF1F5] border-slate-100 text-[#1F2937]'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : `${cat.badgeBg} ${cat.badgeText}`
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <span
                        className={`text-[9.5px] font-semibold leading-none tracking-tight truncate max-w-full px-0.5 ${
                          isSelected ? 'text-white' : 'text-[#1F2937]'
                        }`}
                      >
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Subtle Bottom Privacy Pill + Home Bar */}
              <div className="pt-2 text-center shrink-0">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  <span>PII Firewall · &lt;350B Mesh Packet</span>
                </div>
                <div className="w-28 h-1 rounded-full bg-[#111827]/15 mx-auto mt-2" />
              </div>
            </div>
          )}

          {/* TAB 2: PII VAULT VIEW */}
          {rightTab === 'vault' && (
            <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-0.5">
              {lastBeacon ? (
                <>
                  {/* Card 1: Struck-Through Local PII Scrubbed (ONLY_ON_DEVICE) */}
                  <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-emerald-200/80 space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono font-semibold">
                        <Lock className="w-3 h-3" />
                        <span>ONLY_ON_DEVICE</span>
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-slate-500">
                        {lastBeacon.id} · {lastBeacon.telemetry.latencyMs}ms
                      </span>
                    </div>

                    <div className="text-[11px] font-semibold text-[#111827]">
                      Local PII Scrubbed Before Mesh Broadcast
                    </div>

                    <div className="rounded-xl bg-[#FFF8F8] border border-[#FECACA]/80 p-2.5 text-[11px] text-slate-700 leading-relaxed">
                      {renderStruckThroughPii(lastBeacon.rawInputLocalOnly)}
                    </div>

                    {lastBeacon.piiRedactedTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lastBeacon.piiRedactedTypes.map((piiType) => (
                          <span
                            key={piiType}
                            className="px-1.5 py-0.5 rounded-md bg-[#D9383A]/10 text-[#B91C1C] font-mono text-[9px] font-semibold"
                          >
                            -{piiType}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card 2: <350B Outbound Mesh Packet */}
                  <div className="bg-white rounded-2xl p-3.5 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#111827]">
                        Outbound Mesh Packet (&lt;350B)
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-600">
                        {lastBeacon.rawBytes}B → {lastBeacon.beaconBytes}B
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((lastBeacon.beaconBytes / 350) * 100)
                          )}%`,
                        }}
                        className="h-full rounded-full bg-emerald-500"
                      />
                    </div>

                    <div className="rounded-xl bg-[#111827] text-[#9FE6B8] p-2.5 font-mono text-[9.5px] break-all leading-relaxed">
                      {JSON.stringify(lastBeacon.payload)}
                    </div>
                  </div>

                  {/* Card 3: Numbered Immediate Offline First-Aid */}
                  <div className="bg-white rounded-2xl p-3.5 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#111827]">
                        Immediate Offline First-Aid
                      </span>
                      <span className="text-[9.5px] font-mono text-emerald-600 font-semibold">
                        PREFER_ON_DEVICE
                      </span>
                    </div>

                    <ol className="space-y-2">
                      {lastBeacon.localSurvivalSteps.map((step, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-[11px] text-slate-700 leading-snug"
                        >
                          <span className="w-4 h-4 rounded-full bg-[#D9383A]/12 text-[#D9383A] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRightTab('grid')}
                    className="w-full py-2 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-[11px] font-semibold text-[#111827] shadow-xs transition cursor-pointer"
                  >
                    ← Compose Another SOS Beacon
                  </button>
                </>
              ) : (
                /* Interactive Live Draft Preview before first broadcast */
                <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono font-semibold">
                      <Lock className="w-3 h-3" />
                      <span>ONLY_ON_DEVICE PREVIEW</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      &lt;350B Target
                    </span>
                  </div>

                  <p className="text-[11.5px] font-semibold text-[#111827]">
                    Live Local PII Firewall Inspection
                  </p>

                  <div className="rounded-xl bg-[#FFF8F8] border border-[#FECACA]/80 p-3 text-[11px] text-slate-700 leading-relaxed">
                    {input.trim()
                      ? renderStruckThroughPii(input)
                      : 'Select tiles on Alert Grid to preview real-time on-device PII redaction.'}
                  </div>

                  <p className="text-[10.5px] text-slate-500 leading-relaxed">
                    Struck-through identifiers stay strictly in local device
                    memory and are never transmitted over WebRTC P2P or
                    Firestore.
                  </p>

                  <button
                    type="button"
                    onClick={() => void handleSendSos()}
                    disabled={busy || !input.trim()}
                    className={`w-full rounded-full py-2.5 text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 ${
                      busy
                        ? 'bg-[#0F172A] scale-[0.985] ring-2 ring-emerald-400/50'
                        : 'bg-[#D9383A] hover:bg-[#C32E30] active:scale-[0.985]'
                    }`}
                  >
                    {busy && (
                      <Lock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    )}
                    <span>
                      {busy
                        ? 'Scrubbing PII on-device...'
                        : 'Scrub & Broadcast SOS Beacon'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DIRECTIVES VIEW */}
          {rightTab === 'directives' && (
            <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-0.5">
              {receivedDirectives.length > 0 ? (
                receivedDirectives.map((d) => (
                  <div
                    key={d.id}
                    className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D9383A]/10 text-[#D9383A] font-mono text-[9.5px] font-bold">
                        {d.bytes}B VIA RELAY
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {d.targetCallsign}
                      </span>
                    </div>

                    <p className="text-[12px] font-semibold text-[#111827] leading-snug">
                      {d.message}
                    </p>

                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium pt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        Downlinked from Cloud Gemini Commander via Relay Mule
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2.5">
                  <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#111827]">
                      <Radio className="w-4 h-4 text-[#D9383A] animate-pulse" />
                      <span>Awaiting Relay Mule Downlink</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Listening on offline P2P mesh ({roomId}) for &lt;1KB
                      tactical directives synthesized by Cloud Gemini Incident
                      Commander.
                    </p>
                  </div>

                  {/* Tactile Packet Schema Preview Card */}
                  <div className="bg-white/75 rounded-2xl p-3.5 border border-dashed border-slate-300 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-mono font-semibold text-slate-500">
                        81B VIA RELAY · DOWNLINK FORMAT
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600">
                        STANDBY
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-600 leading-snug">
                      ACK: Hazmat+EMS dispatched w/ insulin via Pine St. ETA
                      14m. Stay upwind of alley.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
