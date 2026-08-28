import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Sparkles, Trash2, Pencil, MessageSquare, X, Check, Bot, Wand2, Loader2 } from 'lucide-react';
import type { Agent } from '../lib/types';
import { CONNECTOR_MAP, CONNECTORS, SKILL_LIBRARY, AGENT_COLORS, AGENT_EMOJIS } from '../lib/catalog';

interface Props {
  authHeaders: () => Promise<Record<string, string>>;
  onChatWithAgent: (a: Agent) => void;
}

const empty: Partial<Agent> = { name: '', emoji: '🪷', color: '#c8781e', description: '', system_prompt: '', skills: [], connectors: [] };

export default function AgentsPanel({ authHeaders, onChatWithAgent }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);
  const [forgePrompt, setForgePrompt] = useState('');
  const [forging, setForging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/agents', { headers: await authHeaders() });
      const text = await res.text();
      if (!res.ok) {
        let msg = `Failed to load agents (${res.status})`;
        try { const j = JSON.parse(text); msg = j.error || msg; } catch {}
        setError(msg);
        return;
      }
      try {
        const data = JSON.parse(text);
        setAgents(Array.isArray(data) ? data : []);
      } catch {
        setError('Invalid response from server');
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing?.name?.trim()) { setError('Agent name is required'); return; }
    const method = editing.id ? 'PUT' : 'POST';
    const prev = agents;
    // Optimistic: if editing, update locally immediately
    if (editing.id) {
      setAgents((p) => p.map((a) => (a.id === editing.id ? { ...a, ...editing } as Agent : a)));
    }
    try {
      const res = await fetch('/api/agents', { method, headers: await authHeaders(), body: JSON.stringify(editing) });
      const text = await res.text();
      let j: any = {};
      try { j = JSON.parse(text); } catch {}
      if (!res.ok) {
        setError(j.error || `Failed to ${editing.id ? 'update' : 'create'} agent`);
        setAgents(prev);
        return;
      }
      setEditing(null);
      showToast(editing.id ? 'Agent updated' : 'Agent created');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setAgents(prev);
    }
  };

  const remove = async (id: string) => {
    const prev = agents;
    setAgents((p) => p.filter((a) => a.id !== id));
    try {
      const res = await fetch('/api/agents', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) });
      if (!res.ok) {
        const txt = await res.text();
        let msg = 'Failed to delete';
        try { msg = JSON.parse(txt).error || msg; } catch {}
        setError(msg);
        setAgents(prev);
      } else {
        showToast('Agent removed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setAgents(prev);
    }
  };

  const forge = async () => {
    if (!forgePrompt.trim()) return;
    setForging(true);
    setError(null);
    try {
      const res = await fetch('/api/agent-forge', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ request: forgePrompt, save: true }) });
      const text = await res.text();
      let j: any = {};
      try { j = JSON.parse(text); } catch { j = { ok:false, error: text.slice(0,200) } }
      if (!res.ok || !j.ok) {
        setError(j.error || `Forge failed (${res.status})`);
        showToast(j.error || 'Forge failed');
        return;
      }
      if (j.ok) {
        setForgePrompt('');
        showToast(`Forged ${j.agent?.name || 'agent'}!`);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Forge failed');
    } finally { setForging(false); }
  };

  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <Bot size={22} className="text-[#b5661a] dark:text-[#ff9933]" />
            <h1 className="font-display text-3xl text-gradient-gold">Agents</h1>
          </div>
          <button onClick={() => setEditing({ ...empty })} className="btn-saffron flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={16} /> New Agent
          </button>
        </div>
        <p className="text-[#7a6746] dark:text-[#a99a7c] text-sm mb-5">Craft specialized AI agents with their own skills, connectors and persona — or let Sutradhar forge one for you. You can also just chat “create an agent that …” and Sutradhar will forge it inline.</p>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-sm">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
          </div>
        )}
        {toast && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-[#8fd4b4] text-sm">
            <Check size={14} /> {toast}
          </div>
        )}

        {/* AI Forge */}
        <div className="jade-panel p-4 mb-6">
          <div className="flex items-center gap-2 mb-2 text-[#1e6e50] dark:text-[#8fd4b4]">
            <Wand2 size={16} />
            <span className="font-medium text-sm">Forge with AI</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={forgePrompt}
              onChange={(e) => setForgePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && forge()}
              placeholder="e.g. an agent that reviews my GitHub PRs and posts summaries to Slack"
              className="ayur-input flex-1 px-3.5 py-2.5 rounded-xl text-sm"
            />
            <button onClick={forge} disabled={forging} className="btn-saffron flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
              {forging ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {forging ? 'Forging…' : 'Forge Agent'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#8a7d60]">Loading agents…</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 text-[#8a7d60]">
            <Bot size={40} className="mx-auto mb-3 opacity-40" />
            No agents yet. Forge one above or create manually.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {agents.map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="agent-card group rounded-2xl p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: a.color }} />
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${a.color}22`, border: `1px solid ${a.color}55` }}>
                    {a.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg text-[#6a4310] dark:text-[#ffd89b] truncate">{a.name}</h3>
                      {a.created_by_ai && <span className="spice-chip !py-0.5 !px-2 text-[9px]">AI-forged</span>}
                    </div>
                    <p className="text-[12.5px] text-[#7a6746] dark:text-[#a99a7c] line-clamp-2 mt-0.5">{a.description}</p>
                  </div>
                </div>
                {a.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {a.skills.slice(0, 4).map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#b87333]/12 text-[#8a5f28] dark:text-[#c9a24a] border border-[#b87333]/20">{s}</span>
                    ))}
                    {a.skills.length > 4 && <span className="text-[10px] text-[#8a7d60]">+{a.skills.length - 4}</span>}
                  </div>
                )}
                {a.connectors?.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2.5">
                    {a.connectors.slice(0, 6).map((c) => {
                      const m = CONNECTOR_MAP[c];
                      return m?.logo ? (
                        <img key={c} src={m.logo} alt={m.name} title={m.name} width={18} height={18} className="w-[18px] h-[18px] object-contain bg-white rounded-md p-0.5 border shadow-sm" style={{ borderColor: `${m.color}22` }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span key={c} title={m?.name} className="text-sm">{m?.emoji || '🔌'}</span>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-3.5 pt-3 border-t border-[#b87333]/15">
                  <button onClick={() => onChatWithAgent(a)} className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg text-[#1e6e50] dark:text-[#8fd4b4] hover:bg-[#1e6e50]/10 transition-colors font-medium">
                    <MessageSquare size={13} /> Chat
                  </button>
                  <button onClick={() => setEditing(a)} className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg text-[#8a5f28] dark:text-[#c9a24a] hover:bg-[#b87333]/10 transition-colors">
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => remove(a.id)} className="ml-auto text-[#8a7d60] hover:text-red-500 p-1.5 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="modal-surface w-full max-w-lg rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-2xl text-gradient-gold">{editing.id ? 'Edit Agent' : 'New Agent'}</h2>
                <button onClick={() => setEditing(null)} className="text-[#8a7d60] hover:text-[#ff9933]"><X size={18} /></button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex flex-wrap gap-1 max-w-[60%]">
                  {AGENT_EMOJIS.map((e) => (
                    <button key={e} onClick={() => setEditing({ ...editing, emoji: e })} className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center ${editing.emoji === e ? 'bg-[#ff9933]/20 ring-1 ring-[#ff9933]/50' : 'hover:bg-[#b87333]/10'}`}>{e}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 flex-1">
                  {AGENT_COLORS.map((c) => (
                    <button key={c} onClick={() => setEditing({ ...editing, color: c })} className={`w-6 h-6 rounded-full ${editing.color === c ? 'ring-2 ring-offset-2 ring-offset-transparent' : ''}`} style={{ background: c, boxShadow: editing.color === c ? `0 0 0 2px ${c}` : 'none' }} />
                  ))}
                </div>
              </div>

              <label className="ayur-label">Name</label>
              <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="ayur-input w-full px-3.5 py-2.5 rounded-xl mb-3" placeholder="e.g. PR Sentinel" />

              <label className="ayur-label">Description</label>
              <input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="ayur-input w-full px-3.5 py-2.5 rounded-xl mb-3" placeholder="One line on what it does" />

              <label className="ayur-label">System prompt</label>
              <textarea value={editing.system_prompt || ''} onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })} rows={4} className="ayur-input w-full px-3.5 py-2.5 rounded-xl mb-3 resize-none" placeholder="You are…" />

              <label className="ayur-label">Skills</label>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SKILL_LIBRARY.map((s) => {
                  const on = (editing.skills || []).includes(s);
                  return (
                    <button key={s} onClick={() => setEditing({ ...editing, skills: toggleIn(editing.skills || [], s) })} className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${on ? 'bg-[#ff9933]/15 border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b]' : 'border-[#b87333]/25 text-[#8a7d60] hover:border-[#ff9933]/30'}`}>{on && <Check size={10} className="inline mr-1" />}{s}</button>
                  );
                })}
              </div>

              <label className="ayur-label">Connectors</label>
              <div className="flex flex-wrap gap-1.5 mb-5">
                {CONNECTORS.map((c) => {
                  const on = (editing.connectors || []).includes(c.id);
                  return (
                    <button key={c.id} onClick={() => setEditing({ ...editing, connectors: toggleIn(editing.connectors || [], c.id) })} className={`text-[11px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-all ${on ? 'bg-[#1e6e50]/12 border-[#1e6e50]/45 text-[#1e6e50] dark:text-[#8fd4b4]' : 'border-[#b87333]/25 text-[#8a7d60] hover:border-[#1e6e50]/30'}`}>
                      <img src={c.logo} alt={c.name} width={14} height={14} className="w-3.5 h-3.5 object-contain bg-white rounded-sm p-0.5" style={{ border: `1px solid ${c.color}18` }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      {c.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button onClick={save} disabled={!editing.name} className="btn-saffron flex-1 py-2.5 rounded-xl font-semibold disabled:opacity-50">{editing.id ? 'Save changes' : 'Create agent'}</button>
                <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933]">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
