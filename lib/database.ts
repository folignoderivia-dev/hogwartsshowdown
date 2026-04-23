/**
 * Camada de persistência mock para usuários e ELO.
 * Migrar para Supabase: substituir funções por chamadas `createClient()` + tabelas `profiles`, `rankings`.
 */

export const ELO_START = 500
export const ELO_WIN = 15
export const ELO_LOSS = 25

export interface DbUser {
  id: string
  email: string
  passwordHash: string
  username: string
  elo: number
  createdAt: string
}

const STORAGE_KEY = "hp-duel-mock-db-v1"

function loadStore(): { users: DbUser[] } {
  if (typeof window === "undefined") return { users: [...seedUsers] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { users: [...seedUsers] }
    const parsed = JSON.parse(raw) as { users: DbUser[] }
    if (!parsed?.users?.length) return { users: [...seedUsers] }
    return parsed
  } catch {
    return { users: [...seedUsers] }
  }
}

function saveStore(data: { users: DbUser[] }) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function hashPw(pw: string): string {
  let h = 0
  for (let i = 0; i < pw.length; i++) h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0
  return `mock:${h}:${pw.length}`
}

const seedUsers: DbUser[] = [
  {
    id: "seed-1",
    email: "demo@hogwarts.test",
    passwordHash: hashPw("demo123"),
    username: "BruxoDemo",
    elo: 520,
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-2",
    email: "rival@hogwarts.test",
    passwordHash: hashPw("rival123"),
    username: "RivalCorvinal",
    elo: 495,
    createdAt: new Date().toISOString(),
  },
]

export function listUsers(): DbUser[] {
  return loadStore().users
}

export function getRankingTop(limit = 50): DbUser[] {
  return [...listUsers()].sort((a, b) => b.elo - a.elo).slice(0, limit)
}

export function registerUser(email: string, password: string, username: string): { ok: true; user: DbUser } | { ok: false; error: string } {
  const store = loadStore()
  const e = email.trim().toLowerCase()
  const u = username.trim()
  if (!e || !password || !u) return { ok: false, error: "Preencha e-mail, senha e nome de usuário." }
  if (store.users.some((x) => x.email === e)) return { ok: false, error: "E-mail já cadastrado." }
  if (store.users.some((x) => x.username.toLowerCase() === u.toLowerCase())) return { ok: false, error: "Nome de usuário já em uso." }
  const user: DbUser = {
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    email: e,
    passwordHash: hashPw(password),
    username: u,
    elo: ELO_START,
    createdAt: new Date().toISOString(),
  }
  store.users.push(user)
  saveStore(store)
  return { ok: true, user }
}

export function loginUser(email: string, password: string): { ok: true; user: DbUser } | { ok: false; error: string } {
  const store = loadStore()
  const e = email.trim().toLowerCase()
  const u = store.users.find((x) => x.email === e)
  if (!u || u.passwordHash !== hashPw(password)) return { ok: false, error: "E-mail ou senha inválidos." }
  return { ok: true, user: u }
}

export function updateUserElo(userId: string, delta: number): DbUser | null {
  const store = loadStore()
  const idx = store.users.findIndex((x) => x.id === userId)
  if (idx < 0) return null
  const next = { ...store.users[idx], elo: Math.max(0, store.users[idx].elo + delta) }
  store.users[idx] = next
  saveStore(store)
  return next
}

export function applyMatchElo(userId: string, outcome: "win" | "lose"): DbUser | null {
  const delta = outcome === "win" ? ELO_WIN : -ELO_LOSS
  return updateUserElo(userId, delta)
}

const SESSION_KEY = "hp-duel-session-user-id"

export function setSessionUserId(userId: string | null) {
  if (typeof window === "undefined") return
  if (userId) localStorage.setItem(SESSION_KEY, userId)
  else localStorage.removeItem(SESSION_KEY)
}

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(SESSION_KEY)
}

export function getUserById(id: string): DbUser | undefined {
  return loadStore().users.find((u) => u.id === id)
}
