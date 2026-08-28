import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const hasServiceAccount = !!(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID);

let app;
let adminAuth;
let adminDb;

try {
  if (getApps().length === 0) {
    if (hasServiceAccount) {
      // Ensure private key has correct format for both literal newlines and escaped newlines
      let pk = process.env.FIREBASE_PRIVATE_KEY;
      if (pk.startsWith('"') && pk.endsWith('"')) pk = pk.slice(1, -1);
      pk = pk.replace(/\\n/g, '\n');
      
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pk,
      };
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      console.warn('[firebase-admin] FIREBASE_PRIVATE_KEY missing');
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'sutradhar-b58ae',
      });
    }
  } else {
    app = getApps()[0];
  }
  adminAuth = getAuth(app);
  adminDb = getFirestore(app);
} catch (e) {
  console.error('[firebase-admin] Failed to initialize:', e.message);
  adminAuth = {
    verifyIdToken: async () => { throw new Error('Firebase Admin init failed: ' + e.message); },
  };
  adminDb = {
    collection: () => { throw new Error('Firestore init failed: ' + e.message); },
  };
}

export { adminAuth, adminDb };