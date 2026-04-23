import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let singleton: SupabaseClient | null = null

function normalizeUrl(raw: string): string {
  return raw.replace(/\/rest\/v1\/?$/i, "")
}

function readSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!rawUrl || !anonKey) {
    throw new Error("Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.")
  }
  return { rawUrl, anonKey }
}

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton
  // Cliente Supabase é estritamente client-side para evitar inicialização prematura em SSR.
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() só pode ser chamado no navegador.")
  }
  const { rawUrl, anonKey } = readSupabaseEnv()
  singleton = createClient(normalizeUrl(rawUrl), anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      flowType: "pkce",
    },
    global: {
      headers: { "X-Client-Info": "duel-arena" },
    },
  })
  return singleton
}

/** Encerra sessão PKCE, zera singleton e remove tokens `sb-*` do localStorage (útil em mobile com canal instável). */
export async function clearSupabaseSessionAndResetClient(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    if (singleton) {
      await singleton.auth.signOut({ scope: "global" })
    }
  } catch (e) {
    console.warn("[Supabase] signOut:", e)
  } finally {
    singleton = null
    try {
      const toRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith("sb-") && k.includes("-auth-")) toRemove.push(k)
      }
      toRemove.forEach((k) => window.localStorage.removeItem(k))
    } catch {
      // ignore
    }
  }
}
