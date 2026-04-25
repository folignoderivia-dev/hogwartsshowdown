import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"

const META_CONFIG_PATH = join(process.cwd(), "meta_config.json")

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* body vazio */ }
    
    const meta = Number(body.meta ?? 60)
    
    // Try to update in game_settings table
    const { error } = await supabase
      .from("game_settings")
      .update({ monthly_goal_value: meta })
      .eq("key", "monthly_goal")
    
    if (error) {
      console.error("Error updating meta global in DB:", error)
      // Fallback: save to local file
      try {
        const config = existsSync(META_CONFIG_PATH) 
          ? JSON.parse(readFileSync(META_CONFIG_PATH, "utf-8"))
          : {}
        config.monthly_goal = meta
        writeFileSync(META_CONFIG_PATH, JSON.stringify(config, null, 2))
        console.log("Meta saved to local file as fallback")
      } catch (fileError) {
        console.error("Error saving to local file:", fileError)
        return NextResponse.json({ error: "Erro ao atualizar meta" }, { status: 500 })
      }
    }
    
    return NextResponse.json({ ok: true, meta })
  } catch (error) {
    console.error("Unexpected error in update-meta:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Try to fetch from game_settings table
    const { data, error } = await supabase
      .from("game_settings")
      .select("monthly_goal_value")
      .eq("key", "monthly_goal")
      .maybeSingle()
    
    if (error || !data) {
      console.error("Error fetching meta global from DB:", error)
      // Fallback: read from local file
      try {
        if (existsSync(META_CONFIG_PATH)) {
          const config = JSON.parse(readFileSync(META_CONFIG_PATH, "utf-8"))
          return NextResponse.json({ meta: config.monthly_goal ?? 60 })
        }
      } catch (fileError) {
        console.error("Error reading local file:", fileError)
      }
      return NextResponse.json({ meta: 60 })
    }
    
    return NextResponse.json({ meta: data.monthly_goal_value ?? 60 })
  } catch (error) {
    console.error("Unexpected error in update-meta GET:", error)
    return NextResponse.json({ meta: 60 })
  }
}
