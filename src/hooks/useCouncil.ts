import { useCallback, useRef, useState } from 'react';
import supabase from '../lib/supabase';
import { rosterFor, type ChatMessage, type CouncilMember, type Phase, type Mode } from '../lib/types';

interface RunArgs {
  prompt: string;
  history: { role: string; content: string }[];
  chatId: string | null;
  mode: Mode;
  onFinalMessage: (msg: ChatMessage) => void;
  onChatId: (id: string) => void;
}

interface RunStatus {
  found: boolean;
  id?: string;
  chatId?: string;
  mode?: Mode;
  status?: string;
  phase?: Phase;
  note?: string;
  council?: CouncilMember[];
  final?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

const PHASE_FROM_STATUS: Record<string, Phase> = {
  solving: 'solving',
  answering: 'answering',
  'cross-checking': 'cross-checking',
  judging: 'judging',
  complete: 'done',
  error: 'error',
};

export function useCouncil() {
  const [council, setCouncil] = useState<CouncilMember[]>(() => rosterFor('trio'));
  const [finalText, setFinalText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progressNote, setProgressNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  const clearPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const reset = useCallback(() => {
    clearPoll();
    setCouncil(rosterFor('trio'));
    setFinalText('');
    setPhase('idle');
    setProgressNote('');
    setError(null);
  }, []);

  const applyStatus = useCallback((st: RunStatus) => {
    if (st.council && st.council.length) setCouncil(st.council);
    if (typeof st.final === 'string') setFinalText(st.final);
    if (st.status) setPhase(PHASE_FROM_STATUS[st.status] || 'solving');
    setProgressNote(st.note || '');
  }, []);

  // Poll a run until it completes or errors. Resolves with the final status.
  const pollRun = useCallback((runId: string, mode: Mode): Promise<RunStatus> => {
    return new Promise((resolve) => {
      clearPoll();
      let misses = 0;
      const tick = async () => {
        if (stoppedRef.current) { clearPoll(); return; }
        try {
          const headers = await authHeaders();
          const res = await fetch(`/api/run-status?runId=${runId}`, { headers });
          if (res.ok) {
            const st: RunStatus = await res.json();
            if (st.found) {
              misses = 0;
              applyStatus(st);
              if (st.status === 'complete' || st.status === 'error') {
                clearPoll();
                resolve(st);
              }
            }
          } else {
            misses += 1;
          }
        } catch {
          misses += 1;
        }
        // Give up gracefully after ~14 min of no contact (900s / 4s).
        if (misses > 210) {
          clearPoll();
          resolve({ found: false, mode });
        }
      };
      tick();
      pollRef.current = setInterval(tick, 2000);
    });
  }, [applyStatus]);

  // Resume watching an in-progress run (used when the user returns to a chat).
  const resume = useCallback(async (chatId: string, onFinalMessage: (m: ChatMessage) => void): Promise<boolean> => {
    stoppedRef.current = false;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/run-status?chatId=${chatId}`, { headers });
      if (!res.ok) return false;
      const st: RunStatus = await res.json();
      if (!st.found || st.status === 'complete' || st.status === 'error') return false;
      // There's a live run — show it and keep polling.
      applyStatus(st);
      const finalSt = await pollRun(st.id!, (st.mode as Mode) || 'trio');
      if (finalSt.found && finalSt.status === 'complete') {
        onFinalMessage({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: finalSt.final || '',
          council: finalSt.council || [],
          mode: (finalSt.mode as Mode) || 'trio',
        });
      }
      return true;
    } catch {
      return false;
    }
  }, [applyStatus, pollRun]);

  const run = useCallback(async ({ prompt, history, chatId, mode, onFinalMessage, onChatId }: RunArgs) => {
    stoppedRef.current = false;
    setCouncil(rosterFor(mode));
    setFinalText('');
    setError(null);
    setPhase(mode === 'direct' ? 'answering' : 'solving');
    setProgressNote('Convening the council…');

    let kickoff: { chatId: string; runId: string; title?: string };
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/run', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, mode, chatId, history }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Failed (${res.status})`);
      }
      kickoff = await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start';
      setError(msg);
      setPhase('error');
      onFinalMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `> The council could not convene. **${msg}**\n\nPlease try again.`,
        council: rosterFor(mode),
        mode,
      });
      return;
    }

    // The chat now exists in the DB — reveal it immediately so the user can
    // leave, browse other chats, and the answer keeps forming in the background.
    onChatId(kickoff.chatId);

    const finalSt = await pollRun(kickoff.runId, mode);
    if (stoppedRef.current) return;

    if (finalSt.found && finalSt.status === 'complete') {
      onFinalMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: finalSt.final || 'No answer produced.',
        council: finalSt.council || rosterFor(mode),
        mode,
      });
    } else if (finalSt.status === 'error') {
      onFinalMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: finalSt.final || '> The council was disrupted. Please try again.',
        council: finalSt.council || rosterFor(mode),
        mode,
      });
    } else {
      // Lost contact — the run continues server-side; tell the user it will be ready.
      onFinalMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: '> The council is still deliberating in the background. Reopen this chat shortly to see the completed answer.',
        council: rosterFor(mode),
        mode,
      });
    }
  }, [pollRun]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearPoll();
    setPhase('idle');
  }, []);

  return { council, finalText, phase, progressNote, error, run, reset, resume, stop };
}
