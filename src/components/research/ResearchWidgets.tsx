import { Fragment, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Gauge, Crown, Cpu, Check, ChevronDown, Circle, Loader2, CircleDot,
  FlaskConical, ArrowUpRight,
} from 'lucide-react';
import type {
  ModelSpec, Benchmark, TrainingStage, RoadmapItem, CompanyMetric, Paper,
} from '../../lib/types';

const TIER_ICON: Record<string, React.ReactNode> = {
  'sutradhar-6.7-lite': <Zap size={20} />,
  'sutradhar-6.7-ultra': <Gauge size={20} />,
  'sutradhar-6.7-extreme': <Crown size={20} />,
};

const fmtInt = (n: number) => n.toLocaleString('en-US');

/* ------------------------------------------------------------ metric band */

export function MetricBand({ metrics }: { metrics: CompanyMetric[] }) {
  const groups = useMemo(() => {
    const out: Record<string, CompanyMetric[]> = {};
    for (const m of metrics) (out[m.group_name] ||= []).push(m);
    return Object.entries(out);
  }, [metrics]);

  return (
    <div className="space-y-6">
      {groups.map(([group, items]) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#8a7350] dark:text-[#a99a7c] mb-2.5">{group}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {items.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: i * 0.04 }}
                className="glass rounded-2xl p-3.5"
                title={m.detail}
              >
                <div className="font-display text-xl sm:text-2xl text-gradient-gold leading-none">{m.value}</div>
                <div className="text-[11px] text-[#6a4310] dark:text-[#ffd89b] mt-1.5 font-medium leading-tight">{m.label}</div>
                <div className="text-[10.5px] text-[#7a6746] dark:text-[#8a7d60] mt-1 leading-snug line-clamp-3">{m.detail}</div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ model cards */

export function ModelCards({ specs }: { specs: ModelSpec[] }) {
  const max = Math.max(...specs.map((s) => s.params_total_num), 1);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {specs.map((m, i) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.55, delay: i * 0.08 }}
          className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden"
        >
          <div
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, ${m.color}, transparent)` }}
          />
          <div className="flex items-start justify-between mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${m.color}22`, border: `1px solid ${m.color}55`, color: m.color }}
            >
              {TIER_ICON[m.slug] || <Cpu size={20} />}
            </div>
            <span className="text-[9.5px] uppercase tracking-[0.16em] px-2 py-1 rounded-full border border-[#b87333]/30 text-[#8a7d60]">
              {m.status} · {m.release}
            </span>
          </div>

          <div className="font-display text-2xl text-[#9a5a12] dark:text-[#ffd89b] leading-tight">{m.name}</div>
          <div className="text-[11px] text-[#8a7d60] mt-0.5">Codename “{m.codename}” · {m.tier}</div>

          {/* parameter bar */}
          <div className="mt-4">
            <div className="flex items-end justify-between mb-1.5">
              <span className="font-display text-4xl leading-none" style={{ color: m.color }}>{m.params_total}</span>
              <span className="text-[11px] text-[#7a6746] dark:text-[#a99a7c] mb-1">total parameters</span>
            </div>
            <div className="h-2 rounded-full bg-[#b87333]/12 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(m.params_total_num / max) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 + i * 0.1 }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${m.color}, ${m.color}80)` }}
              />
            </div>
            <div className="text-[11.5px] text-[#7a6746] dark:text-[#a99a7c] mt-1.5">{m.params_active}</div>
          </div>

          <p className="text-[13px] text-[#7a6746] dark:text-[#a99a7c] mt-4 leading-relaxed flex-1">{m.description}</p>

          <div className="grid grid-cols-2 gap-2 mt-4 text-[11.5px]">
            {[
              ['Experts', `${m.experts_total} / ${m.experts_active} active`],
              ['Layers', String(m.layers)],
              ['Reasoning streams', String(m.reasoning_streams)],
              ['Training tokens', m.train_tokens],
              ['Throughput', m.throughput],
              ['TTFT', m.latency_ttft],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg px-2.5 py-2 bg-[#b87333]/8 border border-[#b87333]/15">
                <div className="text-[9.5px] uppercase tracking-[0.12em] text-[#8a7d60]">{k}</div>
                <div className="text-[#6a4310] dark:text-[#ffd89b] mt-0.5">{v}</div>
              </div>
            ))}
          </div>

          <code className="text-[10.5px] text-[#c9a24a] mt-4 block break-all">model: "{m.slug}"</code>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- architecture table */

const SPEC_ROWS: { label: string; get: (m: ModelSpec) => string; group: string }[] = [
  { group: 'Scale', label: 'Total parameters', get: (m) => m.params_total },
  { group: 'Scale', label: 'Active per token', get: (m) => m.params_active },
  { group: 'Scale', label: 'Architecture', get: (m) => m.architecture },
  { group: 'Scale', label: 'Sparsity ratio', get: (m) => `${(m.params_total_num * 1000 / parseFloat(m.params_active)).toFixed(1)}×` },
  { group: 'Topology', label: 'Layers', get: (m) => String(m.layers) },
  { group: 'Topology', label: 'Model width (d_model)', get: (m) => fmtInt(m.d_model) },
  { group: 'Topology', label: 'Expert FFN width (d_ff)', get: (m) => fmtInt(m.ffn_dim) },
  { group: 'Topology', label: 'Routed experts', get: (m) => String(m.experts_total) },
  { group: 'Topology', label: 'Active experts (top-k)', get: (m) => String(m.experts_active) },
  { group: 'Topology', label: 'Shared experts', get: (m) => String(m.experts_shared) },
  { group: 'Attention', label: 'Query heads', get: (m) => String(m.heads_q) },
  { group: 'Attention', label: 'Latent KV heads', get: (m) => String(m.heads_kv) },
  { group: 'Attention', label: 'Head dimension', get: (m) => String(m.head_dim) },
  { group: 'Attention', label: 'KV-LoRA rank', get: (m) => String(m.kv_lora_rank) },
  { group: 'Attention', label: 'Context window', get: (m) => `${m.context_tokens} tokens` },
  { group: 'Attention', label: 'Max output', get: (m) => `${m.max_output_tokens} tokens` },
  { group: 'Reasoning', label: 'Parallel streams', get: (m) => String(m.reasoning_streams) },
  { group: 'Reasoning', label: 'MTP depth', get: (m) => String(m.mtp_depth) },
  { group: 'Reasoning', label: 'Max deliberation', get: (m) => m.max_thinking },
  { group: 'Training', label: 'Vocabulary', get: (m) => fmtInt(m.vocab_size) },
  { group: 'Training', label: 'Training tokens', get: (m) => m.train_tokens },
  { group: 'Training', label: 'Training compute', get: (m) => m.compute_flops },
  { group: 'Training', label: 'GPU-hours', get: (m) => m.gpu_hours },
  { group: 'Training', label: 'Precision', get: (m) => m.precision },
  { group: 'Serving', label: 'Throughput', get: (m) => m.throughput },
  { group: 'Serving', label: 'Time to first token', get: (m) => m.latency_ttft },
  { group: 'Serving', label: 'Minimum hardware', get: (m) => m.min_serving_hw },
  { group: 'Serving', label: 'Input price', get: (m) => m.price_in },
  { group: 'Serving', label: 'Output price', get: (m) => m.price_out },
];

export function SpecTable({ specs }: { specs: ModelSpec[] }) {
  const groups = useMemo(() => {
    const out: Record<string, typeof SPEC_ROWS> = {};
    for (const r of SPEC_ROWS) (out[r.group] ||= []).push(r);
    return Object.entries(out);
  }, []);

  return (
    <div className="glass rounded-3xl p-4 sm:p-6 overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse min-w-[640px]">
        <thead>
          <tr className="text-left">
            <th className="py-2.5 pr-4 text-[#8a7d60] font-normal text-[11px] uppercase tracking-[0.14em]">Specification</th>
            {specs.map((m) => (
              <th key={m.id} className="py-2.5 pr-4 font-display text-[15px]" style={{ color: m.color }}>
                {m.name.replace('Sutradhar ', '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[#5a4a30] dark:text-[#c9bfa8]">
          {groups.map(([group, rows]) => (
            <Fragment key={group}>
              <tr>
                <td colSpan={specs.length + 1} className="pt-5 pb-1.5">
                  <span className="text-[10px] uppercase tracking-[0.26em] text-[#b5661a] dark:text-[#ff9933]">{group}</span>
                </td>
              </tr>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-[#b87333]/15">
                  <td className="py-2 pr-4 text-[#9a5a12] dark:text-[#ffd89b] font-medium align-top">{r.label}</td>
                  {specs.map((m) => (
                    <td key={m.id} className="py-2 pr-4 align-top">{r.get(m)}</td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- benchmarks */

export function BenchmarkTable({ benchmarks }: { benchmarks: Benchmark[] }) {
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(benchmarks.map((b) => b.category)))],
    [benchmarks]
  );
  const [cat, setCat] = useState('All');
  const rows = cat === 'All' ? benchmarks : benchmarks.filter((b) => b.category === cat);

  const bar = (v: number, unit: string, max: number, color: string) => (
    <div className="min-w-[76px]">
      <div className="text-[12.5px] mb-1" style={{ color }}>
        {v}
        <span className="text-[10px] text-[#8a7d60] ml-0.5">{unit === '%' ? '%' : ` ${unit}`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#b87333]/12 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${Math.min((v / max) * 100, 100)}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`text-[12px] px-3 py-1.5 rounded-full border transition-all ${
              cat === c
                ? 'bg-[#ff9933]/15 border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b]'
                : 'border-[#b87333]/22 text-[#8a7d60] hover:border-[#ff9933]/30'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="glass rounded-3xl p-4 sm:p-6 overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse min-w-[700px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-[#8a7d60]">
              <th className="py-2.5 pr-4 font-normal">Benchmark</th>
              <th className="py-2.5 pr-4 font-normal">Lite</th>
              <th className="py-2.5 pr-4 font-normal">Ultra</th>
              <th className="py-2.5 pr-4 font-normal">Extreme</th>
              <th className="py-2.5 font-normal">Frontier best</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const max = Math.max(b.lite, b.ultra, b.extreme, b.frontier_best) * 1.05 || 1;
              const wins = b.extreme >= b.frontier_best && b.frontier_best > 0;
              return (
                <tr key={b.id} className="border-t border-[#b87333]/15 align-top">
                  <td className="py-3 pr-4 max-w-[240px]">
                    <div className="text-[#9a5a12] dark:text-[#ffd89b] font-medium flex items-center gap-1.5">
                      {b.suite}
                      {wins && <Check size={12} className="text-emerald-600 dark:text-[#8fd4b4]" />}
                    </div>
                    <div className="text-[11px] text-[#7a6746] dark:text-[#8a7d60] leading-snug mt-0.5">{b.detail}</div>
                  </td>
                  <td className="py-3 pr-4">{bar(b.lite, b.unit, max, '#e0a44a')}</td>
                  <td className="py-3 pr-4">{bar(b.ultra, b.unit, max, '#ff9933')}</td>
                  <td className="py-3 pr-4">{bar(b.extreme, b.unit, max, '#c9a24a')}</td>
                  <td className="py-3 text-[#8a7d60] text-[12.5px]">
                    {b.frontier_best > 0 ? `${b.frontier_best}${b.unit === '%' ? '%' : ` ${b.unit}`}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-[#8a7d60] mt-3 leading-relaxed">
        All figures are pass@1 with a single general system prompt, temperature 0.6, averaged over 5 seeds. “Frontier best” is the
        strongest publicly-reported result from any competing model at time of measurement; conditions differ between labs, so treat
        cross-lab comparisons as indicative rather than definitive.
      </p>
    </div>
  );
}

/* -------------------------------------------------------- training pipeline */

export function TrainingPipeline({ stages }: { stages: TrainingStage[] }) {
  const [open, setOpen] = useState<number | null>(stages[0]?.id ?? null);
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const isOpen = open === s.id;
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.3) }}
            className="glass rounded-2xl overflow-hidden"
          >
            <button
              onClick={() => setOpen(isOpen ? null : s.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#b87333]/6 transition-colors"
            >
              <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-display text-lg flex items-center justify-center">
                {s.stage_no}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[17px] text-[#9a5a12] dark:text-[#ffd89b] leading-tight">{s.name}</span>
                <span className="block text-[12px] text-[#7a6746] dark:text-[#a99a7c] truncate">{s.objective}</span>
              </span>
              <span className="hidden sm:block text-[11.5px] text-[#8a7d60] shrink-0 text-right">
                {s.tokens}
                <span className="block">{s.duration}</span>
              </span>
              <ChevronDown size={16} className={`shrink-0 text-[#8a7d60] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                <div className="px-4 pb-4 pt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {[
                      ['Tokens', s.tokens],
                      ['Duration', s.duration],
                      ['Sequence length', s.seq_len],
                      ['Learning rate', s.lr],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg px-2.5 py-2 bg-[#b87333]/8 border border-[#b87333]/15">
                        <div className="text-[9.5px] uppercase tracking-[0.12em] text-[#8a7d60]">{k}</div>
                        <div className="text-[11.5px] text-[#6a4310] dark:text-[#ffd89b] mt-0.5 break-words">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11.5px] text-[#8a7d60] mb-2">
                    <span className="uppercase tracking-[0.12em] text-[9.5px]">Hardware</span> · {s.hardware}
                  </div>
                  <p className="text-[13px] text-[#7a6746] dark:text-[#a99a7c] leading-relaxed">{s.detail}</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ roadmap */

const STATUS_META: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  shipped: { icon: <Check size={12} />, label: 'Shipped', cls: 'border-emerald-500/40 text-emerald-600 dark:text-[#8fd4b4] bg-emerald-500/10' },
  'in-progress': { icon: <Loader2 size={12} className="animate-spin" />, label: 'In training', cls: 'border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b] bg-[#ff9933]/12' },
  planned: { icon: <CircleDot size={12} />, label: 'Planned', cls: 'border-[#b87333]/35 text-[#8a7d60] bg-[#b87333]/8' },
  research: { icon: <FlaskConical size={12} />, label: 'Research', cls: 'border-[#1e6e50]/40 text-[#1e6e50] dark:text-[#8fd4b4] bg-[#1e6e50]/10' },
};

export function RoadmapTimeline({ items }: { items: RoadmapItem[] }) {
  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-[#ff9933]/50 via-[#b87333]/30 to-transparent" />
      <div className="space-y-3">
        {items.map((r, i) => {
          const st = STATUS_META[r.status] || STATUS_META.planned;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.4) }}
              className="relative pl-10"
            >
              <span
                className={`roadmap-dot absolute left-0 top-4 w-8 h-8 rounded-full flex items-center justify-center border ${
                  r.status === 'shipped'
                    ? 'border-emerald-500/40 text-emerald-600 dark:text-[#8fd4b4]'
                    : r.status === 'in-progress'
                    ? 'border-[#ff9933]/50 text-[#b5661a] dark:text-[#ff9933]'
                    : 'border-[#b87333]/35 text-[#8a7d60]'
                }`}
              >
                {r.status === 'shipped' ? <Check size={14} /> : r.status === 'in-progress' ? <Loader2 size={14} className="animate-spin" /> : <Circle size={10} />}
              </span>
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-display text-[13px] text-[#c9a24a] tracking-wide">{r.period}</span>
                  <span className={`text-[9.5px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${st.cls}`}>
                    {st.icon} {st.label}
                  </span>
                  <span className="text-[9.5px] px-2 py-0.5 rounded-full border border-[#b87333]/25 text-[#8a7d60]">{r.track}</span>
                </div>
                <h3 className="font-display text-xl text-[#9a5a12] dark:text-[#ffd89b] leading-tight">{r.title}</h3>
                <p className="text-[13px] text-[#7a6746] dark:text-[#a99a7c] mt-1.5 leading-relaxed">{r.body}</p>
                {r.highlights?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {r.highlights.map((h) => (
                      <span key={h} className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#b87333]/10 border border-[#b87333]/22 text-[#8a7d60]">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- papers */

export function PapersList({ papers }: { papers: Paper[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {papers.map((p, i) => {
        const isOpen = open === p.id;
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.3) }}
            className="glass rounded-2xl overflow-hidden"
          >
            <button onClick={() => setOpen(isOpen ? null : p.id)} className="w-full text-left p-4 hover:bg-[#b87333]/6 transition-colors">
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-[10px] font-mono px-2 py-1 rounded-lg bg-[#b87333]/12 border border-[#b87333]/25 text-[#c9a24a]">
                  {p.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] text-[#9a5a12] dark:text-[#ffd89b] font-medium leading-snug">{p.title}</span>
                  <span className="block text-[11.5px] text-[#8a7d60] mt-0.5">
                    {p.authors} · {p.venue} · {p.year}
                  </span>
                </span>
                <ChevronDown size={16} className={`shrink-0 text-[#8a7d60] transition-transform mt-1 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <p className="text-[13px] text-[#7a6746] dark:text-[#a99a7c] leading-relaxed">{p.abstract}</p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {p.tags.map((t) => (
                    <span key={t} className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#1e6e50]/10 border border-[#1e6e50]/25 text-[#1e6e50] dark:text-[#8fd4b4]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- section head */

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  id,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  id?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      {eyebrow && (
        <div className="flex items-center gap-2 mb-2">
          <span className="h-px w-6 bg-[#b87333]/50" />
          <span className="text-[10px] uppercase tracking-[0.28em] text-[#b5661a] dark:text-[#ff9933]">{eyebrow}</span>
        </div>
      )}
      <h2 className="font-display text-3xl sm:text-4xl text-gradient-gold leading-tight">{title}</h2>
      {subtitle && <p className="text-[#7a6746] dark:text-[#a99a7c] mt-2 max-w-2xl leading-relaxed">{subtitle}</p>}
    </div>
  );
}

export function ExternalNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="jade-panel p-4 text-[12.5px] text-[#1e6e50] dark:text-[#8fd4b4] leading-relaxed flex gap-2.5">
      <ArrowUpRight size={15} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
