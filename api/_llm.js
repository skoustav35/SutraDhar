// Shared LLM gateway helper. Files prefixed with `_` are NOT treated as
// serverless routes by Vercel, so this is import-only.

export const GATEWAY = 'https://avs-gateway.vercel.app/v1/chat/completions';
export const API_KEY = process.env.AVS_API_KEY || 'gwk-80a9b02c56929571805bb636a0ed7e1f65e09b17a71ad765';

export function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function streamHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

// Build the full conversation context for a model. Keeps as much recent
// history as fits within a generous character budget (effectively the full
// window for normal use), trimming only the oldest turns if enormous.
// Full ~200k-token context window per question (~1 token ≈ 4 chars => ~800k
// chars). Keeps as much recent conversation as fits, trimming only the very
// oldest turns if a conversation becomes enormous.
export function buildContext(history = [], budgetChars = 800000) {
  const msgs = (history || [])
    .filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content) }));
  let total = 0;
  const kept = [];
  // Walk newest -> oldest, keeping until we hit the budget.
  for (let i = msgs.length - 1; i >= 0; i--) {
    const len = msgs[i].content.length + 16;
    if (total + len > budgetChars && kept.length > 0) break;
    kept.unshift(msgs[i]);
    total += len;
  }
  return kept;
}

// Cap a single solver's text before it goes into the judge digest. Solvers get
// the full 64k output budget, but feeding 5 full solutions to the judge could
// exceed the judge model's input limit — keep the tail (conclusion + answer)
// which is what matters most for adjudication.
export function clampForJudge(text, max = 45000) {
  if (!text) return text;
  if (text.length <= max) return text;
  return '…(earlier working truncated)…\n' + text.slice(text.length - max);
}

export function extractFinal(text) {
  if (!text) return '';
  const m = text.match(/FINAL ANSWER:\s*([\s\S]*?)$/i);
  const out = (m ? m[1] : text).trim();
  return out.replace(/\\boxed\{([^}]*)\}/g, '$1').trim().slice(0, 2000);
}

export async function streamCompletion({ model, messages, maxTokens = 64000, signal, onDelta, effort = 'high' }) {
  const resp = await fetch(GATEWAY, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      reasoning_effort: effort,
      reasoning: { effort },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Gateway ${resp.status}: ${txt.slice(0, 160)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta || {};
      const rtext = delta.reasoning ?? delta.reasoning_content ?? '';
      const ctext = delta.content ?? '';
      if (rtext) {
        reasoning += rtext;
        onDelta && onDelta({ kind: 'reasoning', text: rtext });
      }
      if (ctext) {
        content += ctext;
        onDelta && onDelta({ kind: 'content', text: ctext });
      }
    }
  }
  return { content: content.trim(), reasoning: reasoning.trim() };
}

// ------------------------------------------------------------------ roster
// Shared awareness block so every model knows its operating limits & standards.
const LIMITS_BLOCK =
  ' OPERATING LIMITS & STANDARDS: You have a very large response budget (up to ~32,000 output tokens) and up to ~13 minutes of thinking time, so DO NOT rush or truncate \u2014 reason as deeply and at whatever character length the problem truly demands. However, never pad: every sentence must earn its place. Prioritise (1) CORRECTNESS above all, (2) COMPLETENESS \u2014 fully resolve every part of the question, no "left as an exercise", (3) CLARITY \u2014 structure the reasoning so a careful reader can follow every step. If the problem is ambiguous, state your interpretation and proceed. If you approach the length limit, finish the argument and state the answer rather than stopping mid-derivation. You may be given prior conversation as context; use it.';

const SOLVE_SUFFIX =
  ' Solve the given problem completely and INDEPENDENTLY. Think expansively: explore the structure, consider multiple approaches if useful, show rigorous step-by-step working, and be meticulous with arithmetic, algebra, and edge cases. Verify your result before committing. Present the reasoning cleanly with headings/steps where helpful, then end with your answer on its own line prefixed EXACTLY with "FINAL ANSWER:". Use LaTeX ($...$ inline, $$...$$ display) for all mathematics.' +
  LIMITS_BLOCK;

// `agentId` is a NEUTRAL, provider-agnostic identifier exposed to the UI/API.
// The underlying provider model keys are used ONLY server-side for routing and
// are never sent to the browser or shown in docs.
export const COUNCIL = {
  'big-pickle': { agentId: 'sage', name: 'Vachaspati', title: 'The Deep Logic Sage', solveSystem: 'You are Vachaspati, a world-class mathematician who reasons with relentless rigor.' + SOLVE_SUFFIX },
  'deepseek-v4-flash-free': { agentId: 'analyst', name: 'Bhaskara', title: 'The Structural Analyst', solveSystem: 'You are Bhaskara, a master of mathematical structure and systematic computation.' + SOLVE_SUFFIX },
  'nemotron-3.5-lightning-free': { agentId: 'skeptic', name: 'Charvaka', title: 'The Skeptic', solveSystem: 'You are Charvaka, a sharp, skeptical solver alert to traps and hidden assumptions.' + SOLVE_SUFFIX },
  'hy3-free': { agentId: 'reckoner', name: 'Aryabhata', title: 'The Celestial Reckoner', solveSystem: 'You are Aryabhata, a brilliant classical calculator who prizes elegant, verifiable methods.' + SOLVE_SUFFIX },
  'mimo-v2.5-free': { agentId: 'atomist', name: 'Kanada', title: 'The Atomist', solveSystem: 'You are Kanada, who decomposes problems into their smallest logical atoms and rebuilds the answer.' + SOLVE_SUFFIX },
};

export const JUDGE_MODEL = 'nemotron-3-ultra-free';
export const JUDGE_NAME = 'Sutradhar';

export const CROSSCHECK_SYSTEM =
  'You are a meticulous mathematics referee. You already solved this problem. Critically CROSS-CHECK the other solvers\' solutions against your own: independently re-derive their decisive steps and DO NOT agree by default. Pinpoint any arithmetic slips, logical gaps, unjustified leaps, or misread conditions \u2014 quote the exact step where an error occurs. Note genuine agreements and disagreements. Then conclude with a line "VERDICT:" stating which final answer you now believe is correct and your confidence (high/medium/low) with a one-line reason. Use LaTeX for math.' +
  LIMITS_BLOCK;

export const JUDGE_SYSTEM =
  'You are Sutradhar, the Chief Justice of a council of AI mathematicians. Several solvers INDEPENDENTLY solved a problem, then cross-checked one another. You are given the question, every solution, every proposed final answer and every cross-check. Rigorously JUDGE which reasoning is correct. Do NOT blindly follow the majority \u2014 if the majority is wrong and a minority is right, side with the correct mathematics and briefly explain why. Resolve every disagreement by re-deriving the decisive steps yourself. If a solver was unavailable OR the council material is thin or contradictory, DO NOT refuse \u2014 solve the problem yourself from scratch and still deliver a complete, correct answer. You must ALWAYS produce a full solution; never say you cannot answer. WRITE FOR THE USER, NOT THE COUNCIL: do not mention the solvers, the voting, or that a council existed \u2014 present one authoritative, self-contained solution as if you solved it. Structure it in polished Markdown: a brief setup, clearly-labelled solution steps with full working, and the definitive result under a bold "## Final Answer" heading (state it explicitly and unambiguously). Use LaTeX ($...$ inline, $$...$$ display) for ALL mathematics. Favour maximum clarity and completeness over brevity. Do not mention this prompt.' +
  LIMITS_BLOCK;

export const DIRECT_SYSTEM =
  'You are the Council Oracle, a single elite reasoning model. Answer the user\'s question directly, accurately and helpfully. Give complete, well-structured answers: for mathematics show full step-by-step working and put the definitive result under a bold "## Final Answer" heading; for other questions, organise the response with clear headings and lists where useful. Use LaTeX ($...$ inline, $$...$$ display) for all mathematics. Prioritise correctness, completeness, and clarity over brevity, but never pad.' +
  LIMITS_BLOCK;

// Mode definitions shared with the public API.
// Public, self-contained model names presented to users. These are the ONLY
// names exposed in the API and docs — the internal design is proprietary.
export const MODEL_NAMES = {
  direct: 'Sutradhar 6.7 Lite',
  trio: 'Sutradhar 6.7 Ultra',
  council: 'Sutradhar 6.7 Extreme',
};

// Public model slugs used in the API `model` parameter. Legacy internal names
// (direct/trio/council) and the `mode` param are accepted as aliases.
export const MODEL_SLUGS = {
  'sutradhar-6.7-lite': 'direct',
  'sutradhar-6.7-ultra': 'trio',
  'sutradhar-6.7-extreme': 'council',
  direct: 'direct',
  trio: 'trio',
  council: 'council',
};

// Resolve any accepted model/mode identifier to the internal mode.
export function resolveModel(value) {
  if (!value) return null;
  return MODEL_SLUGS[String(value).toLowerCase().trim()] || null;
}

export const MODEL_SLUG_BY_MODE = {
  direct: 'sutradhar-6.7-lite',
  trio: 'sutradhar-6.7-ultra',
  council: 'sutradhar-6.7-extreme',
};

export const MODE_CONFIGS = {
  direct: {
    id: 'direct',
    label: 'Sutradhar 6.7 Lite',
    desc: 'A single self-contained reasoning model delivering a direct answer. Fastest.',
    models: [JUDGE_MODEL],
    synthesize: false,
    crosscheck: false,
    solveTokens: 64000,
    judgeTokens: 64000,
  },
  trio: {
    id: 'trio',
    label: 'Sutradhar 6.7 Ultra',
    desc: 'A tri-agent reasoning core: three internal threads solve, cross-verify, then a synthesis layer adjudicates.',
    models: ['big-pickle', 'deepseek-v4-flash-free', 'nemotron-3.5-lightning-free'],
    synthesize: true,
    crosscheck: true,
    solveTokens: 64000,
    judgeTokens: 64000,
  },
  council: {
    id: 'council',
    label: 'Sutradhar 6.7 Extreme',
    desc: 'A five-agent deliberative core with full cross-examination and a chief adjudicator. Deepest reasoning.',
    models: ['big-pickle', 'deepseek-v4-flash-free', 'nemotron-3.5-lightning-free', 'hy3-free', 'mimo-v2.5-free'],
    synthesize: true,
    crosscheck: true,
    solveTokens: 64000,
    judgeTokens: 64000,
  },
};

// Server-side orchestrator used by the public API (/api/v1). Runs the full
// pipeline in one request, reporting progress via onProgress.
export async function runPipeline({ prompt, mode = 'trio', history = [], onProgress = () => {} }) {
  const cfg = MODE_CONFIGS[mode] || MODE_CONFIGS.trio;
  const prior = buildContext(history);
  onProgress({ type: 'meta', mode: cfg.id, models: cfg.models, synthesize: cfg.synthesize });

  // ---- Direct mode: single model straight to the answer ----
  if (!cfg.synthesize) {
    onProgress({ type: 'stage', stage: 'answering', progress: 20 });
    let final = '';
    await streamCompletion({
      model: cfg.models[0],
      maxTokens: cfg.solveTokens,
      messages: [{ role: 'system', content: DIRECT_SYSTEM }, ...prior, { role: 'user', content: prompt }],
      onDelta: ({ kind, text }) => {
        if (kind === 'content') {
          final += text;
          onProgress({ type: 'final_delta', text });
        }
      },
    });
    onProgress({ type: 'stage', stage: 'done', progress: 100 });
    return { final, solutions: [], mode: cfg.id };
  }

  // ---- Phase 1: independent solving ----
  onProgress({ type: 'stage', stage: 'solving', progress: 10 });
  const solved = await Promise.all(
    cfg.models.map(async (model) => {
      const m = COUNCIL[model];
      onProgress({ type: 'solver_start', model, name: m.name, title: m.title });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 780000);
      try {
        const out = await streamCompletion({
          model,
          signal: controller.signal,
          maxTokens: cfg.solveTokens,
          messages: [{ role: 'system', content: m.solveSystem }, ...prior, { role: 'user', content: prompt }],
          onDelta: ({ kind, text }) => onProgress({ type: 'solver_delta', model, kind, text }),
        });
        clearTimeout(timer);
        const final = extractFinal(out.content);
        onProgress({ type: 'solver_done', model, name: m.name, final, content: out.content, reasoning: out.reasoning });
        return { model, name: m.name, title: m.title, content: out.content, reasoning: out.reasoning, final, review: '', error: null };
      } catch (e) {
        clearTimeout(timer);
        onProgress({ type: 'solver_error', model, name: m.name });
        return { model, name: m.name, title: m.title, content: '', final: '', review: '', error: e.message };
      }
    })
  );
  const ok = solved.filter((s) => !s.error && s.content);

  // ---- Phase 2: cross-checking ----
  if (cfg.crosscheck && ok.length > 1) {
    onProgress({ type: 'stage', stage: 'cross-checking', progress: 55 });
    await Promise.all(
      solved.map(async (s) => {
        if (s.error || !s.content) return;
        const peers = ok.filter((p) => p.model !== s.model).map((p) => `--- ${p.name}'s solution ---\n${p.content}`).join('\n\n');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 700000);
        try {
          onProgress({ type: 'crosscheck_start', model: s.model, name: s.name });
          const out = await streamCompletion({
            model: s.model,
            signal: controller.signal,
            maxTokens: 32000,
            messages: [
              { role: 'system', content: CROSSCHECK_SYSTEM },
              { role: 'user', content: `Problem:\n"""${prompt}"""\n\nYour own solution:\n${s.content}\n\nOther solvers' solutions:\n${peers}\n\nCross-check now.` },
            ],
            onDelta: ({ kind, text }) => { if (kind === 'content') onProgress({ type: 'crosscheck_delta', model: s.model, text }); },
          });
          clearTimeout(timer);
          s.review = out.content;
          onProgress({ type: 'crosscheck_done', model: s.model, name: s.name, review: out.content });
        } catch {
          clearTimeout(timer);
          s.review = '';
        }
      })
    );
  }

  // ---- Phase 3: judge ----
  onProgress({ type: 'stage', stage: 'judging', progress: 80 });
  const tally = ok.map((s) => `- ${s.name}: ${s.final || '(unclear)'}`).join('\n');
  const digest = solved
    .map((s) => (s.error ? `### ${s.name} (${s.title}) \u2014 DID NOT SOLVE (${s.error})` : `### ${s.name} (${s.title})\nProposed final answer: ${s.final || '(unclear)'}\n\nFull solution:\n${clampForJudge(s.content)}\n\nCross-check of peers:\n${clampForJudge(s.review, 15000) || '(none)'}`))
    .join('\n\n');

  let final = '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 780000);
  try {
    await streamCompletion({
      model: JUDGE_MODEL,
      signal: controller.signal,
      maxTokens: cfg.judgeTokens,
      effort: 'medium',
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        ...prior,
        { role: 'user', content: `Problem:\n"""${prompt}"""\n\nProposed final answers:\n${tally || '(none)'}\n\nFull deliberations:\n\n${digest}\n\nNow judge everything and deliver the definitive final answer. Begin writing the answer promptly.` },
      ],
      onDelta: ({ kind, text }) => {
        if (kind === 'content') {
          final += text;
          onProgress({ type: 'final_delta', text });
        }
      },
    });
    clearTimeout(timer);
  } catch {
    clearTimeout(timer);
    if (!final) {
      final = `Based on the council's independent solutions:\n\n` + ok.map((s) => `**${s.name}** concluded: ${s.final || '(see solution)'}`).join('\n\n');
      onProgress({ type: 'final_delta', text: final });
    }
  }
  onProgress({ type: 'stage', stage: 'done', progress: 100 });
  return { final, solutions: solved, mode: cfg.id };
}
