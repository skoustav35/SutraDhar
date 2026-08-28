import { adminDb, adminAuth } from './firebase-admin.js';
import { streamCompletion } from './_llm.js';
import { PROVIDERS } from './_providers.js';

export const config = { maxDuration: 120 };

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
    // Use reliable chat models for forging – laguna most stable
    const FORGE_MODELS = ['laguna-s-2.1-free', 'hy3-free', 'mimo-v2.5-free'];
    let content = '';
    let lastErr = null;
    for (const forgeModel of FORGE_MODELS) {
      try {
        const out = await streamCompletion({
          model: forgeModel,
          maxTokens: 2000,
          effort: 'low',
          messages: [
            { role: 'system', content: FORGE_SYSTEM },
            { role: 'user', content: `Create an agent for: ${request}` },
          ],
        });
        content = out.content || '';
        if (content.trim()) break;
      } catch (e) {
        lastErr = e;
        console.warn(`[forge] ${forgeModel} failed:`, e.message);
      }
    }
    if (!content.trim()) {
      console.error('[forge] all models failed', lastErr);
      const fallbackName = String(request).slice(0, 30).replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'New Agent';
      content = JSON.stringify({
        name: fallbackName.slice(0, 40),
        emoji: '🧷',
        color: '#c8781e',
        description: `Agent for: ${String(request).slice(0, 120)}`,
        system_prompt: `You are ${fallbackName}, a helpful AI agent. ${request} Follow the user's instructions precisely, be concise and accurate, and use your assigned tools effectively.`,
        skills: ['Task Automation', 'General Assistance'],
        connectors: [],
      });
    }

    // Robust JSON extraction
    let cleaned = String(content).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    let spec;
    try {
      const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
      spec = JSON.parse(slice);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      try {
        spec = JSON.parse(match ? match[0] : cleaned);
      } catch {
        return res.status(200).json({ ok: false, error: 'Could not design the agent. Please rephrase with more detail (e.g. "a github triage agent for PR reviews").' });
      }
    }

    const agent = {
      name: String(spec.name || 'New Agent').slice(0, 80),
      emoji: spec.emoji || '🧷',
      color: /^#[0-9a-fA-F]{6}$/.test(spec.color || '') ? spec.color : '#c8781e',
      description: String(spec.description || '').slice(0, 500),
      system_prompt: String(spec.system_prompt || '').slice(0, 6000),
      skills: Array.isArray(spec.skills) ? spec.skills.slice(0, 10) : [],
      connectors: Array.isArray(spec.connectors)
        ? spec.connectors.filter((c) => Object.prototype.hasOwnProperty.call(PROVIDERS, c)).slice(0, 12)
        : [],
    };

    if (save) {
      const docRef = await adminDb.collection('agents').add({
        user_id: user.uid,
        created_by_ai: true,
        ...agent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const doc = await docRef.get();
      return res.status(201).json({ ok: true, agent: { id: docRef.id, ...doc.data() } });
    }

    return res.status(200).json({ ok: true, agent });
  } catch (err) {
    console.error('agent-forge error', err);
    return res.status(500).json({ error: err.message || 'Forge failed' });
  }
}
