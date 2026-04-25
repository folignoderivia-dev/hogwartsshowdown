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
    
    // Get search query
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    
    // Fetch users from profiles table
    let query = supabase
      .from("profiles")
      .select("id, username, is_vip, is_admin, elo, vip_expires")
      .order("created_at", { ascending: false })
      .limit(100)
    
    if (search) {
      query = query.ilike("username", `%${search}%`)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error("Error fetching users:", error)
      return NextResponse.json({ users: [] })
    }
    
    return NextResponse.json({ users: data ?? [] })
  } catch (error) {
    console.error("Unexpected error in users route:", error)
    return NextResponse.json({ users: [] })
  }
}
