import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Check, Copy, PanelRightOpen, Loader2, Menu, Cpu, GitCompareArrows, Gavel, Sigma, Zap, Users, Crown } from 'lucide-react';
import type { ChatMessage, Phase, Mode } from '../lib/types';
import { MODES } from '../lib/types';
import Markdown from './Markdown';
import Mandala from './Mandala';

interface Props {
  messages: ChatMessage[];
  streamingFinal: string;
  phase: Phase;
  progressNote?: string;
  busy: boolean;
  onSend: (text: string) => void;
  onToggleCouncil: () => void;
  onToggleSidebar: () => void;
  councilOpen: boolean;
  mode: Mode;
  onModeChange: (m: Mode) => void;
}

const PHASE_META: Record<Phase, { label: string; icon: React.ReactNode }> = {
  idle: { label: 'Idle', icon: null },
  answering: { label: 'Oracle answering', icon: <Zap size={13} /> },
  solving: { label: 'Solving independently', icon: <Cpu size={13} /> },
  'cross-checking': { label: 'Cross-checking answers', icon: <GitCompareArrows size={13} /> },
  judging: { label: 'Judge deliberating', icon: <Gavel size={13} /> },
  done: { label: 'Complete', icon: <Check size={13} /> },
  error: { label: 'Disrupted', icon: null },
};

const MODE_ICON: Record<Mode, React.ReactNode> = {
  direct: <Zap size={14} />,
  trio: <Users size={14} />,
  council: <Crown size={14} />,
};

function AssistantMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="group relative">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff9933] to-[#b87333] flex items-center justify-center text-[#1a1207] text-sm font-bold font-display shadow-[0_0_16px_-4px_rgba(255,153,51,0.6)]">
          S
        </div>
        <div>
          <span className="font-display text-lg text-[#9a5a12] dark:text-[#ffd89b] leading-none">Sutradhar</span>
          <div className="text-[10px] tracking-[0.2em] uppercase text-[#7a6746] dark:text-[#a99a7c] mt-0.5">Chief Justice · Final Verdict</div>
        </div>
      </div>
      <div className="pl-11 relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-[#b87333]/40 to-transparent" />
        <div className="verdict-card rounded-2xl p-5">
          <Markdown content={content} />
        </div>
        {content && (
          <button
            onClick={copy}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[#a99a7c] hover:text-[#ff9933] transition-colors opacity-0 group-hover:opacity-100"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied verdict' : 'Copy verdict'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatCanvas({
  messages,
  streamingFinal,
  phase,
  progressNote,
  busy,
  onSend,
  onToggleCouncil,
  onToggleSidebar,
  councilOpen,
  mode,
  onModeChange,
}: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingFinal]);

  const submit = () => {
    const t = input.trim();
    if (!t || busy) return;
    onSend(t);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const empty = messages.length === 0 && !busy;
  const suggestions = [
    'Find all integer solutions to x² + y² = 2024',
    'Evaluate the integral of x³/(eˣ−1) from 0 to ∞, with steps',
    'Prove that √2 + √3 is irrational',
  ];

  return (
    <div className="h-full flex flex-col relative">
      {/* header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#b87333]/15 glass-strong relative z-20">
        <div className="flex items-center gap-3">
          <button onClick={onToggleSidebar} className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-[#c9a24a] hover:bg-[#b87333]/10">
            <Menu size={18} />
          </button>
          <div>
            <h1 className="font-display text-xl text-gradient-gold leading-none">The Council</h1>
            <p className="text-[10px] tracking-[0.28em] uppercase text-[#a99a7c] mt-0.5">Multi-Agent Math Reasoning</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {busy && phase !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ff9933]/12 border border-[#ff9933]/30 text-[12px] text-[#ffd89b]"
              >
                {PHASE_META[phase].icon}
                <span className="hidden sm:inline">{PHASE_META[phase].label}</span>
              </motion.div>
            )}
          </AnimatePresence>
          {!councilOpen && (
            <button
              onClick={onToggleCouncil}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass text-[13px] text-[#c9a24a] hover:text-[#ff9933] hover:border-[#ff9933]/30 transition-colors"
            >
              <PanelRightOpen size={15} />
              <span className="hidden sm:inline">Council Chamber</span>
            </button>
          )}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {empty && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="min-h-[58vh] flex flex-col items-center justify-center text-center"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 blur-3xl rounded-full bg-[#ff9933]/15 animate-breathe" />
                <Mandala className="w-32 h-32 animate-spin-slow opacity-70 relative" color="#ff9933" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Mandala className="w-16 h-16 animate-spin-slow-rev opacity-90" color="#c9a24a" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sigma size={26} className="text-[#ffd89b]" />
                </div>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl text-gradient-gold mb-2">The Council Awaits</h2>
              <p className="text-[#a99a7c] max-w-md">
                Pose a hard problem. Three scholars solve it independently, cross-check each other, and the Chief Justice
                judges every answer to deliver the definitive solution.
              </p>

              <div className="mt-6 flex items-center gap-2 text-[11px] text-[#8a7d60]">
                <span className="flex items-center gap-1"><Cpu size={12} /> Solve</span>
                <span className="text-[#b87333]/40">→</span>
                <span className="flex items-center gap-1"><GitCompareArrows size={12} /> Cross-check</span>
                <span className="text-[#b87333]/40">→</span>
                <span className="flex items-center gap-1"><Gavel size={12} /> Judge</span>
              </div>

              <div className="mt-8 grid sm:grid-cols-3 gap-2.5 w-full max-w-2xl">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="glass rounded-xl p-3 text-left text-[13px] text-[#c9bfa8] hover:text-[#ffd89b] hover:border-[#ff9933]/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                {m.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 bg-gradient-to-br from-[#2a2118] to-[#1f1811] border border-[#b87333]/25 text-[#ece5d8]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <AssistantMessage content={m.content} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {busy && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
              {streamingFinal ? (
                <AssistantMessage content={streamingFinal} />
              ) : (
                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center gap-3 text-[#9a5a12] dark:text-[#ffd89b] mb-3">
                    <Loader2 size={16} className="animate-spin text-[#c26a12] dark:text-[#ff9933]" />
                    <span className="text-sm font-medium">{PHASE_META[phase].label}…</span>
                  </div>
                  {progressNote && (
                    <div className="mb-3 flex items-center gap-2 text-[12px] text-[#7a6746] dark:text-[#c9a24a]">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff9933] opacity-70" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff9933]" />
                      </span>
                      {progressNote}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="h-3 rounded shimmer w-3/4" />
                    <div className="h-3 rounded shimmer w-full" />
                    <div className="h-3 rounded shimmer w-2/3" />
                  </div>
                  <p className="text-[11px] text-[#877552] dark:text-[#8a7d60] mt-3">
                    Hard problems can take a few minutes — the scholars are thinking deeply. Watch the Council Chamber for live reasoning.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="px-4 sm:px-6 pb-5 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* mode selector */}
          <div className="mb-2.5 flex flex-wrap items-stretch gap-2">
            {(Object.keys(MODES) as Mode[]).map((k) => {
              const cfg = MODES[k];
              const activeMode = mode === k;
              return (
                <button
                  key={k}
                  onClick={() => onModeChange(k)}
                  disabled={busy}
                  title={cfg.desc}
                  className={`group flex-1 min-w-[100px] flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 rounded-xl border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeMode
                      ? 'border-[#ff9933]/50 bg-[#ff9933]/10 saffron-glow'
                      : 'border-[#b87333]/20 glass hover:border-[#ff9933]/30'
                  }`}
                >
                  <span className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${activeMode ? 'bg-[#ff9933]/20 text-[#ff9933]' : 'bg-[#b87333]/10 text-[#c9a24a]'}`}>
                    {MODE_ICON[k]}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[12px] sm:text-[13px] font-medium leading-tight truncate ${activeMode ? 'text-[#ffd89b]' : 'text-[#c9bfa8]'}`}>{cfg.label}</span>
                    <span className="block text-[10px] text-[#8a7d60] leading-tight mt-0.5">
                      {k === 'direct' ? '1 core' : k === 'trio' ? '3 cores + adjudicator' : '5 cores + adjudicator'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="glass-strong rounded-2xl p-2 flex items-end gap-2 focus-within:border-[#ff9933]/40 transition-colors">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Pose a hard problem to the council…"
              disabled={busy}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-[#ece5d8] placeholder:text-[#7d7259] focus:outline-none max-h-[200px]"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || busy}
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </div>
          <p className="text-center text-[10px] text-[#6b6250] mt-2 tracking-wide">
            The council solves independently, cross-checks, then judges. Verify important results.
          </p>
        </div>
      </div>
    </div>
  );
}
