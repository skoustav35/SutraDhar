import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Plus, Trash2, X, Calendar, Power } from 'lucide-react';
import type { ScheduledTask, Agent } from '../lib/types';

interface Props {
  authHeaders: () => Promise<Record<string, string>>;
}

const CADENCES = ['hourly', 'daily', 'weekly', 'monthly', 'once'];

function fmt(dt: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TasksPanel({ authHeaders }: Props) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ScheduledTask> | null>(null);

  const load = useCallback(async () => {
    try {
      const h = await authHeaders();
      const [t, a] = await Promise.all([
        fetch('/api/tasks', { headers: h }),
        fetch('/api/agents', { headers: h }),
      ]);
      if (t.ok) setTasks(await t.json());
      if (a.ok) setAgents(await a.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing?.title) return;
    const method = editing.id ? 'PUT' : 'POST';
    const res = await fetch('/api/tasks', { method, headers: await authHeaders(), body: JSON.stringify(editing) });
    if (res.ok) { setEditing(null); load(); }
  };

  const toggle = async (t: ScheduledTask) => {
    setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)));
    await fetch('/api/tasks', { method: 'PUT', headers: await authHeaders(), body: JSON.stringify({ id: t.id, enabled: !t.enabled }) });
  };

  const remove = async (id: string) => {
    setTasks((p) => p.filter((t) => t.id !== id));
    await fetch('/api/tasks', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) });
  };

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <Clock size={22} className="text-[#b5661a] dark:text-[#ff9933]" />
            <h1 className="font-display text-3xl text-gradient-gold">Scheduled Tasks</h1>
          </div>
          <button onClick={() => setEditing({ title: '', prompt: '', cadence: 'daily', run_time: '09:00' })} className="btn-saffron flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={16} /> New Task
          </button>
        </div>
        <p className="text-[#7a6746] dark:text-[#a99a7c] text-sm mb-5">Automate recurring work — briefings, reports, content, monitoring — run by Sutradhar or a chosen agent.</p>

        {loading ? (
          <div className="text-center py-16 text-[#8a7d60]">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 text-[#8a7d60]">
            <Calendar size={40} className="mx-auto mb-3 opacity-40" />
            No scheduled tasks yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="task-card rounded-2xl p-4 flex items-center gap-4">
                <button onClick={() => toggle(t)} title={t.enabled ? 'Enabled' : 'Paused'} className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${t.enabled ? 'bg-[#1e6e50]/15 text-[#1e6e50] dark:text-[#8fd4b4]' : 'bg-[#b87333]/10 text-[#8a7d60]'}`}>
                  <Power size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-[15px] text-[#6a4310] dark:text-[#ffd89b] truncate">{t.title}</h3>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#b87333]/12 text-[#8a5f28] dark:text-[#c9a24a]">{t.cadence}</span>
                    {agentName(t.agent_id) && <span className="spice-chip !py-0.5 !px-2 text-[9px]">{agentName(t.agent_id)}</span>}
                  </div>
                  <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] truncate mt-0.5">{t.prompt || 'No prompt'}</p>
                  <p className="text-[11px] text-[#8a7d60] mt-1">Next run · {fmt(t.next_run)} {t.last_run && `· Last · ${fmt(t.last_run)}`}</p>
                </div>
                <button onClick={() => remove(t.id)} className="shrink-0 text-[#8a7d60] hover:text-red-500 p-1.5"><Trash2 size={15} /></button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="modal-surface w-full max-w-lg rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-2xl text-gradient-gold">{editing.id ? 'Edit Task' : 'New Task'}</h2>
                <button onClick={() => setEditing(null)} className="text-[#8a7d60] hover:text-[#ff9933]"><X size={18} /></button>
              </div>

              <label className="ayur-label">Title</label>
              <input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="ayur-input w-full px-3.5 py-2.5 rounded-xl mb-3" placeholder="e.g. Daily competitor digest" />

              <label className="ayur-label">Prompt / instructions</label>
              <textarea value={editing.prompt || ''} onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} rows={3} className="ayur-input w-full px-3.5 py-2.5 rounded-xl mb-3 resize-none" placeholder="What should run…" />

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="ayur-label">Cadence</label>
                  <select value={editing.cadence} onChange={(e) => setEditing({ ...editing, cadence: e.target.value })} className="ayur-input w-full px-3 py-2.5 rounded-xl capitalize">
                    {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ayur-label">Time</label>
                  <input type="time" value={editing.run_time || '09:00'} onChange={(e) => setEditing({ ...editing, run_time: e.target.value })} className="ayur-input w-full px-3 py-2.5 rounded-xl" />
                </div>
              </div>

              <label className="ayur-label">Run with agent (optional)</label>
              <select value={editing.agent_id || ''} onChange={(e) => setEditing({ ...editing, agent_id: e.target.value || null })} className="ayur-input w-full px-3 py-2.5 rounded-xl mb-5">
                <option value="">Sutradhar (default)</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
              </select>

              <div className="flex gap-2">
                <button onClick={save} disabled={!editing.title} className="btn-saffron flex-1 py-2.5 rounded-xl font-semibold disabled:opacity-50">{editing.id ? 'Save' : 'Schedule task'}</button>
                <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933]">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
