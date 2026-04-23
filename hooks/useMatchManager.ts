import { useCallback, useState } from "react"
import type { PlayerBuild } from "@/app/page"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"

export interface ExternalMatchState {
  matchId: string
  status: "pending" | "running" | "finished"
  playersExpected: number
  playersJoined: number
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

  const createOrJoinMatch = useCallback(async (mode: PlayerBuild["gameMode"], playerId: string) => {
    const supabase = getSupabaseClient()
    const playersExpected = expectedPlayersByMode(mode)
    const { data: existingRows } = await supabase
      .from("matches")
      .select("match_id,status,players_expected,players_joined,mode")
      .eq("status", "pending")
      .eq("mode", mode)
      .order("updated_at", { ascending: true })
      .limit(20)

    const existing = (existingRows || []).find((m: any) => (m.players_joined ?? 0) < (m.players_expected ?? 0))

    if (!existing) {
      const matchId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await supabase.from("matches").insert({
        match_id: matchId,
        status: "pending",
        mode,
        players_expected: playersExpected,
        players_joined: 1,
        updated_at: new Date().toISOString(),
      })
      await supabase.from("match_players").upsert({ match_id: matchId, player_id: playerId }, { onConflict: "match_id,player_id" })
      return { matchId, status: "pending" as const, playersExpected, playersJoined: 1 }
    }

    const matchId = existing.match_id as string
    await supabase.from("match_players").upsert({ match_id: matchId, player_id: playerId }, { onConflict: "match_id,player_id" })
    const { count } = await supabase
      .from("match_players")
      .select("player_id", { head: true, count: "exact" })
      .eq("match_id", matchId)
    const joined = count || existing.players_joined || 1
    const status = joined >= (existing.players_expected || playersExpected) ? "running" : "pending"
    await supabase
      .from("matches")
      .update({ players_joined: joined, status, updated_at: new Date().toISOString() })
      .eq("match_id", matchId)

    return {
      matchId,
      status: status as "pending" | "running",
      playersExpected: existing.players_expected || playersExpected,
      playersJoined: joined,
    }
  }, [expectedPlayersByMode])

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
    void (async () => {
      try {
        const supabase = getSupabaseClient()
        await supabase.from("matches").upsert(
          {
            match_id: next.matchId,
            status: next.status,
            players_expected: next.playersExpected,
            players_joined: next.playersJoined,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "match_id" }
        )
      } catch {
        // Mantém UI funcional se a persistência remota falhar.
      }
    })()
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
    createOrJoinMatch,
    handleAction,
    applyExternalState,
    subscribeToMatch,
  }
}
