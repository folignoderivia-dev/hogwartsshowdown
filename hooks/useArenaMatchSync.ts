import { useCallback, useEffect, useMemo, useState } from "react"
import type { GameMode } from "@/lib/types"

interface UseArenaMatchSyncParams {
  gameMode: GameMode
  matchId?: string
  selfDuelistId: string
  participantIds: string[]
  expectedOnlinePlayers: number
}

export function useArenaMatchSync({
  gameMode,
  matchId,
  selfDuelistId,
  participantIds,
  expectedOnlinePlayers,
}: UseArenaMatchSyncParams) {
  const isOfflineMode = gameMode === "teste" || gameMode === "challenge"
  const [readyByPlayerId, setReadyByPlayerId] = useState<Record<string, boolean>>({})

  const isOnlineMatch = !isOfflineMode && !!matchId
  const readyCount = useMemo(() => participantIds.filter((id) => !!readyByPlayerId[id]).length, [participantIds, readyByPlayerId])
  const localIsReady = !!readyByPlayerId[selfDuelistId]
  const isBattleReady = !isOnlineMatch || !!selfDuelistId
  const isInitializing = false

  useEffect(() => {
    if (isOfflineMode || !selfDuelistId) return
    setReadyByPlayerId((prev) => ({ ...prev, [selfDuelistId]: true }))
  }, [isOfflineMode, selfDuelistId])

  const markReady = useCallback(async () => {
    if (!selfDuelistId || isOfflineMode) return
    setReadyByPlayerId((prev) => ({ ...prev, [selfDuelistId]: true }))
  }, [isOfflineMode, selfDuelistId])

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
