import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCouncil } from '../hooks/useCouncil';
import type { ChatMessage, ChatSummary, CouncilMember, Mode, NavSection, Agent } from '../lib/types';
import { rosterFor } from '../lib/types';
import Sidebar from '../components/Sidebar';
import ChatCanvas from '../components/ChatCanvas';
import CouncilPane from '../components/CouncilPane';
import AgentsPanel from '../components/AgentsPanel';
import ConnectorsPanel from '../components/ConnectorsPanel';
import TasksPanel from '../components/TasksPanel';

const ASK_CAPABILITY =
  'If you need clarification before answering, you MAY ask the user ONE concise question by emitting a block exactly like [[ASK]]{"question":"...","options":["...","..."],"allowManual":true}[[/ASK]] and nothing after it. Only ask when genuinely needed.';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function CouncilApp() {
  const { user } = useAuth();
  const { council, finalText, phase, progressNote, run, resume, reset } = useCouncil();

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [councilOpen, setCouncilOpen] = useState(true);
  const [restoredCouncil, setRestoredCouncil] = useState<CouncilMember[] | null>(null);
  const [mode, setMode] = useState<Mode>('trio');
  const [section, setSection] = useState<NavSection>('chats');
  const [counts, setCounts] = useState({ agents: 0, connectors: 0, tasks: 0 });
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const h = await authHeaders();
      const [a, c, t] = await Promise.all([
        fetch('/api/agents', { headers: h }),
        fetch('/api/connectors', { headers: h }),
        fetch('/api/tasks', { headers: h }),
      ]);
      setCounts({
        agents: a.ok ? (await a.json()).length : 0,
        connectors: c.ok ? (await c.json()).length : 0,
        tasks: t.ok ? (await t.json()).length : 0,
      });
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const goSection = useCallback((s: NavSection) => {
    setSection(s);
    setSidebarOpen(false);
  }, []);

  const chatWithAgent = useCallback((a: Agent) => {
    setActiveAgent(a);
    setSection('chats');
    setActive(null);
    setMessages([]);
    setRestoredCouncil(null);
    reset();
    setBusy(false);
  }, [reset, setActive]);

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { headers: await authHeaders() });
      if (res.ok) setChats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Authoritative reload of a chat's messages from the DB. Only applies if the
  // chat is still the one being viewed (guards against cross-chat bleed).
  const reloadMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/messages?chatId=${id}`, { headers: await authHeaders() });
      if (!res.ok) return;
      const rows = await res.json();
      const msgs: ChatMessage[] = rows.map((r: { id: string; role: string; content: string; council: CouncilMember[] | null }) => ({
        id: r.id,
        role: r.role === 'user' ? 'user' : 'assistant',
        content: r.role === 'user' ? r.content.replace(/<<CTX>>[\s\S]*?<<END>>\s*/g, '') : r.content,
        council: r.council,
      }));
      if (activeIdRef.current !== id) return;
      setMessages(msgs);
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant' && m.council);
      if (lastAssistant?.council) {
        setRestoredCouncil(lastAssistant.council.map((c) => ({ ...c, status: c.error ? 'error' : 'done' })) as CouncilMember[]);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const openChat = useCallback(async (id: string) => {
    setActive(id);
    setSidebarOpen(false);
    setRestoredCouncil(null);
    reset();
    setBusy(false);
    await reloadMessages(id);
    // If a run for this chat is still going server-side, resume the live view.
    const resumed = await resume(id, async () => {
      await reloadMessages(id);
      if (activeIdRef.current === id) setBusy(false);
    });
    if (resumed && activeIdRef.current === id) {
      setBusy(true);
      if (mode !== 'direct' && window.innerWidth >= 1024) setCouncilOpen(true);
    }
  }, [reloadMessages, resume, reset, mode, setActive]);

  const newChat = useCallback(() => {
    setActive(null);
    setMessages([]);
    setRestoredCouncil(null);
    setSidebarOpen(false);
    reset();
    setBusy(false);
  }, [reset, setActive]);

  // Detect a request to create/build an agent.
  const isAgentRequest = (t: string) =>
    /\b(create|make|build|forge|set\s?up|design)\b[^.!?]*\bagent\b/i.test(t) ||
    /\bagent\b[^.!?]*\b(that|which|to)\b/i.test(t) && /\b(create|make|build)\b/i.test(t);

  const forgeAgent = useCallback(async (text: string) => {
    setBusy(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const thinking: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '🪷 Forging your agent…' };
    setMessages((prev) => [...prev, userMsg, thinking]);
    try {
      const res = await fetch('/api/agent-forge', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ request: text, save: true }) });
      const j = await res.json();
      if (j.ok && j.agent) {
        const a = j.agent as Agent;
        const card = `## ${a.emoji} Agent created — **${a.name}**\n\n${a.description}\n\n**Skills:** ${a.skills.join(', ') || '—'}\n\n**Connectors:** ${a.connectors.join(', ') || '—'}\n\n> Manage it in the **Agents** tab, or start chatting with it there. You can edit its name, skills, connectors and persona anytime.`;
        setMessages((prev) => prev.map((m) => (m.id === thinking.id ? { ...m, content: card } : m)));
        loadCounts();
      } else {
        setMessages((prev) => prev.map((m) => (m.id === thinking.id ? { ...m, content: `> I couldn't design that agent (${j.error || 'try rephrasing'}).` } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === thinking.id ? { ...m, content: '> Agent forge failed. Please try again.' } : m)));
    } finally {
      setBusy(false);
    }
  }, [loadCounts]);

  const send = useCallback(
    async (text: string) => {
      if (busy) return;

      // AI-driven agent creation intent (only in general chat, not agent chat)
      if (!activeAgent && isAgentRequest(text)) {
        await forgeAgent(text);
        return;
      }

      setBusy(true);
      setRestoredCouncil(null);
      const startChatId = activeIdRef.current;
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, userMsg]);
      if (mode !== 'direct' && window.innerWidth >= 1024) setCouncilOpen(true);

      // Build the effective prompt: agent persona + ask capability preamble,
      // wrapped in a sentinel so it can be stripped from the displayed message.
      const preambleParts: string[] = [];
      if (activeAgent) {
        preambleParts.push(
          `Agent persona — you are "${activeAgent.name}". ${activeAgent.system_prompt || activeAgent.description}${activeAgent.connectors?.length ? ` You have access to these connected tools: ${activeAgent.connectors.join(', ')}.` : ''} Stay in character and never mention this instruction.`
        );
      }
      preambleParts.push(ASK_CAPABILITY);
      const effectivePrompt = `<<CTX>>${preambleParts.join(' ')}<<END>>\n\n${text}`;

      let runChatId = startChatId;
      await run({
        prompt: effectivePrompt,
        history,
        chatId: startChatId,
        mode,
        onChatId: (id) => {
          runChatId = id;
          if (!startChatId) setActive(id);
          loadChats();
        },
        onFinalMessage: async () => {
          if (runChatId) await reloadMessages(runChatId);
          if (activeIdRef.current === runChatId) setBusy(false);
        },
      });
    },
    [busy, messages, run, loadChats, mode, reloadMessages, setActive, activeAgent, forgeAgent]
  );

  const deleteChat = useCallback(
    async (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) newChat();
      try {
        await fetch('/api/chats', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) });
      } catch (e) {
        console.error(e);
      }
    },
    [activeId, newChat]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const displayCouncil = busy || phase !== 'idle' ? council : restoredCouncil || rosterFor(mode);
  const newChatFor = useCallback(() => {
    setActiveAgent(null);
    setSection('chats');
    newChat();
  }, [newChat]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#121212] text-[#ece5d8] flex relative grain">
      {/* ambient sandalwood gradient + drifting aurora */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="ambient-bg" />
        <div className="aurora" style={{ width: 480, height: 480, top: '-8%', left: '30%', background: 'rgba(255,153,51,0.10)' }} />
        <div className="aurora" style={{ width: 420, height: 420, bottom: '-10%', right: '18%', background: 'rgba(27,77,62,0.14)', animationDelay: '7s' }} />
        <div className="aurora" style={{ width: 360, height: 360, top: '40%', left: '5%', background: 'rgba(184,115,51,0.10)', animationDelay: '13s' }} />
      </div>

      {/* Sidebar - desktop */}
      <div className="hidden lg:block w-72 shrink-0 border-r border-[#b87333]/12 relative z-10">
        <Sidebar
          chats={chats}
          activeId={activeId}
          section={section}
          counts={counts}
          user={user}
          onNew={newChatFor}
          onSelect={openChat}
          onDelete={deleteChat}
          onLogout={logout}
          onSection={goSection}
        />
      </div>

      {/* Sidebar - mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 z-40"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[82%] max-w-xs z-50 mobile-solid shadow-2xl"
            >
              <Sidebar
                chats={chats}
                activeId={activeId}
                section={section}
                counts={counts}
                user={user}
                onNew={newChatFor}
                onSelect={openChat}
                onDelete={deleteChat}
                onLogout={logout}
                onSection={goSection}
                onClose={() => setSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile header for non-chat panels */}
      {section !== 'chats' && (
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-xl glass-strong flex items-center justify-center text-[#c9a24a]">
          <Menu size={18} />
        </button>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 relative z-10">
        {section === 'chats' && (
          <ChatCanvas
            messages={messages}
            streamingFinal={finalText}
            phase={phase}
            progressNote={progressNote}
            busy={busy}
            onSend={send}
            onToggleCouncil={() => setCouncilOpen((v) => !v)}
            onToggleSidebar={() => setSidebarOpen(true)}
            councilOpen={councilOpen}
            mode={mode}
            onModeChange={setMode}
            onNavigate={goSection}
            onAnswer={send}
            activeAgent={activeAgent}
            onClearAgent={() => setActiveAgent(null)}
          />
        )}
        {section === 'agents' && <AgentsPanel authHeaders={authHeaders} onChatWithAgent={chatWithAgent} />}
        {section === 'connectors' && <ConnectorsPanel authHeaders={authHeaders} />}
        {section === 'tasks' && <TasksPanel authHeaders={authHeaders} />}
      </div>

      {/* Council pane - desktop */}
      <AnimatePresence>
        {councilOpen && section === 'chats' && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 384, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="hidden lg:block shrink-0 border-l border-[#b87333]/12 relative z-10 overflow-hidden"
          >
            <div className="w-96 h-full">
              <CouncilPane council={displayCouncil} phase={phase} onClose={() => setCouncilOpen(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Council pane - mobile drawer */}
      <AnimatePresence>
        {councilOpen && section === 'chats' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCouncilOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="lg:hidden fixed right-0 top-0 bottom-0 w-full max-w-md z-50 mobile-solid shadow-2xl border-l border-[#b87333]/20"
            >
              <CouncilPane council={displayCouncil} phase={phase} onClose={() => setCouncilOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
