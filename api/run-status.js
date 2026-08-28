import { adminDb, adminAuth } from './firebase-admin.js';

// Poll endpoint for a run's live state. Query by ?runId=... or ?chatId=...
// (chatId returns the most recent run for that chat).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let userId = null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    userId = decoded.uid;
  } catch { /* ignore */ }
  if (!userId) return res.status(401).json({ error: 'Invalid token' });

  const { runId, chatId } = req.query;
  try {
    let run = null;
    if (runId) {
      const doc = await adminDb.collection('runs').doc(String(runId)).get();
      if (!doc.exists || doc.data().user_id !== userId) return res.status(200).json({ found: false });
      run = { id: doc.id, ...doc.data() };
    } else if (chatId) {
      const snapshot = await adminDb.collection('runs').where('user_id', '==', userId).where('chat_id', '==', chatId).orderBy('created_at', 'desc').limit(1).get();
      if (snapshot.empty) return res.status(200).json({ found: false });
      run = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } else return res.status(400).json({ error: 'Provide runId or chatId' });

    // Defensively strip any provider `model` key from council entries.
    const council = (run.council || []).map((c) => {
      const { model, ...rest } = c || {};
      return model && !rest.agentId ? { ...rest, agentId: 'oracle' } : rest;
    });

    return res.status(200).json({
      found: true,
      id: run.id,
      chatId: run.chat_id,
      mode: run.mode,
      status: run.status,
      phase: run.phase,
      note: run.note,
      council,
      final: run.final || '',
    });
  } catch (err) {
    console.error('run-status error', err);
    res.status(500).json({ error: err.message });
  }
}