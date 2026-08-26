import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Check, Copy, PanelRightOpen, Loader2, Menu, Cpu, GitCompareArrows, Sparkles, Sigma, FlaskConical, X, Plug } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ChatMessage, Phase, Mode, Agent } from '../lib/types';
import Markdown from './Markdown';
import Mandala from './Mandala';
import ModelSelector from './ModelSelector';
import AskCard, { type AskSpec } from './AskCard';

// Parse [[ASK]]{...json...}[[/ASK]] blocks out of assistant content.
export function parseAsk(content: string): { text: string; ask: AskSpec | null } {
  const m = content.match(/\[\[ASK\]\]([\s\S]*?)\[\[\/ASK\]\]/);
  if (!m) return { text: content, ask: null };
  let ask: AskSpec | null = null;
  try {
    ask = JSON.parse(m[1].trim());
  } catch { ask = null; }
  const text = content.replace(m[0], '').trim();
  return { text, ask };
}

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
  onAnswer: (a: string) => void;
  activeAgent: Agent | null;
  onClearAgent: () => void;
}

const PHASE_META: Record<Phase, { label: string; icon: React.ReactNode }> = {
  idle: { label: 'Idle', icon: null },
  tools: { label: 'Using tools', icon: <Plug size={13} /> },
  answering: { label: 'Reasoning', icon: <Cpu size={13} /> },
  solving: { label: 'Reasoning', icon: <Cpu size={13} /> },
  'cross-checking': { label: 'Self-verifying', icon: <GitCompareArrows size={13} /> },
  judging: { label: 'Synthesizing', icon: <Sparkles size={13} /> },
  done: { label: 'Complete', icon: <Check size={13} /> },
  error: { label: 'Disrupted', icon: null },
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
          <span className="font-display text-lg text-[#9a5a12] dark:text-[#ffd89b] leading-none">Sutradhar 6.7</span>
          <div className="text-[10px] tracking-[0.2em] uppercase text-[#7a6746] dark:text-[#a99a7c] mt-0.5">Final Answer</div>
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
  onAnswer,
  activeAgent,
  onClearAgent,
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
  return (
    <div className="h-full flex flex-col relative">
      {/* header */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-6 py-2.5 sm:py-3 border-b border-[#b87333]/15 glass-strong relative z-30">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={onToggleSidebar}
            aria-label="Open menu"
            className="lg:hidden w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#c9a24a] hover:bg-[#b87333]/10"
          >
            <Menu size={18} />
          </button>
          <div className="hidden md:block shrink-0">
            <h1 className="font-display text-xl text-gradient-gold leading-none">Sutradhar</h1>
            <p className="text-[10px] tracking-[0.28em] uppercase text-[#a99a7c] mt-0.5">Deep Reasoning</p>
          </div>
          <div className="hidden md:block h-8 w-px bg-[#b87333]/20 mx-1" />
          <div className="min-w-0">
            <ModelSelector mode={mode} onModeChange={onModeChange} disabled={busy} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <AnimatePresence>
            {busy && phase !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center justify-center gap-1.5 w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-full bg-[#ff9933]/12 border border-[#ff9933]/30 text-[12px] text-[#ffd89b]"
                title={PHASE_META[phase].label}
              >
                {PHASE_META[phase].icon}
                <span className="hidden sm:inline">{PHASE_META[phase].label}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact, icon-only research shortcut — no caption, no overlap on mobile */}
          <Link to="/research" className="research-chip" aria-label="Research" title="Sutradhar research & architecture">
            <FlaskConical size={16} />
          </Link>

          {!councilOpen && (
            <button
              onClick={onToggleCouncil}
              aria-label="Open reasoning engine"
              title="Reasoning Engine"
              className="flex items-center justify-center gap-2 w-9 h-9 sm:w-auto sm:h-auto sm:px-3.5 sm:py-2 rounded-xl glass text-[13px] text-[#c9a24a] hover:text-[#ff9933] hover:border-[#ff9933]/30 transition-colors"
            >
              <PanelRightOpen size={16} />
              <span className="hidden sm:inline">Reasoning Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* active agent banner */}
      {activeAgent && (
        <div className="agent-banner flex items-center gap-2.5 px-4 sm:px-6 py-2 relative z-20">
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-sm shrink-0" style={{ background: `${activeAgent.color}26`, border: `1px solid ${activeAgent.color}55` }}>{activeAgent.emoji}</span>
          <span className="text-[13px] text-[#6a4310] dark:text-[#ffd89b]">Chatting with <span className="font-semibold">{activeAgent.name}</span></span>
          <button onClick={onClearAgent} className="ml-auto text-[#8a7d60] hover:text-[#ff9933] flex items-center gap-1 text-[12px]"><X size={13} /> Exit agent</button>
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {empty && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="min-h-[62vh] flex flex-col items-center justify-center text-center"
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 blur-3xl rounded-full bg-[#ff9933]/15 animate-breathe" />
                <Mandala className="w-40 h-40 sm:w-52 sm:h-52 animate-spin-slow opacity-70 relative" color="#ff9933" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Mandala className="w-20 h-20 sm:w-26 sm:h-26 animate-spin-slow-rev opacity-90" color="#c9a24a" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sigma size={30} className="text-[#ffd89b]" />
                </div>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl text-gradient-gold mb-2">
                {activeAgent ? `Chat with ${activeAgent.name}` : 'Ask Sutradhar'}
              </h2>
              <p className="text-[#a99a7c] max-w-md text-[15px] leading-relaxed">
                {activeAgent
                  ? activeAgent.description || 'Your specialized agent is ready. Ask it anything.'
                  : 'Pose a question or task. Sutradhar reasons deeply, verifies its own work, and converges to one clear answer.'}
              </p>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m, idx) => {
              const isLast = idx === messages.length - 1;
              const parsed = m.role === 'assistant' ? parseAsk(m.content) : { text: m.content, ask: null };
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  {m.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 bg-gradient-to-br from-[#2a2118] to-[#1f1811] border border-[#b87333]/25 text-[#ece5d8]">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <>
                      {parsed.text && <AssistantMessage content={parsed.text} />}
                      {parsed.ask && (
                        <AskCard spec={parsed.ask} onAnswer={onAnswer} disabled={busy || !isLast} />
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {busy && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
              {streamingFinal ? (
                <AssistantMessage content={parseAsk(streamingFinal).text || streamingFinal} />
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
                    Hard problems can take a few minutes — Sutradhar is thinking deeply. Open the Reasoning Engine to watch it work.
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
              placeholder="Ask Sutradhar anything…"
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
            Sutradhar reasons deeply, verifies its own work, then answers. Verify important results.
          </p>
        </div>
      </div>
    </div>
  );
}
