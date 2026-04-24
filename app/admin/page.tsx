"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface VipRequest {
  id: string
  user_id: string
  email: string
  proof_note: string
  status: string
  created_at: string
}

export default function AdminPage() {
  const [secret, setSecret] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [requests, setRequests] = useState<VipRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [approving, setApproving] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const fetchRequests = useCallback(async (s: string) => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/vip-requests?secret=${encodeURIComponent(s)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Erro ao buscar requests")
        return
      }
      setRequests(data.requests ?? [])
      setAuthenticated(true)
    } catch {
      setError("Falha de conexão")
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetchRequests(secret)
  }

  const handleApprove = async (req: VipRequest, days = 30) => {
    setApproving(req.user_id)
    try {
      const res = await fetch("/api/vip/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret: secret, userId: req.user_id, days }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback((prev) => ({ ...prev, [req.id]: `✓ VIP ativado por ${days} dias` }))
        // Atualizar status local
        setRequests((prev) =>
          prev.map((r) => (r.id === req.id ? { ...r, status: "approved" } : r))
        )
      } else {
        setFeedback((prev) => ({ ...prev, [req.id]: `✗ Erro: ${data.error}` }))
      }
    } catch {
      setFeedback((prev) => ({ ...prev, [req.id]: "✗ Falha de conexão" }))
    } finally {
      setApproving(null)
    }
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
        <div className="w-full max-w-sm rounded-xl border border-amber-800/40 bg-stone-900 p-8 shadow-2xl">
          <h1 className="mb-6 text-center text-2xl font-bold text-amber-300">
            🔒 Painel Admin
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-amber-400">Senha de Admin</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border border-amber-700/50 bg-stone-800 px-3 py-2 text-amber-100 placeholder:text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button
              type="submit"
              disabled={loading || !secret}
              className="w-full bg-amber-700 text-white hover:bg-amber-600"
            >
              {loading ? "Verificando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-300">👑 VIP Requests</h1>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-700 text-amber-400"
            onClick={() => fetchRequests(secret)}
            disabled={loading}
          >
            {loading ? "Carregando..." : "↻ Atualizar"}
          </Button>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-lg border border-amber-800/30 bg-stone-900 p-8 text-center text-amber-500">
            Nenhum pedido de VIP pendente.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="rounded-lg border border-amber-800/40 bg-stone-900 p-4"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-amber-200">{req.email}</p>
                    <p className="text-xs text-stone-400">User ID: {req.user_id}</p>
                    <p className="text-xs text-stone-500">
                      {new Date(req.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Badge
                    className={
                      req.status === "approved"
                        ? "border-green-700 bg-green-900/40 text-green-300"
                        : "border-amber-700 bg-amber-900/40 text-amber-300"
                    }
                  >
                    {req.status === "approved" ? "✓ Aprovado" : "⏳ Pendente"}
                  </Badge>
                </div>

                <div className="mb-3 rounded border border-stone-700 bg-stone-800 p-2 text-xs text-stone-300">
                  <p className="mb-1 text-stone-500">Comprovante/Nota:</p>
                  <p className="whitespace-pre-wrap">{req.proof_note || "(sem nota)"}</p>
                </div>

                {feedback[req.id] ? (
                  <p
                    className={`text-sm font-medium ${
                      feedback[req.id].startsWith("✓") ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {feedback[req.id]}
                  </p>
                ) : req.status !== "approved" ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-amber-700 text-white hover:bg-amber-600"
                      disabled={approving === req.user_id}
                      onClick={() => handleApprove(req, 30)}
                    >
                      {approving === req.user_id ? "Aprovando..." : "✓ Aprovar 30 dias"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-700 text-amber-400"
                      disabled={approving === req.user_id}
                      onClick={() => handleApprove(req, 7)}
                    >
                      7 dias
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
