import { useCallback, useEffect, useMemo, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase"
import type { GameMode } from "@/lib/constants"

interface SyncDuelist {
  hp?: {
    bars?: number[]
  }
}

interface UseArenaMatchSyncParams {
  gameMode: GameMode
  matchId?: string
  matchStatus?: "waiting" | "in_progress" | "finished"
  selfDuelistId: string
  isIdentityReady: boolean
  participantIds: string[]
  duelists: SyncDuelist[]
  expectedOnlinePlayers: number
}

const getTotalHP = (hp: { bars?: number[] } | undefined) => {
  if (!hp?.bars || hp.bars.length === 0) return 0
  return hp.bars.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
}

export function useArenaMatchSync({
  gameMode,
  matchId,
  matchStatus,
  selfDuelistId,
  isIdentityReady,
  participantIds,
  duelists,
  expectedOnlinePlayers,
}: UseArenaMatchSyncParams) {
  const [readyByPlayerId, setReadyByPlayerId] = useState<Record<string, boolean>>({})
  const [isBattleReady, setIsBattleReady] = useState(gameMode === "teste")
  const [isInitializing, setIsInitializing] = useState(gameMode !== "teste")

  const isOnlineMatch = gameMode !== "teste" && !!matchId
  const hasExpectedParticipants = !isOnlineMatch || participantIds.length >= expectedOnlinePlayers
  const onlineStateLoaded =
    !isOnlineMatch ||
    (hasExpectedParticipants &&
      duelists.length >= expectedOnlinePlayers &&
      duelists.every((d) => !!d.hp && Array.isArray(d.hp.bars) && d.hp.bars.length === 5))

  const readyCount = useMemo(() => participantIds.filter((id) => !!readyByPlayerId[id]).length, [participantIds, readyByPlayerId])
  const localIsReady = !!readyByPlayerId[selfDuelistId]
  const isInProgress = !isOnlineMatch || matchStatus === "in_progress"
  const isBattlePrepared = !isOnlineMatch || (onlineStateLoaded && isInProgress && readyCount >= expectedOnlinePlayers)

  useEffect(() => {
    setIsBattleReady(isBattlePrepared)
  }, [isBattlePrepared])

  useEffect(() => {
    if (!isOnlineMatch || !matchId || !isIdentityReady) {
      setIsInitializing(false)
      return
    }
    let mounted = true
    const supabase = getSupabaseClient()

    const checkInit = async () => {
      const { count } = await supabase.from("match_players").select("player_id", { count: "exact", head: true }).eq("match_id", matchId)
      const rosterReady = (count || 0) >= expectedOnlinePlayers
      const stateReady =
        participantIds.length >= expectedOnlinePlayers &&
        duelists.length >= expectedOnlinePlayers &&
        duelists.every((d) => !!d.hp && Array.isArray(d.hp.bars) && d.hp.bars.length === 5 && getTotalHP(d.hp) > 0)

      console.log("[Arena:init] checkInit", {
        matchId,
        rosterReady,
        stateReady,
        expectedOnlinePlayers,
        participantCount: participantIds.length,
        duelistsCount: duelists.length,
        status: matchStatus,
        readyCount,
      })
      if (mounted) setIsInitializing(!(rosterReady && stateReady && matchStatus === "in_progress" && readyCount >= expectedOnlinePlayers))
    }

    void checkInit()
    const timer = window.setInterval(() => void checkInit(), 1000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [duelists, expectedOnlinePlayers, isIdentityReady, isOnlineMatch, matchId, matchStatus, participantIds, readyCount])

  useEffect(() => {
    if (gameMode === "teste" || !matchId || !selfDuelistId) return
    const supabase = getSupabaseClient()

    const pullReadyState = async () => {
      const { data } = await supabase.from("match_ready_states").select("player_id,is_ready").eq("match_id", matchId)
      const next: Record<string, boolean> = {}
      for (const row of data || []) {
        const r = row as { player_id: string; is_ready: boolean }
        next[String(r.player_id)] = !!r.is_ready
      }
      console.log("[Arena:ready] pullReadyState", { matchId, next })
      setReadyByPlayerId(next)
    }

    void supabase.from("match_ready_states").upsert(
      { match_id: matchId, player_id: selfDuelistId, is_ready: false, updated_at: new Date().toISOString() },
      { onConflict: "match_id,player_id" }
    )
    console.log("[Arena:ready] upsert local ready=false", { matchId, selfDuelistId })
    void pullReadyState()

    const readyChannel = supabase
      .channel(`match-ready-db-${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_ready_states", filter: `match_id=eq.${matchId}` },
        () => void pullReadyState()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(readyChannel)
    }
  }, [gameMode, matchId, selfDuelistId])

  useEffect(() => {
    if (!isOnlineMatch || !matchId) return
    if (matchStatus !== "waiting") return
    if (participantIds.length < expectedOnlinePlayers) return
    if (readyCount < expectedOnlinePlayers) return
    const supabase = getSupabaseClient()
    void supabase.from("matches").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("match_id", matchId).eq("status", "waiting")
  }, [expectedOnlinePlayers, isOnlineMatch, matchId, matchStatus, participantIds.length, readyCount])

  const markReady = useCallback(async () => {
    if (!matchId || !selfDuelistId || gameMode === "teste") return
    const supabase = getSupabaseClient()
    await supabase.from("match_ready_states").upsert(
      { match_id: matchId, player_id: selfDuelistId, is_ready: true, updated_at: new Date().toISOString() },
      { onConflict: "match_id,player_id" }
    )
    setReadyByPlayerId((prev) => ({ ...prev, [selfDuelistId]: true }))
  }, [gameMode, matchId, selfDuelistId])

  return {
    isOnlineMatch,
    isBattleReady,
    isInitializing,
    readyByPlayerId,
    readyCount,
    localIsReady,
    markReady,
  }
}
