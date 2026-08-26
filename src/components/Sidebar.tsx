import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, MessageSquare, Trash2, LogOut, X, KeyRound, Sun, Moon, Bot, Plug, Clock, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import type { User } from '@supabase/supabase-js';
import type { ChatSummary, NavSection } from '../lib/types';
import Mandala from './Mandala';

interface Props {
  chats: ChatSummary[];
  activeId: string | null;
  section: NavSection;
  counts: { agents: number; connectors: number; tasks: number };
  user: User | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
  onSection: (s: NavSection) => void;
  onClose?: () => void;
}

function groupChats(chats: ChatSummary[]) {
  const now = Date.now();
  const day = 86400000;
  const groups: Record<string, ChatSummary[]> = { Today: [], Yesterday: [], 'Previous 7 Days': [], 'Previous 30 Days': [], Older: [] };
  for (const c of chats) {
    const diff = now - new Date(c.updated_at).getTime();
    if (diff < day) groups.Today.push(c);
    else if (diff < 2 * day) groups.Yesterday.push(c);
    else if (diff < 7 * day) groups['Previous 7 Days'].push(c);
    else if (diff < 30 * day) groups['Previous 30 Days'].push(c);
    else groups.Older.push(c);
  }
  return Object.entries(groups).filter(([, v]) => v.length > 0);
}

export default function Sidebar({ chats, activeId, section, counts, user, onNew, onSelect, onDelete, onLogout, onSection, onClose }: Props) {
  const { theme, toggle } = useTheme();
  const grouped = useMemo(() => groupChats(chats), [chats]);
  const name = (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || user?.email?.split('@')[0] || 'Seeker';
  const avatar = (user?.user_metadata?.avatar_url as string) || (user?.user_metadata?.picture as string) || null;

  const nav: { id: NavSection; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'chats', label: 'Chats', icon: <MessageSquare size={15} /> },
    { id: 'agents', label: 'Agents', icon: <Bot size={15} />, count: counts.agents },
    { id: 'connectors', label: 'Connectors', icon: <Plug size={15} />, count: counts.connectors },
    { id: 'tasks', label: 'Scheduled', icon: <Clock size={15} />, count: counts.tasks },
  ];

  return (
    <div className="sidebar-surface h-full flex flex-col relative overflow-hidden bg-gradient-to-b from-[#1a1510] to-[#121212]">
      <div className="pointer-events-none absolute -bottom-20 -left-20 opacity-[0.05]">
        <Mandala className="w-72 h-72 animate-spin-slow-rev" color="#c98a2b" />
      </div>

      <div className="flex items-center justify-between px-4 pt-4 pb-3 relative z-10">
        <div className="flex items-center gap-2.5">
          <Mandala className="w-7 h-7 animate-spin-slow" color="#ff9933" />
          <span className="font-display text-xl text-gradient-gold tracking-wide">Sutradhar</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[#b87333] hover:text-[#ff9933]">
            <X size={17} />
          </button>
        )}
      </div>

      {/* nav sections */}
      <div className="px-2.5 pb-1 relative z-10">
        <div className="grid grid-cols-2 gap-1.5">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => onSection(n.id)}
              className={`nav-pill flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[12.5px] transition-all ${section === n.id ? 'nav-pill--active' : ''}`}
            >
              {n.icon}
              <span className="truncate">{n.label}</span>
              {n.count ? <span className="nav-count ml-auto text-[10px] px-1.5 rounded-full">{n.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2.5 relative z-10">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#ff9933]/40 text-[#ffd89b] hover:bg-[#ff9933]/10 hover:saffron-glow transition-all font-medium text-sm"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* chat history (only in chats section) */}
      <div className="flex-1 overflow-y-auto px-2 relative z-10">
        {section === 'chats' ? (
          <>
            {chats.length === 0 && (
              <p className="text-center text-[12px] text-[#6b6250] px-4 py-8">No conversations yet.<br />Ask Sutradhar something to begin.</p>
            )}
            {grouped.map(([label, items]) => (
              <div key={label} className="mb-4">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#8a7d60]">{label}</div>
                <div className="space-y-0.5">
                  {items.map((c) => (
                    <motion.div
                      key={c.id}
                      layout
                      className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-all ${
                        activeId === c.id ? 'bg-[#b87333]/15 border border-[#b87333]/25 shadow-[inset_0_1px_0_rgba(255,216,155,0.06)]' : 'hover:bg-[#b87333]/8 border border-transparent'
                      }`}
                      onClick={() => onSelect(c.id)}
                    >
                      {activeId === c.id && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-gradient-to-b from-[#ff9933] to-[#b87333]" />
                      )}
                      <MessageSquare size={14} className={activeId === c.id ? 'text-[#ff9933]' : 'text-[#8a7d60]'} />
                      <span className={`flex-1 truncate text-[13px] ${activeId === c.id ? 'text-[#ffd89b]' : 'text-[#c9bfa8]'}`}>
                        {c.title}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[#8a7d60] hover:text-red-400 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="px-3 py-6 text-center text-[12px] text-[#8a7d60]">
            {section === 'agents' && 'Manage your agents in the main panel →'}
            {section === 'connectors' && 'Connect your apps in the main panel →'}
            {section === 'tasks' && 'Manage scheduled tasks in the main panel →'}
          </div>
        )}
      </div>

      {/* utility links */}
      <div className="px-3 pb-1 relative z-10 space-y-1.5">
        <Link to="/app/api" className="w-full flex items-center gap-2 py-2 px-3 rounded-xl border border-[#b87333]/22 text-[#c9a24a] hover:text-[#ff9933] hover:border-[#ff9933]/30 transition-all text-[13px]">
          <KeyRound size={14} /> API Keys & Docs
        </Link>
        <Link to="/research" className="w-full flex items-center gap-2 py-2 px-3 rounded-xl border border-[#1e6e50]/25 text-[#2f7a5c] dark:text-[#8fd4b4] hover:border-[#1e6e50]/45 transition-all text-[13px]">
          <FlaskConical size={14} /> Research
        </Link>
      </div>

      <div className="p-3 border-t border-[#b87333]/15 relative z-10">
        <div className="flex items-center gap-3 rounded-xl p-2 glass">
          {avatar ? (
            <img src={avatar} alt={name} className="w-9 h-9 rounded-lg object-cover border border-[#b87333]/30" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#ff9933] to-[#b87333] flex items-center justify-center text-[#1a1207] font-bold uppercase">
              {name[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-[#ffd89b] truncate font-medium">{name}</div>
            <div className="text-[11px] text-[#8a7d60] truncate">{user?.email}</div>
          </div>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a7d60] hover:text-[#ff9933] hover:bg-[#b87333]/10"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onLogout}
            title="Sign out"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a7d60] hover:text-[#ff9933] hover:bg-[#b87333]/10"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
