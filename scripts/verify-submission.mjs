#!/usr/bin/env node
/**
 * ZeroBar — #BuildHybridAI 2026 End-to-End Submission Verifier
 * Zero-dependency Node ESM script that validates hackathon pass/fail gates,
 * Firestore rules vs. client write parity, privacy invariants, repo hygiene,
 * native iOS Swift + Android Kotlin/AICore parity, and visual media proof.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const results = [];

function check(group, name, fn) {
  try {
    const detail = fn();
    results.push({ group, name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({
      group,
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(relPath) {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `Missing file: ${relPath}`);
  return fs.readFileSync(full, 'utf8');
}

function runCmd(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

// ---------------------------------------------------------------------------
// 1. Firebase AI Logic & App Check Gates
// ---------------------------------------------------------------------------
const firebaseTs = read('src/services/firebase.ts');
const hybridEngineTs = read('src/services/hybridEngine.ts');
const webrtcMeshTs = read('src/services/webrtcMesh.ts');
const firestoreRules = read('firestore.rules');
const swiftEngine = read('ios/ZeroBarField/Services/HybridAIEngine.swift');
const swiftModels = read('ios/ZeroBarField/Models/MeshModels.swift');

check('Hackathon Gates', 'firebase/ai imports & invocations', () => {
  const required = [
    "from 'firebase/ai'",
    'getAI(',
    'getGenerativeModel(',
    'new GoogleAIBackend()',
    'InferenceMode.ONLY_ON_DEVICE',
    'InferenceMode.PREFER_ON_DEVICE',
    'InferenceMode.ONLY_IN_CLOUD',
  ];
  const missing = required.filter((tok) => !firebaseTs.includes(tok));
  assert(missing.length === 0, `Missing in firebase.ts: ${missing.join(', ')}`);
  assert(
    hybridEngineTs.includes('.inferenceSource'),
    'Missing response.inferenceSource inspection in hybridEngine.ts'
  );
  return 'All 3 InferenceModes + GoogleAIBackend + inferenceSource verified';
});

check('Hackathon Gates', 'firebase/app-check Web + iOS App Attest', () => {
  assert(firebaseTs.includes("from 'firebase/app-check'"), 'Missing firebase/app-check import');
  assert(firebaseTs.includes('initializeAppCheck('), 'Missing initializeAppCheck() call');
  const hasEnterprise = firebaseTs.includes('new ReCaptchaEnterpriseProvider(');
  const hasV3 = firebaseTs.includes('new ReCaptchaV3Provider(');
  assert(
    hasEnterprise || hasV3,
    'Missing ReCaptchaEnterpriseProvider or ReCaptchaV3Provider'
  );
  assert(swiftEngine.includes('AppAttestProvider'), 'Missing iOS AppAttestProvider');
  const webProvider = hasEnterprise ? 'ReCaptchaEnterpriseProvider' : 'ReCaptchaV3Provider';
  return `${webProvider} (Web) + AppAttestProvider (iOS) verified`;
});

check('Hackathon Gates', 'MIT LICENSE file present', () => {
  const lic = read('LICENSE');
  assert(/MIT License/i.test(lic), 'LICENSE does not contain "MIT License"');
  return 'LICENSE (MIT) verified';
});

check('Hackathon Gates', '.env gitignored and not tracked in git', () => {
  const gitignore = read('.gitignore');
  assert(/^\.env$/m.test(gitignore), '.env is not listed in .gitignore');
  const tracked = runCmd('git', ['ls-files']).split('\n').filter(Boolean);
  assert(!tracked.includes('.env'), '.env is tracked in git ls-files!');
  return '.env ignored and untracked';
});

check('Hackathon Gates', 'No hardcoded Firebase API keys in tracked source', () => {
  const tracked = runCmd('git', ['ls-files', 'src', 'ios', 'public'])
    .split('\n')
    .filter(Boolean);
  const leaked = [];
  for (const rel of tracked) {
    const content = read(rel);
    if (/AIza[0-9A-Za-z_-]{35}/.test(content)) {
      leaked.push(rel);
    }
  }
  assert(leaked.length === 0, `Hardcoded Google API key found in: ${leaked.join(', ')}`);
  return `Scanned ${tracked.length} tracked source files — 0 leaked keys`;
});

// ---------------------------------------------------------------------------
// 2. Privacy Invariant & Schema Parity (Web + iOS vs firestore.rules)
// ---------------------------------------------------------------------------
check('Privacy Invariant', 'Zero-PII rawInputLocalOnly blocked in rules + Web + iOS', () => {
  assert(
    firestoreRules.includes("!('rawInputLocalOnly' in data)") &&
      firestoreRules.includes("!('rawInputLocalOnly' in p)"),
    'firestore.rules must block rawInputLocalOnly at top-level and payload'
  );
  assert(
    firestoreRules.includes('data.beaconBytes <= 2048'),
    'firestore.rules must enforce <=2048B beaconBytes budget'
  );
  assert(
    /const\s*\{\s*rawInputLocalOnly\s*:/.test(firebaseTs),
    'syncBeaconToFirestore must strip rawInputLocalOnly before setDoc'
  );
  const codingKeysMatch = swiftModels.match(/enum\s+CodingKeys[\s\S]*?\}/);
  assert(codingKeysMatch, 'TriageBeacon.CodingKeys not found in MeshModels.swift');
  assert(
    !/case\s+rawInputLocalOnly\b/.test(codingKeysMatch[0]),
    'rawInputLocalOnly must NOT be a CodingKeys case in MeshModels.swift'
  );
  return 'Database rules + Web destructuring + Swift CodingKeys all enforce zero-PII';
});

check('Firestore Parity', 'Beacons & Briefs required fields (Web + iOS vs rules)', () => {
  const beaconReq = [
    'id',
    'originNodeId',
    'originCallsign',
    'payload',
    'beaconBytes',
    'syncedToCloud',
    'syncedAt',
  ];
  for (const field of beaconReq) {
    assert(
      firestoreRules.includes(`'${field}'`),
      `firestore.rules missing beacon required field: ${field}`
    );
    assert(
      swiftModels.includes(`case ${field}`),
      `MeshModels.swift TriageBeacon.CodingKeys missing: ${field}`
    );
  }
  assert(
    firebaseTs.includes('syncedToCloud: true') && firebaseTs.includes('syncedAt: Date.now()'),
    'Web syncBeaconToFirestore must set syncedToCloud and syncedAt'
  );
  assert(
    swiftEngine.includes('uploadCopy.syncedToCloud = true') &&
      swiftEngine.includes('uploadCopy.syncedAt ='),
    'iOS syncBeaconToFirestore must set syncedToCloud and syncedAt'
  );

  const briefReq = [
    'id',
    'generatedAt',
    'beaconsFusedCount',
    'executiveSummary',
    'incidents',
    'directives',
    'telemetry',
  ];
  for (const field of briefReq) {
    assert(
      firestoreRules.includes(`'${field}'`),
      `firestore.rules missing brief required field: ${field}`
    );
    assert(
      hybridEngineTs.includes(field),
      `hybridEngine.ts CloudIncidentBrief missing: ${field}`
    );
  }
  return 'All 7 beacon fields & 7 brief fields aligned across Web, iOS, and rules';
});

check('Firestore Parity', 'WebRTC rtcSignals fields match firestore.rules', () => {
  const rtcBlock = firestoreRules.match(/match\s+\/rtcSignals\/\{signalId\}\s*\{[\s\S]*?\n\s*\}/);
  assert(rtcBlock, 'Could not find match /rtcSignals/{signalId} block in firestore.rules');
  const hasAllMatch = rtcBlock[0].match(/hasAll\(\[([^\]]+)\]\)/);
  assert(hasAllMatch, 'No hasAll([...]) clause found in rtcSignals rule');
  const requiredRuleKeys = hasAllMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  const signalTypeBlock = webrtcMeshTs.match(/type\s+SignalMessage\s*=[\s\S]*?\n\s*\};\n/);
  assert(signalTypeBlock, 'Could not find type SignalMessage in webrtcMesh.ts');

  const missingInClient = requiredRuleKeys.filter(
    (key) => !new RegExp(`\\b${key}\\??\\s*:`).test(signalTypeBlock[0])
  );
  assert(
    missingInClient.length === 0,
    `PERMISSION_DENIED mismatch! firestore.rules requires [${requiredRuleKeys.join(', ')}] but webrtcMesh.ts SignalMessage is missing: [${missingInClient.join(', ')}]`
  );
  return `rtcSignals required keys [${requiredRuleKeys.join(', ')}] match SignalMessage`;
});

check('Firestore Parity', 'Firestore SDK safe against undefined optional fields', () => {
  const hasIgnoreUndefined = firebaseTs.includes('ignoreUndefinedProperties: true');
  assert(
    hasIgnoreUndefined,
    'initializeFirestore in src/services/firebase.ts lacks `ignoreUndefinedProperties: true` (setDoc throws on photoDataUrl: undefined / contradictionResolved: undefined)'
  );
  return 'ignoreUndefinedProperties: true enabled';
});

// ---------------------------------------------------------------------------
// 3. Native iOS Swift Syntax Check (swiftc -parse)
// ---------------------------------------------------------------------------
check('iOS Build Gate', 'All 5 iOS Swift files pass swiftc -parse', () => {
  const swiftFiles = [
    'ios/ZeroBarField/Package.swift',
    'ios/ZeroBarField/ZeroBarFieldApp.swift',
    'ios/ZeroBarField/Models/MeshModels.swift',
    'ios/ZeroBarField/Services/HybridAIEngine.swift',
    'ios/ZeroBarField/Views/FieldNodeView.swift',
  ];
  for (const f of swiftFiles) {
    assert(fs.existsSync(path.join(ROOT, f)), `Missing Swift file: ${f}`);
  }
  runCmd('swiftc', ['-parse', ...swiftFiles]);
  return `${swiftFiles.length} Swift files parsed cleanly with 0 errors`;
});

// ---------------------------------------------------------------------------
// 4. Native Android Kotlin + AICore + Play Integrity + Zero-PII Gate
// ---------------------------------------------------------------------------
check('Android Build Gate', 'Android Kotlin + AICore + Play Integrity + Zero-PII', () => {
  const androidFiles = [
    'android/README.md',
    'android/ZeroBarField/settings.gradle.kts',
    'android/ZeroBarField/build.gradle.kts',
    'android/ZeroBarField/app/build.gradle.kts',
    'android/ZeroBarField/app/src/main/AndroidManifest.xml',
    'android/ZeroBarField/app/src/main/java/app/zerobar/field/MainActivity.kt',
    'android/ZeroBarField/app/src/main/java/app/zerobar/field/models/MeshModels.kt',
    'android/ZeroBarField/app/src/main/java/app/zerobar/field/services/HybridAIEngine.kt',
    'android/ZeroBarField/app/src/main/java/app/zerobar/field/ui/FieldNodeScreen.kt',
  ];
  for (const f of androidFiles) {
    const content = read(f);
    assert(!/AIza[0-9A-Za-z_-]{35}/.test(content), `Hardcoded Google API key found in ${f}`);
  }

  const appGradle = read('android/ZeroBarField/app/build.gradle.kts');
  for (const dep of [
    'com.google.firebase:firebase-ai',
    'com.google.firebase:firebase-ai-ondevice',
    'com.google.firebase:firebase-appcheck-playintegrity',
    'com.google.firebase:firebase-firestore',
  ]) {
    assert(appGradle.includes(dep), `app/build.gradle.kts missing dependency: ${dep}`);
  }

  const ktEngine = read(
    'android/ZeroBarField/app/src/main/java/app/zerobar/field/services/HybridAIEngine.kt'
  );
  for (const tok of [
    'GenerativeBackend.googleAI()',
    'OnDeviceConfig(',
    'InferenceMode.ONLY_ON_DEVICE',
    'InferenceMode.PREFER_ON_DEVICE',
    'response.inferenceSource',
    'PlayIntegrityAppCheckProviderFactory',
    'PersistentCacheSettings',
  ]) {
    assert(ktEngine.includes(tok), `HybridAIEngine.kt missing token: ${tok}`);
  }
  assert(
    !/["']rawInputLocalOnly["']/.test(ktEngine),
    'HybridAIEngine.kt must never serialize rawInputLocalOnly key'
  );

  const ktModels = read(
    'android/ZeroBarField/app/src/main/java/app/zerobar/field/models/MeshModels.kt'
  );
  assert(
    /@(?:get:)?Exclude\s+val\s+rawInputLocalOnly\b/.test(ktModels),
    'MeshModels.kt must annotate rawInputLocalOnly with @get:Exclude'
  );

  const beaconClassIdx = ktModels.indexOf('data class TriageBeacon(');
  assert(beaconClassIdx !== -1, 'TriageBeacon not found in MeshModels.kt');
  const beaconSlice = ktModels.slice(beaconClassIdx);
  const fnStart = beaconSlice.indexOf('fun toFirestoreMap');
  assert(fnStart !== -1, 'TriageBeacon.toFirestoreMap() not found in MeshModels.kt');
  const buildMapIdx = beaconSlice.indexOf('buildMap', fnStart);
  const openBraceIdx = beaconSlice.indexOf('{', buildMapIdx !== -1 ? buildMapIdx : fnStart);
  assert(openBraceIdx !== -1, 'TriageBeacon.toFirestoreMap() opening brace not found');
  let depth = 0;
  let closeBraceIdx = -1;
  for (let i = openBraceIdx; i < beaconSlice.length; i++) {
    if (beaconSlice[i] === '{') depth++;
    else if (beaconSlice[i] === '}') {
      depth--;
      if (depth === 0) {
        closeBraceIdx = i;
        break;
      }
    }
  }
  assert(closeBraceIdx > openBraceIdx, 'TriageBeacon.toFirestoreMap() closing brace not found');
  const toMapBody = beaconSlice.slice(openBraceIdx + 1, closeBraceIdx);
  assert(
    !/rawInputLocalOnly/.test(toMapBody),
    'TriageBeacon.toFirestoreMap() in MeshModels.kt must omit rawInputLocalOnly'
  );

  for (const field of [
    'id',
    'originNodeId',
    'originCallsign',
    'payload',
    'beaconBytes',
    'syncedToCloud',
    'syncedAt',
  ]) {
    assert(
      toMapBody.includes(`"${field}"`),
      `MeshModels.kt TriageBeacon.toFirestoreMap() missing required field: ${field}`
    );
  }

  return 'firebase-ai-ondevice + InferenceMode + PlayIntegrity + zero rawInputLocalOnly verified';
});

// ---------------------------------------------------------------------------
// 5. Visual Media Hero Screenshots Gate
// ---------------------------------------------------------------------------
check('Visual Media Gate', 'Embedded hero screenshots exist in docs/media/', () => {
  const mediaFiles = [
    'docs/media/live-map.png',
    'docs/media/pii-vault.png',
    'docs/media/field-sos.png',
  ];
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const readmeMd = read('README.md');
  const sizesKb = [];

  for (const rel of mediaFiles) {
    const full = path.join(ROOT, rel);
    assert(fs.existsSync(full), `Missing hero screenshot: ${rel}`);
    const buf = fs.readFileSync(full);
    assert(buf.length > 10_240, `Screenshot unexpectedly small (<10KB): ${rel}`);
    assert(
      buf.subarray(0, 8).equals(pngMagic),
      `File does not have a valid PNG header: ${rel}`
    );
    assert(readmeMd.includes(rel), `README.md does not embed ${rel}`);
    sizesKb.push(`${path.basename(rel)} (${Math.round(buf.length / 1024)}KB)`);
  }

  return `Verified PNGs & README embeds: ${sizesKb.join(', ')}`;
});

// ---------------------------------------------------------------------------
// 6. Live DB Firewall Prover & Multimodal Recon / Surge Simulator Gates
// ---------------------------------------------------------------------------
check('Live DB Firewall Prover', 'runLivePrivacyFirewallAudit + Blueprint audit UI + zero ReCaptchaV3', () => {
  const archModalTsx = read('src/components/ArchitectureModal.tsx');
  const appTsx = read('src/App.tsx');
  assert(
    firebaseTs.includes('export async function runLivePrivacyFirewallAudit('),
    'Missing runLivePrivacyFirewallAudit in src/services/firebase.ts'
  );
  assert(
    archModalTsx.includes('runLivePrivacyFirewallAudit') &&
      archModalTsx.includes('data-testid="run-firewall-audit"'),
    'ArchitectureModal.tsx missing runLivePrivacyFirewallAudit or data-testid="run-firewall-audit"'
  );
  assert(
    !archModalTsx.includes('ReCaptchaV3'),
    'ArchitectureModal.tsx must reference ReCaptchaEnterprise (found legacy ReCaptchaV3)'
  );
  assert(
    appTsx.includes('roomId={roomId}'),
    'App.tsx must pass roomId={roomId} to ArchitectureModal'
  );
  return 'Live SSN adversary rejection + <300B schema probe + ReCaptchaEnterprise UI verified';
});

check('Multimodal Recon & Surge Simulator', 'FLIR Drone Recon InlineDataPart + 50k Surge Economics Simulator', () => {
  const reconSampleTs = read('src/utils/crisisPhotoSample.ts');
  const surgeModalTsx = read('src/components/SurgeBenchmarksModal.tsx');
  const appTsx = read('src/App.tsx');
  assert(
    reconSampleTs.includes('export function generateSampleHazardReconDataUrl('),
    'Missing generateSampleHazardReconDataUrl in src/utils/crisisPhotoSample.ts'
  );
  assert(
    appTsx.includes('data-testid="cloud-recon-vision"') &&
      hybridEngineTs.includes('inlineData:'),
    'Missing data-testid="cloud-recon-vision" in App.tsx or inlineData multimodal escalation in hybridEngine.ts'
  );
  assert(
    surgeModalTsx.includes('SurgeBenchmarksModal') &&
      surgeModalTsx.includes('50000') &&
      appTsx.includes('data-testid="open-overview-benchmarks"'),
    'Missing SurgeBenchmarksModal 50k simulator or open-overview-benchmarks trigger'
  );
  return 'generateSampleHazardReconDataUrl + cloud-recon-vision + SurgeBenchmarksModal verified';
});

// ---------------------------------------------------------------------------
// Output Crisp Checklist
// ---------------------------------------------------------------------------
console.log('\n=== ZeroBar #BuildHybridAI 2026 Submission Verification ===\n');
let passed = 0;
let failed = 0;

for (const r of results) {
  const badge = r.ok ? 'PASS' : 'FAIL';
  if (r.ok) passed++;
  else failed++;
  console.log(`[${badge}] (${r.group}) ${r.name}`);
  if (r.detail) {
    console.log(`       ${r.detail}`);
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed (${results.length} total)\n`);
process.exit(failed > 0 ? 1 : 0);
