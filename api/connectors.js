// Real connector management.
//   GET    /api/connectors?catalog=1  → connected accounts + live provider catalog
//   POST   /api/connectors            → connect with a credential (verified live)
//   PUT    /api/connectors            → re-verify an existing connection
//   DELETE /api/connectors            → disconnect
import { adminDb, adminAuth } from './firebase-admin.js';
import { publicCatalog } from './_providers.js';
import { cors, publicConnector, verifyAndSave, reverify, ProviderError, logEvent } from './_connectors-runtime.js';

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
      const snapshot = await adminDb.collection('connectors')
        .where('user_id', '==', user.uid)
        .orderBy('connected_at', 'desc')
        .get();
      const connections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).map(publicConnector);
      if (req.query?.catalog === '1') {
        return res.status(200).json({ connections, catalog: publicCatalog() });
      }
      return res.status(200).json(connections);
    }

    if (req.method === 'POST') {
      const { provider, token, extra } = req.body || {};
      if (!provider) return res.status(400).json({ error: 'provider required' });
      const row = await verifyAndSave({
        userId: user.uid,
        provider,
        token,
        authType: 'token',
        extra: extra && typeof extra === 'object' ? extra : {},
      });
      return res.status(201).json(publicConnector(row));
    }

    if (req.method === 'PUT') {
      const { provider } = req.body || {};
      if (!provider) return res.status(400).json({ error: 'provider required' });
      await reverify(user.uid, provider);
      const snapshot = await adminDb.collection('connectors')
        .where('user_id', '==', user.uid)
        .where('provider', '==', provider)
        .limit(1)
        .get();
      const data = snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
      return res.status(200).json(publicConnector(data));
    }

    if (req.method === 'DELETE') {
      const { id, provider } = req.body || {};
      if (id) {
        const docRef = adminDb.collection('connectors').doc(String(id));
        const doc = await docRef.get();
        if (!doc.exists || doc.data().user_id !== user.uid) return res.status(404).json({ error: 'Connector not found' });
        await docRef.delete();
      } else if (provider) {
        const snapshot = await adminDb.collection('connectors').where('user_id', '==', user.uid).where('provider', '==', provider).get();
        if (snapshot.empty) return res.status(404).json({ error: 'Connector not found' });
        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      } else return res.status(400).json({ error: 'id or provider required' });
      
      await logEvent({
        userId: user.uid,
        provider: provider || 'unknown',
        action: 'disconnect',
        status: 'ok',
        summary: 'Connection removed',
        source: 'manual',
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status || 400 : 500;
    console.error('connectors error', err);
    return res.status(status).json({ error: err.message });
  }
}