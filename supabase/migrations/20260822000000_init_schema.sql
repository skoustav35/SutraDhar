-- Schema for the Council app (derived from api/ usage: chats, messages, runs, api_keys)
create extension if not exists "pgcrypto";

-- ============ chats ============
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New Council',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ messages ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model_used text,
  council jsonb,
  created_at timestamptz not null default now()
);

-- ============ runs ============
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  mode text not null default 'trio',
  status text not null default 'solving',
  phase text not null default 'solving',
  note text not null default '',
  council jsonb not null default '[]'::jsonb,
  final text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ api_keys ============
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Default key',
  key text not null unique,
  revoked boolean not null default false,
  request_count bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ indexes ============
create index if not exists idx_chats_user_updated on public.chats (user_id, updated_at desc);
create index if not exists idx_messages_chat_created on public.messages (chat_id, created_at);
create index if not exists idx_runs_chat_created on public.runs (chat_id, created_at desc);
create index if not exists idx_api_keys_user on public.api_keys (user_id);
create unique index if not exists idx_api_keys_key_active on public.api_keys (key) where revoked = false;

-- ============ RLS ============
-- All table access goes through the /api functions using the service-role key
-- (bypasses RLS). The browser client is used for auth only. Owner-only RLS
-- policies are enabled as defense-in-depth.
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.runs enable row level security;
alter table public.api_keys enable row level security;

drop policy if exists "chats_owner_all" on public.chats;
create policy "chats_owner_all" on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages_owner_all" on public.messages;
create policy "messages_owner_all" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "runs_owner_all" on public.runs;
create policy "runs_owner_all" on public.runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "api_keys_owner_all" on public.api_keys;
create policy "api_keys_owner_all" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
