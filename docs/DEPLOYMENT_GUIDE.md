# ZeroBar — 5-Minute Firebase Deployment & Verification Guide

> Follow this runbook to take ZeroBar from local dev to a live, App Check–protected Firebase Hosting deployment with database-layer Privacy Invariant rules before the **November 30, 2:00 PM PT** submission deadline.

---

## Prerequisites
- Node.js 20+ and npm (`npm install` already run in `/Users/mac/.gemini/antigravity/scratch/zerobar`)
- Firebase CLI installed and logged in:
  ```bash
  npm install -g firebase-tools
  firebase login
  ```

---

## Step 1: Create the Firebase Project & Web App (1 min)
1. Open the [Firebase Console](https://console.firebase.google.com/) and click **Create a project** (e.g., `zerobar-crisis-mesh`).
2. Inside the project, click **Web (`</>`)** to register a Web App (e.g., `ZeroBar Command Center`).
3. Copy the `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. Create your local `.firebaserc` from the template:
   ```bash
   cp .firebaserc.example .firebaserc
   ```
   Replace `"your-zerobar-firebase-project-id"` in `.firebaserc` with your actual Firebase Project ID.

---

## Step 2: Enable Firebase AI Logic & Cloud Firestore (1 min)
1. **Firebase AI Logic (Gemini Developer API):**
   - In Firebase Console, go to **Build → AI Logic** (or **Gemini in Firebase / Firebase AI Logic**).
   - Click **Get started** and select the **Gemini Developer API** backend (`GoogleAIBackend`).
   - Confirm the **Generative Language API** and **Firebase AI Logic API** are enabled for your project.
2. **Cloud Firestore:**
   - Go to **Build → Firestore Database → Create database**.
   - Choose a region (e.g., `us-west1` or `us-central1`) and start in **Production mode** (we will deploy our custom `firestore.rules` in Step 5).

---

## Step 3: Enable Firebase App Check (Required for #BuildHybridAI) (1 min)
1. In Firebase Console, go to **Build → App Check**.
2. Click **Apps** → select your Web App → click **Register** under **reCAPTCHA v3**:
   - Create a reCAPTCHA v3 site key at [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin/create) for `localhost`, `127.0.0.1`, `<your-project-id>.web.app`, and `<your-project-id>.firebaseapp.com`.
   - Paste the **Secret Key** into Firebase Console and save the **Site Key** for `.env`.
3. **Register a Debug Token (for local testing & demo recording):**
   - In App Check → **Apps** → click the `⋮` menu on your Web App → **Manage debug tokens** → **Add debug token**.
   - Alternatively, run `npm run dev` with `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=true`, copy the UUID printed in the browser console (`App Check debug token: ...`), and paste it into **Manage debug tokens**.
4. *(Recommended)* Under **App Check → APIs**, enable enforcement for **Cloud Firestore** and **Firebase AI Logic** once you confirm your Web App + debug token pass.
5. *(Optional — iOS Field Node)* If deploying `ios/ZeroBarField/`, register the iOS app in App Check using **App Attest** (production) and add a **Debug Token** for Xcode Simulator runs.

---

## Step 4: Configure `.env` (30 sec)
```bash
cp .env.example .env
```
Populate `.env` with your Firebase Console values:
```dotenv
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456

# Firebase App Check
VITE_FIREBASE_APP_CHECK_SITE_KEY=6Lc...your_recaptcha_v3_site_key
VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=true

# Cloud Gemini Model
VITE_GEMINI_CLOUD_MODEL=gemini-2.5-flash
```
> **Note:** Before deploying to production for judges who visit the public URL, set `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=false` (so public visitors attest seamlessly via reCAPTCHA v3 without needing your local debug token) and rebuild!

---

## Step 5: Build & Deploy Hosting + Firestore Rules + Indexes (1 min)
```bash
npm run build
firebase deploy --only hosting,firestore
```
This deploys:
- `dist/` to **Firebase Hosting** with SPA fallback (`** -> /index.html`) and `no-cache` headers on `/sw.js` and `/manifest.webmanifest` (from `firebase.json`).
- `firestore.rules` enforcing the **ZeroBar Privacy Invariant** (`!('rawInputLocalOnly' in data)`, SSN regex rejection, `beaconBytes <= 2048`, and `CompactBeaconPayload` schema validation).
- `firestore.indexes.json` for `beacons` and `briefs` queries.

Your live URL will be:
`https://<your-project-id>.web.app`

---

## Step 6: 60-Second Pre-Deadline Verification Checklist (Before Nov 30, 2:00 PM PT)

Run through every check on your live `https://<your-project-id>.web.app` URL:

- [ ] **1. Telemetry Strip & App Check:** Open the live URL in Chrome (v138+ with Gemini Nano flags enabled). Confirm the header shows `Firebase Connected`, `App Check Active`, and `Chrome Nano Ready`.
- [ ] **2. End-to-End Hybrid Demo:** Click **Run 7.2 Quake Swarm Demo**. Verify:
  - Stage 1 (`PII_SCRUB_VAULT`) logs `ONLY_ON_DEVICE` → `ON_DEVICE`.
  - Stage 2 (`TRIAGE_COMPRESS`) logs `PREFER_ON_DEVICE` → `ON_DEVICE` with `<400B` beacon size.
  - Stage 3 (`CLOUD_SWARM_FUSION`) logs `ONLY_IN_CLOUD` → `IN_CLOUD` and resolves the Harbor Bridge North vs. Pine St South contradiction.
  - Directives (`<1KB`) appear on the offline citizen nodes.
- [ ] **3. Database-Layer Privacy Invariant Check:** Open **Firebase Console → Firestore Database → Data → `rooms/CASCADIA-01/beacons`** and verify:
  - Documents exist with `payload.sev`, `payload.cat`, `payload.sum`, `beaconBytes <= 2048`.
  - **Zero** documents contain `rawInputLocalOnly` or unredacted SSNs.
  - *(Optional Rules Playground test)* In **Firestore → Rules → Rules Playground**, simulate a `create` on `/rooms/CASCADIA-01/beacons/ZB-TEST` that includes `"rawInputLocalOnly": "My SSN is 123-45-6789"` → confirm it is **DENIED**.
- [ ] **4. Offline PWA Reload Check:** Open DevTools → **Application → Service Workers** (confirm `sw.js` is activated) → toggle **Offline** → reload the page → confirm ZeroBar loads cleanly and processes an offline SOS with zero network errors.
- [ ] **5. Mobile QR Pairing Check:** Click **Pair Phone** and open `?mode=mobile&room=CASCADIA-01` in a second tab or phone to verify live P2P/Firestore sync.
- [ ] **6. Devpost Submission Check:**
  - Public GitHub repository URL accessible (no `.env` or `.firebaserc` committed!).
  - Live Firebase Hosting URL (`https://<your-project-id>.web.app`) tested in an incognito window.
  - Public YouTube demo video (`<= 3:00`, recorded from `docs/DEMO_VIDEO_SCRIPT.md`) embedded on Devpost.
  - Submission text pasted from `docs/DEVPOST_SUBMISSION.md` and submitted well ahead of **Nov 30, 2:00 PM PT**.
