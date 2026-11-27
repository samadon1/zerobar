# ZeroBar — Devpost Submission (#BuildHybridAI 2026)

> **Copy-paste ready** for the Devpost submission form. Every section is calibrated to the four equal **#BuildHybridAI** judging criteria: **Hybrid AI Architecture**, **Technical Execution**, **Innovation & Impact**, and **UX & Multi-Platform Polish**.

---

## Project Title
**ZeroBar — Off-Grid Crisis Swarm & Hybrid AI Incident Commander**

## Tagline (Short Pitch)
Zero cellular bars. Zero leaked PII. On-device Gemini Nano & Apple Foundation Models compress offline distress calls into <400B P2P beacons; Cloud Gemini fuses the swarm into <1KB rescue directives.

## Live Demo & Repository Links
- **Live Firebase Hosting Demo:** https://zerobar-hybrid-ai-2026.web.app
- **Direct Mobile Field SOS View:** https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01
- **Public GitHub Repository (MIT):** https://github.com/samadon1/zerobar
- **Firebase Project ID:** `zerobar-hybrid-ai-2026`

---

## Inspiration
When a 7.2 earthquake, wildfire, or power-grid blackout strikes, **up to 90% of trapped citizens lose cellular service immediately**, while only intermittent responder vehicles, drones, or ridge relays briefly catch a single bar of signal.

Existing AI emergency tools fail catastrophically in this reality for two opposite reasons:
1. **Cloud-only AI is useless at zero bars** — and worse, forcing desperate citizens to broadcast raw distress messages over untrusted peer-to-peer relays leaks sensitive personal data (full names, SSNs, exact home addresses, medical IDs).
2. **On-device-only AI is blind to the city** — a single phone running a local model cannot deduplicate overlapping eyewitness reports across neighborhoods, resolve conflicting bridge/road-closure rumors, or inspect multi-angle hazard photos.

We built **ZeroBar** because crisis response is a *textbook* problem that **cannot** be solved by cloud-only or edge-only AI alone—it demands **true Hybrid AI**.

---

## What It Does
ZeroBar turns every citizen's phone into an **offline-first AI triage node** and every moving vehicle or responder into an opportunistic **store-and-forward Relay Mule**, orchestrated by a **Cloud Incident Commander**:

1. **Stage 1 — Local PII Privacy Vault (`InferenceMode.ONLY_ON_DEVICE`)**:
   - The moment a citizen types or speaks a panicked SOS (in any language) while completely offline, ZeroBar runs strictly on-device inference (Chrome Gemini Nano on Web / Apple Foundation Models on iOS) to strip names, SSNs, phone numbers, exact street addresses, and medical IDs.
   - **Raw citizen text (`rawInputLocalOnly`) mathematically never leaves the origin device.**
2. **Stage 2 — Edge Triage Compression & Offline Survival Coach (`InferenceMode.PREFER_ON_DEVICE`)**:
   - In ~150ms with zero network bars, on-device AI compresses a verbose multi-sentence distress message into a structured **`<400-byte` JSON `CompactBeaconPayload`** (75–85% bandwidth reduction for P2P mesh gossip) and immediately displays **3 actionable offline first-aid & survival steps**.
   - On browsers without built-in Nano, Firebase AI Logic transparently falls back to Cloud Gemini when online—or to ZeroBar's zero-network local fallback when strictly offline—while recording the exact `response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`).
3. **P2P Store-and-Forward Gossip (WebRTC DataChannel + Offline PWA + Firestore Cache)**:
   - Compact `<400B` beacons hop between nearby devices over **WebRTC `RTCDataChannel`** (and local mesh relay links) until a passing **Relay Mule** sweeps into a 1-bar cellular **Uplink Ridge**.
4. **Stage 3 — Cloud Swarm Fusion & Directive Downlink (`InferenceMode.ONLY_IN_CLOUD`)**:
   - When the Relay Mule syncs its queued PII-free beacons (plus optional hazard photos via multimodal `InlineDataPart`) to Firestore, **Cloud Gemini (`gemini-2.5-flash`)** fuses the entire neighborhood's reports, deduplicates overlapping casualties, **resolves conflicting eyewitness intelligence** (e.g., Harbor Bridge North Ramp blocked vs. Pine St South approach clear), and generates **`<1KB` Tactical Directives** pushed back through Firestore so relays carry rescue orders *back into the blackout zone*.

---

## How We Built It

### 1. Firebase AI Logic — Three Purpose-Built `InferenceMode` Pipelines
Rather than using hybrid inference as a generic fallback, ZeroBar assigns each `InferenceMode` a distinct architectural responsibility in `src/services/firebase.ts`, `src/services/hybridEngine.ts`, and `ios/ZeroBarField/Services/HybridAIEngine.swift`:
- **`InferenceMode.ONLY_ON_DEVICE` (`privacyVaultModel`)**: Enforces a hard privacy boundary so raw PII can never touch cloud endpoints.
- **`InferenceMode.PREFER_ON_DEVICE` (`edgeTriageModel`)**: Delivers instant offline compression (`<400B` JSON) and life-safety coaching on Chrome Gemini Nano / Apple Foundation Models, with seamless Cloud Gemini (`gemini-2.5-flash`) fallback.
- **`InferenceMode.ONLY_IN_CLOUD` (`cloudCommanderModel`)**: Performs heavy cross-node swarm reasoning, contradiction resolution, and multimodal photo hazard analysis when relays reach uplink.
- **Live Telemetry Proof**: Every call inspects `result.response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`) and streams latency, byte compression ratio, and privacy status into the live **Hybrid Telemetry Strip**.

### 2. Defense-in-Depth Security: Firebase App Check + Database-Layer Privacy Invariant
- **Firebase App Check**: Enabled across both platforms—`ReCaptchaV3Provider` (with debug token support) on Web and `AppAttestProviderFactory` / `AppCheckDebugProviderFactory` on iOS—protecting both Firestore and Firebase AI Logic endpoints.
- **Database-Layer Privacy Invariant (`firestore.rules`)**: Even if a compromised client attempted to upload raw citizen text, our Firestore Security Rules **explicitly reject** any write to `rooms/{roomId}/beacons/{beaconId}` that:
  - Contains the forbidden `rawInputLocalOnly` field (at root or nested inside `payload`),
  - Contains an unredacted SSN pattern (`XXX-XX-XXXX`) in `payload.sum`,
  - Exceeds the strict `beaconBytes <= 2048` payload ceiling, or
  - Fails strict `CompactBeaconPayload` schema validation (`sev`, `cat`, `ppl`, `med`, `haz`, `loc`, `sum`, `ts`).

### 3. True Multi-Platform & Offline-First Architecture
- **Web Command Center & Mobile Field PWA** (React 19, TypeScript, Vite, Tailwind CSS):
  - Interactive dark-mode tactical vector map with drag-and-drop mesh nodes, animated P2P packet hops, 1-click **7.2 Quake Swarm Demo**, and QR-code phone pairing ([`https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01`](https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01)).
  - True offline PWA (`public/manifest.webmanifest` + `public/sw.js`) with network-first cache fallback and Firestore `persistentLocalCache` + `persistentMultipleTabManager` so the app reloads and operates in Airplane Mode.
  - Real **WebRTC `RTCDataChannel`** P2P mesh transport (`src/services/webrtcMesh.ts`) for live cross-tab/cross-device `<400B` beacon exchange.
- **Native iOS SwiftUI Field Node** (`ios/ZeroBarField/`):
  - Targets iOS 18+ / iOS 26 with `firebase-ios-sdk` (`FirebaseAI`, `FirebaseAppCheck`, `FirebaseFirestore`), using Apple Foundation Models via Firebase AI Logic (`ONLY_ON_DEVICE` + `PREFER_ON_DEVICE`) and sharing the exact same Firestore collections (`rooms/{roomId}/beacons/{beaconId}` and `rooms/{roomId}/briefs/{briefId}`) for real-time cross-platform Web ↔ iOS sync.

---

## Challenges We Ran Into
- **Preventing Accidental Cloud Leaks on Offline Nodes**: `PREFER_ON_DEVICE` naturally falls back to cloud when on-device weights aren't ready—which would violate our blackout simulation if a node is toggled to 0-Bar Offline Mode. We guarded the edge triage pipeline with an explicit node connectivity check and a deterministic zero-network fallback so offline nodes never silently hit the cloud while still showcasing real `ON_DEVICE` Chrome Nano / Apple Intelligence inference when available.
- **Cross-Platform Schema Parity (Web ↔ iOS ↔ Firestore Rules)**: Aligning TypeScript interfaces (`src/types/mesh.ts`), Swift `Codable` structs (`ios/ZeroBarField/Models/MeshModels.swift`), and Firestore Security Rules (`firestore.rules`) required strict field-by-field parity so that iOS Field Nodes and Web/PWA nodes seamlessly fuse inside the same Cloud Incident Commander session.
- **Enforcing Compactness Under Stress**: Prompting small on-device models to reliably emit `<400B` valid JSON while simultaneously generating 3 concrete survival steps required tight JSON schemas, defensive JSON extraction, and byte-budget validation at both the client and Firestore rule layers.

---

## Accomplishments That We're Proud Of
- **Zero-PII Architectural Proof**: Proving privacy both at the AI layer (`ONLY_ON_DEVICE`) *and* at the database layer (`firestore.rules` hard-rejecting `rawInputLocalOnly` and SSN patterns).
- **75–85% Bandwidth Reduction**: Compressing verbose, panicked multi-language SOS reports down to `<400B` structured beacons—small enough to hop over constrained P2P radios, BLE, or LoRa-class links.
- **Full Closed-Loop Hybrid Demo**: Not just edge-to-cloud uplink, but **cloud-to-edge `<1KB` directive downlink** where Cloud Gemini resolves eyewitness contradictions and sends rescue instructions *back* into the dead zone via Relay Mules.
- **Real Multi-Platform Stack**: Desktop Command Center, installable Offline Mobile PWA, WebRTC P2P DataChannel transport, and a native SwiftUI iOS Field Node all speaking one unified Firebase schema.

---

## What We Learned
- Hybrid AI shines brightest when **each tier does what the other physically cannot**: on-device models own privacy, zero-latency survival coaching, and bandwidth compression; cloud models own global situational awareness, contradiction resolution, and multimodal synthesis.
- Surfacing `response.inferenceSource` directly in the UI transforms hybrid inference from an invisible implementation detail into verifiable user trust—especially in life-safety and privacy-critical workflows.

---

## What's Next for ZeroBar
- **Native BLE / MultipeerConnectivity & LoRaWAN Bridge**: Bind the iOS SwiftUI Field Node's `CompactBeaconPayload` directly to Apple's `MultipeerConnectivity` and Meshtastic/LoRa serial gateways so `<400B` beacons hop over kilometer-scale off-grid radios.
- **Multilingual On-Device Speech-to-Beacon**: Pair on-device speech recognition with `ONLY_ON_DEVICE` translation so non-English distress calls normalize automatically into standardized ICS/FEMA triage codes before leaving the device.
- **Responder Dispatch Integrations**: Export deduplicated `CloudIncidentBrief` records directly into CAP (Common Alerting Protocol) and municipal 911 CAD systems.

---

## Judging Criteria Alignment

| Judging Criterion (25% Each) | How ZeroBar Delivers |
| :--- | :--- |
| **Hybrid AI Architecture & Firebase AI Logic** | Uses all 3 `InferenceMode` tiers (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `ONLY_IN_CLOUD`) with real-time `response.inferenceSource` telemetry (`ON_DEVICE` vs `IN_CLOUD`) and multimodal `InlineDataPart` hazard photo fusion. |
| **Technical Execution & Reliability** | Firebase App Check (`ReCaptchaV3` + `AppAttest`), database-layer Privacy Invariant in `firestore.rules`, Firestore `persistentLocalCache`, true offline PWA Service Worker, WebRTC `RTCDataChannel` P2P transport, and graceful zero-network fallbacks. |
| **Innovation & Real-World Impact** | Solves a concrete life-safety gap (0-bar disaster blackouts) where neither cloud-only nor edge-only AI works, achieving 75–85% P2P payload compression, strict PII containment, and closed-loop `<1KB` rescue directives. |
| **User Experience & Multi-Platform Polish** | High-contrast tactical Command Center with drag-and-drop mesh map, 1-click 7.2 Quake Demo, QR-paired Mobile Field PWA, Hybrid Architecture Inspector modal, and native iOS SwiftUI Field Node sharing 100% Firestore schema parity. |

---

## Built With
`firebase` · `firebase-ai-logic` · `gemini-nano` · `gemini-2.5-flash` · `apple-foundation-models` · `firebase-app-check` · `cloud-firestore` · `firebase-hosting` · `react` · `typescript` · `tailwindcss` · `webrtc` · `pwa` · `swiftui`
