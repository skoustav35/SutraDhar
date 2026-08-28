import supabase from './db-client.js';
import { runPipeline, MODE_CONFIGS, COUNCIL, JUDGE_MODEL, MODEL_NAMES, DIRECT_SYSTEM, streamCompletion, buildContext } from './_llm.js';

export const config = { maxDuration: 800 };

// waitUntil keeps the serverless function alive AFTER we respond, so the whole
// pipeline finishes server-side even if the user closes the tab.
let waitUntil = null;
try {
  const mod = await import('@vercel/functions');
  waitUntil = mod.waitUntil;
} catch { /* fallback: await inline */ }

function rosterFor(mode) {
  const cfg = MODE_CONFIGS[mode] || MODE_CONFIGS.trio;
  if (!cfg.synthesize) {
    return [{ model: cfg.models[0], agentId: 'oracle', name: 'Reasoning Stream', title: 'Direct reasoning', status: 'answering', reasoning: '', content: '', final: '', review: '', error: null }];
  }
  return cfg.models.map((model) => {
    const m = COUNCIL[model];
    return { model, agentId: m.agentId, name: m.name, title: m.title, status: 'idle', reasoning: '', content: '', final: '', review: '', error: null };
  });
}

// Public shape sent to the browser / saved for history: strips the underlying
// provider `model` key entirely, keeping only the neutral `agentId`.
function toPublicCouncil(council) {
  return council.map((c) => ({
    agentId: c.agentId,
    name: c.name,
    title: c.title,
    reasoning: c.reasoning,
    content: c.content,
    final: c.final,
    review: c.review,
    error: c.error,
    status: c.status,
  }));
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

// The background job: runs the full pipeline and persists progress to `runs`,
// then writes the final assistant message to `messages`.
async function orchestrate({ runId, chatId, userId, prompt, mode, history }) {
  const cfg = MODE_CONFIGS[mode] || MODE_CONFIGS.trio;
  const council = rosterFor(mode);
  const byModel = Object.fromEntries(council.map((c) => [c.model, c]));
  let finalAcc = '';
  let phase = cfg.synthesize ? 'solving' : 'answering';
  let note = cfg.synthesize ? `Sutradhar is reasoning across ${council.length} parallel streams…` : 'Sutradhar is reasoning…';
  let lastWrite = 0;

  const flush = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 1100) return;
    lastWrite = now;
    try {
      await supabase.from('runs').update({
        council: toPublicCouncil(council), final: finalAcc, phase, note, status: phase === 'done' ? 'complete' : phase,
        updated_at: new Date().toISOString(),
      }).eq('id', runId);
    } catch { /* non-fatal */ }
  };

  const onProgress = (ev) => {
    const t = ev.type;
    if (t === 'stage') {
      if (ev.stage === 'solving') { phase = 'solving'; note = `Sutradhar is reasoning across ${council.length} parallel streams…`; }
      else if (ev.stage === 'cross-checking') { phase = 'cross-checking'; note = 'Sutradhar is cross-verifying its own reasoning…'; }
      else if (ev.stage === 'judging') { phase = 'judging'; note = 'Sutradhar is converging to the final answer…'; }
      else if (ev.stage === 'answering') { phase = 'answering'; note = 'Sutradhar is reasoning…'; }
      else if (ev.stage === 'done') { phase = 'done'; note = ''; }
      flush();
    } else if (t === 'solver_start') {
      if (byModel[ev.model]) byModel[ev.model].status = 'solving';
      flush();
    } else if (t === 'solver_delta') {
      const m = byModel[ev.model];
      if (m) { if (ev.kind === 'reasoning') m.reasoning += ev.text; else m.content += ev.text; }
      flush();
    } else if (t === 'solver_done') {
      const m = byModel[ev.model];
      if (m) { m.content = ev.content || m.content; m.reasoning = ev.reasoning || m.reasoning; m.final = ev.final || m.final; m.status = 'judged'; }
      flush(true);
    } else if (t === 'solver_error') {
      const m = byModel[ev.model];
      if (m) { m.status = 'error'; m.error = 'Unavailable'; }
      flush(true);
    } else if (t === 'crosscheck_start') {
      const m = byModel[ev.model];
      if (m) m.status = 'cross-checking';
      flush();
    } else if (t === 'crosscheck_delta') {
      const m = byModel[ev.model];
      if (m) m.review += ev.text;
      flush();
    } else if (t === 'crosscheck_done') {
      const m = byModel[ev.model];
      if (m) { m.review = ev.review || m.review; m.status = 'judged'; }
      flush(true);
    } else if (t === 'final_delta') {
      finalAcc += ev.text;
      flush();
    }
  };

  try {
    const result = await runPipeline({ prompt, mode, history, onProgress });
    finalAcc = result.final || finalAcc;

    // Guaranteed-answer rescue if the pipeline produced nothing.
    if (!finalAcc.trim()) {
      note = 'Sutradhar is composing a direct solution…';
      await flush(true);
      const rescueModels = [JUDGE_MODEL, 'big-pickle', 'deepseek-v4-flash-free'];
      for (const rm of rescueModels) {
        try {
          const out = await streamCompletion({
            model: rm,
            maxTokens: 64000,
            effort: 'medium',
            messages: [{ role: 'system', content: DIRECT_SYSTEM }, ...buildContext(history), { role: 'user', content: prompt }],
            onDelta: ({ kind, text }) => { if (kind === 'content') { finalAcc += text; flush(); } },
          });
          if (out.content) { finalAcc = out.content; break; }
        } catch { /* try next */ }
      }
    }
    if (!finalAcc.trim()) finalAcc = 'The problem is exceptionally demanding and the models are momentarily unavailable. Please try again.';

    // mark solvers complete
    council.forEach((c) => { if (c.status !== 'error') c.status = 'done'; });
    phase = 'done';
    note = '';
    await supabase.from('runs').update({
      status: 'complete', phase: 'done', note: '', council: toPublicCouncil(council), final: finalAcc, updated_at: new Date().toISOString(),
    }).eq('id', runId);

    // Persist the final assistant message for permanent history.
    // model_used is stored as the neutral public model name (never the provider).
    await supabase.from('messages').insert({
      chat_id: chatId, user_id: userId, role: 'assistant', content: finalAcc, model_used: MODEL_NAMES[mode] || 'Sutradhar 6.7',
      council: toPublicCouncil(council),
    });
    await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
  } catch (err) {
    try {
      await supabase.from('runs').update({ status: 'error', note: err.message, updated_at: new Date().toISOString() }).eq('id', runId);
    } catch { /* noop */ }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required to run the council.' });

  const { prompt, mode = 'trio', chatId, history = [] } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  const useMode = MODE_CONFIGS[mode] ? mode : 'trio';

  try {
    // 1) Create the chat immediately with a name (or touch existing).
    let cid = chatId || null;
    let chatTitle = '';
    if (!cid) {
      chatTitle = prompt.slice(0, 60).replace(/\s+/g, ' ').trim() || 'New Council';
      const { data: chat, error } = await supabase.from('chats').insert({ user_id: user.id, title: chatTitle }).select().single();
      if (error) throw error;
      cid = chat.id;
    } else {
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', cid).eq('user_id', user.id);
    }

    // 2) Persist the user's message immediately.
    await supabase.from('messages').insert({ chat_id: cid, user_id: user.id, role: 'user', content: prompt, model_used: null, council: null });

    // 3) Create the live run row.
    const { data: run, error: runErr } = await supabase.from('runs').insert({
      chat_id: cid, user_id: user.id, prompt, mode: useMode,
      status: useMode && MODE_CONFIGS[useMode].synthesize ? 'solving' : 'answering',
      phase: MODE_CONFIGS[useMode].synthesize ? 'solving' : 'answering',
      note: '', council: toPublicCouncil(rosterFor(useMode)), final: '',
    }).select().single();
    if (runErr) throw runErr;

    // 4) Respond immediately so the UI can show the new chat and let the user leave.
    res.status(200).json({ chatId: cid, runId: run.id, title: chatTitle });

    // 5) Run the pipeline in the background (survives the user leaving).
    const job = orchestrate({ runId: run.id, chatId: cid, userId: user.id, prompt, mode: useMode, history });
    if (waitUntil) waitUntil(job); else await job;
  } catch (err) {
    console.error('run kickoff error', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}
