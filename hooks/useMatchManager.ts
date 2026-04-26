import { useCallback, useState } from "react"
import type { PlayerBuild } from "@/lib/types"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"

/** PvP: matchmaking via Supabase (criação de sala). Combate em tempo real via Socket.io (server/index.ts). */

export interface ExternalMatchState {
  matchId: string
  status: "waiting" | "in_progress" | "finished"
  playersExpected: number
  playersJoined: number
  participantIds: string[]
  participantNames: string[]
  mode: PlayerBuild["gameMode"]
  currentTurnOwner?: string
}

export interface ActionPayload {
  eventId: string
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
    return build.gameMode !== "teste" && build.gameMode !== "torneio-offline" && build.gameMode !== "floresta" && build.gameMode !== "historia"
  }, [])

  const logMatch = useCallback((scope: string, payload: Record<string, unknown>) => {
    console.log(`[MatchManager:${scope}]`, payload)
  }, [])

  const closeInactiveWaitingRooms = useCallback(async () => {
    const supabase = getSupabaseClient()
    const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: staleRows } = await supabase
      .from("matches")
      .select("match_id")
      .eq("status", "waiting")
      .lt("updated_at", cutoffIso)
      .limit(100)
    const staleIds = (staleRows || []).map((r: any) => String(r.match_id)).filter(Boolean)
    if (staleIds.length === 0) return
    await supabase.from("matches").update({ status: "finished", updated_at: new Date().toISOString() }).in("match_id", staleIds)
    await supabase.from("match_players").delete().in("match_id", staleIds)
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
      currentTurnOwner: row.current_turn_owner || ids[0],
    }
  }, [])

  const findSingleActiveRoom = useCallback(async (playerId: string) => {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from("matches")
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner,updated_at")
      .in("status", ["waiting", "in_progress"])
      .or(`p1_id.eq.${playerId},p2_id.eq.${playerId},p3_id.eq.${playerId},p4_id.eq.${playerId}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return toExternalState(data)
  }, [toExternalState])

  const buildActionPayload = useCallback((matchId: string, playerId: string, action: RoundAction): ActionPayload => {
    const eventId = `${matchId}:${playerId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
    const normalizedAction: RoundAction = { ...action, eventId }
    return {
      eventId,
      matchId,
      playerId,
      actionId: normalizedAction.spellName || normalizedAction.type,
      targetId: normalizedAction.targetId,
      timestamp: Date.now(),
      action: normalizedAction,
    }
  }, [])

  const expectedPlayersByMode = useCallback((mode: PlayerBuild["gameMode"]) => {
    if (mode === "2v2" || mode === "ffa") return 4
    if (mode === "ffa3") return 3
    return 2
  }, [])

  const joinMatchmaker = useCallback(async (mode: PlayerBuild["gameMode"], playerId: string, playerName: string) => {
    logMatch("joinMatchmaker:start", { mode, playerId, playerName })
    await closeInactiveWaitingRooms()
    const active = await findSingleActiveRoom(playerId)
    if (active) {
      logMatch("joinMatchmaker:reuse-active", {
        matchId: active.matchId,
        status: active.status,
        playersJoined: active.playersJoined,
        playersExpected: active.playersExpected,
      })
      return active
    }
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
      const joined = await callRpc()
      logMatch("joinMatchmaker:rpc-ok", {
        matchId: joined.matchId,
        status: joined.status,
        playersJoined: joined.playersJoined,
        playersExpected: joined.playersExpected,
        mode: joined.mode,
      })
      return joined
    } catch {
      logMatch("joinMatchmaker:rpc-fallback", { mode, playerId })
      // Fallback cliente para ambientes onde a RPC ainda não foi aplicada.
      const playersExpected = expectedPlayersByMode(mode)
      const { data: waitingRows } = await supabase
        .from("matches")
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner,updated_at")
        .eq("status", "waiting")
        .eq("mode", mode)
        .order("updated_at", { ascending: true })
        .limit(10)

      for (const row of waitingRows || []) {
        if ([row.p1_id, row.p2_id, row.p3_id, row.p4_id].includes(playerId)) {
          await supabase.from("match_players").upsert({ match_id: row.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
          const reused = toExternalState(row)
          logMatch("joinMatchmaker:fallback-reuse-row", {
            matchId: reused.matchId,
            status: reused.status,
            playersJoined: reused.playersJoined,
            playersExpected: reused.playersExpected,
          })
          return reused
        }
        const oldJoined = Number(row.players_joined || 0)
        if (oldJoined >= playersExpected) continue
        const updatePayload: Record<string, any> = {
          players_joined: oldJoined + 1,
          status: oldJoined + 1 >= playersExpected ? "in_progress" : "waiting",
          current_turn_owner: row.current_turn_owner || row.p1_id,
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
          .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner")
          .maybeSingle()
        if (updated) {
          await supabase.from("match_players").upsert({ match_id: updated.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
          const joined = toExternalState(updated)
          logMatch("joinMatchmaker:fallback-joined-existing", {
            matchId: joined.matchId,
            status: joined.status,
            playersJoined: joined.playersJoined,
            playersExpected: joined.playersExpected,
          })
          return joined
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
          current_turn_owner: playerId,
          updated_at: new Date().toISOString(),
        })
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner")
        .single()
      if (!created) throw new Error("Não foi possível criar a sala")
      await supabase.from("match_players").upsert({ match_id: created.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
      const opened = toExternalState(created)
      logMatch("joinMatchmaker:fallback-created", {
        matchId: opened.matchId,
        status: opened.status,
        playersJoined: opened.playersJoined,
        playersExpected: opened.playersExpected,
      })
      return opened
    }
  }, [closeInactiveWaitingRooms, expectedPlayersByMode, findSingleActiveRoom, logMatch, toExternalState])

  const createRoom = useCallback(async (mode: PlayerBuild["gameMode"], playerId: string, playerName: string) => {
    logMatch("createRoom:start", { mode, playerId, playerName })
    await closeInactiveWaitingRooms()
    const active = await findSingleActiveRoom(playerId)
    if (active) {
      logMatch("createRoom:reuse-active", {
        matchId: active.matchId,
        status: active.status,
        playersJoined: active.playersJoined,
        playersExpected: active.playersExpected,
      })
      return active
    }
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
        current_turn_owner: playerId,
        updated_at: new Date().toISOString(),
      })
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner")
      .single()
    if (error) throw error
    await supabase.from("match_players").upsert({ match_id: data.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
    const created = toExternalState(data)
    logMatch("createRoom:ok", {
      matchId: created.matchId,
      status: created.status,
      playersJoined: created.playersJoined,
      playersExpected: created.playersExpected,
    })
    return created
  }, [closeInactiveWaitingRooms, expectedPlayersByMode, findSingleActiveRoom, logMatch, toExternalState])

  const joinRoomById = useCallback(async (matchId: string, playerId: string, playerName: string) => {
    logMatch("joinRoomById:start", { matchId, playerId, playerName })
    await closeInactiveWaitingRooms()
    const active = await findSingleActiveRoom(playerId)
    if (active && active.matchId !== matchId) {
      logMatch("joinRoomById:blocked-other-active", {
        activeMatchId: active.matchId,
        requestedMatchId: matchId,
      })
      throw new Error("Você já está em outra sala ativa. Saia dela antes de entrar em uma nova.")
    }
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
      const joined = toExternalState(row)
      logMatch("joinRoomById:rpc-ok", {
        matchId: joined.matchId,
        status: joined.status,
        playersJoined: joined.playersJoined,
        playersExpected: joined.playersExpected,
      })
      return joined
    } catch {
      logMatch("joinRoomById:rpc-fallback", { matchId, playerId })
      const { data: row } = await supabase
        .from("matches")
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner")
        .eq("match_id", matchId)
        .maybeSingle()
      if (!row) throw new Error("Sala não encontrada")
      if ([row.p1_id, row.p2_id, row.p3_id, row.p4_id].includes(playerId)) {
        const reused = toExternalState(row)
        logMatch("joinRoomById:fallback-already-member", {
          matchId: reused.matchId,
          status: reused.status,
          playersJoined: reused.playersJoined,
          playersExpected: reused.playersExpected,
        })
        return reused
      }
      const oldJoined = Number(row.players_joined || 0)
      if (row.status !== "waiting" || oldJoined >= Number(row.players_expected || 0)) throw new Error("Sala já fechada")
      const payload: Record<string, any> = {
        players_joined: oldJoined + 1,
        status: oldJoined + 1 >= Number(row.players_expected || 0) ? "in_progress" : "waiting",
        current_turn_owner: row.current_turn_owner || row.p1_id,
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
        .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner")
        .maybeSingle()
      if (!updated) throw new Error("Não foi possível entrar na sala")
      await supabase.from("match_players").upsert({ match_id: updated.match_id, player_id: playerId }, { onConflict: "match_id,player_id" })
      const joined = toExternalState(updated)
      logMatch("joinRoomById:fallback-joined", {
        matchId: joined.matchId,
        status: joined.status,
        playersJoined: joined.playersJoined,
        playersExpected: joined.playersExpected,
      })
      return joined
    }
  }, [closeInactiveWaitingRooms, findSingleActiveRoom, logMatch, toExternalState])

  const fetchOpenRooms = useCallback(async (mode?: PlayerBuild["gameMode"]) => {
    await closeInactiveWaitingRooms()
    const supabase = getSupabaseClient()
    let query = supabase
      .from("matches")
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner,updated_at")
      .eq("status", "waiting")
      .order("updated_at", { ascending: true })
      .limit(30)
    if (mode) query = query.eq("mode", mode)
    const { data } = await query
    const rows = (data || []).map((r: any) => toExternalState(r))
    logMatch("fetchOpenRooms", {
      mode: mode || "all",
      count: rows.length,
      sample: rows.slice(0, 5).map((r) => ({
        matchId: r.matchId,
        status: r.status,
        playersJoined: r.playersJoined,
        playersExpected: r.playersExpected,
      })),
    })
    return rows
  }, [closeInactiveWaitingRooms, logMatch, toExternalState])

  const findActiveMatchForPlayer = useCallback(async (playerId: string) => {
    await closeInactiveWaitingRooms()
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from("matches")
      .select("match_id,mode,status,players_expected,players_joined,p1_id,p2_id,p3_id,p4_id,p1_name,p2_name,p3_name,p4_name,current_turn_owner,updated_at")
      .in("status", ["waiting", "in_progress"])
      .or(`p1_id.eq.${playerId},p2_id.eq.${playerId},p3_id.eq.${playerId},p4_id.eq.${playerId}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return toExternalState(data)
  }, [closeInactiveWaitingRooms, toExternalState])

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
        const { error } = await supabase.rpc("commit_match_action", {
          p_match_id: payload.matchId,
          p_player_id: payload.playerId,
          p_action_id: payload.eventId,
          p_target_id: payload.targetId ?? null,
          p_timestamp_ms: payload.timestamp,
          p_payload: payload,
        })
        if (error) throw error
      } catch {
        // Fallback para ambientes sem RPC aplicada.
        try {
          const supabase = getSupabaseClient()
          await supabase.from("match_actions").insert({
            match_id: payload.matchId,
            player_id: payload.playerId,
            action_id: payload.eventId,
            target_id: payload.targetId ?? null,
            timestamp_ms: payload.timestamp,
            payload,
          })
        } catch {
          // Falha de rede/tabela não bloqueia a arena local.
        }
      }
    })()
    return payload
  }, [buildActionPayload, externalMatchState?.matchId])

  const applyExternalState = useCallback((next: ExternalMatchState) => {
    setExternalMatchState(next)
    // Fonte de verdade passa a ser o banco, então aqui só atualizamos estado local.
  }, [])

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
  }
}
