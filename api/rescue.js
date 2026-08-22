import { corsHeaders, streamHeaders, sse, streamCompletion, JUDGE_MODEL, buildContext } from './_llm.js';

export const config = { maxDuration: 800 };

// LAST-RESORT rescue: a single strong-model call answering the raw question.
// Used only when every solver AND the judge failed to produce anything, so the
// app NEVER returns "the council could not reach an answer".
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
  const system =
    'You are the Council Oracle, an elite mathematician and reasoner. Solve the problem completely and rigorously. Show full, clear step-by-step working, then give the definitive result under a bold "## Final Answer" heading. Use LaTeX ($...$ inline, $$...$$ display) for all mathematics. Be thorough yet readable.';

  // Try a couple of models in order so this is extremely unlikely to fail.
  const models = [JUDGE_MODEL, 'big-pickle', 'deepseek-v4-flash-free'];
  let delivered = false;

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 790000);
    let got = false;
    try {
      await streamCompletion({
        model,
        signal: controller.signal,
        maxTokens: 64000,
        effort: 'medium',
        messages: [{ role: 'system', content: system }, ...prior, { role: 'user', content: prompt }],
        onDelta: ({ kind, text }) => {
          if (kind === 'content') { got = true; delivered = true; sse(res, { type: 'delta', text }); }
          else sse(res, { type: 'reasoning', text });
        },
      });
      clearTimeout(timeout);
      if (got) break;
    } catch {
      clearTimeout(timeout);
      // try next model
    }
  }

  clearInterval(hb);
  if (!delivered) {
    sse(res, { type: 'delta', text: 'The problem is exceptionally demanding and the models are momentarily unavailable. Please try again in a moment.' });
  }
  sse(res, { type: 'done' });
  res.end();
}
