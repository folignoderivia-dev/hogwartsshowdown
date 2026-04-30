"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Users, AlertTriangle, RefreshCw, TrendingUp, Bug } from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase"
import { updateServerMeta, getServerMeta } from "@/lib/database"
import type { SupabaseClient } from "@supabase/supabase-js"
import AdminBalancePanel from "@/components/admin-balance-panel"
import AdminErrorPanel from "@/components/admin-error-panel"

interface UserProfile {
  id: string
  username: string
  elo: number | null
  is_vip: boolean | null
  is_admin: boolean | null
  offline_wins: number | null
}

interface Report {
  id: string
  reporter_id: string
  target_id: string
  reason: string
  description: string
  status: string
  created_at: string
}

interface VipRequest {
  id: string
  user_id: string
  email: string
  proof_note: string
  status: string
  created_at: string
}

type AdminTab = "users" | "reports" | "vip_requests" | "ranking" | "meta_balance" | "errors"

export default function AdminPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [vipRequests, setVipRequests] = useState<VipRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [checkingSession, setCheckingSession] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab>("users")
  const [userSearch, setUserSearch] = useState("")
  const [resettingRanking, setResettingRanking] = useState(false)
  const [arrecadado, setArrecadado] = useState(0)
  const [metaObjetivo, setMetaObjetivo] = useState(60)
  const [showMeta, setShowMeta] = useState(true)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSupabase(getSupabaseClient())
    }
  }, [])

  const fetchUserProfile = useCallback(async () => {
    if (!supabase) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("profiles")
        .select("id, username, elo, is_vip, is_admin, offline_wins")
        .eq("id", user.id)
        .maybeSingle()

      if (data) setUserProfile(data)
    } catch {
      setCheckingSession(false)
    }
  }, [supabase])

  const fetchUsers = useCallback(async (search = "") => {
    if (!supabase) return
    setLoading(true)
    setError("")
    try {
      let query = supabase
        .from("profiles")
        .select("id, username, elo, is_vip, is_admin, offline_wins")
        .order("created_at", { ascending: false })
        .limit(100)

      if (search) {
        query = query.ilike("username", `%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setUsers(data ?? [])
    } catch (err) {
      setError("Erro ao buscar usuários")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchServerMeta = useCallback(async () => {
    const meta = await getServerMeta()
    setArrecadado(meta.arrecadado)
    setMetaObjetivo(meta.meta_objetivo)
    setShowMeta(meta.showMeta)
  }, [])

  const handleUpdateServerMeta = async () => {
    const success = await updateServerMeta(arrecadado, showMeta)
    if (success) {
      alert("Meta de doações atualizada com sucesso!")
    } else {
      setError("Erro ao atualizar meta de doações")
    }
  }

  const handleResetRanking = async () => {
    if (!supabase) return
    if (!confirm("Tem certeza que deseja resetar o ranking de todos os jogadores para 500? Esta ação não pode ser desfeita.")) {
      return
    }
    setResettingRanking(true)
    setError("")
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ elo: 500 })
        .neq("id", "00000000-0000-0000-0000-000000000000")

      if (error) throw error
      alert("Ranking resetado com sucesso! Todos os jogadores agora têm 500 ELO.")
      await fetchUsers()
    } catch {
      setError("Erro ao resetar ranking")
    } finally {
      setResettingRanking(false)
    }
  }

  const handleToggleVip = async (userId: string, currentVip: boolean | null) => {
    if (!supabase) return
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          is_vip: !currentVip,
          vip_expires: !currentVip ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null
        })
        .eq("id", userId)

      if (error) throw error
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_vip: !currentVip } : u
        )
      )
    } catch {
      setError("Erro ao alterar VIP")
    }
  }

  const handleToggleAdmin = async (userId: string, currentAdmin: boolean | null) => {
    if (!supabase) return
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_admin: !currentAdmin })
        .eq("id", userId)

      if (error) throw error
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_admin: !currentAdmin } : u))
      )
    } catch {
      setError("Erro ao alterar Admin")
    }
  }

  const handleUpdateElo = async (userId: string, newElo: number) => {
    if (!supabase) return
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ elo: newElo })
        .eq("id", userId)

      if (error) throw error
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, elo: newElo } : u))
      )
    } catch {
      setError("Erro ao atualizar ELO")
    }
  }

  const handleBanUser = async (userId: string, username: string) => {
    if (!supabase) return
    if (!confirm(`Tem certeza que deseja banir permanentemente o usuário "${username}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId)

      if (error) throw error
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      alert("Usuário banido com sucesso!")
    } catch {
      setError("Erro ao banir usuário")
    }
  }

  const fetchReports = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError("")
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setReports(data ?? [])
    } catch {
      setError("Erro ao buscar denúncias")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const handleResolveReport = async (reportId: string) => {
    if (!supabase) return
    try {
      const { error } = await supabase
        .from("reports")
        .update({ status: "closed" })
        .eq("id", reportId)

      if (error) throw error
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: "closed" } : r)))
    } catch {
      setError("Erro ao resolver denúncia")
    }
  }

  const fetchVipRequests = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError("")
    try {
      const { data, error } = await supabase
        .from("vip_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setVipRequests(data ?? [])
    } catch {
      setError("Erro ao buscar solicitações VIP")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const handleApproveVip = async (requestId: string, userId: string) => {
    if (!supabase) return
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ 
          is_vip: true,
          vip_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq("id", userId)

      if (profileError) throw profileError

      const { error: requestError } = await supabase
        .from("vip_requests")
        .update({ status: "approved" })
        .eq("id", requestId)

      if (requestError) throw requestError

      setVipRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "approved" } : r)))
      alert("VIP aprovado com sucesso!")
    } catch {
      setError("Erro ao aprovar VIP")
    }
  }

  useEffect(() => {
    if (supabase) {
      const init = async () => {
        await fetchUserProfile()
        await fetchServerMeta()
        setCheckingSession(false)
      }
      init()
    }
  }, [fetchUserProfile, fetchServerMeta, supabase])

  useEffect(() => {
    if (userProfile?.is_admin && supabase) {
      fetchUsers()
      if (activeTab === "reports") fetchReports()
      if (activeTab === "vip_requests") fetchVipRequests()
    }
  }, [userProfile, activeTab, fetchUsers, fetchReports, fetchVipRequests, supabase])

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <p className="text-amber-400">Verificando sessão...</p>
      </div>
    )
  }

  if (!userProfile?.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
        <div className="w-full max-w-sm rounded-xl border border-amber-800/40 bg-stone-900 p-8 shadow-2xl">
          <h1 className="mb-2 text-center text-2xl font-bold text-amber-300">🔒 Acesso Negado</h1>
          <p className="text-center text-xs text-stone-400">Você não tem permissão para acessar este painel.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-amber-300">🔒 Painel Admin</h1>
            <p className="text-xs text-stone-500">Hogwarts Showdown</p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 rounded border border-amber-700/50 bg-stone-800 px-3 py-2">
              <span className="text-xs text-amber-400">Arrecadado (R$):</span>
              <input
                type="number"
                value={arrecadado}
                onChange={(e) => setArrecadado(Number(e.target.value))}
                className="w-16 rounded border border-amber-700 bg-stone-900 px-2 py-1 text-xs text-amber-200 text-right"
              />
              <span className="text-xs text-amber-400">Meta (R$):</span>
              <input
                type="number"
                value={metaObjetivo}
                onChange={(e) => setMetaObjetivo(Number(e.target.value))}
                className="w-16 rounded border border-amber-700 bg-stone-900 px-2 py-1 text-xs text-amber-200 text-right"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-6 border-amber-600 text-xs text-amber-300"
                onClick={handleUpdateServerMeta}
              >
                Salvar
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded border border-amber-700/50 bg-stone-800 px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMeta}
                  onChange={(e) => setShowMeta(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-700 bg-stone-900 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs text-amber-400">Exibir Meta na Página Principal</span>
              </label>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-amber-800/40 pb-2">
          <Button
            size="sm"
            variant={activeTab === "users" ? "default" : "ghost"}
            className={activeTab === "users" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => setActiveTab("users")}
          >
            <Users className="mr-2 h-4 w-4" />
            Usuários
          </Button>
          <Button
            size="sm"
            variant={activeTab === "reports" ? "default" : "ghost"}
            className={activeTab === "reports" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => setActiveTab("reports")}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Denúncias
          </Button>
          <Button
            size="sm"
            variant={activeTab === "vip_requests" ? "default" : "ghost"}
            className={activeTab === "vip_requests" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => setActiveTab("vip_requests")}
          >
            <Shield className="mr-2 h-4 w-4" />
            Solicitações VIP
          </Button>
          <Button
            size="sm"
            variant={activeTab === "ranking" ? "default" : "ghost"}
            className={activeTab === "ranking" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => setActiveTab("ranking")}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Resetar Ranking
          </Button>
          <Button
            size="sm"
            variant={activeTab === "meta_balance" ? "default" : "ghost"}
            className={activeTab === "meta_balance" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => setActiveTab("meta_balance")}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Meta/Balance
          </Button>
          <Button
            size="sm"
            variant={activeTab === "errors" ? "default" : "ghost"}
            className={activeTab === "errors" ? "bg-amber-700 text-white" : "text-amber-400 hover:bg-amber-900/30"}
            onClick={() => setActiveTab("errors")}
          >
            <Bug className="mr-2 h-4 w-4" />
            Erros
          </Button>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {/* Users Tab */}
        {activeTab === "users" && (
          <Card className="border-amber-800/40 bg-stone-900">
            <CardHeader>
              <CardTitle className="text-amber-300">Gerenciar Usuários</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                <Input
                  placeholder="Buscar por nome..."
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
                          <p className="text-xs text-stone-500">ELO: {user.elo ?? 500}</p>
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-900 bg-red-900/20 text-red-500 text-xs"
                            onClick={() => handleBanUser(user.id, user.username || "")}
                          >
                            Banir
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
          <Card className="border-amber-800/40 bg-stone-900">
            <CardHeader>
              <CardTitle className="text-amber-300">Denúncias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Button
                  onClick={() => fetchReports()}
                  disabled={loading}
                  className="bg-amber-700 text-white hover:bg-amber-600"
                >
                  {loading ? "Carregando..." : "↻ Atualizar"}
                </Button>
              </div>
              {reports.length === 0 ? (
                <p className="py-4 text-center text-sm text-amber-500">Nenhuma denúncia encontrada.</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {reports.map((report) => (
                    <div key={report.id} className="rounded border border-amber-800/30 bg-stone-800 p-3">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-stone-400">Denunciado por: {report.reporter_id}</p>
                          <p className="text-xs text-stone-400">Alvo: {report.target_id}</p>
                          <p className="text-xs text-stone-500">{new Date(report.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                        <Badge
                          className={report.status === "closed" ? "border-green-700 bg-green-900/40 text-green-300" : "border-amber-700 bg-amber-900/40 text-amber-300"}
                        >
                          {report.status === "closed" ? "✓ Resolvida" : "⏳ Pendente"}
                        </Badge>
                      </div>
                      <div className="mb-2">
                        <p className="text-xs text-stone-500">Motivo:</p>
                        <p className="text-sm text-amber-200">{report.reason}</p>
                      </div>
                      <div className="mb-3 rounded border border-stone-700 bg-stone-800 p-2 text-xs text-stone-300">
                        <p className="mb-1 text-stone-500">Descrição:</p>
                        <p className="whitespace-pre-wrap">{report.description}</p>
                      </div>
                      {report.status !== "closed" && (
                        <Button
                          size="sm"
                          className="bg-green-700 text-white hover:bg-green-600"
                          onClick={() => handleResolveReport(report.id)}
                        >
                          ✓ Resolver
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* VIP Requests Tab */}
        {activeTab === "vip_requests" && (
          <Card className="border-amber-800/40 bg-stone-900">
            <CardHeader>
              <CardTitle className="text-amber-300">Solicitações VIP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Button
                  onClick={() => fetchVipRequests()}
                  disabled={loading}
                  className="bg-amber-700 text-white hover:bg-amber-600"
                >
                  {loading ? "Carregando..." : "↻ Atualizar"}
                </Button>
              </div>
              {vipRequests.length === 0 ? (
                <p className="py-4 text-center text-sm text-amber-500">Nenhuma solicitação VIP encontrada.</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {vipRequests.map((request) => (
                    <div key={request.id} className="rounded border border-amber-800/30 bg-stone-800 p-3">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-amber-200">{request.email}</p>
                          <p className="text-xs text-stone-400">User ID: {request.user_id}</p>
                          <p className="text-xs text-stone-500">{new Date(request.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                        <Badge
                          className={request.status === "approved" ? "border-green-700 bg-green-900/40 text-green-300" : "border-amber-700 bg-amber-900/40 text-amber-300"}
                        >
                          {request.status === "approved" ? "✓ Aprovado" : "⏳ Pendente"}
                        </Badge>
                      </div>
                      <div className="mb-3 rounded border border-stone-700 bg-stone-800 p-2 text-xs text-stone-300">
                        <p className="mb-1 text-stone-500">Comprovante/ID:</p>
                        <p className="whitespace-pre-wrap">{request.proof_note || "(sem comprovante)"}</p>
                      </div>
                      {request.status !== "approved" && (
                        <Button
                          size="sm"
                          className="bg-green-700 text-white hover:bg-green-600"
                          onClick={() => handleApproveVip(request.id, request.user_id)}
                        >
                          ✓ Aprovar VIP
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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

        {/* Meta/Balance Tab */}
        {activeTab === "meta_balance" && userProfile && (
          <AdminBalancePanel
            isOpen={true}
            onClose={() => {}}
            currentUser={userProfile}
          />
        )}

        {/* Errors Tab */}
        {activeTab === "errors" && userProfile && (
          <AdminErrorPanel
            isOpen={true}
            onClose={() => {}}
            currentUser={userProfile}
          />
        )}
      </div>
    </div>
  )
}
