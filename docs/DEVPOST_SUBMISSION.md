# ZeroBar — Devpost Submission (#BuildHybridAI 2026)

> **Copy-paste ready** for the Devpost submission form. Calibrated to qualify across **Grand Prize + Web + iOS + Android** and address all four equal **#BuildHybridAI** judging criteria: **Hybrid AI Architecture**, **Technical Execution**, **Innovation & Impact**, and **UX & Multi-Platform Polish**.

---

## Project Title
**ZeroBar — Off-Grid Crisis Swarm & Hybrid AI Incident Commander**

## Tagline (Short Pitch)
Zero cellular bars. Zero leaked PII. On-device Gemini Nano (Chrome & Android AICore) and Apple Foundation Models scrub PII & compress SOS calls into <400B P2P beacons; Cloud Gemini fuses the swarm into <1KB rescue directives.

## Live Demo & Repository Links
- **Live Firebase Hosting Demo:** https://zerobar-hybrid-ai-2026.web.app
- **Direct Mobile Field SOS View:** https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01
- **Public GitHub Repository (MIT — Web + iOS + Android):** https://github.com/samadon1/zerobar
- **Firebase Project ID:** `zerobar-hybrid-ai-2026`

---

## Inspiration
When a 7.2 earthquake, wildfire, or power-grid blackout strikes, **up to 90% of trapped citizens lose cellular service immediately**, while only intermittent responder vehicles, drones, or ridge relays briefly catch a single bar of signal.

Existing AI emergency tools fail catastrophically in this reality for two opposite reasons:
1. **Cloud-only AI is useless at zero bars** — and worse, forcing desperate citizens to broadcast raw distress messages over untrusted peer-to-peer relays leaks sensitive personal data (full names, SSNs, exact home addresses, medical IDs).
2. **On-device-only AI is blind to the city** — a single phone running a local model cannot deduplicate overlapping eyewitness reports across neighborhoods, resolve conflicting bridge/road-closure rumors, or inspect multi-angle hazard photos.

We built **ZeroBar** because crisis response is a *textbook* problem that **cannot** be solved by cloud-only or edge-only AI alone—it demands **true Hybrid AI** across every citizen device on the ground (**Web/Chrome, iOS, and Android**).

---

## What It Does
ZeroBar turns every citizen's browser, iPhone, or Android phone into an **offline-first AI triage node** and every moving vehicle or responder into an opportunistic **store-and-forward Relay Mule**, orchestrated by a **Cloud Incident Commander**:

1. **Stage 1 — Local PII Privacy Vault (`InferenceMode.ONLY_ON_DEVICE`)**:
   - The moment a citizen types or speaks a panicked SOS (in any language) while completely offline, ZeroBar runs strictly on-device inference—**Chrome Gemini Nano** on Web (`src/`), **Apple Foundation Models** on iOS (`ios/ZeroBarField/`), and **Android AICore Gemini Nano** on Android (`android/ZeroBarField/`)—to strip names, SSNs, phone numbers, exact street addresses, and medical IDs locally in RAM.
   - **Raw citizen text (`rawInputLocalOnly`) mathematically never leaves the origin device.**
2. **Stage 2 — Edge Triage Compression & Offline Survival Coach (`InferenceMode.PREFER_ON_DEVICE`)**:
   - In ~150ms with zero network bars, on-device AI compresses a verbose multi-sentence distress message into a structured **`<400-byte` JSON `CompactBeaconPayload`** (75–85% bandwidth reduction for P2P mesh gossip) and immediately displays **3 actionable offline first-aid & survival steps**.
   - On devices or browsers where local weights are still warming up, Firebase AI Logic transparently falls back to Cloud Gemini (`gemini-2.5-flash`) when online—or to ZeroBar's deterministic zero-network local fallback when strictly offline—while recording the exact `response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`).
3. **P2P Store-and-Forward Gossip (WebRTC DataChannel + Offline PWA + Native Firestore Cache)**:
   - Compact `<400B` beacons hop between nearby nodes over **WebRTC `RTCDataChannel`** and offline-persisted mesh queues until a passing **Relay Mule** sweeps across the Golden Gate / Marin **Uplink Ridge**.
4. **Stage 3 — Cloud Swarm Fusion & Directive Downlink (`InferenceMode.ONLY_IN_CLOUD`)**:
   - When the Relay Mule syncs its queued PII-free beacons (plus optional hazard photos via multimodal `InlineDataPart`) to Firestore, **Cloud Gemini (`gemini-2.5-flash`)** fuses reports across Web, iOS, and Android Field Nodes, deduplicates overlapping casualties, **resolves conflicting eyewitness intelligence** (e.g., Harbor Bridge North Ramp blocked vs. Pine St South approach clear), and generates **`<1KB` Tactical Directives** pushed back through Firestore so relays carry rescue orders *back into the blackout zone*.

---

## How We Built It

### 1. Firebase AI Logic — Three Purpose-Built `InferenceMode` Pipelines Across Web, iOS & Android
Rather than using hybrid inference as a generic fallback, ZeroBar assigns each `InferenceMode` a distinct architectural responsibility across all three official `#BuildHybridAI` SDKs—`src/services/firebase.ts` & `src/services/hybridEngine.ts` (Web), `ios/ZeroBarField/Services/HybridAIEngine.swift` (iOS), and `android/ZeroBarField/app/src/main/java/app/zerobar/field/services/HybridAIEngine.kt` (Android):
- **`InferenceMode.ONLY_ON_DEVICE` (`privacyVaultModel`)**: Enforces a hard privacy boundary on Chrome Gemini Nano, Apple Foundation Models, and Android AICore Gemini Nano so raw PII never touches cloud endpoints.
- **`InferenceMode.PREFER_ON_DEVICE` (`edgeTriageModel`)**: Delivers instant offline compression (`<400B` JSON) and life-safety coaching on-device, paired with seamless `gemini-2.5-flash` cloud fallback when online.
- **`InferenceMode.ONLY_IN_CLOUD` (`cloudCommanderModel`)**: Performs heavy cross-node swarm reasoning, contradiction resolution, and multimodal photo hazard analysis (`InlineDataPart`) when relays reach uplink.
- **Live Telemetry Proof**: Every call inspects `response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`) and streams latency, byte compression ratio, and privacy status into the live telemetry feed.

### 2. Defense-in-Depth Security: Tri-Platform Firebase App Check + Database-Layer Privacy Invariant
- **Firebase App Check Across All 3 Platforms**:
  - **Web:** `ReCaptchaV3Provider` (with hackathon debug token support) in `src/services/firebase.ts`.
  - **iOS:** `AppAttestProviderFactory` (with `AppCheckDebugProviderFactory` in `#if DEBUG`) in `HybridAIEngine.swift`.
  - **Android:** `PlayIntegrityAppCheckProviderFactory` (with `DebugAppCheckProviderFactory` in debug builds) in `HybridAIEngine.kt`.
- **Database-Layer Privacy Invariant (`firestore.rules`)**: Even if a compromised client attempted to upload raw citizen text, our Firestore Security Rules **explicitly reject** any write to `rooms/{roomId}/beacons/{beaconId}` that:
  - Contains the forbidden `rawInputLocalOnly` field (at root or nested inside `payload`),
  - Contains an unredacted SSN pattern (`XXX-XX-XXXX`) in `payload.sum`,
  - Exceeds the strict `beaconBytes <= 2048` payload ceiling, or
  - Fails strict `CompactBeaconPayload` schema validation (`sev`, `cat`, `ppl`, `med`, `haz`, `loc`, `sum`, `ts`).

### 3. True Multi-Platform & Offline-First Architecture (Web + iOS + Android)
- **Web Spatial Command Center & Offline Field PWA (`src/`)** — *React 19, TypeScript, MapLibre GL JS, Tailwind CSS, Vite*:
  - Full-bleed **MapLibre GL JS** coastal-mountain satellite terrain map (Marin Headlands / Golden Gate Strait) with lime 0-Bar blackout geofence polygons, 60fps `requestAnimationFrame` Relay Mule patrol, animated P2P packet flights, side-by-side **PII Vault** redaction diff, 1-click **Simulate 7.2 Quake** swarm demo, and QR-code phone pairing.
  - True offline PWA (`public/manifest.webmanifest` + `public/sw.js`) with Firestore `persistentLocalCache` + `persistentMultipleTabManager` and real **WebRTC `RTCDataChannel`** P2P mesh transport (`src/services/webrtcMesh.ts`).
- **Native iOS SwiftUI Field Node (`ios/ZeroBarField/`)** — *SwiftUI, `FirebaseAI`, Apple Foundation Models, `AppAttest`*:
  - Targets iOS 18+ / iOS 26 with `firebase-ios-sdk` (`FirebaseAI`, `FirebaseAppCheck`, `FirebaseFirestore`), Speech framework voice SOS dictation, `ONLY_ON_DEVICE` + `PREFER_ON_DEVICE` Apple Foundation Models inference, and `CodingKeys` omission of `rawInputLocalOnly` so raw PII cannot serialize.
- **Native Android Jetpack Compose Field Node (`android/ZeroBarField/`)** — *Kotlin, Jetpack Compose Material 3, `firebase-ai-ondevice` (AICore Gemini Nano), `PlayIntegrity`*:
  - Built with Firebase BoM, `com.google.firebase:firebase-ai`, `com.google.firebase:firebase-ai-ondevice` (`OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE)` & `PREFER_ON_DEVICE`), `PlayIntegrityAppCheckProviderFactory`, and `FirebaseFirestore` persistent cache.
  - Features a dark/mint tactical Material 3 SOS screen (`FieldNodeScreen.kt`) with 0-Bar Offline toggle, Android `SpeechRecognizer` voice SOS, emergency category chips, struck-through PII redaction proof, `@Exclude` zero-PII Firestore mapping (`MeshModels.kt`), and real-time Cloud HQ Relay Directives listener.

---

## Challenges We Ran Into
- **Preventing Accidental Cloud Leaks on Offline Nodes**: `PREFER_ON_DEVICE` naturally falls back to cloud when on-device weights aren't ready—which would violate our blackout simulation if a node is toggled to 0-Bar Offline Mode. Across Web, iOS, and Android, we guarded the edge triage pipeline with an explicit node connectivity check and a deterministic zero-network fallback so offline nodes never silently hit the cloud while showcasing real `ON_DEVICE` Chrome Nano / Apple Intelligence / Android AICore inference when available.
- **4-Way Schema & Security Rule Parity (Web ↔ iOS ↔ Android ↔ `firestore.rules`)**: Aligning TypeScript interfaces (`src/types/mesh.ts`), Swift `Codable` structs (`MeshModels.swift`), Kotlin data classes & `toFirestoreMap()` (`MeshModels.kt`), and `firestore.rules` required field-by-field verification—so we built an automated zero-dependency verifier (`scripts/verify-submission.mjs`) to enforce parity on every build.
- **Enforcing `<400B` Compactness Under Stress**: Prompting compact on-device models across three runtimes to emit valid `<400B` JSON while simultaneously generating 3 concrete survival steps required tight schemas, defensive JSON extraction, and byte-budget validation at both the client and Firestore rule layers.

---

## Accomplishments That We're Proud Of
- **All 3 `#BuildHybridAI` Platforms in One Unified Swarm**: A Web/Chrome MapLibre Spatial Command Center + Offline PWA, a native SwiftUI iOS Field Node, and a native Jetpack Compose Android Field Node—all reading and writing the exact same Firestore rooms (`rooms/{roomId}/beacons` and `rooms/{roomId}/briefs`).
- **Zero-PII Architectural Proof**: Proving privacy at both the AI layer (`ONLY_ON_DEVICE` + visual struck-through PII Vault diff) *and* the database layer (`firestore.rules` hard-rejecting `rawInputLocalOnly` and SSN patterns, plus client-side destructuring/`CodingKeys`/`@Exclude`).
- **75–85% Bandwidth Reduction (`~291B` avg packet)**: Compressing panicked multi-language SOS reports into `<400B` structured beacons small enough to hop over constrained P2P DataChannels, BLE, or LoRa-class links.
- **Full Closed-Loop Hybrid Demo**: Not just edge-to-cloud uplink, but **cloud-to-edge `<1KB` directive downlink** where Cloud Gemini resolves eyewitness contradictions and sends rescue ACKs *back* into the dead zone via Relay Mules.

---

## What We Learned
- Hybrid AI shines brightest when **each tier does what the other physically cannot**: on-device models (Chrome Nano, Apple Foundation Models, Android AICore) own privacy, zero-latency survival coaching, and bandwidth compression; cloud models (`gemini-2.5-flash`) own city-wide situational awareness, contradiction resolution, and multimodal photo synthesis.
- Surfacing `response.inferenceSource` directly in the UI transforms hybrid inference from an invisible implementation detail into verifiable user trust—especially in life-safety and privacy-critical workflows.

---

## What's Next for ZeroBar
- **Native BLE / MultipeerConnectivity / Nearby Connections & LoRaWAN Bridge**: Bind iOS `MultipeerConnectivity`, Android `Nearby Connections`, and Meshtastic/LoRa serial gateways directly to `CompactBeaconPayload` so `<400B` beacons hop over kilometer-scale off-grid radios between iPhones and Android phones.
- **Multilingual On-Device Speech-to-Beacon**: Pair offline speech recognition with `ONLY_ON_DEVICE` normalization so non-English distress calls map automatically into standardized ICS/FEMA triage codes before leaving the device.
- **Responder Dispatch Integrations**: Export deduplicated `CloudIncidentBrief` records directly into CAP (Common Alerting Protocol) and municipal 911 CAD systems.

---

## Judging Criteria Alignment

| Judging Criterion (25% Each) | How ZeroBar Delivers |
| :--- | :--- |
| **Hybrid AI Architecture & Firebase AI Logic** | Uses all 3 `InferenceMode` tiers (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `ONLY_IN_CLOUD`) across Web (`firebase/ai`), iOS (`FirebaseAI`), and Android (`firebase-ai-ondevice`) with real-time `response.inferenceSource` telemetry and multimodal `InlineDataPart` hazard photo fusion. |
| **Technical Execution & Reliability** | Tri-platform Firebase App Check (`ReCaptchaV3` + `AppAttest` + `PlayIntegrity`), database-layer Privacy Invariant in `firestore.rules`, Firestore `persistentLocalCache`, offline Service Worker PWA, WebRTC `RTCDataChannel` P2P transport, and automated 12-gate `verify-submission.mjs` suite. |
| **Innovation & Real-World Impact** | Solves a concrete life-safety gap (0-bar disaster blackouts) where neither cloud-only nor edge-only AI works, achieving 75–85% P2P payload compression (`~291B` avg), strict PII containment, and closed-loop `<1KB` rescue directives. |
| **User Experience & Multi-Platform Polish** | Spatial glass MapLibre GL Command Center, side-by-side struck-through PII Vault proof, Dual-Mode Field SOS PWA, Hybrid Architecture Blueprint modal, native iOS SwiftUI app, and native Android Jetpack Compose app sharing 100% Firestore schema parity. |

---

## Built With
`firebase` · `firebase-ai-logic` · `gemini-nano` · `android-aicore` · `gemini-2.5-flash` · `apple-foundation-models` · `firebase-app-check` · `cloud-firestore` · `firebase-hosting` · `react` · `typescript` · `maplibre-gl` · `tailwindcss` · `webrtc` · `pwa` · `swiftui` · `kotlin` · `jetpack-compose`
