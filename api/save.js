import { adminDb, adminAuth } from './firebase-admin.js';

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
    const decoded = await adminAuth.verifyIdToken(token);
    userId = decoded.uid;
  } catch { /* ignore */ }
  if (!userId) return res.status(401).json({ error: 'Invalid token' });

  const { chatId, prompt, finalContent, council } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    let savedChatId = chatId || null;
    if (!savedChatId) {
      const title = prompt.slice(0, 60).replace(/\s+/g, ' ').trim() || 'New Council';
      const chatRef = await adminDb.collection('chats').add({
        user_id: userId, title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      savedChatId = chatRef.id;
    } else {
      await adminDb.collection('chats').doc(savedChatId).update({ updated_at: new Date().toISOString() });
    }
    if (savedChatId) {
      const batch = adminDb.batch();
      const userMsgRef = adminDb.collection('messages').doc();
      const assistantMsgRef = adminDb.collection('messages').doc();
      
      batch.set(userMsgRef, {
        chat_id: savedChatId, user_id: userId, role: 'user', content: prompt, model_used: null, council: null,
        created_at: new Date().toISOString(),
      });
      batch.set(assistantMsgRef, {
        chat_id: savedChatId, user_id: userId, role: 'assistant', content: finalContent, model_used: 'nemotron-3-ultra-free', council: council || null,
        created_at: new Date().toISOString(),
      });
      await batch.commit();
    }
    return res.status(200).json({ chatId: savedChatId });
  } catch (err) {
    console.error('save error', err);
    return res.status(500).json({ error: err.message });
  }
}