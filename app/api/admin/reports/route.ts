import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

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
    
    // Fetch reports from reports table
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
    
    if (error) {
      console.error("Error fetching reports:", error)
      return NextResponse.json({ reports: [] })
    }
    
    return NextResponse.json({ reports: data ?? [] })
  } catch (error) {
    console.error("Unexpected error in reports route:", error)
    return NextResponse.json({ reports: [] })
  }
}
