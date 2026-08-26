// Real connector management.
//   GET    /api/connectors?catalog=1  → connected accounts + live provider catalog
//   POST   /api/connectors            → connect with a credential (verified live)
//   PUT    /api/connectors            → re-verify an existing connection
//   DELETE /api/connectors            → disconnect
import supabase from './db-client.js';
import { publicCatalog } from './_providers.js';
import { cors, getUser, publicConnector, verifyAndSave, reverify, ProviderError, logEvent } from './_connectors-runtime.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('connectors')
        .select('*')
        .eq('user_id', user.id)
        .order('connected_at', { ascending: false });
      if (error) throw error;
      const connections = (data || []).map(publicConnector);
      if (req.query?.catalog === '1') {
        return res.status(200).json({ connections, catalog: publicCatalog() });
      }
      return res.status(200).json(connections);
    }

    if (req.method === 'POST') {
      const { provider, token, extra } = req.body || {};
      if (!provider) return res.status(400).json({ error: 'provider required' });
      const row = await verifyAndSave({
        userId: user.id,
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
      await reverify(user.id, provider);
      const { data } = await supabase
        .from('connectors')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .maybeSingle();
      return res.status(200).json(publicConnector(data));
    }

    if (req.method === 'DELETE') {
      const { id, provider } = req.body || {};
      let q = supabase.from('connectors').delete().eq('user_id', user.id);
      if (id) q = q.eq('id', id);
      else if (provider) q = q.eq('provider', provider);
      else return res.status(400).json({ error: 'id or provider required' });
      const { error } = await q;
      if (error) throw error;
      await logEvent({
        userId: user.id,
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
