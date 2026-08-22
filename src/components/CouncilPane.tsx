import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, Scale, ShieldAlert, Sparkles, X, AlertTriangle, Check, Gavel, GitCompareArrows, Cpu, Timer } from 'lucide-react';
import type { CouncilMember, Phase } from '../lib/types';
import Mandala from './Mandala';

// Icons keyed by NEUTRAL agentId (no underlying provider names).
const ICONS: Record<string, React.ReactNode> = {
  sage: <Brain size={16} />,
  analyst: <Scale size={16} />,
  skeptic: <ShieldAlert size={16} />,
  reckoner: <Sparkles size={16} />,
  atomist: <Cpu size={16} />,
  oracle: <Gavel size={16} />,
};
function iconFor(agentId: string) {
  return ICONS[agentId] || <Brain size={16} />;
}

// Strip LaTeX delimiters/commands for a compact, readable answer badge.
function cleanAnswer(s: string): string {
  if (!s) return s;
  return s
    .replace(/\\boxed\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\sqrt\s*\{(\w)\}/g, '√$1')
    .replace(/\\sqrt\s*\{([^}]*)\}/g, '√($1)')
    .replace(/\\sqrt\s*(\d+)/g, '√$1')
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\pi/g, 'π')
    .replace(/\\infty/g, '∞')
    .replace(/\\[a-zA-Z]+/g, '') // drop any remaining \commands
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\$\$?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

const STATUS_LABEL: Record<CouncilMember['status'], string> = {
  idle: 'Awaiting',
  answering: 'Answering…',
  solving: 'Solving…',
  'cross-checking': 'Cross-checking…',
  judged: 'Verdict cast',
  done: 'Complete',
  error: 'Unavailable',
};

function statusColor(s: CouncilMember['status']) {
  if (s === 'done' || s === 'judged') return 'text-emerald-600 dark:text-[#7bbfa0]';
  if (s === 'error') return 'text-red-500 dark:text-red-400';
  if (s === 'idle') return 'text-[#8a7d60]';
  return 'text-[#c26a12] dark:text-[#ff9933]';
}

function ElapsedTimer({ active }: { active: boolean }) {
  const [secs, setSecs] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (active) {
      if (startRef.current === null) startRef.current = Date.now();
      const id = setInterval(() => {
        if (startRef.current !== null) setSecs(Math.floor((Date.now() - startRef.current) / 1000));
      }, 250);
      return () => clearInterval(id);
    }
  }, [active]);
  if (!active && secs === 0) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[#c26a12]/80 dark:text-[#c9a24a]/80 tabular-nums">
      <Timer size={10} />
      {m > 0 ? `${m}m ` : ''}{s}s
    </span>
  );
}

function PipelineBar({ phase }: { phase: Phase }) {
  const steps = [
    { key: 'solving', label: 'Solve', icon: <Cpu size={13} /> },
    { key: 'cross-checking', label: 'Cross-check', icon: <GitCompareArrows size={13} /> },
    { key: 'judging', label: 'Judge', icon: <Gavel size={13} /> },
  ];
  const order = ['solving', 'cross-checking', 'judging', 'done'];
  const curIdx = order.indexOf(phase === 'done' ? 'judging' : phase);
  return (
    <div className="flex items-center gap-1 px-4 py-3 border-b border-[#b87333]/15">
      {steps.map((s, i) => {
        const active = phase === s.key;
        const complete = curIdx > i || phase === 'done';
        return (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            <motion.div
              animate={active ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 1.6, repeat: active ? Infinity : 0 }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all w-full justify-center border ${
                active
                  ? 'bg-[#ff9933]/15 text-[#c26a12] dark:text-[#ff9933] border-[#ff9933]/45 saffron-glow'
                  : complete
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#7bbfa0] border-emerald-600/30 dark:border-[#1b4d3e]/60'
                  : 'text-[#8a7d60] border-transparent'
              }`}
            >
              {complete && !active ? <Check size={12} /> : s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </motion.div>
            {i < steps.length - 1 && (
              <div className={`h-px w-2 shrink-0 ${curIdx > i ? 'bg-emerald-500/50' : 'bg-[#b87333]/25'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberCard({ m, index }: { m: CouncilMember; index: number }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'reason' | 'solution' | 'review'>('reason');
  const active = m.status === 'solving' || m.status === 'cross-checking' || m.status === 'answering';
  const answer = cleanAnswer(m.final);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`glass rounded-2xl overflow-hidden ${active ? 'saffron-glow thinking-ring' : ''}`}
    >
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-3.5 text-left">
        <motion.div
          animate={active ? { rotate: [0, 4, -4, 0] } : {}}
          transition={{ duration: 2.4, repeat: active ? Infinity : 0 }}
          className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${
            m.status === 'error'
              ? 'border-red-500/40 text-red-500 dark:text-red-400 bg-red-500/5'
              : 'border-[#b87333]/40 text-[#c26a12] dark:text-[#ff9933] bg-[#ff9933]/10'
          }`}
        >
          {m.status === 'error' ? <AlertTriangle size={16} /> : iconFor(m.agentId)}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg leading-none text-[#9a5a12] dark:text-[#ffd89b]">{m.name}</span>
            {active && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff9933] opacity-70" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff9933]" />
              </span>
            )}
          </div>
          <div className="text-[11px] tracking-wide text-[#7a6746] dark:text-[#a99a7c] truncate">{m.title}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium ${statusColor(m.status)}`}>{STATUS_LABEL[m.status]}</span>
            <ChevronDown size={15} className={`text-[#b87333] transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
          <ElapsedTimer active={active} />
        </div>
      </button>

      {answer && (
        <div className="px-4 -mt-1 pb-2">
          <div className="answer-badge">
            <Check size={12} className="shrink-0" />
            <span className="truncate">Answer: {answer}</span>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {m.status === 'error' ? (
                <p className="text-sm text-red-500/90 dark:text-red-300/80 italic">{m.error}</p>
              ) : (
                <>
                  <div className="chamber-tabs">
                    {([
                      ['reason', 'Reasoning'],
                      ['solution', 'Solution'],
                      ['review', 'Cross-check'],
                    ] as const).map(([k, lbl]) => (
                      <button
                        key={k}
                        onClick={() => setTab(k)}
                        className={`chamber-tab ${tab === k ? 'chamber-tab--active' : ''}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <div className="text-[13px] leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                    {tab === 'reason' && (
                      <div className="text-[#6a5a3c] dark:text-[#b8ac91] font-light border-l-2 border-[#b87333]/30 pl-3">
                        {m.reasoning || (m.status === 'idle'
                          ? <span className="text-[#93825e] dark:text-[#6b6250] italic">Awaiting the problem…</span>
                          : <span className="text-[#93825e] dark:text-[#6b6250] italic">Thinking silently…</span>)}
                        {active && tab === 'reason' && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-[#ff9933] animate-pulse" />}
                      </div>
                    )}
                    {tab === 'solution' && (
                      <div className="text-[#47391f] dark:text-[#e6ddcc]">
                        {m.content || <span className="text-[#93825e] dark:text-[#6b6250] italic">Not yet solved.</span>}
                      </div>
                    )}
                    {tab === 'review' && (
                      <div className="text-[#5a4a30] dark:text-[#cbb9d6]">
                        {m.review || <span className="text-[#93825e] dark:text-[#6b6250] italic">Cross-check pending…</span>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function CouncilPane({ council, phase, onClose }: { council: CouncilMember[]; phase: Phase; onClose?: () => void }) {
  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 opacity-[0.05]">
        <Mandala className="w-80 h-80 animate-spin-slow" color="#ff9933" />
      </div>

      <div className="flex items-center justify-between px-5 py-4 border-b border-[#b87333]/15 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles size={16} className="text-[#c26a12] dark:text-[#ff9933] shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-xl text-[#9a5a12] dark:text-[#ffd89b] leading-none">Council Chamber</h2>
            <p className="text-[10px] tracking-[0.22em] text-[#7a6746] dark:text-[#a99a7c] uppercase mt-1 truncate">Independent · Cross-check · Judge</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#b87333] hover:text-[#c26a12] dark:hover:text-[#ff9933] hover:bg-[#b87333]/10 shrink-0">
            <X size={17} />
          </button>
        )}
      </div>

      <div className="relative z-10">
        <PipelineBar phase={phase} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative z-10">
        {council.map((m, i) => (
          <MemberCard key={m.agentId} m={m} index={i} />
        ))}

        {phase === 'judging' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-3.5 flex items-center gap-3 thinking-ring"
          >
            <motion.div
              animate={{ rotate: [0, 12, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border border-[#ff9933]/40 text-[#c26a12] dark:text-[#ff9933] bg-[#ff9933]/10"
            >
              <Gavel size={16} />
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg leading-none text-[#9a5a12] dark:text-[#ffd89b]">Sutradhar</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff9933] opacity-70" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff9933]" />
                </span>
              </div>
              <div className="text-[11px] text-[#7a6746] dark:text-[#a99a7c]">Chief Justice · weighing all verdicts…</div>
            </div>
          </motion.div>
        )}

        <div className="pt-2 text-center">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#877552] dark:text-[#7d7259]">
            {phase === 'idle' && 'The chamber rests'}
            {phase === 'answering' && 'The Oracle answers…'}
            {phase === 'solving' && 'Scholars solve independently…'}
            {phase === 'cross-checking' && 'Scholars cross-examine each other…'}
            {phase === 'judging' && 'The Chief Justice deliberates…'}
            {phase === 'done' && 'Judgment delivered'}
            {phase === 'error' && 'The council was disrupted'}
          </p>
        </div>
      </div>
    </div>
  );
}
