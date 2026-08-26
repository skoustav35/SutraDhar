import supabase from './db-client.js';
import { GATEWAY, API_KEY, JUDGE_MODEL } from './_llm.js';

export const config = { maxDuration: 120 };

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

const FORGE_SYSTEM = `You are Sutradhar's Agent Forge. Given a user's request to create an AI agent, design a complete, production-ready agent specification. Respond with ONLY valid minified JSON (no markdown, no prose) of the exact shape:
{"name":"distinct catchy proper name","emoji":"one relevant emoji","color":"#hex","description":"one concise sentence on what it does","system_prompt":"a rich, detailed system prompt (120-260 words) written in second person that gives the agent a clear persona, goals, tone, guardrails and step-by-step working style","skills":["4-8 short skill phrases"],"connectors":["relevant app connector ids from this set: github, vercel, slack, notion, gmail, gcal, linear, jira, twitter, instagram, youtube, linkedin, tiktok, discord, stripe, figma, gdrive, zapier, hubspot, webflow"]}
Pick a genuinely distinct NAME (not "Assistant"). Choose an emoji and a warm hex color. Only include connectors that truly fit the agent's purpose.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { request, save } = req.body || {};
  if (!request) return res.status(400).json({ error: 'Missing request' });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100000);
    const resp = await fetch(GATEWAY, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 2000,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: FORGE_SYSTEM },
          { role: 'user', content: `Create an agent for: ${request}` },
        ],
      }),
    });
    clearTimeout(timer);
    const json = await resp.json();
    let content = json.choices?.[0]?.message?.content || '';
    // Extract JSON object from the response
    const match = content.match(/\{[\s\S]*\}/);
    let spec;
    try {
      spec = JSON.parse(match ? match[0] : content);
    } catch {
      return res.status(200).json({ ok: false, error: 'Could not design the agent. Please rephrase.' });
    }

    const agent = {
      name: String(spec.name || 'New Agent').slice(0, 80),
      emoji: spec.emoji || '\ud83e\udeb7',
      color: /^#[0-9a-fA-F]{6}$/.test(spec.color || '') ? spec.color : '#c8781e',
      description: String(spec.description || '').slice(0, 500),
      system_prompt: String(spec.system_prompt || '').slice(0, 6000),
      skills: Array.isArray(spec.skills) ? spec.skills.slice(0, 10) : [],
      connectors: Array.isArray(spec.connectors) ? spec.connectors.slice(0, 12) : [],
    };

    if (save) {
      const { data, error } = await supabase
        .from('agents')
        .insert({ user_id: user.id, created_by_ai: true, ...agent })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ ok: true, agent: data });
    }

    return res.status(200).json({ ok: true, agent });
  } catch (err) {
    console.error('agent-forge error', err);
    return res.status(500).json({ error: err.message });
  }
}
