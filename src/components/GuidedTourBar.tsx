import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export type TourStepIndex = 0 | 1 | 2 | 3;

export interface TourChapterMeta {
  step: TourStepIndex;
  pillLabel: string;
  title: string;
  modeBadge: 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD';
  caption: string;
  voiceScript: string;
  durationMs: number;
}

export const STORY_TOUR_CHAPTERS: readonly TourChapterMeta[] = [
  {
    step: 0,
    pillLabel: '01 On-Device Vault',
    title: 'On-Device PII Vault & Offline Survival Triage',
    modeBadge: 'ONLY_ON_DEVICE',
    caption:
      'Firebase AI Logic runs strictly ONLY_ON_DEVICE in local RAM—striking out names, SSNs, and street addresses before any packet touches the radio mesh.',
    voiceScript:
      'Chapter 1: On-Device Privacy Vault. Firebase AI Logic runs strictly ONLY ON DEVICE to scrub names, social security numbers, and street addresses in RAM before any radio hop.',
    durationMs: 8000,
  },
  {
    step: 1,
    pillLabel: '02 WebRTC P2P Relay',
    title: 'Sub-305B Beacons & WebRTC Data-Mule Sweep',
    modeBadge: 'PREFER_ON_DEVICE',
    caption:
      'PREFER_ON_DEVICE compresses SOS reports by 68% into <305B JSON beacons as RELAY-MULE-01 glides across Golden Gate scooping all 3 sectors peer-to-peer.',
    voiceScript:
      'Chapter 2: WebRTC Peer-to-Peer Relay. PREFER ON DEVICE compresses crisis reports into sub-305-byte beacons as Relay Mule 01 sweeps the Golden Gate blackout zone.',
    durationMs: 10000,
  },
  {
    step: 2,
    pillLabel: '03 Cloud Gemini Fusion',
    title: 'App Check Cloud Gemini Swarm Fusion & Downlink',
    modeBadge: 'ONLY_IN_CLOUD',
    caption:
      'Crossing Uplink Ridge fires ONLY_IN_CLOUD Gemini 2.5 Flash to fuse multi-node beacons, resolve bridge contradictions, and relay <1KB directives back.',
    voiceScript:
      'Chapter 3: Cloud Gemini Swarm Fusion. Crossing Uplink Ridge triggers ONLY IN CLOUD Gemini to fuse all three beacons, resolve the Harbor Bridge route contradiction, and carry tactical directives back.',
    durationMs: 11000,
  },
  {
    step: 3,
    pillLabel: '04 Field SOS Node',
    title: 'Dual-iPhone Field SOS Radar & 12-Tile Crisis Grid',
    modeBadge: 'ONLY_ON_DEVICE',
    caption:
      'Citizens pair via QR or offline PWA, iOS, and Android field nodes—scanning 0-bar mesh peers on live radar while ONLY_ON_DEVICE guards 12 SOS tiles.',
    voiceScript:
      'Chapter 4: Field SOS Node. Citizens pair over QR or native iOS and Android field nodes, scanning nearby mesh peers on zero-bar radar with one-tap offline triage.',
    durationMs: 9000,
  },
] as const;

interface GuidedTourBarProps {
  tourStep: TourStepIndex | null;
  chapterStartedAt: number;
  voiceoverEnabled: boolean;
  onToggleVoiceover: () => void;
  onSelectStep: (step: TourStepIndex) => void;
  onNextStep: () => void;
  onEndTour: () => void;
}

function renderCaptionWithModeHighlight(caption: string): React.ReactNode[] {
  const modeRegex = /(ONLY_ON_DEVICE|PREFER_ON_DEVICE|ONLY_IN_CLOUD)/g;
  const parts = caption.split(modeRegex);
  return parts.map((part, idx) => {
    if (
      part === 'ONLY_ON_DEVICE' ||
      part === 'PREFER_ON_DEVICE' ||
      part === 'ONLY_IN_CLOUD'
    ) {
      const isCloud = part === 'ONLY_IN_CLOUD';
      return (
        <code
          key={`${idx}-${part}`}
          className={`px-1 py-0.5 rounded font-mono text-[11px] font-semibold ${
            isCloud
              ? 'bg-[#F2B84B]/14 text-[#F2B84B]'
              : 'bg-[#B7E852]/14 text-[#B7E852]'
          }`}
        >
          {part}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const GuidedTourBar: React.FC<GuidedTourBarProps> = ({
  tourStep,
  chapterStartedAt,
  voiceoverEnabled,
  onToggleVoiceover,
  onSelectStep,
  onNextStep,
  onEndTour,
}) => {
  const [progressPct, setProgressPct] = useState<number>(0);

  // Smooth 60fps progress bar tracking elapsed time within the active chapter
  useEffect(() => {
    if (tourStep === null) {
      setProgressPct(0);
      return;
    }

    const chapter = STORY_TOUR_CHAPTERS[tourStep];
    let rafId: number | null = null;

    const update = () => {
      const elapsed = Math.max(0, Date.now() - chapterStartedAt);
      const pct = Math.min(100, (elapsed / chapter.durationMs) * 100);
      setProgressPct(pct);
      if (pct < 100) {
        rafId = requestAnimationFrame(update);
      }
    };

    rafId = requestAnimationFrame(update);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [tourStep, chapterStartedAt]);

  // Optional Web Speech API narration — strictly opt-in (silent by default)
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    if (tourStep === null || !voiceoverEnabled) {
      return;
    }

    let cancelled = false;
    const chapter = STORY_TOUR_CHAPTERS[tourStep];

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const utterance = new SpeechSynthesisUtterance(chapter.voiceScript);
        utterance.rate = 1.04;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              /(Samantha|Daniel|Ava|Google US English|Natural)/i.test(v.name)
          ) || voices.find((v) => v.lang.startsWith('en'));
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore browser speech synthesis restrictions
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.speechSynthesis.cancel();
    };
  }, [tourStep, voiceoverEnabled]);

  if (tourStep === null) {
    return null;
  }

  const currentChapter = STORY_TOUR_CHAPTERS[tourStep];
  const isCloudChapter = currentChapter.modeBadge === 'ONLY_IN_CLOUD';

  return (
    <aside
      role="region"
      aria-label="ZeroBar Guided Story Tour"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[540px] w-[calc(100%-32px)] bg-[#141619]/92 backdrop-blur-2xl border border-[#B7E852]/30 rounded-[22px] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-[#F3F4F6]"
    >
      {/* Top Row: 4 Crisp Chapter Progress Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {STORY_TOUR_CHAPTERS.map((ch) => {
          const isActive = ch.step === tourStep;
          const isCompleted = ch.step < tourStep;

          return (
            <button
              key={ch.step}
              type="button"
              onClick={() => onSelectStep(ch.step)}
              className={`relative overflow-hidden rounded-xl px-1.5 py-1.5 border text-[9.75px] font-medium tracking-[-0.015em] whitespace-nowrap text-center transition cursor-pointer ${
                isActive
                  ? 'bg-[#B7E852]/16 border-[#B7E852]/65 text-[#B7E852] shadow-[0_0_16px_rgba(183,232,82,0.18)]'
                  : isCompleted
                  ? 'bg-[#B7E852]/[0.06] border-[#B7E852]/22 text-[#D9F59B] hover:bg-[#B7E852]/12'
                  : 'bg-white/[0.03] border-white/[0.07] text-[#8A919E] hover:text-[#D1D5DB] hover:bg-white/[0.06]'
              }`}
            >
              <span className="relative z-10 block truncate">{ch.pillLabel}</span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-[2px] bg-[#B7E852] transition-[width] duration-75"
                  style={{ width: `${progressPct}%` }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Chapter Title + Active Firebase AI Logic Mode Badge */}
      <div className="mt-3 flex items-center justify-between gap-2.5">
        <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em] leading-snug min-w-0 truncate">
          {currentChapter.title}
        </h2>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-mono text-[10px] font-semibold whitespace-nowrap ${
            isCloudChapter
              ? 'bg-[#F2B84B]/12 border-[#F2B84B]/35 text-[#F2B84B]'
              : 'bg-[#B7E852]/12 border-[#B7E852]/35 text-[#B7E852]'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              isCloudChapter ? 'bg-[#F2B84B]' : 'bg-[#B7E852]'
            }`}
          />
          <span>{currentChapter.modeBadge}</span>
        </span>
      </div>

      {/* Concise 2-Line Judge Narration Caption */}
      <p className="mt-1.5 text-[12.5px] text-[#B0B7C3] leading-[1.5]">
        {renderCaptionWithModeHighlight(currentChapter.caption)}
      </p>

      {/* Controls Bar: Optional Voiceover Toggle + Next + End Tour */}
      <div className="mt-3.5 pt-2.5 border-t border-white/[0.07] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleVoiceover}
          aria-pressed={voiceoverEnabled}
          title={
            voiceoverEnabled
              ? 'Mute Web Speech voiceover narration'
              : 'Enable optional Web Speech voiceover narration'
          }
          className={`h-8 px-2.5 rounded-xl border text-[12px] font-medium inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            voiceoverEnabled
              ? 'bg-[#B7E852]/15 border-[#B7E852]/45 text-[#B7E852]'
              : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-[#B0B7C3] hover:text-white'
          }`}
        >
          {voiceoverEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-[#B7E852]" strokeWidth={2} />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-[#8A919E]" strokeWidth={2} />
          )}
          <span>🔊 Voiceover</span>
          <span className="text-[10.5px] opacity-75">
            {voiceoverEnabled ? 'On' : 'Off'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNextStep}
            className="h-8 px-3.5 rounded-xl bg-[#B7E852] hover:bg-[#c5f069] text-[#0D1013] text-[12px] font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <span>Next →</span>
          </button>

          <button
            type="button"
            onClick={onEndTour}
            className="h-8 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-[#D1D5DB] hover:text-white text-[12px] font-medium inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <span>✕ End Tour</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
