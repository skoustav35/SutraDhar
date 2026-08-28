import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const hasServiceAccount = !!(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID);

let app;
let adminAuth;
let adminDb;

if (getApps().length === 0) {
  if (hasServiceAccount) {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
    };
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } else {
    console.warn('[firebase-admin] FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL missing — initializing without credential (some admin ops will fail until env is set)');
    // Fallback: initialize with projectId only; Firestore rules will still require auth
    // For local dev without service account, this allows the app to start;
    // API routes that require adminAuth will return 500 until env is configured.
    app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'sutradhar-b58ae',
    });
  }
} else {
  app = getApps()[0];
}

try {
  adminAuth = getAuth(app);
  adminDb = getFirestore(app);
} catch (e) {
  console.error('[firebase-admin] Failed to initialize:', e.message);
  // Provide dummy that throws on use
  adminAuth = {
    verifyIdToken: async () => { throw new Error('Firebase Admin not configured — set FIREBASE_PRIVATE_KEY in .env'); },
  };
  adminDb = {
    collection: () => { throw new Error('Firestore not configured — set FIREBASE env vars'); },
  };
}

export { adminAuth, adminDb };