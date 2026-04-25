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
    
    // Reset all profiles ELO to 500
    const { error } = await supabase
      .from("profiles")
      .update({ elo: 500 })
      .neq("id", "")  // Update all records
    
    if (error) {
      console.error("Error resetting ranking:", error)
      return NextResponse.json({ error: "Erro ao resetar ranking" }, { status: 500 })
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Unexpected error in reset-ranking:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
