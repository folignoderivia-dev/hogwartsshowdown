import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let singleton: SupabaseClient | null = null

function normalizeUrl(raw: string): string {
  return raw.replace(/\/rest\/v1\/?$/i, "")
}

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton
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
    },
  })
  return singleton
}
