import { adminDb, adminAuth } from './firebase-admin.js';

export { adminDb, adminAuth };

export async function verifyToken(token) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export async function getUserFromToken(token) {
  const decoded = await verifyToken(token);
  return decoded ? { uid: decoded.uid, email: decoded.email } : null;
}