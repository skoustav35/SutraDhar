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

function computeNextRun(cadence, runTime) {
  const [hh, mm] = String(runTime || '09:00').split(':').map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (cadence === 'hourly') {
    next.setTime(now.getTime() + 60 * 60 * 1000);
  } else if (cadence === 'weekly') {
    if (next <= now) next.setDate(next.getDate() + 7);
  } else if (cadence === 'monthly') {
    if (next <= now) next.setMonth(next.getMonth() + 1);
  } else {
    // daily / once
    if (next <= now) next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
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
      const snapshot = await adminDb.collection('scheduled_tasks')
        .where('user_id', '==', user.uid)
        .orderBy('created_at', 'desc')
        .get();
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(tasks);
    }

    if (req.method === 'POST') {
      const { title, prompt, cadence, run_time, agent_id } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title required' });
      const next_run = computeNextRun(cadence, run_time);
      const docRef = await adminDb.collection('scheduled_tasks').add({
        user_id: user.uid,
        agent_id: agent_id || null,
        title: String(title).slice(0, 120),
        prompt: (prompt || '').slice(0, 4000),
        cadence: cadence || 'daily',
        run_time: run_time || '09:00',
        next_run,
        enabled: true,
        status: 'idle',
        created_at: new Date().toISOString(),
      });
      const doc = await docRef.get();
      return res.status(201).json({ id: docRef.id, ...doc.data() });
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const patch = {};
      for (const k of ['title', 'prompt', 'cadence', 'run_time', 'enabled', 'agent_id', 'status', 'last_run']) {
        if (k in fields) patch[k] = fields[k];
      }
      if ('cadence' in patch || 'run_time' in patch) {
        patch.next_run = computeNextRun(patch.cadence || fields.cadence, patch.run_time || fields.run_time);
      }
      const docRef = adminDb.collection('scheduled_tasks').doc(id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Task not found' });
      }
      await docRef.update(patch);
      const updated = await docRef.get();
      return res.status(200).json({ id: docRef.id, ...updated.data() });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      const docRef = adminDb.collection('scheduled_tasks').doc(id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Task not found' });
      }
      await docRef.delete();
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('tasks error', err);
    res.status(500).json({ error: err.message });
  }
}