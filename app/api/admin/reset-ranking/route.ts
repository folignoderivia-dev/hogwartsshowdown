import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Reset all profiles ELO to 500 using .neq() to update all records
    const { error } = await supabase
      .from("profiles")
      .update({ elo: 500 })
      .neq("id", "00000000-0000-0000-0000-000000000000")
    
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
