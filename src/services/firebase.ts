import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type AI,
  type GenerativeModel,
} from 'firebase/ai';
import type { CloudIncidentBrief, TriageBeacon } from '../types/mesh';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const CLOUD_MODEL_NAME =
  import.meta.env.VITE_GEMINI_CLOUD_MODEL || 'gemini-2.5-flash';

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== 'your_api_key_here'
);

export interface FirebaseRuntime {
  app: FirebaseApp | null;
  appCheck: AppCheck | null;
  db: Firestore | null;
  ai: AI | null;
  /** Strictly on-device PII scrubber — never sends raw PII to cloud */
  privacyVaultModel: GenerativeModel | null;
  /** Prefers on-device Gemini Nano for offline triage; falls back to Cloud Gemini */
  edgeTriageModel: GenerativeModel | null;
  /** Exclusively Cloud Gemini for multimodal swarm fusion & contradiction resolution */
  cloudCommanderModel: GenerativeModel | null;
  appCheckActive: boolean;
}

let cachedRuntime: FirebaseRuntime | null = null;

export function getFirebaseRuntime(): FirebaseRuntime {
  if (cachedRuntime) return cachedRuntime;

  if (!isFirebaseConfigured) {
    cachedRuntime = {
      app: null,
      appCheck: null,
      db: null,
      ai: null,
      privacyVaultModel: null,
      edgeTriageModel: null,
      cloudCommanderModel: null,
      appCheckActive: false,
    };
    return cachedRuntime;
  }

  const app = initializeApp(firebaseConfig);

  // Firebase App Check (required for #BuildHybridAI; debug token supported)
  let appCheck: AppCheck | null = null;
  let appCheckActive = false;
  try {
    if (import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN === 'true') {
      (
        globalThis as unknown as {
          FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
        }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    const siteKey =
      import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY || 'debug-site-key';
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckActive = true;
  } catch (err) {
    console.warn('[ZeroBar] App Check initialization warning:', err);
  }

  // Offline-first Firestore cache so relay nodes queue & sync seamlessly
  let db: Firestore | null = null;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    console.warn('[ZeroBar] Firestore offline cache fallback:', err);
  }

  // Firebase AI Logic — GoogleAIBackend (Gemini Developer API + Chrome Gemini Nano)
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  // 1. ONLY_ON_DEVICE: Hard privacy boundary for local PII redaction
  const privacyVaultModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
  });

  // 2. PREFER_ON_DEVICE: Fast offline field triage compression & survival guidance
  const edgeTriageModel = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: CLOUD_MODEL_NAME,
    },
  });

  // 3. ONLY_IN_CLOUD: Heavy multimodal swarm fusion & tactical directives
  const cloudCommanderModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL_NAME,
    },
  });

  cachedRuntime = {
    app,
    appCheck,
    db,
    ai,
    privacyVaultModel,
    edgeTriageModel,
    cloudCommanderModel,
    appCheckActive,
  };

  return cachedRuntime;
}

/**
 * Syncs a PII-scrubbed CompactBeaconPayload to Firestore when a relay hits uplink.
 * Raw citizen text is stripped BEFORE calling this function.
 */
export async function syncBeaconToFirestore(
  roomId: string,
  beacon: TriageBeacon
): Promise<void> {
  const { db } = getFirebaseRuntime();
  if (!db) return;

  const { rawInputLocalOnly: _neverUpload, ...safeBeacon } = beacon;
  await setDoc(doc(db, 'rooms', roomId, 'beacons', beacon.id), {
    ...safeBeacon,
    syncedToCloud: true,
    syncedAt: Date.now(),
  });
}

export async function saveBriefToFirestore(
  roomId: string,
  brief: CloudIncidentBrief
): Promise<void> {
  const { db } = getFirebaseRuntime();
  if (!db) return;

  await setDoc(doc(db, 'rooms', roomId, 'briefs', brief.id), brief);
}

export function subscribeToRoomBeacons(
  roomId: string,
  onBeacons: (beacons: TriageBeacon[]) => void
): () => void {
  const { db } = getFirebaseRuntime();
  if (!db) return () => {};

  const q = query(
    collection(db, 'rooms', roomId, 'beacons'),
    orderBy('syncedAt', 'desc'),
    limit(30)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list: TriageBeacon[] = snap.docs.map((d) => {
        const data = d.data() as Omit<TriageBeacon, 'rawInputLocalOnly'>;
        return {
          ...data,
          rawInputLocalOnly: '[REDACTED_AT_ORIGIN_NODE]',
        };
      });
      onBeacons(list);
    },
    (err) => {
      console.warn('[ZeroBar] Firestore beacon listener warning:', err);
    }
  );
}
