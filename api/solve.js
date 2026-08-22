import { COUNCIL, corsHeaders, streamHeaders, sse, streamCompletion, extractFinal, buildContext } from './_llm.js';

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, model, history = [] } = req.body || {};
  const member = COUNCIL[model];
  if (!prompt || !member) return res.status(400).json({ error: 'Missing prompt or invalid model' });

  streamHeaders(res);
  // initial heartbeat so the connection opens immediately
  res.write(': open\n\n');
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* closed */ } }, 12000);

  const prior = buildContext(history);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 795000);

  try {
    const out = await streamCompletion({
      model,
      signal: controller.signal,
      maxTokens: 64000,
      messages: [
        { role: 'system', content: member.solveSystem },
        ...prior,
        { role: 'user', content: prompt },
      ],
      onDelta: ({ kind, text }) => sse(res, { type: 'delta', kind, text }),
    });
    clearTimeout(timeout);
    clearInterval(hb);
    sse(res, { type: 'done', content: out.content, reasoning: out.reasoning, final: extractFinal(out.content) });
  } catch (err) {
    clearTimeout(timeout);
    clearInterval(hb);
    const msg = err.name === 'AbortError' ? 'Timed out while solving (very hard problem)' : err.message;
    sse(res, { type: 'error', error: msg });
  }
  res.end();
}
