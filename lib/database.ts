import { getSupabaseClient } from "@/lib/supabase"

export const ELO_START = 500
export const ELO_WIN = 15
export const ELO_LOSS = 25

export interface DbUser {
  id: string
  email: string
  username: string
  elo: number
  createdAt?: string
}

interface ProfileRow {
  id: string
  username: string
  elo: number | null
  created_at?: string | null
}

function mapProfile(profile: ProfileRow, email: string): DbUser {
  return {
    id: profile.id,
    email,
    username: profile.username,
    elo: profile.elo ?? ELO_START,
    createdAt: profile.created_at ?? undefined,
  }
}

async function getProfileById(id: string): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from("profiles").select("id,username,elo,created_at").eq("id", id).maybeSingle()
  if (error) return null
  return data as ProfileRow | null
}

export async function getRankingTop(limit = 50): Promise<DbUser[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,elo,created_at")
    .order("elo", { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as ProfileRow[]).map((p) => ({
    id: p.id,
    email: "",
    username: p.username,
    elo: p.elo ?? ELO_START,
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
    .upsert({ id: userId, username: u, elo: ELO_START }, { onConflict: "id" })
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
      .upsert({ id: data.user.id, username: fallbackUsername, elo: ELO_START }, { onConflict: "id" })
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
  return { id: userId, email, username: profile.username, elo: nextElo, createdAt: profile.created_at ?? undefined }
}

export async function applyMatchElo(userId: string, outcome: "win" | "lose"): Promise<DbUser | null> {
  const delta = outcome === "win" ? ELO_WIN : -ELO_LOSS
  return updateUserElo(userId, delta)
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
