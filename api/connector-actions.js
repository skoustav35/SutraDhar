// Execute real provider actions and read the execution log.
//   GET  /api/connector-actions?log=1   → recent executions
//   POST /api/connector-actions         → run an action against the live API
import { adminDb, adminAuth } from './firebase-admin.js';
import { cors, runAction, ProviderError } from './_connectors-runtime.js';

export const config = { maxDuration: 60 };

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
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query?.limit) || 25, 100);
      let query = adminDb.collection('connector_events')
        .where('user_id', '==', user.uid)
        .orderBy('created_at', 'desc')
        .limit(limit);
      if (req.query?.provider) query = query.where('provider', '==', req.query.provider);
      const snapshot = await query.get();
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { provider, action, params } = req.body || {};
      if (!provider || !action) return res.status(400).json({ error: 'provider and action are required' });
      const result = await runAction({
        userId: user.uid,
        provider,
        actionId: action,
        params: params && typeof params === 'object' ? params : {},
        source: 'manual',
      });
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status || 400 : 500;
    console.error('connector-actions error', err);
    return res.status(status).json({ error: err.message });
  }
}