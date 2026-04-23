"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import nextDynamic from "next/dynamic"
import CommonRoom from "@/components/common-room"
import { applyMatchElo, getSessionUserId, getUserById } from "@/lib/database"
import type { DbUser } from "@/lib/database"
import { useMatchManager, type ExternalMatchState } from "@/hooks/useMatchManager"
import type { RoundAction } from "@/lib/duelActions"
import type { PlayerBuild } from "@/lib/constants"

export const dynamic = "force-dynamic"

const DuelArena = nextDynamic(() => import("@/components/duel-arena"), {
  ssr: false,
  loading: () => <p>Carregando Arena...</p>,
})

interface DuelArenaHandle {
  submitRemoteAction: (casterId: string, action: RoundAction) => void
}

export default function Home() {
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  const [screen, setScreen] = useState<"setup" | "battle">("setup")
  const [matchPending, setMatchPending] = useState(false)
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [playerBuild, setPlayerBuild] = useState<PlayerBuild | null>(null)
  const [accountUser, setAccountUser] = useState<DbUser | null>(null)
  const [pendingSpectate, setPendingSpectate] = useState<{ matchId: string; mode: PlayerBuild["gameMode"] } | null>(null)
  const [openRooms, setOpenRooms] = useState<Array<{ matchId: string; mode: PlayerBuild["gameMode"]; host: string; playersJoined: number; playersExpected: number }>>([])
  /** Ex.: `duelArenaRef.current?.submitRemoteAction(id, createCastAction(...))` quando o WebSocket estiver ativo. */
  const duelArenaRef = useRef<DuelArenaHandle>(null)
  const unsubscribeMatchRef = useRef<null | (() => void)>(null)
  const { isOnlineMode, applyExternalState, externalMatchState, joinMatchmaker, createRoom, joinRoomById, fetchOpenRooms, findActiveMatchForPlayer, subscribeToMatch, handleAction } = useMatchManager()
  const [isSpectator, setIsSpectator] = useState(false)
  const [resumableMatch, setResumableMatch] = useState<{ matchId: string; mode: PlayerBuild["gameMode"]; status: "waiting" | "in_progress" } | null>(null)
  const normalizeIncomingAction = useCallback((playerId: string, action: RoundAction): RoundAction => {
    return {
      ...action,
      casterId: playerId,
      targetId: action.targetId,
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const id = await getSessionUserId()
      if (id) {
        const u = await getUserById(id)
        if (u) setAccountUser(u)
      }
    })()
  }, [])

  const handleStartDuel = (build: PlayerBuild) => {
    if (!build.userId) return
    setPlayerBuild(build)
    if (typeof window !== "undefined") window.localStorage.setItem(`duel:lastBuild:${build.userId}`, JSON.stringify(build))
    void (async () => {
      if (!isOnlineMode(build)) {
        setActiveMatchId(null)
        setMatchPending(false)
        setIsSpectator(false)
        setScreen("battle")
        return
      }

      const joined = await joinMatchmaker(build.gameMode, build.userId!, build.username || build.name)
      setActiveMatchId(joined.matchId)
      applyExternalState(joined)
      setMatchPending(joined.status !== "in_progress")
      setIsSpectator(false)
      setScreen(joined.status === "in_progress" ? "battle" : "setup")

      unsubscribeMatchRef.current?.()
      unsubscribeMatchRef.current = subscribeToMatch(joined.matchId, {
        onState: (st) => {
          applyExternalState(st)
          if (st.status === "in_progress" && st.playersJoined >= st.playersExpected) {
            setMatchPending(false)
            setScreen("battle")
          }
        },
        onAction: (payload) => {
          duelArenaRef.current?.submitRemoteAction(payload.playerId, normalizeIncomingAction(payload.playerId, payload.action))
        },
      })
    })()
  }

  const attachMatch = useCallback((build: PlayerBuild, joined: ExternalMatchState) => {
    setActiveMatchId(joined.matchId)
    applyExternalState(joined)
    setMatchPending(joined.status !== "in_progress")
    setIsSpectator(false)
    setScreen("battle")

    unsubscribeMatchRef.current?.()
    unsubscribeMatchRef.current = subscribeToMatch(joined.matchId, {
      onState: (st) => {
        applyExternalState(st)
        if (st.status === "in_progress" && st.playersJoined >= st.playersExpected) {
          setMatchPending(false)
        }
      },
      onAction: (payload) => {
        duelArenaRef.current?.submitRemoteAction(payload.playerId, normalizeIncomingAction(payload.playerId, payload.action))
      },
    })
  }, [applyExternalState, normalizeIncomingAction, subscribeToMatch])

  const handleCreateRoom = (build: PlayerBuild) => {
    if (!build.userId) return
    setPlayerBuild(build)
    if (typeof window !== "undefined") window.localStorage.setItem(`duel:lastBuild:${build.userId}`, JSON.stringify(build))
    void (async () => {
      if (!isOnlineMode(build)) {
        handleStartDuel(build)
        return
      }
      const created = await createRoom(build.gameMode, build.userId!, build.username || build.name)
      attachMatch(build, created)
    })()
  }

  const handleJoinOpenRoom = (build: PlayerBuild, matchId: string) => {
    if (!build.userId) return
    setPlayerBuild(build)
    if (typeof window !== "undefined") window.localStorage.setItem(`duel:lastBuild:${build.userId}`, JSON.stringify(build))
    void (async () => {
      const joined = await joinRoomById(matchId, build.userId!, build.username || build.name)
      attachMatch(build, joined)
    })()
  }

  const handleReturnToCommonRoom = () => {
    setScreen("setup")
    setMatchPending(false)
    setActiveMatchId(null)
    setIsSpectator(false)
    unsubscribeMatchRef.current?.()
    unsubscribeMatchRef.current = null
    void (async () => {
      const id = await getSessionUserId()
      if (id) {
        const u = await getUserById(id)
        if (u) setAccountUser(u)
      }
    })()
  }

  const handleBattleEnd = (outcome: "win" | "lose", userId?: string) => {
    if (!userId) return
    if (playerBuild?.gameMode === "teste") return
    void (async () => {
      await applyMatchElo(userId, outcome)
      const u = await getUserById(userId)
      if (u) setAccountUser(u)
    })()
  }

  useEffect(() => {
    if (!accountUser?.id) {
      setResumableMatch(null)
      return
    }
    void (async () => {
      const active = await findActiveMatchForPlayer(accountUser.id)
      if (!active) {
        setResumableMatch(null)
        return
      }
      setResumableMatch({ matchId: active.matchId, mode: active.mode, status: active.status })
    })()
  }, [accountUser?.id, findActiveMatchForPlayer])

  useEffect(() => {
    if (!accountUser) {
      setOpenRooms([])
      return
    }
    const refresh = async () => {
      const rows = await fetchOpenRooms()
      setOpenRooms(
        rows.map((r) => ({
          matchId: r.matchId,
          mode: r.mode,
          host: r.participantNames[0] || "Bruxo",
          playersJoined: r.playersJoined,
          playersExpected: r.playersExpected,
        }))
      )
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2500)
    return () => window.clearInterval(timer)
  }, [accountUser, fetchOpenRooms])

  useEffect(() => {
    return () => {
      unsubscribeMatchRef.current?.()
      unsubscribeMatchRef.current = null
    }
  }, [])

  const dispatchActionToSupabase = (_playerId: string, action: RoundAction, matchId?: string) => {
    if (!playerBuild || !playerBuild.userId || playerBuild.gameMode === "teste" || isSpectator) return
    handleAction(playerBuild.userId, action, matchId || activeMatchId || undefined)
  }

  const handleSpectateMatch = useCallback((matchId: string, mode: PlayerBuild["gameMode"]) => {
    const spectatorBuild: PlayerBuild = {
      name: accountUser?.username || "Espectador",
      house: "ravenclaw",
      wand: "unicorn",
      potion: "foco",
      spells: [],
      avatar: "bruxo01",
      gameMode: mode === "teste" ? "1v1" : mode,
      userId: accountUser?.id,
      username: accountUser?.username,
      elo: accountUser?.elo,
    }
    setPlayerBuild(spectatorBuild)
    setActiveMatchId(matchId)
    setIsSpectator(true)
    setMatchPending(false)
    setScreen("battle")

    unsubscribeMatchRef.current?.()
    unsubscribeMatchRef.current = subscribeToMatch(matchId, {
      onState: (st) => applyExternalState(st),
      onAction: (payload) => {
        duelArenaRef.current?.submitRemoteAction(payload.playerId, normalizeIncomingAction(payload.playerId, payload.action))
      },
    })
  }, [accountUser, applyExternalState, normalizeIncomingAction, subscribeToMatch])

  const handleResumeMatch = useCallback(() => {
    if (!accountUser || !resumableMatch) return
    const storageKey = `duel:lastBuild:${accountUser.id}`
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null
    let recoveredBuild: PlayerBuild | null = null
    if (raw) {
      try {
        recoveredBuild = JSON.parse(raw) as PlayerBuild
      } catch {
        recoveredBuild = null
      }
    }
    const fallbackBuild: PlayerBuild = {
      name: accountUser.username,
      house: recoveredBuild?.house || "ravenclaw",
      wand: recoveredBuild?.wand || "unicorn",
      potion: recoveredBuild?.potion || "foco",
      spells: recoveredBuild?.spells || [],
      avatar: recoveredBuild?.avatar || "bruxo01",
      gameMode: resumableMatch.mode,
      userId: accountUser.id,
      username: accountUser.username,
      elo: accountUser.elo,
    }
    setPlayerBuild(fallbackBuild)
    setActiveMatchId(resumableMatch.matchId)
    setIsSpectator(false)
    setMatchPending(resumableMatch.status !== "in_progress")
    setScreen("battle")
    unsubscribeMatchRef.current?.()
    unsubscribeMatchRef.current = subscribeToMatch(resumableMatch.matchId, {
      onState: (st) => {
        applyExternalState(st)
        setResumableMatch({ matchId: st.matchId, mode: st.mode, status: st.status })
        if (st.status === "in_progress" && st.playersJoined >= st.playersExpected) {
          setMatchPending(false)
        }
      },
      onAction: (payload) => {
        duelArenaRef.current?.submitRemoteAction(payload.playerId, normalizeIncomingAction(payload.playerId, payload.action))
      },
    })
  }, [accountUser, resumableMatch, subscribeToMatch, applyExternalState, normalizeIncomingAction])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const matchId = params.get("spectate")
    const modeParam = params.get("mode")
    if (!matchId) return
    const mode = (modeParam === "2v2" || modeParam === "ffa" || modeParam === "ffa3" || modeParam === "teste" || modeParam === "1v1" ? modeParam : "1v1") as PlayerBuild["gameMode"]
    setPendingSpectate({ matchId, mode })
  }, [])

  useEffect(() => {
    if (!pendingSpectate) return
    handleSpectateMatch(pendingSpectate.matchId, pendingSpectate.mode)
    setPendingSpectate(null)
  }, [pendingSpectate, handleSpectateMatch])

  if (!isClient) {
    return (
      <main className="min-h-screen wood-bg p-6 text-amber-100">
        <p>Inicializando cliente...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      {screen === "setup" ? (
        <CommonRoom
          currentUser={accountUser}
          onAuthChange={setAccountUser}
          onStartDuel={handleStartDuel}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinOpenRoom}
          openRooms={openRooms}
          onSpectateMatch={handleSpectateMatch}
          resumableMatch={resumableMatch}
          onResumeMatch={handleResumeMatch}
        />
      ) : (
        <DuelArena
          ref={duelArenaRef}
          playerBuild={playerBuild!}
          onReturn={handleReturnToCommonRoom}
          onBattleEnd={handleBattleEnd}
          matchId={activeMatchId || undefined}
          onDispatchAction={dispatchActionToSupabase}
          isSpectator={isSpectator}
          participantIds={externalMatchState?.participantIds || []}
          participantNames={externalMatchState?.participantNames || []}
          localNetworkId={playerBuild?.userId}
          matchStatus={externalMatchState?.status}
        />
      )}
      {matchPending && screen === "battle" && (
        <section className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center p-3">
          <div className="pointer-events-auto rounded-lg border border-amber-700 bg-stone-900/95 px-4 py-2 text-center text-xs text-amber-100">
            Aguardando jogadores... Sala {externalMatchState?.matchId ?? "-"} ({externalMatchState?.playersJoined ?? 1}/{externalMatchState?.playersExpected ?? 2})
          </div>
        </section>
      )}
    </main>
  )
}
