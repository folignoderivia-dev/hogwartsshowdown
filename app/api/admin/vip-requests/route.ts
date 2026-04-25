import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(req: NextRequest) {
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
  
  // Fetch VIP requests, return empty array if table doesn't exist
  const { data, error } = await supabase
    .from("vip_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    
  // If table doesn't exist, return empty array instead of error
  if (error) {
    if (error.code === "42P01") { // Table doesn't exist
      return NextResponse.json({ requests: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ requests: data ?? [] })
}
