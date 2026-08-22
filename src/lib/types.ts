export type Role = 'user' | 'assistant';

export type CouncilStatus =
  | 'idle'
  | 'solving'
  | 'answering'
  | 'cross-checking'
  | 'judged'
  | 'done'
  | 'error';

export interface CouncilMember {
  // Neutral, provider-agnostic identifier. Underlying model names are never
  // exposed to the client.
  agentId: string;
  name: string;
  title: string;
  status: CouncilStatus;
  reasoning: string;
  content: string;
  final: string;
  review: string;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  council?: CouncilMember[] | null;
  streaming?: boolean;
  mode?: Mode;
}

export interface ChatSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type Phase = 'idle' | 'solving' | 'answering' | 'cross-checking' | 'judging' | 'done' | 'error';

export type Mode = 'direct' | 'trio' | 'council';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  revoked: boolean;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface RosterMember { agentId: string; name: string; title: string }

export interface ModeConfig {
  id: Mode;
  label: string;
  short: string;
  desc: string;
  synthesize: boolean;
  crosscheck: boolean;
  roster: RosterMember[];
}

export const MODES: Record<Mode, ModeConfig> = {
  direct: {
    id: 'direct',
    label: 'Sutradhar 6.7 Lite',
    short: 'Lite',
    desc: 'A single self-contained reasoning model answering directly. Fastest, best for everyday queries.',
    synthesize: false,
    crosscheck: false,
    roster: [{ agentId: 'oracle', name: 'Oracle', title: 'The Direct Voice' }],
  },
  trio: {
    id: 'trio',
    label: 'Sutradhar 6.7 Ultra',
    short: 'Ultra',
    desc: 'A tri-agent reasoning core: three internal threads solve, cross-verify, then a synthesis layer adjudicates.',
    synthesize: true,
    crosscheck: true,
    roster: [
      { agentId: 'sage', name: 'Vachaspati', title: 'The Deep Logic Sage' },
      { agentId: 'analyst', name: 'Bhaskara', title: 'The Structural Analyst' },
      { agentId: 'skeptic', name: 'Charvaka', title: 'The Skeptic' },
    ],
  },
  council: {
    id: 'council',
    label: 'Sutradhar 6.7 Extreme',
    short: 'Extreme',
    desc: 'A five-agent deliberative core with full cross-examination and a chief adjudicator. Deepest reasoning.',
    synthesize: true,
    crosscheck: true,
    roster: [
      { agentId: 'sage', name: 'Vachaspati', title: 'The Deep Logic Sage' },
      { agentId: 'analyst', name: 'Bhaskara', title: 'The Structural Analyst' },
      { agentId: 'skeptic', name: 'Charvaka', title: 'The Skeptic' },
      { agentId: 'reckoner', name: 'Aryabhata', title: 'The Celestial Reckoner' },
      { agentId: 'atomist', name: 'Kanada', title: 'The Atomist' },
    ],
  },
};

export function rosterFor(mode: Mode): CouncilMember[] {
  return MODES[mode].roster.map((r) => ({
    agentId: r.agentId,
    name: r.name,
    title: r.title,
    status: 'idle',
    reasoning: '',
    content: '',
    final: '',
    review: '',
    error: null,
  }));
}

// Back-compat default (Trio)
export const COUNCIL_BLUEPRINT: CouncilMember[] = rosterFor('trio');
