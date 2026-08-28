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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const snapshot = await adminDb.collection('chats')
        .where('user_id', '==', user.uid)
        .orderBy('updated_at', 'desc')
        .get();
      
      const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(chats);
    }

    if (req.method === 'POST') {
      const { title } = req.body;
      const docRef = await adminDb.collection('chats').add({
        user_id: user.uid,
        title: title || 'New Council',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const doc = await docRef.get();
      return res.status(200).json({ id: docRef.id, ...doc.data() });
    }

    if (req.method === 'PUT') {
      const { id, title } = req.body;
      const docRef = adminDb.collection('chats').doc(id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      await docRef.update({ title, updated_at: new Date().toISOString() });
      const updated = await docRef.get();
      return res.status(200).json({ id: docRef.id, ...updated.data() });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      const batch = adminDb.batch();
      
      const messagesSnapshot = await adminDb.collection('messages')
        .where('chat_id', '==', id)
        .where('user_id', '==', user.uid)
        .get();
      messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      const runsSnapshot = await adminDb.collection('runs')
        .where('chat_id', '==', id)
        .where('user_id', '==', user.uid)
        .get();
      runsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      const chatRef = adminDb.collection('chats').doc(id);
      const chatDoc = await chatRef.get();
      if (!chatDoc.exists || chatDoc.data().user_id !== user.uid) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      batch.delete(chatRef);
      
      await batch.commit();
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('chats error', err);
    res.status(500).json({ error: err.message });
  }
}