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
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { name, emoji, color, description, system_prompt, skills, connectors, created_by_ai } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Agent name is required' });
      const { data, error } = await supabase
        .from('agents')
        .insert({
          user_id: user.id,
          name: String(name).slice(0, 80),
          emoji: emoji || '\ud83e\udeb7',
          color: color || '#c8781e',
          description: (description || '').slice(0, 500),
          system_prompt: (system_prompt || '').slice(0, 6000),
          skills: Array.isArray(skills) ? skills.slice(0, 20) : [],
          connectors: Array.isArray(connectors) ? connectors.slice(0, 20) : [],
          created_by_ai: !!created_by_ai,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const patch = {};
      for (const k of ['name', 'emoji', 'color', 'description', 'system_prompt', 'skills', 'connectors']) {
        if (k in fields) patch[k] = fields[k];
      }
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('agents')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      const { error } = await supabase.from('agents').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('agents error', err);
    res.status(500).json({ error: err.message });
  }
}
