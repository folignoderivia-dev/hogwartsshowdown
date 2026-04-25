import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  try {
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
    
    // Update meta in game_settings table
    const { error } = await supabase
      .from("game_settings")
      .upsert({ key: "monthly_goal", value: meta }, { onConflict: "key" })
    
    if (error) {
      console.error("Error updating meta global:", error)
      return NextResponse.json({ error: "Erro ao atualizar meta" }, { status: 500 })
    }
    
    return NextResponse.json({ ok: true, meta })
  } catch (error) {
    console.error("Unexpected error in update-meta:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
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
    
    // Fetch current meta from game_settings
    const { data, error } = await supabase
      .from("game_settings")
      .select("value")
      .eq("key", "monthly_goal")
      .maybeSingle()
    
    if (error) {
      console.error("Error fetching meta global:", error)
      return NextResponse.json({ meta: 60 }) // Return default on error
    }
    
    return NextResponse.json({ meta: data?.value ?? 60 })
  } catch (error) {
    console.error("Unexpected error in update-meta GET:", error)
    return NextResponse.json({ meta: 60 }) // Return default on error
  }
}
