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
    if (mode === "ffa3") return 3
    return 2
  }, [])

  const toExternalState = useCallback((row: any): ExternalMatchState => {
    const slots: Array<{ id?: string; name?: string }> = [
      { id: row.p1_id, name: row.p1_name },
      { id: row.p2_id, name: row.p2_name },
      { id: row.p3_id, name: row.p3_name },
      { id: row.p4_id, name: row.p4_name },
    ]
    const ids: string[] = []
    const names: string[] = []
    for (const slot of slots) {
      if (!slot.id) continue
      ids.push(slot.id)
      names.push(slot.name || "Bruxo")
    }
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
    const callRpc = async () => {
      const { data, error } = await supabase.rpc("join_matchmaker", {
        p_mode: mode,
        p_player_id: playerId,
        p_player_name: playerName,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row) throw new Error("join_matchmaker retornou vazio")
      return toExternalState(row)
    }

    try {
      return await callRpc()
    } catch {
      // Fallback cliente para ambientes onde a RPC ainda não foi aplicada.
      const playersExpected = expectedPlayersByMode(mode)
      const { data: waitingRows } = await supabase
        .from("matches")
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,updated_at")
        .eq("status", "waiting")
        .eq("mode", mode)
        .order("updated_at", { ascending: true })
        .limit(10)

      for (const row of waitingRows || []) {
        if ([row.p1_id, row.p2_id, row.p3_id, row.p4_id].includes(playerId)) {
          await supabase.from("match_players").upsert({ match_id: row.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
          return toExternalState(row)
        }
        const oldJoined = Number(row.players_joined || 0)
        if (oldJoined >= playersExpected) continue
        const updatePayload: Record<string, any> = {
          players_joined: oldJoined + 1,
          status: oldJoined + 1 >= playersExpected ? "in_progress" : "waiting",
          updated_at: new Date().toISOString(),
        }
        if (!row.p2_id) {
          updatePayload.p2_id = playerId
          updatePayload.p2_name = playerName
        } else if (!row.p3_id) {
          updatePayload.p3_id = playerId
          updatePayload.p3_name = playerName
        } else if (!row.p4_id) {
          updatePayload.p4_id = playerId
          updatePayload.p4_name = playerName
        } else {
          continue
        }
        const { data: updated } = await supabase
          .from("matches")
          .update(updatePayload)
          .eq("match_id", row.match_id)
          .eq("status", "waiting")
          .eq("players_joined", oldJoined)
          .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name")
          .maybeSingle()
        if (updated) {
          await supabase.from("match_players").upsert({ match_id: updated.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
          return toExternalState(updated)
        }
      }

      const { data: created } = await supabase
        .from("matches")
        .insert({
          mode,
          status: "waiting",
          players_expected: playersExpected,
          players_joined: 1,
          p1_id: playerId,
          p1_name: playerName,
          updated_at: new Date().toISOString(),
        })
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name")
        .single()
      await supabase.from("match_players").upsert({ match_id: created.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
      return toExternalState(created)
    }
  }, [expectedPlayersByMode, toExternalState])

  const createRoom = useCallback(async (mode: PlayerBuild["gameMode"], playerId: string, playerName: string) => {
    const supabase = getSupabaseClient()
    const playersExpected = expectedPlayersByMode(mode)
    const { data, error } = await supabase
      .from("matches")
      .insert({
        mode,
        status: "waiting",
        players_expected: playersExpected,
        players_joined: 1,
        p1_id: playerId,
        p1_name: playerName,
        updated_at: new Date().toISOString(),
      })
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name")
      .single()
    if (error) throw error
    await supabase.from("match_players").upsert({ match_id: data.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
    return toExternalState(data)
  }, [expectedPlayersByMode, toExternalState])

  const joinRoomById = useCallback(async (matchId: string, playerId: string, playerName: string) => {
    const supabase = getSupabaseClient()
    try {
      const { data, error } = await supabase.rpc("join_specific_room", {
        p_match_id: matchId,
        p_player_id: playerId,
        p_player_name: playerName,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row) throw new Error("join_specific_room retornou vazio")
      return toExternalState(row)
    } catch {
      const { data: row } = await supabase
        .from("matches")
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name")
        .eq("match_id", matchId)
        .maybeSingle()
      if (!row) throw new Error("Sala não encontrada")
      if ([row.p1_id, row.p2_id, row.p3_id, row.p4_id].includes(playerId)) return toExternalState(row)
      const oldJoined = Number(row.players_joined || 0)
      if (row.status !== "waiting" || oldJoined >= Number(row.players_expected || 0)) throw new Error("Sala já fechada")
      const payload: Record<string, any> = {
        players_joined: oldJoined + 1,
        status: oldJoined + 1 >= Number(row.players_expected || 0) ? "in_progress" : "waiting",
        updated_at: new Date().toISOString(),
      }
      if (!row.p2_id) {
        payload.p2_id = playerId
        payload.p2_name = playerName
      } else if (!row.p3_id) {
        payload.p3_id = playerId
        payload.p3_name = playerName
      } else if (!row.p4_id) {
        payload.p4_id = playerId
        payload.p4_name = playerName
      } else {
        throw new Error("Sala lotada")
      }
      const { data: updated } = await supabase
        .from("matches")
        .update(payload)
        .eq("match_id", matchId)
        .eq("status", "waiting")
        .eq("players_joined", oldJoined)
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name")
        .maybeSingle()
      if (!updated) throw new Error("Não foi possível entrar na sala")
      await supabase.from("match_players").upsert({ match_id: updated.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
      return toExternalState(updated)
    }
  }, [toExternalState])

  const fetchOpenRooms = useCallback(async (mode?: PlayerBuild["gameMode"]) => {
    const supabase = getSupabaseClient()
    let query = supabase
      .from("matches")
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,updated_at")
      .eq("status", "waiting")
      .order("updated_at", { ascending: true })
      .limit(30)
    if (mode) query = query.eq("mode", mode)
    const { data } = await query
    return (data || []).map((r: any) => toExternalState(r))
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
              participantNames: [
                row.p1_id ? (row.p1_name || "Bruxo") : null,
                row.p2_id ? (row.p2_name || "Bruxo") : null,
                row.p3_id ? (row.p3_name || "Bruxo") : null,
                row.p4_id ? (row.p4_name || "Bruxo") : null,
              ].filter(Boolean) as string[],
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
    createRoom,
    joinRoomById,
    fetchOpenRooms,
    findActiveMatchForPlayer,
    fetchInProgressMatches,
    handleAction,
    applyExternalState,
    subscribeToMatch,
  }
}
