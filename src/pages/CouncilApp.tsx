import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCouncil } from '../hooks/useCouncil';
import type { ChatMessage, ChatSummary, CouncilMember, Mode } from '../lib/types';
import { rosterFor } from '../lib/types';
import Sidebar from '../components/Sidebar';
import ChatCanvas from '../components/ChatCanvas';
import CouncilPane from '../components/CouncilPane';

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

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

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
        content: r.content,
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

  const send = useCallback(
    async (text: string) => {
      if (busy) return;
      setBusy(true);
      setRestoredCouncil(null);
      const startChatId = activeIdRef.current;
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, userMsg]);
      if (mode !== 'direct' && window.innerWidth >= 1024) setCouncilOpen(true);

      let runChatId = startChatId;
      await run({
        prompt: text,
        history,
        chatId: startChatId,
        mode,
        onChatId: (id) => {
          runChatId = id;
          // Reveal the freshly-created chat immediately so the user can leave.
          if (!startChatId) setActive(id);
          loadChats();
        },
        onFinalMessage: async () => {
          // Pull the authoritative user+assistant rows the server persisted.
          if (runChatId) await reloadMessages(runChatId);
          if (activeIdRef.current === runChatId) setBusy(false);
        },
      });
    },
    [busy, messages, run, loadChats, mode, reloadMessages, setActive]
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
          user={user}
          onNew={newChat}
          onSelect={openChat}
          onDelete={deleteChat}
          onLogout={logout}
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
                user={user}
                onNew={newChat}
                onSelect={openChat}
                onDelete={deleteChat}
                onLogout={logout}
                onClose={() => setSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 min-w-0 relative z-10">
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
        />
      </div>

      {/* Council pane - desktop */}
      <AnimatePresence>
        {councilOpen && (
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
        {councilOpen && (
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
              className="lg:hidden fixed right-0 top-0 bottom-0 w-[90%] max-w-sm z-50 mobile-solid shadow-2xl border-l border-[#b87333]/20"
            >
              <CouncilPane council={displayCouncil} phase={phase} onClose={() => setCouncilOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
