import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data, error } = await supabase
      .from("vip_requests")
      .select("id, user_id, email, proof_note, status")
      .order("created_at", { ascending: false })
      .limit(100)
    
    if (error) {
      console.error("Error fetching vip_requests:", error)
      return NextResponse.json({ error: "Erro ao ler vip_requests" }, { status: 500 })
    }
    
    return NextResponse.json({ requests: data ?? [] })
  } catch (error) {
    console.error("Unexpected error in vip-requests route:", error)
    return NextResponse.json({ error: "Erro ao ler vip_requests" }, { status: 500 })
  }
}
