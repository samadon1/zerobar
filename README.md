# ZeroBar — Off-Grid Crisis Swarm & Hybrid AI Incident Commander

> Built for the **#BuildHybridAI 2026 Hackathon** powered by **Firebase AI Logic Hybrid Inference**, **Firebase App Check**, and **Firestore Offline Persistence**.

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
npm install
cp .env.example .env
# Fill in your Firebase project keys + App Check debug token in .env
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
- **Mobile Field Node + QR Pairing:** Click **Pair Phone** to open `?mode=mobile&room=CASCADIA-01` on a phone or second tab with Web Speech voice SOS, camera hazard photo upload, and an Airplane/0-Bar Offline toggle.

## License
MIT — see [LICENSE](./LICENSE).
