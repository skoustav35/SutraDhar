import { adminDb } from './firebase-admin.js';
import { corsHeaders, streamHeaders, sse, runPipeline, MODEL_NAMES, MODEL_SLUGS, resolveModel, MODEL_SLUG_BY_MODE } from './_llm.js';

// Progress events are presented as a single model's reasoning phases. We only
// forward coarse phase/answer signals — never any internal structure.
function publicEvent(ev) {
  const t = ev.type;
  if (t === 'stage') return { type: 'progress', phase: ev.stage, progress: ev.progress };
  if (t === 'final_delta') return { type: 'answer_delta', text: ev.text };
  // Suppress all other internal events (solver_*, crosscheck_*, meta, etc.).
  return null;
}

export const config = { maxDuration: 800 };

// Public API endpoint. Authenticate with an app-issued API key:
//   Authorization: Bearer sk-council-xxxxx
// Body: { prompt, model?: 'sutradhar-6.7-lite'|'-ultra'|'-extreme', stream?: boolean }
export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const apiKey = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!apiKey || !apiKey.startsWith('sk-council-')) {
    return res.status(401).json({ error: 'Missing or invalid API key. Pass it as: Authorization: Bearer sk-council-...' });
  }

  // Validate the key
  console.log('Checking api_keys...'); let keyRow = null;
  try {
    console.log('Fetching snapshot...'); const snapshot = await adminDb.collection('api_keys').where('key', '==', apiKey).where('revoked', '==', false).limit(1).get();
    keyRow = snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
  } catch (e) {
    return res.status(500).json({ error: 'Key validation failed: ' + e.message });
  }
  console.log('KeyRow:', keyRow); if (!keyRow) return res.status(403).json({ error: 'API key not recognized or has been revoked.' });

  const { prompt, model, mode, stream = false } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing "prompt" (string) in request body.' });
  const resolved = resolveModel(model || mode || 'sutradhar-6.7-ultra');
  if (!resolved) {
    const valid = Object.keys(MODEL_SLUGS).filter((k) => k.startsWith('sutradhar')).join(', ');
    return res.status(400).json({ error: `Invalid model. Use one of: ${valid}.` });
  }

  // Update usage (fire and forget)
  adminDb.collection('api_keys').doc(keyRow.id).update({ last_used_at: new Date().toISOString(), request_count: (keyRow.request_count || 0) + 1 })
    .then(() => {}, () => {});

  // -------- Streaming response (progress + final) --------
  if (stream) {
    streamHeaders(res);
    res.write(': open\n\n');
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* closed */ } }, 12000);
    try {
      console.log('Running pipeline...'); const result = await runPipeline({
        prompt,
        mode: resolved,
        onProgress: (ev) => { const p = publicEvent(ev); if (p) sse(res, p); },
      });
      sse(res, { type: 'done', answer: result.final, model: MODEL_NAMES[result.mode], model_id: MODEL_SLUG_BY_MODE[result.mode] });
    } catch (e) {
      sse(res, { type: 'error', error: e.message });
    } finally {
      clearInterval(hb);
      res.end();
    }
    return;
  }

  // -------- Non-streaming JSON response --------
  try {
    const result = await runPipeline({ prompt, mode: resolved });
    console.log('Returning 200'); return res.status(200).json({
      id: 'cmpl-' + Date.now(),
      object: 'chat.completion',
      model: MODEL_NAMES[result.mode] || 'Sutradhar 6.7',
      model_id: MODEL_SLUG_BY_MODE[result.mode],
      answer: result.final,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}