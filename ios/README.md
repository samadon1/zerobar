# ZeroBar iOS Field Node (SwiftUI + Firebase AI Logic)

Native iOS 18+ / iOS 26 tactical field client for **ZeroBar** that pairs directly with the Web Command Center over offline-first Cloud Firestore (`rooms/{roomId}/beacons` and `rooms/{roomId}/briefs`).

### Hybrid AI Architecture (Apple Platforms)
- **Stage 1 — `ONLY_ON_DEVICE` (Apple Foundation Models):** Runs local PII redaction (names, SSNs, phone numbers, exact house numbers, medical IDs) before any data leaves memory. Includes a deterministic zero-network regex fallback so iOS Simulator and non-Apple-Intelligence devices preserve the exact same privacy invariant.
- **Stage 2 — `PREFER_ON_DEVICE` (Hybrid Triage & Survival Coach):** Compresses redacted distress input into a `<400B` `CompactBeaconPayload` and generates 3 immediate offline survival steps, preferring on-device Apple Foundation Models in 0-Bar Airplane Mode and falling back to Cloud Gemini (`gemini-2.5-flash`) via **Firebase AI Logic** when online.
- **Privacy Invariant at the Type Layer:** `TriageBeacon.rawInputLocalOnly` is omitted from `CodingKeys`, making it physically impossible for `Firestore.Encoder` to transmit raw citizen text to the cloud.
- **Firebase App Check & Offline Firestore:** Uses `AppCheckDebugProviderFactory` in `DEBUG` builds and `AppAttestProvider` in `RELEASE` builds, with `PersistentCacheSettings()` enabled so beacons queued during a 0-Bar blackout auto-sync on first uplink.

---

## 5-Step Xcode Setup Guide

### 1. Create the Xcode iOS App Target & Link SwiftPM
1. Open **Xcode 16+** (or Xcode 26 for Apple Foundation Models SDK) → **File → New → Project → iOS App**.
   - Product Name: `ZeroBarField`
   - Interface: `SwiftUI`
   - Minimum Deployment: `iOS 18.0` (or `iOS 26.0` for Apple Intelligence `FoundationModels`)
2. Drag the `ios/ZeroBarField/Models`, `Services`, `Views`, and `ZeroBarFieldApp.swift` files into your app target (replacing the default `ContentView.swift` / `*App.swift`), **or** add `ios/ZeroBarField` as a local Swift Package.
3. Add the Firebase Apple SDK (`https://github.com/firebase/firebase-ios-sdk.git`, `12.0.0+`) and link:
   - `FirebaseCore`
   - `FirebaseAI`
   - `FirebaseAppCheck`
   - `FirebaseFirestore`

### 2. Add `GoogleService-Info.plist`
1. In the **Firebase Console**, open the same project used by the ZeroBar Web Command Center.
2. Add an iOS app matching your Xcode Bundle Identifier (e.g., `com.zerobar.field`) and download `GoogleService-Info.plist`.
3. Drag `GoogleService-Info.plist` into the root of your Xcode app target (ensure **"Copy items if needed"** is checked).
   > **Note:** If you skip this step during a quick UI test, the app still launches cleanly in local 0-Bar mode without crashing.

### 3. Configure Firebase App Check (Debug Token for Simulator)
1. In Xcode, open **Product → Scheme → Edit Scheme → Run → Arguments Passed On Launch** and add:
   ```
   -FIRDebugEnabled
   ```
2. Run the app once in Simulator and check the Xcode console for:
   ```
   Firebase App Check debug token: <UUID>
   ```
3. Register that UUID in **Firebase Console → App Check → Apps → Manage debug tokens**.
4. Release builds automatically switch to Apple's hardware-backed `AppAttestProvider`.

### 4. Add Voice SOS Permissions (`Info.plist`)
Add these two keys to your target's **Info** tab so the native Voice SOS button works on device:
- `NSMicrophoneUsageDescription`: `ZeroBar records spoken distress reports locally for offline triage.`
- `NSSpeechRecognitionUsageDescription`: `ZeroBar transcribes emergency voice reports on-device.`

### 5. Run on Simulator vs. Apple Intelligence Device
- **iOS Simulator (Any Mac):**
  - Launch with **0-Bar Offline Mode** toggled ON → tap **EMIT <400B BEACON** → verify local PII scrubbing (`LOCAL_VAULT`), `<400B` compression, and instant survival steps.
  - Toggle **0-Bar Offline Mode** OFF → watch queued beacons flush to `rooms/CASCADIA-01/beacons` and appear live on the Web Command Center map.
  - Click **Run Cloud Swarm Commander** in the Web Command Center → watch `<1KB` **Cloud Directives** appear in real time at the bottom of `FieldNodeView`.
- **Apple Intelligence Device (iPhone 15 Pro / 16+ on iOS 26+):**
  - Enable Apple Intelligence in **Settings → Apple Intelligence & Siri**.
  - Stage 1 (`ONLY_ON_DEVICE`) and Stage 2 (`PREFER_ON_DEVICE`) execute natively on Apple Foundation Models, lighting up the green **`ON_DEVICE`** telemetry pill with zero cellular/Wi-Fi connectivity.
