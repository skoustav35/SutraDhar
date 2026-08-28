import { adminDb, adminAuth } from './firebase-admin.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const snapshot = await adminDb.collection('agents')
        .where('user_id', '==', user.uid)
        .orderBy('created_at', 'desc')
        .get();
      const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(agents);
    }

    if (req.method === 'POST') {
      const { name, emoji, color, description, system_prompt, skills, connectors, created_by_ai } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Agent name is required' });
      const docRef = await adminDb.collection('agents').add({
        user_id: user.uid,
        name: String(name).slice(0, 80),
        emoji: emoji || '🧷',
        color: color || '#c8781e',
        description: (description || '').slice(0, 500),
        system_prompt: (system_prompt || '').slice(0, 6000),
        skills: Array.isArray(skills) ? skills.slice(0, 20) : [],
        connectors: Array.isArray(connectors) ? connectors.slice(0, 20) : [],
        created_by_ai: !!created_by_ai,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const doc = await docRef.get();
      return res.status(201).json({ id: docRef.id, ...doc.data() });
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const patch = {};
      for (const k of ['name', 'emoji', 'color', 'description', 'system_prompt', 'skills', 'connectors']) {
        if (k in fields) patch[k] = fields[k];
      }
      patch.updated_at = new Date().toISOString();
      const docRef = adminDb.collection('agents').doc(id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      await docRef.update(patch);
      const updated = await docRef.get();
      return res.status(200).json({ id: docRef.id, ...updated.data() });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      const docRef = adminDb.collection('agents').doc(id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      await docRef.delete();
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('agents error', err);
    res.status(500).json({ error: err.message });
  }
}