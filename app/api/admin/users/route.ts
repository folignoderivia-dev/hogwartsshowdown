import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, elo, is_vip, is_admin, offline_wins")
      .order("created_at", { ascending: false })
      .limit(100)
    
    if (error) {
      console.error("Error fetching profiles:", error)
      return NextResponse.json({ error: "Erro ao ler profiles" }, { status: 500 })
    }
    
    return NextResponse.json({ users: data ?? [] })
  } catch (error) {
    console.error("Unexpected error in users route:", error)
    return NextResponse.json({ error: "Erro ao ler profiles" }, { status: 500 })
  }
}
