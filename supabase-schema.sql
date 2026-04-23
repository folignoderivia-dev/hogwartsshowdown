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

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
on public.profiles for select
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create table if not exists public.matches (
  match_id text primary key default gen_random_uuid()::text,
  mode text not null check (mode in ('teste', '1v1', '2v2', 'ffa', 'ffa3')),
  status text not null check (status in ('waiting', 'in_progress', 'finished')),
  players_expected int not null,
  players_joined int not null,
  current_turn_owner text null,
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
alter table public.matches add column if not exists current_turn_owner text;
alter table public.matches add column if not exists p2_id text;
alter table public.matches add column if not exists p3_id text;
alter table public.matches add column if not exists p4_id text;
alter table public.matches add column if not exists p1_name text;
alter table public.matches add column if not exists p2_name text;
alter table public.matches add column if not exists p3_name text;
alter table public.matches add column if not exists p4_name text;
alter table public.matches drop constraint if exists matches_mode_check;
alter table public.matches add constraint matches_mode_check check (mode in ('teste', '1v1', '2v2', 'ffa', 'ffa3'));
alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check check (status in ('waiting', 'in_progress', 'finished'));
update public.matches set current_turn_owner = coalesce(current_turn_owner, p1_id) where current_turn_owner is null;

alter table public.matches enable row level security;

drop policy if exists "matches_rw_authenticated" on public.matches;
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

drop policy if exists "match_players_rw_authenticated" on public.match_players;
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
-- Migração legada: em versões antigas action_id era nome de feitiço e pode repetir.
-- Normaliza para um valor único por linha antes de criar índice único.
update public.match_actions
set action_id = action_id || ':' || id::text
where action_id is not null
  and action_id not like '%:%';
create unique index if not exists match_actions_action_id_uq on public.match_actions(action_id);

alter table public.match_actions enable row level security;

drop policy if exists "match_actions_rw_authenticated" on public.match_actions;
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

drop policy if exists "friends_select_owner" on public.friends;
create policy "friends_select_owner"
on public.friends for select
using (auth.uid() = owner_id);

drop policy if exists "friends_insert_owner" on public.friends;
create policy "friends_insert_owner"
on public.friends for insert
with check (auth.uid() = owner_id);

drop policy if exists "friends_delete_owner" on public.friends;
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

drop policy if exists "friend_messages_rw_participants" on public.friend_messages;
create policy "friend_messages_rw_participants"
on public.friend_messages for all
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);

create or replace function public.join_matchmaker(
  p_mode text,
  p_player_id text,
  p_player_name text
)
returns table (
  match_id text,
  mode text,
  status text,
  players_expected int,
  players_joined int,
  current_turn_owner text,
  p1_id text,
  p2_id text,
  p3_id text,
  p4_id text,
  p1_name text,
  p2_name text,
  p3_name text,
  p4_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int;
  v_match public.matches%rowtype;
begin
  if p_mode not in ('teste', '1v1', '2v2', 'ffa', 'ffa3') then
    raise exception 'Modo inválido: %', p_mode;
  end if;

  if p_player_id is null or length(trim(p_player_id)) = 0 then
    raise exception 'player_id inválido';
  end if;

  v_expected := case when p_mode in ('2v2', 'ffa') then 4 when p_mode = 'ffa3' then 3 else 2 end;

  -- Rejoin idempotente: se já está em sala ativa desse modo, apenas retorna.
  select m.*
    into v_match
  from public.matches m
  where m.mode = p_mode
    and m.status in ('waiting', 'in_progress')
    and (
      m.p1_id = p_player_id or
      m.p2_id = p_player_id or
      m.p3_id = p_player_id or
      m.p4_id = p_player_id
    )
  order by m.updated_at desc
  limit 1
  for update skip locked;

  if found then
    insert into public.match_players(match_id, player_id)
    values (v_match.match_id, p_player_id)
    on conflict (match_id, player_id) do nothing;

    return query
    select v_match.match_id, v_match.mode, v_match.status, v_match.players_expected, v_match.players_joined, v_match.current_turn_owner,
           v_match.p1_id, v_match.p2_id, v_match.p3_id, v_match.p4_id,
           v_match.p1_name, v_match.p2_name, v_match.p3_name, v_match.p4_name;
    return;
  end if;

  -- Busca sala waiting com vaga, lockando a linha para evitar corrida.
  select m.*
    into v_match
  from public.matches m
  where m.mode = p_mode
    and m.status = 'waiting'
    and m.players_joined < m.players_expected
    and coalesce(m.p1_id, '') <> p_player_id
    and coalesce(m.p2_id, '') <> p_player_id
    and coalesce(m.p3_id, '') <> p_player_id
    and coalesce(m.p4_id, '') <> p_player_id
  order by m.updated_at asc
  limit 1
  for update skip locked;

  if found then
    if v_match.p2_id is null then
      v_match.p2_id := p_player_id;
      v_match.p2_name := p_player_name;
    elsif v_match.p3_id is null then
      v_match.p3_id := p_player_id;
      v_match.p3_name := p_player_name;
    elsif v_match.p4_id is null then
      v_match.p4_id := p_player_id;
      v_match.p4_name := p_player_name;
    else
      v_match := null;
    end if;

    if v_match.match_id is not null then
      v_match.players_joined := least(v_match.players_expected, coalesce(v_match.players_joined, 0) + 1);
      v_match.status := case when v_match.players_joined >= v_match.players_expected then 'in_progress' else 'waiting' end;
      v_match.updated_at := now();

      update public.matches
      set players_joined = v_match.players_joined,
          status = v_match.status,
          current_turn_owner = coalesce(v_match.current_turn_owner, v_match.p1_id),
          p2_id = v_match.p2_id,
          p3_id = v_match.p3_id,
          p4_id = v_match.p4_id,
          p2_name = v_match.p2_name,
          p3_name = v_match.p3_name,
          p4_name = v_match.p4_name,
          updated_at = v_match.updated_at
      where match_id = v_match.match_id
      returning * into v_match;

      insert into public.match_players(match_id, player_id)
      values (v_match.match_id, p_player_id)
      on conflict (match_id, player_id) do nothing;

      return query
      select v_match.match_id, v_match.mode, v_match.status, v_match.players_expected, v_match.players_joined, v_match.current_turn_owner,
             v_match.p1_id, v_match.p2_id, v_match.p3_id, v_match.p4_id,
             v_match.p1_name, v_match.p2_name, v_match.p3_name, v_match.p4_name;
      return;
    end if;
  end if;

  -- Nenhuma waiting válida: cria nova sala.
  insert into public.matches(mode, status, players_expected, players_joined, current_turn_owner, p1_id, p1_name, updated_at)
  values (p_mode, 'waiting', v_expected, 1, p_player_id, p_player_id, p_player_name, now())
  returning * into v_match;

  insert into public.match_players(match_id, player_id)
  values (v_match.match_id, p_player_id)
  on conflict (match_id, player_id) do nothing;

  return query
  select v_match.match_id, v_match.mode, v_match.status, v_match.players_expected, v_match.players_joined, v_match.current_turn_owner,
         v_match.p1_id, v_match.p2_id, v_match.p3_id, v_match.p4_id,
         v_match.p1_name, v_match.p2_name, v_match.p3_name, v_match.p4_name;
end;
$$;

grant execute on function public.join_matchmaker(text, text, text) to authenticated;

create or replace function public.join_specific_room(
  p_match_id text,
  p_player_id text,
  p_player_name text
)
returns table (
  match_id text,
  mode text,
  status text,
  players_expected int,
  players_joined int,
  current_turn_owner text,
  p1_id text,
  p2_id text,
  p3_id text,
  p4_id text,
  p1_name text,
  p2_name text,
  p3_name text,
  p4_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  select m.* into v_match
  from public.matches m
  where m.match_id = p_match_id
  limit 1
  for update;

  if not found then
    raise exception 'Sala não encontrada';
  end if;

  if v_match.status <> 'waiting' then
    raise exception 'Sala não está disponível';
  end if;

  if v_match.p1_id = p_player_id or v_match.p2_id = p_player_id or v_match.p3_id = p_player_id or v_match.p4_id = p_player_id then
    insert into public.match_players(match_id, player_id)
    values (v_match.match_id, p_player_id)
    on conflict (match_id, player_id) do nothing;

    return query
    select v_match.match_id, v_match.mode, v_match.status, v_match.players_expected, v_match.players_joined, v_match.current_turn_owner,
           v_match.p1_id, v_match.p2_id, v_match.p3_id, v_match.p4_id,
           v_match.p1_name, v_match.p2_name, v_match.p3_name, v_match.p4_name;
    return;
  end if;

  if v_match.players_joined >= v_match.players_expected then
    raise exception 'Sala lotada';
  end if;

  if v_match.p2_id is null then
    v_match.p2_id := p_player_id;
    v_match.p2_name := p_player_name;
  elsif v_match.p3_id is null then
    v_match.p3_id := p_player_id;
    v_match.p3_name := p_player_name;
  elsif v_match.p4_id is null then
    v_match.p4_id := p_player_id;
    v_match.p4_name := p_player_name;
  else
    raise exception 'Sala lotada';
  end if;

  v_match.players_joined := least(v_match.players_expected, coalesce(v_match.players_joined, 0) + 1);
  v_match.status := case when v_match.players_joined >= v_match.players_expected then 'in_progress' else 'waiting' end;
  v_match.updated_at := now();

  update public.matches
  set players_joined = v_match.players_joined,
      status = v_match.status,
      current_turn_owner = coalesce(v_match.current_turn_owner, v_match.p1_id),
      p2_id = v_match.p2_id,
      p3_id = v_match.p3_id,
      p4_id = v_match.p4_id,
      p2_name = v_match.p2_name,
      p3_name = v_match.p3_name,
      p4_name = v_match.p4_name,
      updated_at = v_match.updated_at
  where match_id = v_match.match_id
  returning * into v_match;

  insert into public.match_players(match_id, player_id)
  values (v_match.match_id, p_player_id)
  on conflict (match_id, player_id) do nothing;

  return query
  select v_match.match_id, v_match.mode, v_match.status, v_match.players_expected, v_match.players_joined, v_match.current_turn_owner,
         v_match.p1_id, v_match.p2_id, v_match.p3_id, v_match.p4_id,
         v_match.p1_name, v_match.p2_name, v_match.p3_name, v_match.p4_name;
end;
$$;

grant execute on function public.join_specific_room(text, text, text) to authenticated;

create or replace function public.commit_match_action(
  p_match_id text,
  p_player_id text,
  p_action_id text,
  p_target_id text,
  p_timestamp_ms bigint,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  if p_match_id is null or p_player_id is null or p_action_id is null or p_payload is null then
    raise exception 'Parâmetros inválidos para commit_match_action';
  end if;

  select * into v_match
  from public.matches
  where match_id = p_match_id
  for update;

  if not found then
    raise exception 'Partida não encontrada';
  end if;

  if v_match.status not in ('waiting', 'in_progress') then
    return false;
  end if;

  if p_expected_owner is not null and v_match.current_turn_owner is distinct from p_expected_owner then
    return false;
  end if;

  if p_expected_owner is not null and p_player_id is distinct from v_match.current_turn_owner then
    return false;
  end if;

  insert into public.match_actions(match_id, player_id, action_id, target_id, timestamp_ms, payload)
  values (p_match_id, p_player_id, p_action_id, p_target_id, p_timestamp_ms, p_payload)
  on conflict (action_id) do nothing;

  return true;
end;
$$;

grant execute on function public.commit_match_action(text, text, text, text, bigint, jsonb) to authenticated;

-- Ready state para sincronizar início da batalha entre todos os participantes.
create table if not exists public.match_ready_states (
  match_id text not null references public.matches(match_id) on delete cascade,
  player_id text not null,
  is_ready boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table public.match_ready_states enable row level security;

drop policy if exists "match_ready_states_rw_authenticated" on public.match_ready_states;
create policy "match_ready_states_rw_authenticated"
on public.match_ready_states for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
