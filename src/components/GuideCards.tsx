import { motion } from 'framer-motion';
import { Bot, Plug, Clock, Sparkles, ArrowRight } from 'lucide-react';
import type { NavSection } from '../lib/types';

const GUIDES: { icon: React.ReactNode; title: string; body: string; cta: string; section: NavSection }[] = [
  { icon: <Bot size={18} />, title: 'Create an Agent', body: 'Just ask in chat — “make an agent that drafts my tweets” — and Sutradhar forges it with skills & connectors.', cta: 'Open Agents', section: 'agents' },
  { icon: <Plug size={18} />, title: 'Connect your apps', body: 'Link GitHub, Slack, Notion, Gmail, Instagram & more so your agents can act across your stack.', cta: 'Browse Connectors', section: 'connectors' },
  { icon: <Clock size={18} />, title: 'Schedule tasks', body: 'Automate daily briefings, reports and content on a cadence — run by Sutradhar or any agent.', cta: 'Plan a Task', section: 'tasks' },
];

export default function GuideCards({ onNavigate }: { onNavigate: (s: NavSection) => void }) {
  return (
    <div className="w-full max-w-2xl mt-8">
      <div className="flex items-center gap-2 mb-3 justify-center text-[#8a7350] dark:text-[#a99a7c]">
        <Sparkles size={13} className="text-[#b5661a] dark:text-[#ff9933]" />
        <span className="text-[11px] uppercase tracking-[0.24em]">Superpowers</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {GUIDES.map((g, i) => (
          <motion.button
            key={g.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            onClick={() => onNavigate(g.section)}
            className="guide-card group text-left rounded-2xl p-4 transition-all"
          >
            <div className="guide-card-icon w-9 h-9 rounded-xl flex items-center justify-center mb-2.5">{g.icon}</div>
            <h3 className="font-display text-lg text-[#6a4310] dark:text-[#ffd89b] mb-1">{g.title}</h3>
            <p className="text-[12px] leading-snug text-[#7a6746] dark:text-[#a99a7c] mb-2.5">{g.body}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1e6e50] dark:text-[#8fd4b4] group-hover:gap-1.5 transition-all">
              {g.cta} <ArrowRight size={13} />
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
