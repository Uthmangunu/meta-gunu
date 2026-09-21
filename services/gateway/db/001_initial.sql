create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key,
  created_at timestamptz not null default now()
);

insert into app_users (id) values ('00000000-0000-4000-8000-000000000001') on conflict do nothing;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  title text,
  is_private boolean not null default false,
  provider_conversation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  fact text not null,
  source_conversation_id uuid references conversations(id) on delete set null,
  source_message_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists memories_active_user_idx on memories (user_id, updated_at desc) where deleted_at is null;

create table if not exists devices (
  id text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  kind text not null check (kind in ('iphone', 'glasses', 'laptop')),
  display_name text not null,
  public_key text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  conversation_id uuid not null,
  idempotency_key text not null,
  kind text not null check (kind in ('research', 'laptop')),
  prompt text not null,
  workspace text,
  status text not null,
  codex_thread_id text,
  codex_turn_id text,
  result text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  provider_request_id text not null,
  summary text not null,
  status text not null check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (task_id, provider_request_id)
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  category text not null,
  quantity numeric not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  provider_event_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists usage_provider_event_idx
  on usage_events(provider, provider_event_id) where provider_event_id is not null;
