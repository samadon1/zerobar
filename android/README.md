# ZeroBar Android Field Node (Jetpack Compose + Firebase AI Logic + AICore)

Native Android (API 26+ / Android 14–15 AICore) tactical field client for **ZeroBar** that pairs directly with the Web Command Center and iOS SwiftUI Field Node over offline-first Cloud Firestore (`rooms/{roomId}/beacons` and `rooms/{roomId}/briefs`).

### Hybrid AI Architecture (Android Platform)
- **Stage 1 — `ONLY_ON_DEVICE` (AICore Gemini Nano):** Uses `com.google.firebase:firebase-ai-ondevice` with `OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE)` to scrub full names, SSNs, phone numbers, exact house numbers, and medical IDs locally in RAM before any packet is built. Paired with a deterministic local regex safety guard and full offline emulator fallback so raw PII **never** touches the network.
- **Stage 2 — `PREFER_ON_DEVICE` (Hybrid Triage & Survival Coach):** Uses `OnDeviceConfig(mode = InferenceMode.PREFER_ON_DEVICE)` with `gemini-2.5-flash` cloud fallback to compress redacted reports into `<400B` `CompactBeaconPayload` packets + 3 offline survival steps, inspecting `response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`).
- **Privacy Invariant at the Model & Rules Layer:** `TriageBeacon.rawInputLocalOnly` is annotated `@get:Exclude` and omitted from `TriageBeacon.toFirestoreMap()`, matching the database-layer guard in `firestore.rules` 100%.
- **Firebase App Check & Offline Firestore:** Installs `DebugAppCheckProviderFactory` in debug builds and `PlayIntegrityAppCheckProviderFactory` in release builds, with Firestore `PersistentCacheSettings` enabled for seamless 0-Bar queue-and-flush sync.

---

## 5-Step Android Studio Setup Guide

### 1. Open `android/ZeroBarField` in Android Studio
1. Open **Android Studio Ladybug (2024.2.1)+** → **File → Open** and select `android/ZeroBarField`.
2. Let Gradle sync `:app` (`compileSdk = 35`, Kotlin `2.0.21`, Jetpack Compose Material 3, Firebase BoM `34.4.0`, `firebase-ai`, `firebase-ai-ondevice`).
   > **Zero-Config Emulator Ready:** If `app/google-services.json` is not yet added, `:app` still compiles cleanly and launches in local **0-Bar Offline Mode** out of the box.

### 2. Add `google-services.json`
1. Open the **Firebase Console** for your ZeroBar project (the same project connected to the Web Command Center).
2. Add an **Android app** with package name `app.zerobar.field`.
3. Download `google-services.json` and place it at:
   ```text
   android/ZeroBarField/app/google-services.json
   ```
4. Re-sync Gradle — `app/build.gradle.kts` automatically detects `google-services.json` and activates `com.google.gms.google-services`.

### 3. Enable AICore Gemini Nano (Pixel Device vs. Emulator)
- **Pixel 8 Pro / Pixel 9 / Pixel 9 Pro (Recommended for Hardware `ON_DEVICE`):**
  1. Ensure **Android AICore** is updated via Google Play Store.
  2. Open **Settings → Developer options → AICore Settings** and enable **Enable AICore Persistent**.
  3. Launch `ZeroBarField` with Airplane Mode ON: `InferenceMode.ONLY_ON_DEVICE` and `InferenceMode.PREFER_ON_DEVICE` execute natively on Gemini Nano (`AICORE NANO` mint badge).
- **Android Studio Emulator (API 34/35):**
  - Standard emulators without AICore hardware automatically fall back in Stage 1 to the deterministic local regex PII vault (`LOCAL_VAULT` badge — zero network bytes) and in Stage 2 to `gemini-2.5-flash` when online (`IN_CLOUD` badge) or local triage when in 0-Bar Mode.

### 4. Register Firebase App Check Debug Token (Play Integrity Ready)
1. Run the `debug` build once and filter **Logcat** for `DebugAppCheckProvider`:
   ```text
   D DebugAppCheckProvider: Enter this debug secret into the allow list in the Firebase Console for your project: <UUID>
   ```
2. Add `<UUID>` in **Firebase Console → App Check → Apps → ZeroBar Android → Manage debug tokens**.
3. For `release` builds, register your signing certificate's **SHA-256** fingerprint in Firebase Project Settings so `PlayIntegrityAppCheckProviderFactory` attests hardware integrity automatically.

### 5. Verify End-to-End Multi-Platform Sync
1. Keep **0-BAR OFFLINE MODE** toggled **ON**, select a category chip or crisis preset (or tap **VOICE** to dictate via offline `SpeechRecognizer`), and tap **EMIT <400B BEACON**.
2. Inspect the **Struck-Through PII Redaction Diff** (`Elena Rostova` → `[PERSON]`, SSN → `[SSN_REDACTED]`), `<400B` payload byte counter, and 3 **Instant Offline Survival Steps**.
3. Toggle **0-BAR OFFLINE MODE** **OFF** → watch queued beacons flush to `rooms/CASCADIA-01/beacons` and appear live on the Web Command Center map.
4. Click **Run Cloud Swarm Commander** on the Web Command Center → watch `<1KB` **Cloud HQ Relay Directives** stream live into the Android app via `rooms/CASCADIA-01/briefs`.
