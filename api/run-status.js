import supabase from './db-client.js';

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
    const { data } = await supabase.auth.getUser(token);
    userId = data?.user?.id || null;
  } catch { /* ignore */ }
  if (!userId) return res.status(401).json({ error: 'Invalid token' });

  const { runId, chatId } = req.query;
  try {
    let query = supabase.from('runs').select('*').eq('user_id', userId);
    if (runId) query = query.eq('id', runId);
    else if (chatId) query = query.eq('chat_id', chatId).order('created_at', { ascending: false }).limit(1);
    else return res.status(400).json({ error: 'Provide runId or chatId' });

    const { data, error } = await query;
    if (error) throw error;
    const run = Array.isArray(data) ? data[0] : data;
    if (!run) return res.status(200).json({ found: false });

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
