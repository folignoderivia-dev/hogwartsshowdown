import { getSupabaseClient } from "@/lib/supabase"

export const ELO_START = 500
export const ELO_WIN = 20      // 1v1 e 2v2 vitória
export const ELO_LOSS = 25     // 1v1 e 2v2 derrota
export const ELO_WIN_FFA = 25  // FFA sobrevivente
export const ELO_LOSS_FFA = 0  // FFA morto (sem penalidade)

export interface DbUser {
  id: string
  email: string
  username: string
  elo: number
  wins?: number
  losses?: number
  favoriteSpell?: string | null
  createdAt?: string
}

interface ProfileRow {
  id: string
  username: string
  elo: number | null
  wins?: number | null
  losses?: number | null
  favorite_spell?: string | null
  created_at?: string | null
}

function mapProfile(profile: ProfileRow, email: string): DbUser {
  return {
    id: profile.id,
    email,
    username: profile.username,
    elo: profile.elo ?? ELO_START,
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    favoriteSpell: profile.favorite_spell ?? null,
    createdAt: profile.created_at ?? undefined,
  }
}

async function getProfileById(id: string): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,elo,wins,losses,favorite_spell,created_at")
    .eq("id", id)
    .maybeSingle()
  if (error) return null
  return data as ProfileRow | null
}

export async function getRankingTop(limit = 50): Promise<DbUser[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,elo,wins,losses,favorite_spell,created_at")
    .order("elo", { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as ProfileRow[]).map((p) => ({
    id: p.id,
    email: "",
    username: p.username,
    elo: p.elo ?? ELO_START,
    wins: p.wins ?? 0,
    losses: p.losses ?? 0,
    favoriteSpell: p.favorite_spell ?? null,
    createdAt: p.created_at ?? undefined,
  }))
}

export async function registerUser(
  email: string,
  password: string,
  username: string
): Promise<{ ok: true; user: DbUser } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase()
  const u = username.trim()
  if (!e || !password || !u) return { ok: false, error: "Preencha e-mail, senha e nome de usuário." }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.signUp({ email: e, password })
  if (error || !data.user) return { ok: false, error: error?.message || "Falha no registro." }

  const userId = data.user.id
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({ id: userId, username: u, elo: ELO_START, wins: 0, losses: 0, favorite_spell: null }, { onConflict: "id" })
  if (profileErr) return { ok: false, error: profileErr.message }

  return {
    ok: true,
    user: {
      id: userId,
      email: e,
      username: u,
      elo: ELO_START,
      createdAt: new Date().toISOString(),
    },
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ ok: true; user: DbUser } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase()
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: e, password })
  if (error || !data.user) return { ok: false, error: "E-mail ou senha inválidos." }

  const profile = await getProfileById(data.user.id)
  if (!profile) {
    const fallbackUsername = e.split("@")[0] || "Bruxo"
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: data.user.id, username: fallbackUsername, elo: ELO_START, wins: 0, losses: 0, favorite_spell: null }, { onConflict: "id" })
    if (profileErr) return { ok: false, error: profileErr.message }
    return {
      ok: true,
      user: { id: data.user.id, email: e, username: fallbackUsername, elo: ELO_START, createdAt: new Date().toISOString() },
    }
  }

  return { ok: true, user: mapProfile(profile, e) }
}

export async function signOutUser(): Promise<void> {
  const supabase = getSupabaseClient()
  await supabase.auth.signOut()
}

export async function updateUserElo(userId: string, delta: number): Promise<DbUser | null> {
  const supabase = getSupabaseClient()
  const profile = await getProfileById(userId)
  if (!profile) return null
  const nextElo = Math.max(0, (profile.elo ?? ELO_START) + delta)
  const { error } = await supabase.from("profiles").update({ elo: nextElo }).eq("id", userId)
  if (error) return null
  const session = await supabase.auth.getSession()
  const email = session.data.session?.user?.email || ""
  return {
    id: userId,
    email,
    username: profile.username,
    elo: nextElo,
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    favoriteSpell: profile.favorite_spell ?? null,
    createdAt: profile.created_at ?? undefined,
  }
}

export async function applyMatchElo(userId: string, outcome: "win" | "lose", mode?: string): Promise<DbUser | null> {
  const isFfa = mode === "ffa" || mode === "ffa3"
  const winDelta = isFfa ? ELO_WIN_FFA : ELO_WIN
  const lossDelta = isFfa ? ELO_LOSS_FFA : ELO_LOSS
  const delta = outcome === "win" ? winDelta : -lossDelta
  const supabase = getSupabaseClient()
  const profile = await getProfileById(userId)
  if (!profile) return null

  const nextElo = Math.max(ELO_START, (profile.elo ?? ELO_START) + delta)
  const nextWins = (profile.wins ?? 0) + (outcome === "win" ? 1 : 0)
  const nextLosses = (profile.losses ?? 0) + (outcome === "lose" ? 1 : 0)

  // Melhor esforço para descobrir o feitiço mais usado pelo usuário via histórico de ações.
  const { data: spellRows } = await supabase
    .from("match_actions")
    .select("action_id")
    .eq("player_id", userId)
    .limit(1000)
  const counts: Record<string, number> = {}
  for (const row of spellRows || []) {
    const spell = String((row as any).action_id || "")
    if (!spell) continue
    counts[spell] = (counts[spell] || 0) + 1
  }
  const favoriteSpell = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? profile.favorite_spell ?? null

  const { error } = await supabase
    .from("profiles")
    .update({ elo: nextElo, wins: nextWins, losses: nextLosses, favorite_spell: favoriteSpell })
    .eq("id", userId)
  if (error) return null

  const session = await supabase.auth.getSession()
  const email = session.data.session?.user?.email || ""
  return {
    id: userId,
    email,
    username: profile.username,
    elo: nextElo,
    wins: nextWins,
    losses: nextLosses,
    favoriteSpell,
    createdAt: profile.created_at ?? undefined,
  }
}

export async function setSessionUserId(_userId: string | null): Promise<void> {
  // Compatibilidade com chamadas antigas: sessão agora é gerenciada pelo Supabase Auth.
}

export async function getSessionUserId(): Promise<string | null> {
  const supabase = getSupabaseClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

export async function getUserById(id: string): Promise<DbUser | undefined> {
  const supabase = getSupabaseClient()
  const profile = await getProfileById(id)
  if (!profile) return undefined
  const session = await supabase.auth.getSession()
  const email = session.data.session?.user?.id === id ? session.data.session.user.email || "" : ""
  return mapProfile(profile, email)
}

export interface FriendProfile {
  id: string
  username: string
  wins: number
  losses: number
  favoriteSpell: string | null
}

export interface FriendMessage {
  id: number
  senderId: string
  receiverId: string
  content: string
  createdAt: string
}

export async function addFriendByUsername(ownerId: string, friendUsername: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseClient()
  const normalized = friendUsername.trim()
  if (!normalized) return { ok: false, error: "Informe um nome de usuário válido." }

  const { data: friendRow, error: friendErr } = await supabase
    .from("profiles")
    .select("id,username")
    .eq("username", normalized)
    .maybeSingle()
  if (friendErr || !friendRow) return { ok: false, error: "Bruxo não encontrado." }
  if (friendRow.id === ownerId) return { ok: false, error: "Você não pode adicionar a si mesmo." }

  const { error } = await supabase
    .from("friends")
    .upsert({ owner_id: ownerId, friend_id: friendRow.id }, { onConflict: "owner_id,friend_id" })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getFriendsWithStats(ownerId: string): Promise<FriendProfile[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("friends")
    .select("friend_id, profiles!friends_friend_id_fkey(id,username,wins,losses,favorite_spell)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return (data as any[])
    .map((row) => row.profiles)
    .filter(Boolean)
    .map((p: any) => ({
      id: p.id,
      username: p.username,
      wins: p.wins ?? 0,
      losses: p.losses ?? 0,
      favoriteSpell: p.favorite_spell ?? null,
    }))
}

export async function removeFriend(ownerId: string, friendId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from("friends").delete().eq("owner_id", ownerId).eq("friend_id", friendId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function searchUsersByUsername(term: string, limit = 8): Promise<FriendProfile[]> {
  const supabase = getSupabaseClient()
  const normalized = term.trim()
  if (normalized.length < 2) return []
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,wins,losses,favorite_spell")
    .ilike("username", `%${normalized}%`)
    .order("username", { ascending: true })
    .limit(limit)
  if (error || !data) return []
  return (data as any[]).map((p) => ({
    id: p.id,
    username: p.username,
    wins: p.wins ?? 0,
    losses: p.losses ?? 0,
    favoriteSpell: p.favorite_spell ?? null,
  }))
}

export async function sendFriendMessage(senderId: string, receiverId: string, content: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseClient()
  const text = content.trim()
  if (!text) return { ok: false, error: "Mensagem vazia." }
  const { error } = await supabase.from("friend_messages").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: text,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getFriendMessages(userId: string, friendId: string): Promise<FriendMessage[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("friend_messages")
    .select("id,sender_id,receiver_id,content,created_at")
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`)
    .order("created_at", { ascending: true })
    .limit(100)
  if (error || !data) return []
  return (data as any[]).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    receiverId: m.receiver_id,
    content: m.content,
    createdAt: m.created_at,
  }))
}

/**
 * Insere um relatório de bug/denúncia na tabela `reports`.
 * Estrutura mínima esperada:
 *   id uuid PK default gen_random_uuid()
 *   reporter_id text
 *   match_id text
 *   message text
 *   created_at timestamptz default now()
 */
export async function submitReport(reporterId: string, matchId: string | null, message: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from("reports").insert({
    reporter_id: reporterId,
    match_id: matchId,
    message,
    created_at: new Date().toISOString(),
  })
  return !error
}

export async function saveMatchHistory(data: {
  matchId: string
  gameMode: string
  winnerNames: string[]
  loserNames: string[]
}): Promise<void> {
  const supabase = getSupabaseClient()
  await supabase.from("match_history").upsert(
    {
      match_id: data.matchId,
      game_mode: data.gameMode,
      winner_names: data.winnerNames,
      loser_names: data.loserNames,
      finished_at: new Date().toISOString(),
    },
    { onConflict: "match_id" }
  )
}

export async function getRecentMatchHistory(limit = 5): Promise<
  Array<{ matchId: string; gameMode: string; winnerNames: string[]; loserNames: string[]; finishedAt: string }>
> {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from("match_history")
    .select("match_id, game_mode, winner_names, loser_names, finished_at")
    .order("finished_at", { ascending: false })
    .limit(limit)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    matchId: String(r.match_id ?? ""),
    gameMode: String(r.game_mode ?? "1v1"),
    winnerNames: (r.winner_names as string[]) ?? [],
    loserNames: (r.loser_names as string[]) ?? [],
    finishedAt: String(r.finished_at ?? ""),
  }))
}
