import { corsHeaders, streamHeaders, sse, streamCompletion, DIRECT_SYSTEM, JUDGE_MODEL, buildContext } from './_llm.js';

export const config = { maxDuration: 800 };

// Direct mode for the app: a single model streams straight to the canvas.
export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, history = [] } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  streamHeaders(res);
  res.write(': open\n\n');
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* closed */ } }, 12000);

  const prior = buildContext(history);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 795000);
  try {
    await streamCompletion({
      model: JUDGE_MODEL,
      signal: controller.signal,
      maxTokens: 64000,
      messages: [{ role: 'system', content: DIRECT_SYSTEM }, ...prior, { role: 'user', content: prompt }],
      onDelta: ({ kind, text }) => {
        if (kind === 'content') sse(res, { type: 'delta', text });
        else sse(res, { type: 'reasoning', text });
      },
    });
    clearTimeout(timeout);
    clearInterval(hb);
    sse(res, { type: 'done' });
  } catch (err) {
    clearTimeout(timeout);
    clearInterval(hb);
    sse(res, { type: 'error', error: err.name === 'AbortError' ? 'Timed out' : err.message });
  }
  res.end();
}
