"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSupabaseClient } from "@/lib/supabase"
import { Shield, Users, AlertTriangle, RefreshCw } from "lucide-react"

interface VipRequest {
  id: string
  user_id: string
  email: string
  proof_note: string
  status: string
  created_at: string
}

interface Report {
  id: string
  user_id: string
  email: string
  type: string
  description: string
  status: string
  created_at: string
}

interface UserProfile {
  id: string
  username: string
  email: string
  elo: number | null
  wins: number | null
  losses: number | null
  is_vip: boolean | null
  vip_expires: string | null
  is_admin: boolean | null
}

type AdminTab = "vip" | "users" | "reports" | "ranking"

export default function AdminPage() {
  const [secret, setSecret] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [requests, setRequests] = useState<VipRequest[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [approving, setApproving] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [checkingSession, setCheckingSession] = useState(true)
  const [adminSecret, setAdminSecret] = useState("")
  const [activeTab, setActiveTab] = useState<AdminTab>("vip")
  const [userSearch, setUserSearch] = useState("")
  const [resettingRanking, setResettingRanking] = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Sessão não encontrada")
        return
      }
      
      const res = await fetch("/api/admin/vip-requests", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
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

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Sessão não encontrada")
        return
      }
      
      const res = await fetch("/api/admin/reports", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Erro ao buscar denúncias")
        return
      }
      setReports(data.reports ?? [])
      setAuthenticated(true)
    } catch {
      setError("Falha de conexão")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async (search = "") => {
    setLoading(true)
    setError("")
    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Sessão não encontrada")
        return
      }
      
      const res = await fetch("/api/admin/users", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Erro ao buscar usuários")
        return
      }
      setUsers(data.users ?? [])
      setAuthenticated(true)
    } catch {
      setError("Falha de conexão")
    } finally {
      setLoading(false)
    }
  }, [])

  // Verifica se o usuário atual tem is_admin=true na sessão Supabase
  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        const supabase = getSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          const { data } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", session.user.id)
            .maybeSingle()
          if (data?.is_admin === true) {
            // Admin logado: buscar requests
            await fetchRequests()
          }
        }
      } catch {
        // Silencioso — pode não ter sessão
      } finally {
        setCheckingSession(false)
      }
    }
    checkAdminSession()
  }, [fetchRequests])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetchRequests()
  }

  const handleApprove = async (req: VipRequest, days = 30) => {
    setApproving(req.user_id)
    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setFeedback((prev) => ({ ...prev, [req.id]: "✗ Sessão não encontrada" }))
        return
      }
      
      const res = await fetch("/api/vip/grant", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: req.user_id, days }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback((prev) => ({ ...prev, [req.id]: `✓ VIP ativado por ${days} dias` }))
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

  const handleResetRanking = async () => {
    if (!confirm("Tem certeza que deseja resetar o ranking de todos os jogadores para 500? Esta ação não pode ser desfeita.")) {
      return
    }
    setResettingRanking(true)
    setError("")
    try {
      const res = await fetch("/api/admin/reset-ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret }),
      })
      const data = await res.json()
      if (res.ok) {
        alert("Ranking resetado com sucesso! Todos os jogadores agora têm 500 ELO.")
      } else {
        setError(data.error ?? "Erro ao resetar ranking")
      }
    } catch {
      setError("Falha de conexão")
    } finally {
      setResettingRanking(false)
    }
  }

  const handleToggleVip = async (userId: string, currentVip: boolean | null) => {
    try {
      const res = await fetch("/api/admin/toggle-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, userId, setVip: !currentVip }),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, is_vip: !currentVip, vip_expires: !currentVip ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null } : u
          )
        )
      } else {
        setError(data.error ?? "Erro ao alterar VIP")
      }
    } catch {
      setError("Falha de conexão")
    }
  }

  const handleToggleAdmin = async (userId: string, currentAdmin: boolean | null) => {
    try {
      const res = await fetch("/api/admin/toggle-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, userId, setAdmin: !currentAdmin }),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_admin: !currentAdmin } : u))
        )
      } else {
        setError(data.error ?? "Erro ao alterar Admin")
      }
    } catch {
      setError("Falha de conexão")
    }
  }

  const handleUpdateElo = async (userId: string, newElo: number) => {
    try {
      const res = await fetch("/api/admin/update-elo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, userId, elo: newElo }),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, elo: newElo } : u))
        )
      } else {
        setError(data.error ?? "Erro ao atualizar ELO")
      }
    } catch {
      setError("Falha de conexão")
    }
  }

  const handleResolveReport = async (reportId: string, status: "resolved" | "dismissed") => {
    try {
      const res = await fetch("/api/admin/resolve-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, reportId, status }),
      })
      const data = await res.json()
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status } : r))
        )
      } else {
        setError(data.error ?? "Erro ao resolver denúncia")
      }
    } catch {
      setError("Falha de conexão")
    }
  }

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab)
    if (tab === "vip" && authenticated) fetchRequests()
    if (tab === "reports" && authenticated) fetchReports()
    if (tab === "users" && authenticated) fetchUsers(userSearch)
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <p className="text-amber-400">Verificando sessão...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
        <div className="w-full max-w-sm rounded-xl border border-amber-800/40 bg-stone-900 p-8 shadow-2xl">
          <h1 className="mb-2 text-center text-2xl font-bold text-amber-300">🔒 Painel Admin</h1>
          <p className="mb-6 text-center text-xs text-stone-500">Hogwarts Showdown</p>
          {error && <p className="mb-4 text-xs text-red-400">{error}</p>}
          <p className="text-center text-xs text-stone-400">
            Faça login no jogo com uma conta Admin para acessar este painel.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-amber-300">� Painel Admin</h1>
            <p className="text-xs text-stone-500">Hogwarts Showdown</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-700 text-amber-400"
            onClick={() => {
              setAuthenticated(false)
              setSecret("")
            }}
          >
            Sair
          </Button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-amber-800/40 pb-2">
          <Button
            size="sm"
            variant={activeTab === "vip" ? "default" : "ghost"}
            className={activeTab === "vip" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => handleTabChange("vip")}
          >
            <Shield className="mr-2 h-4 w-4" />
            VIP Requests
          </Button>
          <Button
            size="sm"
            variant={activeTab === "users" ? "default" : "ghost"}
            className={activeTab === "users" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => handleTabChange("users")}
          >
            <Users className="mr-2 h-4 w-4" />
            Usuários
          </Button>
          <Button
            size="sm"
            variant={activeTab === "reports" ? "default" : "ghost"}
            className={activeTab === "reports" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => handleTabChange("reports")}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Denúncias
          </Button>
          <Button
            size="sm"
            variant={activeTab === "ranking" ? "default" : "ghost"}
            className={activeTab === "ranking" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => handleTabChange("ranking")}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Ranking
          </Button>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {/* VIP Requests Tab */}
        {activeTab === "vip" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-stone-500">{requests.length} pedido(s) encontrado(s)</p>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-700 text-amber-400"
                onClick={() => fetchRequests()}
                disabled={loading}
              >
                {loading ? "Carregando..." : "↻ Atualizar"}
              </Button>
            </div>

            {requests.length === 0 ? (
              <div className="rounded-lg border border-amber-800/30 bg-stone-900 p-8 text-center text-amber-500">
                Nenhum pedido de VIP encontrado.
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-800 text-green-400"
                          disabled={approving === req.user_id}
                          onClick={() => handleApprove(req, 365)}
                        >
                          1 ano
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <Card className="border-amber-800/40 bg-stone-900">
            <CardHeader>
              <CardTitle className="text-amber-300">Gerenciar Usuários</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchUsers(userSearch)}
                  className="border-amber-700 bg-stone-800 text-amber-100 placeholder:text-amber-700"
                />
                <Button
                  onClick={() => fetchUsers(userSearch)}
                  disabled={loading}
                  className="bg-amber-700 text-white hover:bg-amber-600"
                >
                  Buscar
                </Button>
              </div>

              {users.length === 0 ? (
                <p className="py-4 text-center text-sm text-amber-500">
                  {userSearch ? "Nenhum usuário encontrado." : "Digite para buscar usuários."}
                </p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {users.map((user) => (
                    <div key={user.id} className="rounded border border-amber-800/30 bg-stone-800 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-amber-200">{user.username || "Sem nome"}</p>
                          <p className="text-xs text-stone-400">{user.email}</p>
                          <p className="text-xs text-stone-500">
                            ELO: {user.elo ?? 500} · V: {user.wins ?? 0} · D: {user.losses ?? 0}
                          </p>
                          <div className="mt-1 flex gap-2">
                            <Badge className={user.is_vip ? "border-yellow-600 bg-yellow-900/40 text-yellow-300" : "border-stone-600 bg-stone-700 text-stone-400"}>
                              {user.is_vip ? "👑 VIP" : "Normal"}
                            </Badge>
                            <Badge className={user.is_admin ? "border-red-600 bg-red-900/40 text-red-300" : "border-stone-600 bg-stone-700 text-stone-400"}>
                              {user.is_admin ? "🔒 Admin" : "Usuário"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-yellow-700 text-yellow-400 text-xs"
                            onClick={() => handleToggleVip(user.id, user.is_vip)}
                          >
                            {user.is_vip ? "Remover VIP" : "Dar VIP"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-700 text-red-400 text-xs"
                            onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                          >
                            {user.is_admin ? "Remover Admin" : "Tornar Admin"}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Novo ELO"
                          defaultValue={user.elo ?? 500}
                          className="h-7 w-24 border-amber-700 bg-stone-700 text-amber-100 text-xs"
                          id={`elo-${user.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-700 text-amber-400 text-xs h-7"
                          onClick={() => {
                            const input = document.getElementById(`elo-${user.id}`) as HTMLInputElement
                            const newElo = parseInt(input.value)
                            if (!isNaN(newElo)) handleUpdateElo(user.id, newElo)
                          }}
                        >
                          Atualizar ELO
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-stone-500">{reports.length} denúncia(s) encontrada(s)</p>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-700 text-amber-400"
                onClick={() => fetchReports()}
                disabled={loading}
              >
                {loading ? "Carregando..." : "↻ Atualizar"}
              </Button>
            </div>

            {reports.length === 0 ? (
              <div className="rounded-lg border border-amber-800/30 bg-stone-900 p-8 text-center text-amber-500">
                Nenhuma denúncia encontrada.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="rounded-lg border border-amber-800/40 bg-stone-900 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-amber-200">{report.email}</p>
                        <p className="text-xs text-stone-400">User ID: {report.user_id}</p>
                        <p className="text-xs text-stone-500">
                          {new Date(report.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <Badge
                        className={
                          report.status === "resolved"
                            ? "border-green-700 bg-green-900/40 text-green-300"
                            : report.status === "dismissed"
                              ? "border-stone-600 bg-stone-700 text-stone-400"
                              : "border-amber-700 bg-amber-900/40 text-amber-300"
                        }
                      >
                        {report.status === "resolved" ? "✓ Resolvida" : report.status === "dismissed" ? "✕ Ignorada" : "⏳ Pendente"}
                      </Badge>
                    </div>

                    <div className="mb-2">
                      <p className="text-xs text-stone-500">Tipo:</p>
                      <p className="text-sm text-amber-200">{report.type}</p>
                    </div>

                    <div className="mb-3 rounded border border-stone-700 bg-stone-800 p-2 text-xs text-stone-300">
                      <p className="mb-1 text-stone-500">Descrição:</p>
                      <p className="whitespace-pre-wrap">{report.description}</p>
                    </div>

                    {report.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-700 text-white hover:bg-green-600"
                          onClick={() => handleResolveReport(report.id, "resolved")}
                        >
                          ✓ Resolver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-stone-600 text-stone-400"
                          onClick={() => handleResolveReport(report.id, "dismissed")}
                        >
                          ✕ Ignorar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Ranking Tab */}
        {activeTab === "ranking" && (
          <Card className="border-amber-800/40 bg-stone-900">
            <CardHeader>
              <CardTitle className="text-amber-300">Resetar Ranking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-stone-400">
                Esta ação definirá o ELO de todos os jogadores para 500. Esta ação é irreversível.
              </p>
              <Button
                onClick={handleResetRanking}
                disabled={resettingRanking}
                className="bg-red-700 text-white hover:bg-red-600"
              >
                {resettingRanking ? "Resetando..." : "⚠️ Resetar Ranking para 500"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
