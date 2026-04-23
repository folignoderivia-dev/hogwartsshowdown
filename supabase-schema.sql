-- Execute no SQL Editor do Supabase para habilitar login/ranking/match online.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  elo int not null default 500,
  wins int not null default 0,
  losses int not null default 0,
  favorite_spell text null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles add column if not exists wins int not null default 0;
alter table public.profiles add column if not exists losses int not null default 0;
alter table public.profiles add column if not exists favorite_spell text null;

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
  match_id text primary key default gen_random_uuid()::text,
  mode text not null check (mode in ('teste', '1v1', '2v2', 'ffa')),
  status text not null check (status in ('waiting', 'in_progress', 'finished')),
  players_expected int not null,
  players_joined int not null,
  p1_id text null,
  p2_id text null,
  p3_id text null,
  p4_id text null,
  p1_name text null,
  p2_name text null,
  p3_name text null,
  p4_name text null,
  updated_at timestamptz not null default now()
);

alter table public.matches add column if not exists mode text;
alter table public.matches alter column match_id set default gen_random_uuid()::text;
alter table public.matches add column if not exists p1_id text;
alter table public.matches add column if not exists p2_id text;
alter table public.matches add column if not exists p3_id text;
alter table public.matches add column if not exists p4_id text;
alter table public.matches add column if not exists p1_name text;
alter table public.matches add column if not exists p2_name text;
alter table public.matches add column if not exists p3_name text;
alter table public.matches add column if not exists p4_name text;
alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check check (status in ('waiting', 'in_progress', 'finished'));

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

create table if not exists public.friends (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  constraint friends_not_self check (owner_id <> friend_id)
);

alter table public.friends enable row level security;

create policy "friends_select_owner"
on public.friends for select
using (auth.uid() = owner_id);

create policy "friends_insert_owner"
on public.friends for insert
with check (auth.uid() = owner_id);

create policy "friends_delete_owner"
on public.friends for delete
using (auth.uid() = owner_id);

create table if not exists public.friend_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 500),
  created_at timestamptz not null default now()
);

alter table public.friend_messages enable row level security;

create policy "friend_messages_rw_participants"
on public.friend_messages for all
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);
