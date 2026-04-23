import { useCallback, useState } from "react"
import type { PlayerBuild } from "@/app/page"
import type { RoundAction } from "@/lib/duelActions"

export interface ExternalMatchState {
  matchId: string
  status: "pending" | "running" | "finished"
  playersExpected: number
  playersJoined: number
}

export interface ActionPayload {
  playerId: string
  actionId: string
  targetId?: string
  timestamp: number
}

export function useMatchManager() {
  const [externalMatchState, setExternalMatchState] = useState<ExternalMatchState | null>(null)
  const [queuedPayloads, setQueuedPayloads] = useState<ActionPayload[]>([])

  const isOnlineMode = useCallback((build: PlayerBuild | null) => {
    if (!build) return false
    return build.gameMode !== "teste"
  }, [])

  const buildActionPayload = useCallback((playerId: string, action: RoundAction): ActionPayload => {
    return {
      playerId,
      actionId: action.spellName || action.type,
      targetId: action.targetId,
      timestamp: Date.now(),
    }
  }, [])

  const handleAction = useCallback((playerId: string, action: RoundAction) => {
    const payload = buildActionPayload(playerId, action)
    setQueuedPayloads((prev) => [...prev, payload])
    return payload
  }, [buildActionPayload])

  const applyExternalState = useCallback((next: ExternalMatchState) => {
    setExternalMatchState(next)
  }, [])

  return {
    externalMatchState,
    queuedPayloads,
    isOnlineMode,
    buildActionPayload,
    handleAction,
    applyExternalState,
  }
}
