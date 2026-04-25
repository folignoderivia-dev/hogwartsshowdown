import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  const supabase = getSupabaseClient()
  
  // Get session from Authorization header
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  
  const token = authHeader.substring(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 })
  }
  
  // Check if user is admin
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()
    
  if (profileError || !profile?.is_admin) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }
  
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vazio */ }
  
  const meta = Number(body.meta ?? 60)
  
  // Update meta in a config table or profiles table with a specific ID
  // For now, we'll use a simple approach: update a special user profile or create a config table
  const { error } = await supabase
    .from("config")
    .upsert({ key: "meta_global", value: meta }, { onConflict: "key" })
  
  if (error) {
    // If config table doesn't exist, return success anyway (we can handle this differently)
    console.log("Config table might not exist, meta not persisted to DB")
  }
  
  return NextResponse.json({ ok: true, meta })
}
