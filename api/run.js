import { adminDb, adminAuth } from './firebase-admin.js';
import { runPipeline, MODE_CONFIGS, COUNCIL, JUDGE_MODEL, MODEL_NAMES, DIRECT_SYSTEM, streamCompletion, buildContext, sanitizeIdentity } from './_llm.js';
import { gatherToolContext } from './_tools.js';

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
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

// The background job: runs the full pipeline and persists progress to `runs`,
// then writes the final assistant message to `messages`.
async function orchestrate({ runId, chatId, userId, prompt, mode, history, agentConnectors }) {
  const cfg = MODE_CONFIGS[mode] || MODE_CONFIGS.trio;
  const council = rosterFor(mode);
  const byModel = Object.fromEntries(council.map((c) => [c.model, c]));
  let finalAcc = '';
  let phase = cfg.synthesize ? 'solving' : 'answering';
  let note = cfg.synthesize ? `Sutradhar is reasoning across ${council.length} parallel streams…` : 'Sutradhar is reasoning…';
  let lastWrite = 0;
  let toolResults = [];

  const flush = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 150) return;
    lastWrite = now;
    try {
      await adminDb.collection('runs').doc(runId).update({
        council: toPublicCouncil(council), final: finalAcc, phase, note, status: phase === 'done' ? 'complete' : phase,
        updated_at: new Date().toISOString(),
      });
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
    // ---- Phase 0: real tool use across the user's connected accounts ----
    let effectivePrompt = prompt;
    try {
      phase = 'tools';
      note = 'Sutradhar is consulting your connected tools…';
      await flush(true);
      const gathered = await gatherToolContext({
        userId,
        prompt,
        history,
        restrictTo: agentConnectors,
        isAgent: Array.isArray(agentConnectors) && agentConnectors.length > 0,
        onEvent: (ev) => {
          if (ev.type === 'tool_start') note = `Calling ${ev.provider} · ${ev.label || ev.action}…`;
          else if (ev.type === 'tool_done') note = `${ev.provider} responded — ${ev.summary || 'done'}`;
          else if (ev.type === 'tool_error') note = `${ev.provider} failed — ${ev.error}`;
          flush();
        },
      });
      toolResults = (gathered.results || []).map((r) => ({
        provider: r.provider,
        action: r.action,
        label: r.tool?.label || r.action,
        ok: r.ok,
        summary: r.ok ? r.result.summary : r.error,
      }));
      if (gathered.context) effectivePrompt = `${gathered.context}\n\n${prompt}`;
    } catch {
      /* tool use is best-effort; reasoning continues without it */
    }
    phase = cfg.synthesize ? 'solving' : 'answering';
    note = cfg.synthesize ? `Sutradhar is reasoning across ${council.length} parallel streams…` : 'Sutradhar is reasoning…';
    await flush(true);

    const result = await runPipeline({ prompt: effectivePrompt, mode, history, onProgress });
    finalAcc = result.final || finalAcc;

    // Guaranteed-answer rescue if the pipeline produced nothing.
    if (!finalAcc.trim()) {
      note = 'Sutradhar is composing a direct solution…';
      await flush(true);
      const rescueModels = [JUDGE_MODEL, 'mimo-v2.5-free', 'laguna-s-2.1-free'];
      for (const rm of rescueModels) {
        try {
          const out = await streamCompletion({
            model: rm,
            maxTokens: 128000,
            effort: 'medium',
            messages: [{ role: 'system', content: DIRECT_SYSTEM }, ...buildContext(history), { role: 'user', content: prompt }],
            onDelta: ({ kind, text }) => { if (kind === 'content') { finalAcc += sanitizeIdentity(text); flush(); } },
          });
          if (out.content) { finalAcc = sanitizeIdentity(out.content); break; }
        } catch { /* try next */ }
      }
    }
    finalAcc = sanitizeIdentity(finalAcc);
    if (!finalAcc.trim()) finalAcc = 'The problem is exceptionally demanding and the models are momentarily unavailable. Please try again.';

    // Record which live tools were actually called, so the provenance of the
    // answer is visible and permanently stored with the message.
    if (toolResults.length) {
      const lines = toolResults
        .map((t) => `- ${t.ok ? '✅' : '⚠️'} **${t.provider}** · ${t.label} — ${t.summary}`)
        .join('\n');
      finalAcc += `\n\n---\n\n**Live data used**\n\n${lines}`;
    }

    // mark solvers complete
    council.forEach((c) => { if (c.status !== 'error') c.status = 'done'; });
    phase = 'done';
    note = '';
    await adminDb.collection('runs').doc(runId).update({
      status: 'complete', phase: 'done', note: '', council: toPublicCouncil(council), final: finalAcc, updated_at: new Date().toISOString(),
    });

    // Persist the final assistant message for permanent history.
    // model_used is stored as the neutral public model name (never the provider).
    await adminDb.collection('messages').add({
      chat_id: chatId, user_id: userId, role: 'assistant', content: finalAcc, model_used: MODEL_NAMES[mode] || 'Sutradhar 6.7',
      council: toPublicCouncil(council),
      created_at: new Date().toISOString(),
    });
    await adminDb.collection('chats').doc(chatId).update({ updated_at: new Date().toISOString() });
  } catch (err) {
    try {
      await adminDb.collection('runs').doc(runId).update({ status: 'error', note: err.message, updated_at: new Date().toISOString() });
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

  const { prompt, mode = 'trio', chatId, history = [], agentConnectors = null } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  const useMode = MODE_CONFIGS[mode] ? mode : 'trio';

  // Helper to create a polished, formal chat title from the raw prompt (strip CTX preamble)
  function polishTitle(raw) {
    // Strip the <<CTX>>...<<END>> preamble that the frontend wraps around the user text
    const withoutCtx = String(raw || '').replace(/<<CTX>>[\s\S]*?<<END>>\s*/g, '').trim();
    // Take first meaningful line, remove extra punctuation, capitalize
    let t = withoutCtx.split('\n')[0].trim();
    // Remove leading non-alphanumeric, collapse spaces
    t = t.replace(/^\W+/, '').replace(/\s+/g, ' ').trim();
    if (!t) return 'New Council';
    // Title-case-ish: first letter upper, not fully lowercasing to preserve proper nouns
    t = t.charAt(0).toUpperCase() + t.slice(1);
    // Truncate to ~60 chars at word boundary
    if (t.length > 60) {
      t = t.slice(0, 57).replace(/\s+\S*$/, '').trim() + '…';
    }
    // Ensure it doesn't look like a raw instruction
    if (/^If you need clarification/i.test(t)) return 'New Council';
    return t;
  }

  try {
    // 1) Create the chat immediately with a name (or touch existing).
    let cid = chatId || null;
    let chatTitle = '';
    if (!cid) {
      chatTitle = polishTitle(prompt) || 'New Council';
      const chatRef = await adminDb.collection('chats').add({
        user_id: user.uid,
        title: chatTitle,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      cid = chatRef.id;
    } else {
      await adminDb.collection('chats').doc(cid).update({ updated_at: new Date().toISOString() });
    }

    // 2) Persist the user's message immediately.
    await adminDb.collection('messages').add({
      chat_id: cid, user_id: user.uid, role: 'user', content: prompt, model_used: null, council: null,
      created_at: new Date().toISOString(),
    });

    // 3) Create the live run row.
    const runRef = await adminDb.collection('runs').add({
      chat_id: cid, user_id: user.uid, prompt, mode: useMode,
      status: useMode && MODE_CONFIGS[useMode].synthesize ? 'solving' : 'answering',
      phase: MODE_CONFIGS[useMode].synthesize ? 'solving' : 'answering',
      note: '', council: toPublicCouncil(rosterFor(useMode)), final: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 4) Respond immediately so the UI can show the new chat and let the user leave.
    res.status(200).json({ chatId: cid, runId: runRef.id, title: chatTitle });

    // 5) Run the pipeline in the background (survives the user leaving).
    const job = orchestrate({
      runId: runRef.id,
      chatId: cid,
      userId: user.uid,
      prompt,
      mode: useMode,
      history,
      agentConnectors: Array.isArray(agentConnectors) ? agentConnectors : null,
    });
    if (waitUntil) waitUntil(job); else await job;
  } catch (err) {
    console.error('run kickoff error', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}