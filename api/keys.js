import { adminDb, adminAuth } from './firebase-admin.js';
import crypto from 'crypto';

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const snapshot = await adminDb.collection('api_keys')
        .where('user_id', '==', user.uid)
        .orderBy('created_at', 'desc')
        .get();
      const keys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(keys);
    }

    if (req.method === 'POST') {
      const { name } = req.body || {};
      const key = 'sk-council-' + crypto.randomBytes(24).toString('hex');
      const docRef = await adminDb.collection('api_keys').add({
        user_id: user.uid,
        name: (name || 'Default key').slice(0, 60),
        key,
        revoked: false,
        request_count: 0,
        created_at: new Date().toISOString(),
      });
      const doc = await docRef.get();
      return res.status(201).json({ id: docRef.id, ...doc.data() });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      const docRef = adminDb.collection('api_keys').doc(id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Key not found' });
      }
      await docRef.delete();
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('keys error', err);
    res.status(500).json({ error: err.message });
  }
}