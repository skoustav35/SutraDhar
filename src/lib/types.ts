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

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  system_prompt: string;
  skills: string[];
  connectors: string[];
  created_by_ai: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Connector {
  id: string;
  provider: string;
  account_label: string;
  status: string;
  scopes: string[];
  connected_at: string;
}

export interface ScheduledTask {
  id: string;
  agent_id: string | null;
  title: string;
  prompt: string;
  cadence: string;
  run_time: string;
  next_run: string | null;
  last_run: string | null;
  enabled: boolean;
  status: string;
  created_at: string;
}

export type NavSection = 'chats' | 'agents' | 'connectors' | 'tasks';

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
    desc: 'A fast, efficient model for everyday questions and general reasoning. Lowest latency.',
    synthesize: false,
    crosscheck: false,
    roster: [{ agentId: 'oracle', name: 'Reasoning Stream', title: 'Direct reasoning' }],
  },
  trio: {
    id: 'trio',
    label: 'Sutradhar 6.7 Ultra',
    short: 'Ultra',
    desc: 'Our flagship model — deep, high-accuracy reasoning with self-verification for hard, multi-step problems.',
    synthesize: true,
    crosscheck: true,
    // Internal parallel reasoning streams of the SINGLE model (not separate models).
    roster: [
      { agentId: 'sage', name: 'Reasoning Stream I', title: 'Logical derivation' },
      { agentId: 'analyst', name: 'Reasoning Stream II', title: 'Structural analysis' },
      { agentId: 'skeptic', name: 'Reasoning Stream III', title: 'Error-checking pass' },
    ],
  },
  council: {
    id: 'council',
    label: 'Sutradhar 6.7 Extreme',
    short: 'Extreme',
    desc: 'Our most capable model — maximum reasoning depth for the very hardest challenges.',
    synthesize: true,
    crosscheck: true,
    roster: [
      { agentId: 'sage', name: 'Reasoning Stream I', title: 'Logical derivation' },
      { agentId: 'analyst', name: 'Reasoning Stream II', title: 'Structural analysis' },
      { agentId: 'skeptic', name: 'Reasoning Stream III', title: 'Error-checking pass' },
      { agentId: 'reckoner', name: 'Reasoning Stream IV', title: 'Numerical computation' },
      { agentId: 'atomist', name: 'Reasoning Stream V', title: 'First-principles decomposition' },
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
