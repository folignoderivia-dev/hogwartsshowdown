"use client"

import { useState, useEffect, useRef } from "react"
import CommonRoom from "@/components/common-room"
import DuelArena, { type DuelArenaHandle } from "@/components/duel-arena"
import { applyMatchElo, getSessionUserId, getUserById } from "@/lib/database"
import type { DbUser } from "@/lib/database"
import { useMatchManager } from "@/hooks/useMatchManager"
import type { RoundAction } from "@/lib/duelActions"

export interface PlayerBuild {
  name: string
  house: string
  wand: string
  potion: string
  spells: string[]
  avatar: string
  gameMode: "teste" | "1v1" | "2v2" | "ffa"
  userId?: string
  username?: string
  elo?: number
}

export default function Home() {
  const [screen, setScreen] = useState<"setup" | "battle">("setup")
  const [matchPending, setMatchPending] = useState(false)
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [playerBuild, setPlayerBuild] = useState<PlayerBuild | null>(null)
  const [accountUser, setAccountUser] = useState<DbUser | null>(null)
  /** Ex.: `duelArenaRef.current?.submitRemoteAction(id, createCastAction(...))` quando o WebSocket estiver ativo. */
  const duelArenaRef = useRef<DuelArenaHandle>(null)
  const unsubscribeMatchRef = useRef<null | (() => void)>(null)
  const { isOnlineMode, applyExternalState, externalMatchState, createOrJoinMatch, subscribeToMatch, handleAction } = useMatchManager()

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
    void (async () => {
      if (!isOnlineMode(build)) {
        setActiveMatchId(null)
        setMatchPending(false)
        setScreen("battle")
        return
      }

      const joined = await createOrJoinMatch(build.gameMode, build.userId!)
      setActiveMatchId(joined.matchId)
      applyExternalState(joined)
      setMatchPending(joined.status !== "running")
      setScreen(joined.status === "running" ? "battle" : "setup")

      unsubscribeMatchRef.current?.()
      unsubscribeMatchRef.current = subscribeToMatch(joined.matchId, {
        onState: (st) => {
          applyExternalState(st)
          if (st.status === "running" && st.playersJoined >= st.playersExpected) {
            setMatchPending(false)
            setScreen("battle")
          }
        },
        onAction: (payload) => {
          if (!build.userId || payload.playerId === build.userId) return
          duelArenaRef.current?.submitRemoteAction(payload.playerId, payload.action)
        },
      })
    })()
  }

  const handleReturnToCommonRoom = () => {
    setScreen("setup")
    setMatchPending(false)
    setActiveMatchId(null)
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
    void (async () => {
      await applyMatchElo(userId, outcome)
      const u = await getUserById(userId)
      if (u) setAccountUser(u)
    })()
  }

  useEffect(() => {
    return () => {
      unsubscribeMatchRef.current?.()
      unsubscribeMatchRef.current = null
    }
  }, [])

  const dispatchActionToSupabase = (_playerId: string, action: RoundAction, matchId?: string) => {
    if (!playerBuild || !playerBuild.userId || playerBuild.gameMode === "teste") return
    handleAction(playerBuild.userId, action, matchId || activeMatchId || undefined)
  }

  return (
    <main className="min-h-screen bg-background">
      {screen === "setup" ? (
        <CommonRoom
          currentUser={accountUser}
          onAuthChange={setAccountUser}
          onStartDuel={handleStartDuel}
        />
      ) : (
        <DuelArena
          ref={duelArenaRef}
          playerBuild={playerBuild!}
          onReturn={handleReturnToCommonRoom}
          onBattleEnd={handleBattleEnd}
          matchId={activeMatchId || undefined}
          onDispatchAction={dispatchActionToSupabase}
        />
      )}
      {matchPending && (
        <section className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-xl rounded-xl border border-amber-700 bg-stone-900 p-8 text-center text-amber-100">
            <h2 className="text-2xl font-bold text-amber-300">Aguardando Oponentes...</h2>
            <p className="mt-3 text-sm text-amber-100/85">
              Matchmaking pendente para o modo online. O duelo inicia somente quando a sala tiver jogadores reais suficientes.
            </p>
            <p className="mt-2 text-xs text-amber-300/90">
              Sala: {externalMatchState?.matchId ?? "-"} · Jogadores: {externalMatchState?.playersJoined ?? 1}/{externalMatchState?.playersExpected ?? 2}
            </p>
            <button
              type="button"
              className="mt-5 rounded-md border border-amber-700 px-4 py-2 text-sm hover:bg-amber-900/30"
              onClick={handleReturnToCommonRoom}
            >
              Voltar para sala comunal
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
