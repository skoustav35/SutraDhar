import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let userId = null;
  try {
    const { data } = await supabase.auth.getUser(token);
    userId = data?.user?.id || null;
  } catch { /* ignore */ }
  if (!userId) return res.status(401).json({ error: 'Invalid token' });

  const { chatId, prompt, finalContent, council } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    let savedChatId = chatId || null;
    if (!savedChatId) {
      const title = prompt.slice(0, 60).replace(/\s+/g, ' ').trim() || 'New Council';
      const { data: chat } = await supabase.from('chats').insert({ user_id: userId, title }).select().single();
      savedChatId = chat?.id || null;
    } else {
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', savedChatId).eq('user_id', userId);
    }
    if (savedChatId) {
      await supabase.from('messages').insert([
        { chat_id: savedChatId, user_id: userId, role: 'user', content: prompt, model_used: null, council: null },
        { chat_id: savedChatId, user_id: userId, role: 'assistant', content: finalContent, model_used: 'nemotron-3-ultra-free', council: council || null },
      ]);
    }
    return res.status(200).json({ chatId: savedChatId });
  } catch (err) {
    console.error('save error', err);
    return res.status(500).json({ error: err.message });
  }
}
