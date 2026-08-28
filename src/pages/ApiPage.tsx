import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, KeyRound, Plus, Copy, Check, Trash2, Eye, EyeOff, Terminal, Zap, Gauge, Crown, Activity, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ApiKey } from '../lib/types';
import Mandala from '../components/Mandala';
import { auth } from '../lib/firebase';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await (auth as import('firebase/auth').Auth | undefined)?.currentUser?.getIdToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1500); }}
      className="inline-flex items-center gap-1 text-[11px] text-[#c9a24a] hover:text-[#ff9933] transition-colors"
    >
      {c ? <Check size={13} /> : <Copy size={13} />}
      {c ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBox({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#b87333]/25 bg-[#0f0d0a]">
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-[#2a2118] to-[#1a1510] border-b border-[#b87333]/20">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[#c9a24a]">{title}</span>
        <CopyBtn text={code} />
      </div>
      <pre className="p-4 overflow-x-auto text-[12.5px] leading-relaxed text-[#e6ddcc]"><code>{code}</code></pre>
    </div>
  );
}

export default function ApiPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/keys', { headers: await authHeaders() });
      if (res.ok) setKeys(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/keys', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ name: newName || 'My key' }) });
      if (res.ok) {
        const k = await res.json();
        setReveal((r) => ({ ...r, [k.id]: true }));
        setNewName('');
        load();
      }
    } finally { setCreating(false); }
  };

  const revoke = async (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    try { await fetch('/api/keys', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) }); } catch (e) { console.error(e); }
  };

  const base = origin || 'https://your-app.vercel.app';
  const firstKey = keys[0]?.key || 'sk-council-YOUR_KEY';

  const curlExample = `curl -X POST ${base}/api/v1 \\
  -H "Authorization: Bearer ${firstKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Find all integer solutions to x^2 + y^2 = 2024",
    "model": "sutradhar-6.7-extreme"
  }'`;

  const jsExample = `const res = await fetch("${base}/api/v1", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${firstKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "Prove that sqrt(2) + sqrt(3) is irrational",
    model: "sutradhar-6.7-ultra",   // lite | ultra | extreme
    stream: false,                   // set true for live progress (SSE)
  }),
});
const data = await res.json();
console.log(data.answer);`;

  const streamExample = `// Live progress stream (Server-Sent Events)
const res = await fetch("${base}/api/v1", {
  method: "POST",
  headers: { "Authorization": "Bearer ${firstKey}", "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "...", model: "sutradhar-6.7-extreme", stream: true }),
});
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  for (const chunk of buf.split("\\n\\n")) {
    const line = chunk.split("\\n").find(l => l.startsWith("data:"));
    if (!line) continue;
    const ev = JSON.parse(line.slice(5).trim());
    // ev.type: "progress" (phase updates) | "answer_delta" | "done"
    if (ev.type === "answer_delta") process.stdout.write(ev.text);
    if (ev.type === "done") console.log("\\nDONE:", ev.answer);
  }
  buf = buf.slice(buf.lastIndexOf("\\n\\n") + 2);
}`;

  const jsonResponse = `{
  "id": "cmpl-1730000000000",
  "object": "chat.completion",
  "model": "Sutradhar 6.7 Extreme",
  "model_id": "sutradhar-6.7-extreme",
  "answer": "## Final Answer\\n...the model's complete solution..."
}`;

  return (
    <div className="min-h-screen bg-[#121212] text-[#ece5d8] relative overflow-hidden grain">
      <div className="pointer-events-none fixed inset-0 z-0"><div className="ambient-bg" /></div>
      <div className="pointer-events-none fixed -top-24 -right-24 opacity-[0.05] z-0"><Mandala className="w-[420px] h-[420px] animate-spin-slow" color="#ff9933" /></div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <Link to="/app" className="inline-flex items-center gap-2 text-[#c9a24a] hover:text-[#ff9933] transition-colors text-sm">
            <ArrowLeft size={16} /> Back to Council
          </Link>
          <div className="flex items-center gap-2">
            <Mandala className="w-6 h-6" color="#ff9933" />
            <span className="font-display text-lg text-gradient-gold">Developer API</span>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="font-display text-4xl sm:text-5xl text-gradient-gold mb-2">Sutradhar API</h1>
          <p className="text-[#a99a7c] max-w-2xl">
            Call the Sutradhar 6.7 family of large language models from your own code. Choose the model that fits your
            task and receive a complete, well-structured answer — optionally with a live progress stream.
          </p>
        </motion.div>

        {/* Models */}
        <div className="grid sm:grid-cols-3 gap-3 mt-8">
          {[
            { icon: <Zap size={18} />, slug: 'sutradhar-6.7-lite', label: 'Sutradhar 6.7 Lite', d: 'A fast, efficient large language model for everyday questions and general reasoning. Lowest latency.' },
            { icon: <Gauge size={18} />, slug: 'sutradhar-6.7-ultra', label: 'Sutradhar 6.7 Ultra', d: 'Our flagship model — deep, high-accuracy reasoning with self-verification for hard, multi-step problems.' },
            { icon: <Crown size={18} />, slug: 'sutradhar-6.7-extreme', label: 'Sutradhar 6.7 Extreme', d: 'Our most capable model — maximum reasoning depth for the very hardest challenges.' },
          ].map((m) => (
            <div key={m.slug} className="glass rounded-2xl p-4">
              <div className="w-10 h-10 rounded-xl bg-[#b87333]/15 border border-[#b87333]/30 flex items-center justify-center text-[#ff9933] mb-3">{m.icon}</div>
              <div className="font-display text-xl text-[#ffd89b]">{m.label}</div>
              <code className="text-[11px] text-[#c9a24a]">{m.slug}</code>
              <p className="text-[12.5px] text-[#a99a7c] mt-2">{m.d}</p>
            </div>
          ))}
        </div>

        {/* API Keys */}
        <div className="glass-strong rounded-3xl p-5 sm:p-7 mt-8">
          <div className="flex items-center gap-2.5 mb-1">
            <KeyRound size={18} className="text-[#ff9933]" />
            <h2 className="font-display text-2xl text-[#ffd89b]">Your API Keys</h2>
          </div>
          <p className="text-[13px] text-[#a99a7c] mb-5">Create a key, then pass it as <code className="text-[#ffce8a]">Authorization: Bearer &lt;key&gt;</code>. Keep it secret.</p>

          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Key name (e.g. Production)"
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#1a1510] border border-[#b87333]/25 text-[#ece5d8] placeholder:text-[#6b6250] focus:outline-none focus:border-[#ff9933]/50 text-sm"
            />
            <button
              onClick={create}
              disabled={creating}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 transition-all disabled:opacity-60"
            >
              <Plus size={16} /> Generate Key
            </button>
          </div>

          {loading ? (
            <div className="text-center text-[#8a7d60] py-6 text-sm">Loading keys…</div>
          ) : keys.length === 0 ? (
            <div className="text-center text-[#8a7d60] py-8 text-sm border border-dashed border-[#b87333]/20 rounded-xl">
              No keys yet. Generate your first key above.
            </div>
          ) : (
            <div className="space-y-2.5">
              {keys.map((k) => (
                <div key={k.id} className="glass rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] text-[#ffd89b] font-medium">{k.name}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#8fd4b4]"><Activity size={10} /> {k.request_count} calls</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-[12.5px] text-[#c9a24a] font-mono truncate">
                          {reveal[k.id] ? k.key : `${k.key.slice(0, 14)}${'\u2022'.repeat(18)}`}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => setReveal((r) => ({ ...r, [k.id]: !r[k.id] }))} className="text-[#8a7d60] hover:text-[#ff9933]" title={reveal[k.id] ? 'Hide' : 'Reveal'}>
                        {reveal[k.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <CopyBtn text={k.key} />
                      <button onClick={() => revoke(k.id)} className="text-[#8a7d60] hover:text-red-400" title="Revoke"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Docs */}
        <div className="mt-8 space-y-5">
          <div className="flex items-center gap-2.5">
            <Terminal size={18} className="text-[#ff9933]" />
            <h2 className="font-display text-2xl text-[#ffd89b]">Quick Start</h2>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="text-[13px] text-[#a99a7c] mb-2">Endpoint</div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#1b4d3e]/40 text-[#8fd4b4] text-[12px] font-mono">POST</span>
              <code className="text-[13px] text-[#ffce8a] font-mono break-all">{base}/api/v1</code>
            </div>
            <div className="mt-3 text-[13px] text-[#a99a7c]">Body parameters</div>
            <ul className="mt-1.5 text-[13px] space-y-1 text-[#c9bfa8]">
              <li><code className="text-[#ffce8a]">prompt</code> <span className="text-[#8a7d60]">string, required</span> — your question</li>
              <li><code className="text-[#ffce8a]">model</code> <span className="text-[#8a7d60]">"sutradhar-6.7-lite" | "sutradhar-6.7-ultra" | "sutradhar-6.7-extreme"</span> — default "sutradhar-6.7-ultra"</li>
              <li><code className="text-[#ffce8a]">stream</code> <span className="text-[#8a7d60]">boolean</span> — default false; true streams live progress</li>
            </ul>
          </div>

          {/* Model table */}
          <div className="glass rounded-2xl p-4 overflow-x-auto">
            <div className="text-[13px] text-[#a99a7c] mb-2">Available models</div>
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="text-left text-[#c9a24a]">
                  <th className="py-1.5 pr-3">Model</th>
                  <th className="py-1.5 pr-3"><code>model</code></th>
                  <th className="py-1.5 pr-3">Class</th>
                  <th className="py-1.5">Best for</th>
                </tr>
              </thead>
              <tbody className="text-[#c9bfa8]">
                <tr className="border-t border-[#b87333]/15">
                  <td className="py-1.5 pr-3 text-[#ffd89b]">Sutradhar 6.7 Lite</td>
                  <td className="py-1.5 pr-3"><code className="text-[#ffce8a]">sutradhar-6.7-lite</code></td>
                  <td className="py-1.5 pr-3">Efficient</td>
                  <td className="py-1.5">Fast everyday answers</td>
                </tr>
                <tr className="border-t border-[#b87333]/15">
                  <td className="py-1.5 pr-3 text-[#ffd89b]">Sutradhar 6.7 Ultra</td>
                  <td className="py-1.5 pr-3"><code className="text-[#ffce8a]">sutradhar-6.7-ultra</code></td>
                  <td className="py-1.5 pr-3">Flagship</td>
                  <td className="py-1.5">Hard problems, high accuracy</td>
                </tr>
                <tr className="border-t border-[#b87333]/15">
                  <td className="py-1.5 pr-3 text-[#ffd89b]">Sutradhar 6.7 Extreme</td>
                  <td className="py-1.5 pr-3"><code className="text-[#ffce8a]">sutradhar-6.7-extreme</code></td>
                  <td className="py-1.5 pr-3">Frontier</td>
                  <td className="py-1.5">The very hardest challenges</td>
                </tr>
              </tbody>
            </table>
          </div>

          <CodeBox title="cURL" code={curlExample} />
          <CodeBox title="JavaScript — JSON response" code={jsExample} />
          <CodeBox title="Response shape" code={jsonResponse} />
          <CodeBox title="JavaScript — live progress stream" code={streamExample} />

          <div className="glass rounded-2xl p-4 text-[13px] text-[#a99a7c]">
            <span className="text-[#ffd89b] font-medium">Note:</span> Sutradhar 6.7 Extreme performs the deepest
            reasoning and can take several minutes on tough problems. Use <code className="text-[#ffce8a]">stream: true</code> to
            receive live progress updates while the answer is being formed. Each Sutradhar model is a distinct large
            language model. No rate limits are applied.
          </div>

          <div className="text-center pt-2">
            <Link to="/research" className="inline-flex items-center gap-2 text-[13px] text-[#c26a12] dark:text-[#ff9933] hover:underline">
              <FlaskConical size={15} /> Learn more about the models in Research →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
