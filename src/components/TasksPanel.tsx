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
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setError(null);
    try {
      const h = await authHeaders();
      const [t, a] = await Promise.all([
        fetch('/api/tasks', { headers: h }),
        fetch('/api/agents', { headers: h }),
      ]);
      const tText = await t.text();
      if (!t.ok) {
        let msg = `Failed to load tasks (${t.status})`;
        try { msg = JSON.parse(tText).error || msg; } catch {}
        setError(msg);
      } else {
        try { setTasks(JSON.parse(tText)); } catch { setError('Invalid tasks response'); }
      }
      if (a.ok) {
        const aText = await a.text();
        try { setAgents(JSON.parse(aText)); } catch {}
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing?.title?.trim()) { setError('Title is required'); return; }
    const method = editing.id ? 'PUT' : 'POST';
    const prev = tasks;
    if (editing.id) {
      setTasks((p) => p.map((x) => x.id === editing.id ? { ...x, ...editing } as ScheduledTask : x));
    }
    try {
      const res = await fetch('/api/tasks', { method, headers: await authHeaders(), body: JSON.stringify(editing) });
      const text = await res.text();
      let j: any = {};
      try { j = JSON.parse(text); } catch {}
      if (!res.ok) {
        setError(j.error || `Failed to ${editing.id ? 'update' : 'create'} task`);
        setTasks(prev);
        return;
      }
      setEditing(null);
      showToast(editing.id ? 'Task updated' : 'Task scheduled');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setTasks(prev);
    }
  };

  const toggle = async (t: ScheduledTask) => {
    const prev = tasks;
    setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      const res = await fetch('/api/tasks', { method: 'PUT', headers: await authHeaders(), body: JSON.stringify({ id: t.id, enabled: !t.enabled }) });
      if (!res.ok) {
        const txt = await res.text();
        let msg = 'Failed to toggle';
        try { msg = JSON.parse(txt).error || msg; } catch {}
        setError(msg);
        setTasks(prev);
      } else {
        showToast(t.enabled ? 'Paused' : 'Enabled');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
      setTasks(prev);
    }
  };

  const remove = async (id: string) => {
    const prev = tasks;
    setTasks((p) => p.filter((t) => t.id !== id));
    try {
      const res = await fetch('/api/tasks', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) });
      if (!res.ok) {
        const txt = await res.text();
        let msg = 'Failed to delete';
        try { msg = JSON.parse(txt).error || msg; } catch {}
        setError(msg);
        setTasks(prev);
      } else {
        showToast('Task removed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setTasks(prev);
    }
  };

  const runNow = async (t: ScheduledTask) => {
    setTesting(t.id);
    try {
      const res = await fetch('/api/cron-tasks?force=1', { method: 'POST', headers: await authHeaders() });
      const txt = await res.text();
      let j: any = {};
      try { j = JSON.parse(txt); } catch { j = { error: txt.slice(0,200) } }
      if (!res.ok) throw new Error(j.error || 'Failed');
      showToast(`Executed ${j.executed} task(s)`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run');
    } finally {
      setTesting(null);
    }
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
          <div className="flex items-center gap-2">
            <button onClick={() => runNow({ id: 'all' } as any)} disabled={!!testing} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933] text-xs">
              {testing ? 'Running…' : 'Run due now'}
            </button>
            <button onClick={() => setEditing({ title: '', prompt: '', cadence: 'daily', run_time: '09:00', enabled: true })} className="btn-saffron flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
              <Plus size={16} /> New Task
            </button>
          </div>
        </div>
        <p className="text-[#7a6746] dark:text-[#a99a7c] text-sm mb-5">Automate recurring work — briefings, reports, content, monitoring — run by Sutradhar or a chosen agent. Tasks run every 5 min via Vercel Cron.</p>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-sm">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">×</button>
          </div>
        )}
        {toast && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-[#8fd4b4] text-sm">
            ✓ {toast}
          </div>
        )}

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="task-card rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl shimmer shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded shimmer" />
                  <div className="h-3 w-full rounded shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 text-[#8a7d60]">
            <Calendar size={40} className="mx-auto mb-3 opacity-40" />
            No scheduled tasks yet. Create one or try “Run due now” to test the runner.
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="task-card rounded-2xl p-4 flex items-center gap-4">
                <button onClick={() => toggle(t)} title={t.enabled ? 'Enabled (click to pause)' : 'Paused (click to enable)'} className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${t.enabled ? 'bg-[#1e6e50]/15 text-[#1e6e50] dark:text-[#8fd4b4] saffron-glow' : 'bg-[#b87333]/10 text-[#8a7d60]'}`}>
                  <Power size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-[15px] text-[#6a4310] dark:text-[#ffd89b] truncate">{t.title}</h3>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#b87333]/12 text-[#8a5f28] dark:text-[#c9a24a]">{t.cadence}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${t.status === 'running' ? 'border-amber-500/40 text-amber-600 bg-amber-500/10' : t.status === 'error' ? 'border-red-500/40 text-red-600 bg-red-500/10' : 'border-emerald-500/20 text-emerald-600 bg-emerald-500/5'}`}>{t.status}</span>
                    {agentName(t.agent_id) && <span className="spice-chip !py-0.5 !px-2 text-[9px]">{agentName(t.agent_id)}</span>}
                  </div>
                  <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] truncate mt-0.5">{t.prompt || 'No prompt'}</p>
                  <p className="text-[11px] text-[#8a7d60] mt-1">Next · {fmt(t.next_run)} {t.last_run && `· Last · ${fmt(t.last_run)}`}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => runNow(t)} disabled={!!testing} title="Run now" className="text-[#8a7d60] hover:text-[#ff9933] p-1.5 text-xs">{testing === t.id ? '…' : 'Run'}</button>
                  <button onClick={() => setEditing(t)} className="text-[#8a7d60] hover:text-[#ff9933] p-1.5 text-xs">Edit</button>
                  <button onClick={() => remove(t.id)} className="text-[#8a7d60] hover:text-red-500 p-1.5"><Trash2 size={15} /></button>
                </div>
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
