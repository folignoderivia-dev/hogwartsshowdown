import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

const PIX_MIN_CENTS = 1000  // R$ 10,00 em centavos

function addDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString()
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vazio */ }

  const supabase = getSupabaseClient()

  // ── Ativação manual pelo Admin (com autenticação de sessão) ─────────────────
  if (body.userId && body.days) {
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
    
    const userId = String(body.userId ?? "")
    const days   = Number(body.days ?? 30)
    if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 })
    const { error } = await supabase
      .from("profiles")
      .update({ is_vip: true, vip_expires: addDays(days) })
      .eq("id", userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: `VIP ativado por ${days} dias` })
  }

  // ── Webhook PIX (estrutura genérica — adaptar ao provedor real) ────────────
  // Provedores comuns enviam: { event, status, amount/valor, metadata.userId }
  const isPaid =
    body.event === "payment.confirmed" ||
    body.status === "paid" ||
    body.status === "approved"

  if (isPaid) {
    const rawAmount = body.amount ?? body.valor ?? 0
    const amountCents = Number(rawAmount)
    // Aceita valor em centavos (1000) ou em reais (10)
    const paid = amountCents >= PIX_MIN_CENTS || amountCents >= PIX_MIN_CENTS / 100
    if (!paid) return NextResponse.json({ error: "Valor insuficiente (mín R$ 10)" }, { status: 400 })

    const meta  = (body.metadata ?? body.meta ?? {}) as Record<string, unknown>
    const userId = String(meta.userId ?? body.userId ?? body.user_id ?? "")
    if (!userId) return NextResponse.json({ error: "userId ausente no payload" }, { status: 400 })

    const { error } = await supabase
      .from("profiles")
      .update({ is_vip: true, vip_expires: addDays(30) })
      .eq("id", userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    console.log(`[VIP] Ativado via webhook PIX — userId: ${userId}`)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, message: "Webhook recebido (sem ação)" })
}
