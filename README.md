# ZeroBar — Off-Grid Crisis Swarm & Hybrid AI Incident Commander

> Built for the **#BuildHybridAI 2026 Hackathon** powered by **Firebase AI Logic Hybrid Inference**, **Firebase App Check**, and **Firestore Offline Persistence**.

- **Live Firebase Hosting Demo:** [https://zerobar-hybrid-ai-2026.web.app](https://zerobar-hybrid-ai-2026.web.app)
- **Direct Mobile Field SOS URL:** [https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01](https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01)
- **Public GitHub Repo (MIT):** [https://github.com/samadon1/zerobar](https://github.com/samadon1/zerobar)
- **Firebase Project ID:** `zerobar-hybrid-ai-2026`

## 60-Second Judge Verification Guide

1. **Launch the Live Command Center (15s):** Open [https://zerobar-hybrid-ai-2026.web.app](https://zerobar-hybrid-ai-2026.web.app) and click **Run 7.2 Quake Swarm Demo**. Watch the top **Hybrid Telemetry Strip** log real `inferenceSource` proofs (`ON_DEVICE` vs `IN_CLOUD`) across all 3 stages: local PII scrubbing, `<400B` P2P beacon hops, Cloud Gemini contradiction resolution, and `<1KB` directive downlink.
2. **Test the Mobile Field SOS View (15s):** Open [https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01](https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01) on a phone or second browser tab. Toggle **0-Bar Offline Mode**, send a voice/text SOS or attach a hazard photo, and verify instant offline survival steps + P2P/Firestore sync.
3. **Inspect the `Hybrid Architecture` Blueprint Modal (10s):** Click **Hybrid Architecture** in the header of the [Live Demo](https://zerobar-hybrid-ai-2026.web.app) to review the 3-tier `InferenceMode` pipeline (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `ONLY_IN_CLOUD`), live latency/byte telemetry, and security boundaries.
4. **Verify the `PII Vault` Redaction Proof (10s):** Inspect the **PII Privacy Vault** side-by-side diff in the Command Center (showing names, SSNs, and street addresses stripped strictly on-device) and verify the database-layer hard enforcement in [`firestore.rules`](https://github.com/samadon1/zerobar/blob/main/firestore.rules) (rejects `rawInputLocalOnly`, SSN patterns, and payloads `> 2048B`).
5. **Review the Native iOS SwiftUI Companion (10s):** Browse [`ios/ZeroBarField/`](https://github.com/samadon1/zerobar/tree/main/ios/ZeroBarField) — specifically [`HybridAIEngine.swift`](https://github.com/samadon1/zerobar/blob/main/ios/ZeroBarField/Services/HybridAIEngine.swift) — for the Apple Foundation Models + `AppAttest` SwiftUI Field Node sharing 100% Firestore schema parity with the web app.

## The Problem
During earthquakes, wildfires, and grid blackouts, **90% of trapped citizens have zero cellular bars**, while only intermittent responder vehicles or ridge relays briefly catch 1 bar of signal.
- **Cloud-only AI fails completely** in the blackout zone and forces citizens to leak raw personal/medical data (names, SSNs, exact home addresses) over untrusted relays.
- **On-device-only AI cannot see the whole city**, deduplicate conflicting eyewitness reports across neighborhoods, or analyze multi-photo hazard evidence.

## How ZeroBar Uses Firebase AI Logic Hybrid Inference

ZeroBar uses **three distinct `InferenceMode` configurations** in `src/services/firebase.ts` and `src/services/hybridEngine.ts`, logging real `result.response.inferenceSource` telemetry (`ON_DEVICE` vs `IN_CLOUD`) on every operation:

| Stage | Firebase AI Logic Mode | Why This Mode Is Essential |
| :--- | :--- | :--- |
| **1. PII Privacy Vault** | `InferenceMode.ONLY_ON_DEVICE` | Strictly scrubs names, SSNs, phone numbers, exact house numbers, and medical IDs locally on-device. Raw PII mathematically never leaves the citizen's device. |
| **2. Edge Triage & Survival Coach** | `InferenceMode.PREFER_ON_DEVICE` | Compresses panicked multi-sentence voice/text (any language) into a **<400-byte structured JSON Triage Beacon** (75–85% byte reduction for P2P gossip) and gives immediate offline first-aid steps in ~150ms. Falls back seamlessly to Cloud Gemini on unsupported browsers. |
| **3. Cloud Incident Commander** | `InferenceMode.ONLY_IN_CLOUD` | Triggered when a **Relay Mule** crosses into the cellular Uplink Ridge. Fuses dozens of PII-free beacons + optional hazard photos (`InlineDataPart`), resolves conflicting eyewitness reports, and generates compact **<1KB Tactical Directives** pushed back via Firestore so relays carry rescue orders *back* into the dead zone. |

## Quick Start

```bash
git clone https://github.com/samadon1/zerobar.git
cd zerobar
npm install
cp .env.example .env
# Fill in your Firebase project keys (e.g., zerobar-hybrid-ai-2026) + App Check debug token in .env
npm run dev
```

### Enabling Real On-Device Gemini Nano in Chrome
1. Open Chrome (v138+ Desktop) and visit `chrome://flags`.
2. Enable `#optimization-guide-on-device-model` (**Enabled BypassPerfRequirement**) and `#prompt-api-for-gemini-nano`.
3. Restart Chrome. ZeroBar's top **Hybrid Telemetry Strip** will display `Chrome Nano Ready`, and edge calls will report `ON_DEVICE`.

### Enabling Firebase App Check
ZeroBar initializes `initializeAppCheck` with `ReCaptchaV3Provider` and supports `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=true` for local development and hackathon judging. Register the printed debug token in **Firebase Console → App Check → Apps → Manage debug tokens**.

## Features Included
- **1-Click 7.2 Quake Swarm Demo:** Instantly fires 3 realistic multi-language/PII-heavy distress calls across offline nodes, sweeps `RELAY-MULE-01` across the Uplink Ridge, fuses reports in Cloud Gemini (resolving the Harbor Bridge North vs. Pine St South contradiction), and delivers `<1KB` directives back into the blackout zone.
- **Interactive Drag-and-Drop Mesh Map:** Drag `RELAY-MULE-01` or any citizen node to watch dynamic P2P links form and packets hop live.
- **Mobile Field Node + QR Pairing:** Click **Pair Phone** or open [https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01](https://zerobar-hybrid-ai-2026.web.app/?mode=mobile&room=CASCADIA-01) on a phone or second tab with Web Speech voice SOS, camera hazard photo upload, and an Airplane/0-Bar Offline toggle.

## Documentation
- [Devpost Submission Copy](./docs/DEVPOST_SUBMISSION.md)
- [2:45 Demo Video Script](./docs/DEMO_VIDEO_SCRIPT.md)
- [Firebase Deployment & Verification Guide](./docs/DEPLOYMENT_GUIDE.md)

## License
MIT — see [LICENSE](./LICENSE).
