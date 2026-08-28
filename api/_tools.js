// Tool use for the reasoning pipeline.
//
// Connected accounts are exposed to Sutradhar as callable tools. Before the
// reasoning streams run, a fast planning pass decides which (if any) tools are
// needed; those calls are then executed against the providers' REAL APIs and
// the results are injected into the reasoning context. Every execution is
// written to `connector_events`.
import { adminDb } from './firebase-admin.js';
import { PROVIDERS } from './_providers.js';
import { runAction } from './_connectors-runtime.js';
import { streamCompletion } from './_llm.js';

// Planning is a short, cheap call. Try a few fast models so a single upstream
// outage never silently disables tool use.
const PLANNER_MODELS = ['laguna-s-2.1-free', 'hy3-free', 'mimo-v2.5-free', 'muse-spark-1.2-contributor-free'];

/** Tools available to a user right now, based on healthy connections. */
export async function listUserTools(userId, restrictTo = null) {
  const snapshot = await adminDb.collection('connectors')
    .where('user_id', '==', userId)
    .get();
  if (snapshot.empty) return [];

  const allow = Array.isArray(restrictTo) && restrictTo.length ? new Set(restrictTo) : null;
  const tools = [];
  for (const doc of snapshot.docs) {
    const row = { id: doc.id, ...doc.data() };
    if (row.status !== 'connected') continue;
    if (allow && !allow.has(row.provider)) continue;
    const def = PROVIDERS[row.provider];
    if (!def) continue;
    for (const [id, action] of Object.entries(def.actions || {})) {
      tools.push({
        provider: row.provider,
        providerName: def.name,
        account: row.account_name,
        action: id,
        label: action.label,
        description: action.description || '',
        write: !!action.write,
        params: (action.params || []).map((p) => ({
          name: p.name,
          required: !!p.required,
          type: p.type || 'text',
          placeholder: p.placeholder || '',
        })),
      });
    }
  }
  return tools;
}

function manifest(tools) {
  return tools
    .map((t) => {
      const params = t.params.length
        ? t.params.map((p) => `${p.name}${p.required ? '*' : ''}:${p.type}`).join(', ')
        : 'none';
      return `- ${t.provider}.${t.action} — ${t.label}. ${t.description} Params: ${params}.${t.write ? ' [WRITES DATA]' : ''}`;
    })
    .join('\n');
}

const BASE_PLANNER_SYSTEM = `You decide whether a user's request needs live data or actions from their connected accounts.
You are given a tool list. Reply with ONLY a JSON object, no prose, no markdown fences:
{"calls":[{"provider":"github","action":"list_repos","params":{"limit":5},"why":"needs their repo list"}]}
Rules:
- Return {"calls":[]} when the request can be answered from reasoning alone. This is the common case — do not invent work.
- Maximum 3 calls. Only use providers and actions from the list. Only use listed param names.
- Prefer read-only calls that directly supply the missing facts.`;

const PLANNER_SYSTEM = BASE_PLANNER_SYSTEM + `
- Never call a tool marked [WRITES DATA] unless the user explicitly asked for that action to be performed.`;

const AGENT_PLANNER_SYSTEM = BASE_PLANNER_SYSTEM + `
- You are powering an autonomous agent with FULL connector powers. The agent's persona and its assigned connectors mean it is EXPECTED to use tools aggressively and effectively. For this agent:
  * You SHOULD call tools whenever they could help — do not wait for an explicit "send/create" keyword. If the user's request hints at needing live data (e.g. "summarize my repos", "what's on my calendar", "draft an email"), CALL the relevant tool immediately.
  * You MAY and SHOULD call [WRITES DATA] tools (post message, send email, create issue, etc.) whenever they serve the request — the agent is explicitly authorized. Prefer to act rather than just describe.
  * Use up to 5 calls (not just 3) for agents, to fully leverage their connectors. Choose the most impactful actions.
  * Still: only call tools from the list, never hallucinate params, and never call a tool with missing required params.`;

/** Ask a fast model which real tool calls (if any) the request needs. */
export async function planToolCalls({ prompt, tools, history = [], isAgent = false }) {
  if (!tools.length) return [];
  const recent = history
    .slice(-4)
    .map((m) => `${m.role}: ${String(m.content).slice(0, 400)}`)
    .join('\n');

  const system = isAgent ? AGENT_PLANNER_SYSTEM : PLANNER_SYSTEM;
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Available tools:\n${manifest(tools)}\n\n${recent ? `Recent conversation:\n${recent}\n\n` : ''}User request:\n"""${String(prompt).slice(0, 4000)}"""\n\nJSON only.`,
    },
  ];

  let parsed = null;
  for (const model of PLANNER_MODELS) {
    let raw = '';
    try {
      const out = await streamCompletion({ model, maxTokens: 900, effort: 'low', messages });
      raw = out.content || '';
    } catch {
      continue; // model unavailable — try the next one
    }
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) continue;
    try {
      parsed = JSON.parse(match[0]);
      break;
    } catch {
      /* malformed — try the next model */
    }
  }
  if (!parsed) return [];

  const valid = new Map(tools.map((t) => [`${t.provider}.${t.action}`, t]));
  const maxCalls = isAgent ? 8 : 5;
  return (Array.isArray(parsed.calls) ? parsed.calls : [])
    .slice(0, maxCalls)
    .filter((c) => c && valid.has(`${c.provider}.${c.action}`))
    .map((c) => ({
      provider: c.provider,
      action: c.action,
      params: c.params && typeof c.params === 'object' ? c.params : {},
      why: String(c.why || '').slice(0, 200),
      tool: valid.get(`${c.provider}.${c.action}`),
    }));
}

/** Execute planned calls against the providers' real APIs. */
export async function executeToolCalls({ userId, calls, onEvent = () => {} }) {
  const results = [];
  for (const call of calls) {
    onEvent({ type: 'tool_start', provider: call.provider, action: call.action, label: call.tool?.label });
    try {
      const result = await runAction({
        userId,
        provider: call.provider,
        actionId: call.action,
        params: call.params,
        source: 'agent',
      });
      results.push({ ok: true, ...call, result });
      onEvent({ type: 'tool_done', provider: call.provider, action: call.action, summary: result.summary });
    } catch (e) {
      results.push({ ok: false, ...call, error: e.message });
      onEvent({ type: 'tool_error', provider: call.provider, action: call.action, error: e.message });
    }
  }
  return results;
}

/** Render executed tool results as context the reasoning streams can use. */
export function formatToolContext(results) {
  if (!results.length) return '';
  const blocks = results.map((r) => {
    const head = `### ${PROVIDERS[r.provider]?.name || r.provider} · ${r.tool?.label || r.action}`;
    if (!r.ok) return `${head}\nThe live call failed: ${r.error}. Do not invent data for it — say the tool was unavailable if it matters.`;
    const rows = (r.result.rows || [])
      .slice(0, 25)
      .map((row) => {
        const bits = [row.title, row.subtitle, row.meta, row.url].filter(Boolean);
        return `- ${bits.join(' — ')}`;
      })
      .join('\n');
    return `${head}\n${r.result.summary || ''}\n${rows || '(no rows returned)'}`;
  });
  return [
    '<<LIVE_TOOL_DATA>>',
    'The following is REAL, freshly-fetched data from the user\'s connected accounts. Treat it as authoritative ground truth and cite it naturally. Never claim you cannot access their accounts when data appears here.',
    '',
    blocks.join('\n\n'),
    '<<END_LIVE_TOOL_DATA>>',
  ].join('\n');
}

function formatAvailableTools(tools) {
  if (!tools.length) return '';
  const lines = tools.map((t) => `- ${t.provider}.${t.action} — ${t.label}: ${t.description} Params: ${t.params.map((p) => `${p.name}${p.required ? '*' : ''}:${p.type}`).join(', ') || 'none'}${t.write ? ' [WRITES]' : ''}`).join('\n');
  return [
    '<<AVAILABLE_TOOLS>>',
    'You have these live connectors/tools available RIGHT NOW (already connected and verified). You can call them via the planner, but you also have the capability description for reasoning:',
    lines,
    '<<END_AVAILABLE_TOOLS>>',
    'If the planner did not call a tool but you still need live data, say so in your answer and the system will call it next turn.',
  ].join('\n');
}

/**
 * Full pre-flight: plan, execute and format. Returns the context block plus a
 * machine-readable log for the UI.
 */
export async function gatherToolContext({ userId, prompt, history, restrictTo = null, onEvent = () => {}, isAgent = false }) {
  const tools = await listUserTools(userId, restrictTo);
  if (!tools.length) return { context: '', results: [], toolCount: 0 };

  // If this is an agent call, allow very effective tool-use
  const effectiveIsAgent = isAgent || (Array.isArray(restrictTo) && restrictTo.length > 0);
  const calls = await planToolCalls({ prompt, tools, history, isAgent: effectiveIsAgent });
  if (!calls.length) {
    // For agents, always inject the available tools list so the LLM knows its powers, even if planner chose 0 calls
    const availableContext = effectiveIsAgent ? formatAvailableTools(tools) : '';
    return { context: availableContext, results: [], toolCount: tools.length };
  }

  const results = await executeToolCalls({ userId, calls, onEvent });
  const liveContext = formatToolContext(results);
  // For agents, also append the full tool list so the model understands its full capabilities
  const availableContext = effectiveIsAgent ? '\n\n' + formatAvailableTools(tools) : '';
  return { context: liveContext + availableContext, results, toolCount: tools.length };
}