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

export type Phase = 'idle' | 'tools' | 'solving' | 'answering' | 'cross-checking' | 'judging' | 'done' | 'error';

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
  name: string;
  auth_type: 'token' | 'oauth2';
  account_id: string;
  account_name: string;
  account_label: string;
  account_avatar: string;
  account_url: string;
  scopes: string[];
  status: 'connected' | 'error' | 'expired';
  last_error: string;
  last_verified_at: string | null;
  token_expires_at: string | null;
  connected_at: string;
  has_refresh: boolean;
  meta: Record<string, unknown>;
}

export interface ConnectorActionParam {
  name: string;
  type: 'text' | 'textarea' | 'number';
  required?: boolean;
  placeholder?: string;
  default?: number | string;
}

export interface ConnectorActionDef {
  id: string;
  label: string;
  description: string;
  write: boolean;
  params: ConnectorActionParam[];
}

export interface ConnectorExtraField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface ProviderDef {
  id: string;
  name: string;
  docs: string;
  tokenLabel: string;
  tokenUrl: string;
  tokenHelp: string;
  extraFields: ConnectorExtraField[];
  oauthAvailable: boolean;
  oauthReady: boolean;
  oauthScopes: string[];
  oauthEnvKeys: string[];
  actions: ConnectorActionDef[];
}

export interface ActionResultRow {
  title?: string;
  subtitle?: string;
  meta?: string;
  url?: string;
  body?: string;
}

export interface ActionResult {
  summary: string;
  rows: ActionResultRow[];
  provider: string;
  action: string;
  duration_ms: number;
  executed_at: string;
}

export interface ConnectorEvent {
  id: string;
  provider: string;
  action: string;
  status: 'ok' | 'error';
  duration_ms: number;
  summary: string;
  source: string;
  created_at: string;
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

/* ------------------------------------------------------------ research page */

export interface ModelSpec {
  id: number;
  slug: string;
  name: string;
  tier: string;
  codename: string;
  tagline: string;
  description: string;
  color: string;
  params_total: string;
  params_total_num: number;
  params_active: string;
  architecture: string;
  experts_total: number;
  experts_active: number;
  experts_shared: number;
  layers: number;
  d_model: number;
  ffn_dim: number;
  heads_q: number;
  heads_kv: number;
  head_dim: number;
  kv_lora_rank: number;
  vocab_size: number;
  context_tokens: string;
  max_output_tokens: string;
  train_tokens: string;
  compute_flops: string;
  gpu_hours: string;
  precision: string;
  mtp_depth: number;
  reasoning_streams: number;
  throughput: string;
  latency_ttft: string;
  max_thinking: string;
  min_serving_hw: string;
  price_in: string;
  price_out: string;
  release: string;
  status: string;
}

export interface ResearchSection {
  id: number;
  slug: string;
  chapter: string;
  title: string;
  summary: string;
  icon: string;
  body: string;
  read_minutes: number;
}

export interface Benchmark {
  id: number;
  suite: string;
  category: string;
  detail: string;
  unit: string;
  lite: number;
  ultra: number;
  extreme: number;
  frontier_best: number;
}

export interface TrainingStage {
  id: number;
  stage_no: number;
  name: string;
  objective: string;
  tokens: string;
  duration: string;
  hardware: string;
  seq_len: string;
  lr: string;
  detail: string;
}

export interface RoadmapItem {
  id: number;
  period: string;
  title: string;
  body: string;
  status: string;
  track: string;
  highlights: string[];
}

export interface CompanyMetric {
  id: number;
  label: string;
  value: string;
  detail: string;
  group_name: string;
}

export interface Paper {
  id: number;
  code: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
  abstract: string;
  tags: string[];
}

export interface ResearchPayload {
  specs: ModelSpec[];
  sections: ResearchSection[];
  benchmarks: Benchmark[];
  training: TrainingStage[];
  roadmap: RoadmapItem[];
  metrics: CompanyMetric[];
  papers: Paper[];
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
