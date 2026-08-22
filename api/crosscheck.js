import { COUNCIL, corsHeaders, streamHeaders, sse, streamCompletion } from './_llm.js';

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, model, ownSolution, peers = [] } = req.body || {};
  const member = COUNCIL[model];
  if (!prompt || !member) return res.status(400).json({ error: 'Missing prompt or invalid model' });

  streamHeaders(res);
  res.write(': open\n\n');

  if (!peers.length) {
    sse(res, { type: 'done', review: 'No peer solutions available to cross-check.' });
    return res.end();
  }

  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* closed */ } }, 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 795000);
  const peerBlock = peers.map((p) => `--- ${p.name}'s solution ---\n${p.content}`).join('\n\n');

  try {
    const out = await streamCompletion({
      model,
      signal: controller.signal,
      maxTokens: 32000,
      messages: [
        {
          role: 'system',
          content:
            'You are a meticulous mathematics referee. You already solved this problem. Now critically CROSS-CHECK the other solvers\' solutions against your own. Independently verify their decisive steps — do not agree by default. Point out any arithmetic or logical errors, note agreements and disagreements. Conclude with a line "VERDICT:" stating which final answer you now believe is correct and your confidence level. Use LaTeX for math.',
        },
        {
          role: 'user',
          content: `Problem:\n"""${prompt}"""\n\nYour own solution:\n${ownSolution}\n\nOther solvers' solutions:\n${peerBlock}\n\nCross-check now.`,
        },
      ],
      onDelta: ({ kind, text }) => sse(res, { type: 'delta', kind, text }),
    });
    clearTimeout(timeout);
    clearInterval(hb);
    sse(res, { type: 'done', review: out.content });
  } catch (err) {
    clearTimeout(timeout);
    clearInterval(hb);
    const msg = err.name === 'AbortError' ? 'Timed out while cross-checking' : err.message;
    sse(res, { type: 'error', error: msg });
  }
  res.end();
}
