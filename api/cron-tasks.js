import { adminDb } from './firebase-admin.js';
import { runPipeline, MODE_CONFIGS } from './_llm.js';
import { getFirestore } from 'firebase-admin/firestore';

export const config = { maxDuration: 300 };

// Helper to compute next run (same as in tasks.js)
function computeNextRun(cadence, runTime) {
  const [hh, mm] = String(runTime || '09:00').split(':').map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (cadence === 'hourly') {
    next.setTime(now.getTime() + 60 * 60 * 1000);
  } else if (cadence === 'weekly') {
    if (next <= now) next.setDate(next.getDate() + 7);
  } else if (cadence === 'monthly') {
    if (next <= now) next.setMonth(next.getMonth() + 1);
  } else {
    if (next <= now) next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export default async function handler(req, res) {
  // Vercel Cron will call this with Authorization: Bearer ${CRON_SECRET}
  // For manual testing, allow if CRON_SECRET is not set or if ?force=1
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}` && req.query?.force !== '1') {
    // Also allow if called from same project via service account (no auth header but from Vercel Cron)
    // For now, require secret if set
    if (req.headers['x-vercel-cron'] !== '1') {
      return res.status(401).json({ error: 'Unauthorized cron' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const now = new Date().toISOString();
  try {
    // Find all due tasks: enabled && next_run <= now
    const snapshot = await adminDb.collection('scheduled_tasks')
      .where('enabled', '==', true)
      .where('next_run', '<=', now)
      .limit(20)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ ok: true, executed: 0, message: 'No due tasks' });
    }

    let executed = 0;
    const results = [];

    for (const doc of snapshot.docs) {
      const task = { id: doc.id, ...doc.data() };
      try {
        // Update task to prevent double execution: set next_run immediately
        const nextRun = computeNextRun(task.cadence, task.run_time);
        await adminDb.collection('scheduled_tasks').doc(task.id).update({
          last_run: now,
          next_run: nextRun,
          status: 'running',
          updated_at: now,
        });

        // If task has an agent, load its persona and connectors
        let effectivePrompt = task.prompt;
        let agentConnectors = null;
        if (task.agent_id) {
          try {
            const agentSnap = await adminDb.collection('agents').doc(task.agent_id).get();
            if (agentSnap.exists && agentSnap.data().user_id === task.user_id) {
              const agent = agentSnap.data();
              effectivePrompt = `Agent persona — you are "${agent.name}". ${agent.system_prompt || agent.description}${agent.connectors?.length ? ` You have access to these connected tools: ${agent.connectors.join(', ')}.` : ''} Stay in character.\n\n${task.prompt}`;
              agentConnectors = agent.connectors || null;
            }
          } catch {}
        }

        // Create a chat for the scheduled run (or use a dedicated scheduled chat?)
        // For now, create a new chat per execution with title from task
        const chatRef = await adminDb.collection('chats').add({
          user_id: task.user_id,
          title: `Scheduled: ${task.title}`.slice(0, 80),
          created_at: now,
          updated_at: now,
        });
        const chatId = chatRef.id;

        // Persist user prompt as message
        await adminDb.collection('messages').add({
          chat_id: chatId,
          user_id: task.user_id,
          role: 'user',
          content: task.prompt,
          model_used: null,
          council: null,
          created_at: now,
        });

        // Create a run
        const runRef = await adminDb.collection('runs').add({
          chat_id: chatId,
          user_id: task.user_id,
          prompt: effectivePrompt,
          mode: 'trio', // default to ultra for scheduled tasks
          status: 'solving',
          phase: 'solving',
          note: `Scheduled task: ${task.title}`,
          council: [],
          final: '',
          created_at: now,
          updated_at: now,
        });

        // Run the pipeline (with tool context if agent has connectors)
        // Note: This is awaited, so cron will wait for completion (max 5 min per Vercel limit)
        // For longer tasks, we could use waitUntil, but for cron we await
        const { gatherToolContext } = await import('./_tools.js');
        let toolContext = '';
        try {
          const gathered = await gatherToolContext({
            userId: task.user_id,
            prompt: task.prompt,
            history: [],
            restrictTo: agentConnectors,
            isAgent: !!agentConnectors,
            onEvent: () => {},
          });
          if (gathered.context) toolContext = gathered.context;
        } catch {}
        const finalPrompt = toolContext ? `${toolContext}\n\n${effectivePrompt}` : effectivePrompt;

        const result = await runPipeline({
          prompt: finalPrompt,
          mode: 'trio',
          history: [],
          onProgress: () => {},
        });

        const final = result.final || 'Scheduled task completed with no output.';

        // Update run as complete
        await adminDb.collection('runs').doc(runRef.id).update({
          status: 'complete',
          phase: 'done',
          note: '',
          final,
          updated_at: new Date().toISOString(),
        });

        // Persist assistant message
        await adminDb.collection('messages').add({
          chat_id: chatId,
          user_id: task.user_id,
          role: 'assistant',
          content: final,
          model_used: 'Sutradhar 6.7 Ultra',
          council: [],
          created_at: new Date().toISOString(),
        });
        await adminDb.collection('chats').doc(chatId).update({ updated_at: new Date().toISOString() });

        // Update task status to idle
        await adminDb.collection('scheduled_tasks').doc(task.id).update({
          status: 'idle',
          last_run: now,
          updated_at: new Date().toISOString(),
        });

        executed++;
        results.push({ id: task.id, title: task.title, status: 'success', chatId });
      } catch (e) {
        console.error(`cron task ${task.id} failed`, e);
        try {
          await adminDb.collection('scheduled_tasks').doc(task.id).update({
            status: 'error',
            last_error: String(e.message).slice(0, 500),
            updated_at: new Date().toISOString(),
          });
        } catch {}
        results.push({ id: task.id, title: task.title, status: 'error', error: e.message });
      }
    }

    return res.status(200).json({ ok: true, executed, results });
  } catch (err) {
    console.error('cron-tasks error', err);
    return res.status(500).json({ error: err.message });
  }
}
