import supabase from './db-client.js';

// Map any legacy provider model key to a neutral public model name so old
// history never leaks underlying model/provider names.
const LEGACY_MODEL_NAMES = {
  'nemotron-3-ultra-free': 'Sutradhar 6.7',
  'big-pickle': 'Sutradhar 6.7',
  'deepseek-v4-flash-free': 'Sutradhar 6.7',
  'nemotron-3.5-lightning-free': 'Sutradhar 6.7',
  'hy3-free': 'Sutradhar 6.7',
  'mimo-v2.5-free': 'Sutradhar 6.7',
};
const AGENT_ID_BY_MODEL = {
  'big-pickle': 'sage',
  'deepseek-v4-flash-free': 'analyst',
  'nemotron-3.5-lightning-free': 'skeptic',
  'hy3-free': 'reckoner',
  'mimo-v2.5-free': 'atomist',
  'nemotron-3-ultra-free': 'oracle',
};

// Strip underlying provider/model keys from a persisted message before it is
// returned to the browser (covers both new rows and legacy rows).
function sanitizeMessage(m) {
  const out = { ...m };
  if (out.model_used) out.model_used = LEGACY_MODEL_NAMES[out.model_used] || out.model_used;
  if (Array.isArray(out.council)) {
    out.council = out.council.map((c) => {
      const { model, ...rest } = c || {};
      return { ...rest, agentId: rest.agentId || AGENT_ID_BY_MODEL[model] || 'oracle' };
    });
  }
  return out;
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const chatId = req.query.chatId;
      if (!chatId) return res.status(400).json({ error: 'Missing chatId' });
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json((data || []).map(sanitizeMessage));
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('messages error', err);
    res.status(500).json({ error: err.message });
  }
}
