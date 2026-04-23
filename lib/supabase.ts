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
    },
  })
  return singleton
}
