import { useCallback, useState } from "react"
import type { PlayerBuild } from "@/app/page"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"

export interface ExternalMatchState {
  matchId: string
  status: "waiting" | "in_progress" | "finished"
  playersExpected: number
  playersJoined: number
  participantIds: string[]
  participantNames: string[]
  mode: PlayerBuild["gameMode"]
}

export interface ActionPayload {
  matchId: string
  playerId: string
  actionId: string
  targetId?: string
  timestamp: number
  action: RoundAction
}

export function useMatchManager() {
  const [externalMatchState, setExternalMatchState] = useState<ExternalMatchState | null>(null)
  const [queuedPayloads, setQueuedPayloads] = useState<ActionPayload[]>([])

  const isOnlineMode = useCallback((build: PlayerBuild | null) => {
    if (!build) return false
    return build.gameMode !== "teste"
  }, [])

  const buildActionPayload = useCallback((matchId: string, playerId: string, action: RoundAction): ActionPayload => {
    return {
      matchId,
      playerId,
      actionId: action.spellName || action.type,
      targetId: action.targetId,
      timestamp: Date.now(),
      action,
    }
  }, [])

  const expectedPlayersByMode = useCallback((mode: PlayerBuild["gameMode"]) => {
    if (mode === "2v2" || mode === "ffa") return 4
    return 2
  }, [])

  const toExternalState = useCallback((row: any): ExternalMatchState => {
    const ids = [row.p1_id, row.p2_id, row.p3_id, row.p4_id].filter(Boolean)
    const names = [row.p1_name, row.p2_name, row.p3_name, row.p4_name].filter(Boolean)
    return {
      matchId: row.match_id,
      status: row.status,
      playersExpected: row.players_expected,
      playersJoined: row.players_joined,
      participantIds: ids,
      participantNames: names,
      mode: row.mode,
    }
  }, [])

  const joinMatchmaker = useCallback(async (mode: PlayerBuild["gameMode"], playerId: string, playerName: string) => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc("join_matchmaker", {
      p_mode: mode,
      p_player_id: playerId,
      p_player_name: playerName,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error("join_matchmaker retornou vazio")
    return toExternalState(row)
  }, [toExternalState])

  const findActiveMatchForPlayer = useCallback(async (playerId: string) => {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from("matches")
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,updated_at")
      .in("status", ["waiting", "in_progress"])
      .or(`p1_id.eq.${playerId},p2_id.eq.${playerId},p3_id.eq.${playerId},p4_id.eq.${playerId}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return toExternalState(data)
  }, [toExternalState])

  const fetchInProgressMatches = useCallback(async () => {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from("matches")
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,updated_at")
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(25)
    return (data || []).map((r: any) => toExternalState(r))
  }, [toExternalState])

  const handleAction = useCallback((playerId: string, action: RoundAction, matchId?: string) => {
    const resolvedMatchId = matchId || externalMatchState?.matchId || "local-offline"
    const payload = buildActionPayload(resolvedMatchId, playerId, action)
    setQueuedPayloads((prev) => [...prev, payload])
    void (async () => {
      try {
        const supabase = getSupabaseClient()
        await supabase.from("match_actions").insert({
          match_id: payload.matchId,
          player_id: payload.playerId,
          action_id: payload.actionId,
          target_id: payload.targetId ?? null,
          timestamp_ms: payload.timestamp,
          payload,
        })
      } catch {
        // Falha de rede/tabela não bloqueia a arena local.
      }
    })()
    return payload
  }, [buildActionPayload, externalMatchState?.matchId])

  const applyExternalState = useCallback((next: ExternalMatchState) => {
    setExternalMatchState(next)
    // Fonte de verdade passa a ser o banco, então aqui só atualizamos estado local.
  }, [])

  const subscribeToMatch = useCallback(
    (
      matchId: string,
      handlers: {
        onState?: (state: ExternalMatchState) => void
        onAction?: (payload: ActionPayload) => void
      }
    ) => {
      const supabase = getSupabaseClient()
      const channel = supabase
        .channel(`match-${matchId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `match_id=eq.${matchId}` },
          (evt: any) => {
            const row = evt.new || evt.old
            if (!row) return
            handlers.onState?.({
              matchId: row.match_id,
              status: row.status,
              playersExpected: row.players_expected,
              playersJoined: row.players_joined,
              participantIds: [row.p1_id, row.p2_id, row.p3_id, row.p4_id].filter(Boolean),
              participantNames: [row.p1_name, row.p2_name, row.p3_name, row.p4_name].filter(Boolean),
              mode: row.mode,
            })
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "match_actions", filter: `match_id=eq.${matchId}` },
          (evt: any) => {
            const p = evt.new?.payload as ActionPayload | undefined
            if (p) handlers.onAction?.(p)
          }
        )
        .subscribe()

      return () => {
        void supabase.removeChannel(channel)
      }
    },
    []
  )

  return {
    externalMatchState,
    queuedPayloads,
    isOnlineMode,
    buildActionPayload,
    joinMatchmaker,
    findActiveMatchForPlayer,
    fetchInProgressMatches,
    handleAction,
    applyExternalState,
    subscribeToMatch,
  }
}
