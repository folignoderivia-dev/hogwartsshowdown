-- Execute no SQL Editor do Supabase para habilitar login/ranking/match online.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  elo int not null default 500,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_all"
on public.profiles for select
using (true);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create table if not exists public.matches (
  match_id text primary key,
  mode text not null check (mode in ('teste', '1v1', '2v2', 'ffa')),
  status text not null check (status in ('pending', 'running', 'finished')),
  players_expected int not null,
  players_joined int not null,
  updated_at timestamptz not null default now()
);

alter table public.matches add column if not exists mode text;

alter table public.matches enable row level security;

create policy "matches_rw_authenticated"
on public.matches for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create table if not exists public.match_players (
  match_id text not null references public.matches(match_id) on delete cascade,
  player_id text not null,
  joined_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table public.match_players enable row level security;

create policy "match_players_rw_authenticated"
on public.match_players for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create table if not exists public.match_actions (
  id bigint generated always as identity primary key,
  match_id text not null references public.matches(match_id) on delete cascade,
  player_id text not null,
  action_id text not null,
  target_id text null,
  timestamp_ms bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.match_actions enable row level security;

create policy "match_actions_rw_authenticated"
on public.match_actions for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
