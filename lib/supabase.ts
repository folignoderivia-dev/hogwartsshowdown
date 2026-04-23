import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * SINGLETON ABSOLUTO — createClient é chamado no máximo UMA VEZ por processo de browser.
 * Jamais zere esta referência depois de criada: zerá-la dispara "Multiple GoTrueClient instances".
 */
let singleton: SupabaseClient | null = null

function normalizeUrl(raw: string): string {
  return raw.replace(/\/rest\/v1\/?$/i, "")
}

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() só pode ser chamado no navegador.")
  }
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!rawUrl || !anonKey) {
    throw new Error("Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.")
  }
  singleton = createClient(normalizeUrl(rawUrl), anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      flowType: "pkce",
    },
    global: {
      headers: { "X-Client-Info": "duel-arena" },
    },
  })
  return singleton
}

/**
 * Encerra a sessão PKCE e limpa tokens do localStorage.
 * NÃO destrói o singleton — isso evita "Multiple GoTrueClient instances".
 */
export async function clearSupabaseSessionAndResetClient(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    if (singleton) {
      await singleton.auth.signOut({ scope: "global" })
    }
  } catch (e) {
    console.warn("[Supabase] signOut:", e)
  }
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && (k.startsWith("sb-") && k.includes("-auth-"))) toRemove.push(k)
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    // ignore
  }
}
