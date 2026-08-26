import supabase from './db-client.js';

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const { data } = await supabase.auth.getUser(token);
    return data?.user || null;
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
      const { data, error } = await supabase
        .from('connectors')
        .select('*')
        .eq('user_id', user.id)
        .order('connected_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { provider, account_label, scopes } = req.body || {};
      if (!provider) return res.status(400).json({ error: 'provider required' });
      // Prevent duplicate connections of the same provider
      const { data: existing } = await supabase
        .from('connectors')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .maybeSingle();
      if (existing) {
        const { data, error } = await supabase
          .from('connectors')
          .update({ status: 'connected', account_label: account_label || '', connected_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      const { data, error } = await supabase
        .from('connectors')
        .insert({ user_id: user.id, provider, account_label: account_label || '', scopes: scopes || [], status: 'connected' })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const { id, provider } = req.body || {};
      let q = supabase.from('connectors').delete().eq('user_id', user.id);
      if (id) q = q.eq('id', id);
      else if (provider) q = q.eq('provider', provider);
      else return res.status(400).json({ error: 'id or provider required' });
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('connectors error', err);
    res.status(500).json({ error: err.message });
  }
}
