import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data, error } = await supabase
      .from("reports")
      .select("id, reporter_id, target_id, reason, description, status")
      .order("created_at", { ascending: false })
      .limit(100)
    
    if (error) {
      console.error("Error fetching reports:", error)
      console.error("Supabase error details:", JSON.stringify(error, null, 2))
      return NextResponse.json({ error: "Erro ao ler reports" }, { status: 500 })
    }
    
    return NextResponse.json({ reports: data ?? [] })
  } catch (error) {
    console.error("Unexpected error in reports route:", error)
    return NextResponse.json({ error: "Erro ao ler reports" }, { status: 500 })
  }
}
