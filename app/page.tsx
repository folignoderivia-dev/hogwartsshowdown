"use client"

import { useState, useEffect, useRef } from "react"
import CommonRoom from "@/components/common-room"
import DuelArena, { type DuelArenaHandle } from "@/components/duel-arena"
import { applyMatchElo, getSessionUserId, getUserById } from "@/lib/database"
import type { DbUser } from "@/lib/database"
import { useMatchManager } from "@/hooks/useMatchManager"

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
  const [playerBuild, setPlayerBuild] = useState<PlayerBuild | null>(null)
  const [accountUser, setAccountUser] = useState<DbUser | null>(null)
  /** Ex.: `duelArenaRef.current?.submitRemoteAction(id, createCastAction(...))` quando o WebSocket estiver ativo. */
  const duelArenaRef = useRef<DuelArenaHandle>(null)
  const { isOnlineMode, applyExternalState, externalMatchState } = useMatchManager()

  useEffect(() => {
    const id = getSessionUserId()
    if (id) {
      const u = getUserById(id)
      if (u) setAccountUser(u)
    }
  }, [])

  const handleStartDuel = (build: PlayerBuild) => {
    if (!build.userId) return
    setPlayerBuild(build)
    if (!isOnlineMode(build)) {
      setMatchPending(false)
      setScreen("battle")
      return
    }
    applyExternalState({
      matchId: `local-${Date.now()}`,
      status: "pending",
      playersExpected: build.gameMode === "2v2" ? 4 : build.gameMode === "ffa" ? 4 : 2,
      playersJoined: 1,
    })
    setMatchPending(true)
  }

  const handleReturnToCommonRoom = () => {
    setScreen("setup")
    setMatchPending(false)
    const id = getSessionUserId()
    if (id) {
      const u = getUserById(id)
      if (u) setAccountUser(u)
    }
  }

  const handleBattleEnd = (outcome: "win" | "lose", userId?: string) => {
    if (!userId) return
    applyMatchElo(userId, outcome)
    const u = getUserById(userId)
    if (u) setAccountUser(u)
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
