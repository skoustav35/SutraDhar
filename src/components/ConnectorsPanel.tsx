import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plug, Check, X, Search } from 'lucide-react';
import type { Connector } from '../lib/types';
import { CONNECTORS, CATEGORIES } from '../lib/catalog';

interface Props {
  authHeaders: () => Promise<Record<string, string>>;
}

export default function ConnectorsPanel({ authHeaders }: Props) {
  const [connected, setConnected] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors', { headers: await authHeaders() });
      if (res.ok) setConnected(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const isConnected = (id: string) => connected.some((c) => c.provider === id);

  const connect = async (id: string, name: string) => {
    setPending(id);
    try {
      const res = await fetch('/api/connectors', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ provider: id, account_label: `${name} account` }) });
      if (res.ok) load();
    } finally { setPending(null); }
  };

  const disconnect = async (id: string) => {
    setConnected((p) => p.filter((c) => c.provider !== id));
    await fetch('/api/connectors', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ provider: id }) });
  };

  const filtered = CONNECTORS.filter((c) =>
    (cat === 'All' || c.category === cat) &&
    (c.name.toLowerCase().includes(query.toLowerCase()) || c.blurb.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Plug size={22} className="text-[#b5661a] dark:text-[#ff9933]" />
          <h1 className="font-display text-3xl text-gradient-gold">Connectors</h1>
        </div>
        <p className="text-[#7a6746] dark:text-[#a99a7c] text-sm mb-4">Connect your accounts so Sutradhar and your agents can act across the tools you use.</p>

        <div className="jade-panel p-3 mb-5 text-[12.5px] text-[#1e6e50] dark:text-[#8fd4b4]">
          <span className="font-medium">{connected.length}</span> connected · Connections are stored securely to your workspace.
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7d60]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connectors…" className="ayur-input w-full pl-9 pr-3 py-2.5 rounded-xl text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {['All', ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`text-[12px] px-3 py-1.5 rounded-full border transition-all ${cat === c ? 'bg-[#ff9933]/15 border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b]' : 'border-[#b87333]/22 text-[#8a7d60] hover:border-[#ff9933]/30'}`}>{c}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#8a7d60]">Loading connectors…</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => {
              const on = isConnected(c.id);
              return (
                <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="connector-card rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${c.color}1e`, border: `1px solid ${c.color}44` }}>{c.emoji}</div>
                    {on && <span className="spice-chip !py-0.5 !px-2 text-[9px]"><Check size={10} /> Connected</span>}
                  </div>
                  <h3 className="font-medium text-[15px] text-[#6a4310] dark:text-[#ffd89b]">{c.name}</h3>
                  <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] mb-3">{c.blurb}</p>
                  {on ? (
                    <button onClick={() => disconnect(c.id)} className="w-full py-2 rounded-lg text-[13px] border border-[#b87333]/25 text-[#8a7d60] hover:text-red-500 hover:border-red-400/40 transition-colors flex items-center justify-center gap-1.5">
                      <X size={13} /> Disconnect
                    </button>
                  ) : (
                    <button onClick={() => connect(c.id, c.name)} disabled={pending === c.id} className="btn-jade w-full py-2 rounded-lg text-[13px] font-medium disabled:opacity-60">
                      {pending === c.id ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
