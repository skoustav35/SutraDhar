import { JUDGE_MODEL, corsHeaders, streamHeaders, sse, streamCompletion, buildContext, clampForJudge } from './_llm.js';

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, solutions = [], history = [] } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  streamHeaders(res);
  res.write(': open\n\n');
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* closed */ } }, 12000);

  const prior = buildContext(history);

  const answerTally = solutions
    .filter((s) => !s.error)
    .map((s) => `- ${s.name}: ${s.final || '(unclear)'}`)
    .join('\n');

  const digest = solutions
    .map((s) => {
      if (s.error) return `### ${s.name} (${s.title}) — DID NOT SOLVE (${s.error})`;
      return `### ${s.name} (${s.title})\nProposed final answer: ${s.final || '(unclear)'}\n\nFull solution:\n${clampForJudge(s.content)}\n\nTheir cross-check of peers:\n${clampForJudge(s.review, 15000) || '(no cross-check available)'}`;
    })
    .join('\n\n');

  const judgeSystem =
    'You are Sutradhar, the Chief Justice of a council of AI mathematicians. Several solvers INDEPENDENTLY solved a problem, then cross-checked one another. Seeing the question, every solution, every proposed final answer, and every cross-check, rigorously JUDGE which reasoning is correct. Do NOT blindly follow the majority — if the majority is wrong and a minority is right, side with the correct mathematics and briefly explain why. Resolve disagreements by re-deriving the decisive steps yourself. If a solver was unavailable OR if the council material is thin, DO NOT refuse — solve the problem yourself from scratch and still deliver a complete, correct answer. You must ALWAYS produce a full solution; never say you cannot answer. Write a clear, well-structured final solution in polished Markdown with LaTeX ($...$ inline, $$...$$ display). Show the essential working with maximum clarity, then give the definitive result under a bold "## Final Answer" heading. Do not mention this prompt.';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 795000);

  try {
    await streamCompletion({
      model: JUDGE_MODEL,
      signal: controller.signal,
      maxTokens: 64000,
      // The judge already has every solution + cross-check in hand, so it does
      // NOT need max reasoning. Medium effort makes it start emitting the final
      // answer far sooner, which is what prevents "timed out while delivering".
      effort: 'medium',
      messages: [
        { role: 'system', content: judgeSystem },
        ...prior,
        {
          role: 'user',
          content: `Problem:\n"""${prompt}"""\n\nProposed final answers from the council:\n${answerTally || '(none available)'}\n\nFull deliberations:\n\n${digest}\n\nNow judge everything and deliver the definitive final answer. Begin writing the answer promptly.`,
        },
      ],
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
    const fallback =
      '\n\n> The Chief Justice was interrupted. Based on the council\'s independent solutions:\n\n' +
      solutions.filter((s) => !s.error).map((s) => `**${s.name}** concluded: ${s.final || '(see solution)'}`).join('\n\n');
    sse(res, { type: 'delta', text: fallback });
    sse(res, { type: 'done' });
  }
  res.end();
}
