import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, clearIndexedDbPersistence, terminate, type Firestore } from 'firebase/firestore';
import { getAuth, signOut, type Auth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const env = (import.meta as any).env || {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseClientConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseClientConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);

  // Enable Firebase App Check when site key is configured
  const appCheckSiteKey = (env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();
  if (appCheckSiteKey && typeof window !== 'undefined') {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // Safe fallback if already initialized
    }
  }
}

export async function clearFirebaseClientState(): Promise<void> {
  try {
    if (auth) {
      await signOut(auth).catch(() => {});
    }
    if (db) {
      await terminate(db).catch(() => {});
      await clearIndexedDbPersistence(db).catch(() => {});
    }
  } catch {
    // Ignore when no IndexedDB persistence is active
  }
}

export { app, db, auth };
export default app;
