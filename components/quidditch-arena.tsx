"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { io, type Socket } from "socket.io-client"
import { Button } from "@/components/ui/button"
import type { PlayerBuild } from "@/lib/types"

// ─── Assets ───────────────────────────────────────────────────────────────────

const BACKGROUNDS = [
  "https://i.postimg.cc/cJ40SkQj/wp12183642-quidditch-field-wallpapers.jpg",
  "https://i.postimg.cc/s2DsrHpL/wp12183653-quidditch-field-wallpapers.jpg",
  "https://i.postimg.cc/fbTDNqc4/wp12183660-quidditch-field-wallpapers.png",
]

const PHASE_IMAGES = {
  attacker_1: "https://i.postimg.cc/jj509wTz/Gemini-Generated-Image-ykiy8bykiy8bykiy-(1).png",
  defender_1: "https://i.postimg.cc/N0MqV9t6/Gemini-Generated-Image-wc0ldgwc0ldgwc0l-(1).png",
  attacker_2: "https://i.postimg.cc/vmBFjgy7/Gemini-Generated-Image-u63sndu63sndu63s-(1).png",
  defender_2: "https://i.postimg.cc/rpmXb0T5/Gemini-Generated-Image-8v6jx58v6jx58v6j-(1).png",
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type QuidditchRole = "attacker" | "defender"
type Direction = "left" | "right" | "center" | "left_high" | "right_high"
type Screen = "lobby" | "waiting_opponent" | "playing" | "revealing" | "gameover"

const DIRECTIONS: { key: Direction; label: string; icon: string }[] = [
  { key: "left",       label: "Left",   icon: "←" },
  { key: "right",      label: "Right",    icon: "→" },
  { key: "center",     label: "Center",     icon: "●" },
  { key: "left_high",  label: "Left High",  icon: "↖" },
  { key: "right_high", label: "Right High",  icon: "↗" },
]

const DIR_LABEL: Record<Direction, string> = {
  left: "Left ←",
  right: "Right →",
  center: "Center ●",
  left_high: "Left High ↖",
  right_high: "Right High ↖",
}

interface TurnResult {
  turn: number
  attackerChoice: Direction
  defenderChoice: Direction
  scored: QuidditchRole
  scores: { attacker: number; defender: number }
}

interface QuidditchArenaProps {
  playerBuild: PlayerBuild
  matchId?: string         // se veio de uma sala criada pelo matchmaker
  onReturn: () => void
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function getPhase(turn: number): 1 | 2 {
  return turn <= 3 ? 1 : 2
}

function getPhaseName(phase: 1 | 2, role: QuidditchRole) {
  if (phase === 1) return role === "attacker" ? "Chaser" : "Keeper"
  return role === "attacker" ? "Seeker" : "Beater"
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function QuidditchArena({ playerBuild, matchId: externalMatchId, onReturn }: QuidditchArenaProps) {
  const bg = useRef(BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]).current

  const [screen, setScreen]         = useState<Screen>(externalMatchId ? "waiting_opponent" : "lobby")
  const [matchCode, setMatchCode]   = useState(externalMatchId ?? "")
  const [joinCode, setJoinCode]     = useState("")
  const [role, setRole]             = useState<QuidditchRole | null>(null)
  const [opponentName, setOpponentName] = useState("")
  const [turn, setTurn]             = useState(1)
  const [scores, setScores]         = useState({ attacker: 0, defender: 0 })
  const [chosen, setChosen]         = useState<Direction | null>(null)
  const [waitingOpponent, setWaitingOpponent] = useState(false)
  const [lastResult, setLastResult] = useState<TurnResult | null>(null)
  const [winner, setWinner]         = useState<{ role: QuidditchRole; name: string } | null>(null)
  const [launchAnim, setLaunchAnim] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const userId    = playerBuild.userId ?? "guest"
  const myName    = playerBuild.username ?? playerBuild.name ?? "Wizard"

  // ─── Socket ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const url = "https://hogwartsshowdown-production.up.railway.app"
    const s = io(url, { transports: ["websocket", "polling"], autoConnect: true })
    socketRef.current = s

    s.on("QUIDDITCH_START", ({ roles, playerNames }: { roles: Record<string, QuidditchRole>; playerNames: Record<string, string> }) => {
      const myRole = roles[userId]
      const oppId  = Object.keys(playerNames).find((id) => id !== userId) ?? ""
      setRole(myRole)
      setOpponentName(playerNames[oppId] ?? "Opponent")
      setTurn(1)
      setScores({ attacker: 0, defender: 0 })
      setChosen(null)
      setWaitingOpponent(false)
      setLastResult(null)
      setScreen("playing")
    })

    s.on("QUIDDITCH_OPPONENT_READY", () => {
      setWaitingOpponent(true)
    })

    s.on("QUIDDITCH_TURN_RESULT", (result: TurnResult) => {
      setLastResult(result)
      setScores(result.scores)
      setChosen(null)
      setWaitingOpponent(false)
      setScreen("revealing")
    })

    s.on("QUIDDITCH_GAME_OVER", ({ winner: winnerRole, winnerName, scores: finalScores }: { winner: QuidditchRole; winnerName: string; scores: { attacker: number; defender: number } }) => {
      setWinner({ role: winnerRole, name: winnerName })
      setScores(finalScores)
      setScreen("gameover")
    })

    // Se veio de sala externa, join imediato
    if (externalMatchId) {
      s.emit("QUIDDITCH_JOIN", { matchId: externalMatchId, userId, name: myName })
    }

    return () => { s.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const createMatch = useCallback(() => {
    const code = `Q-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    setMatchCode(code)
    setScreen("waiting_opponent")
    socketRef.current?.emit("QUIDDITCH_JOIN", { matchId: code, userId, name: myName })
  }, [myName, userId])

  const joinMatch = useCallback(() => {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setMatchCode(code)
    setScreen("waiting_opponent")
    socketRef.current?.emit("QUIDDITCH_JOIN", { matchId: code, userId, name: myName })
  }, [joinCode, myName, userId])

  const submitAction = useCallback((dir: Direction) => {
    if (chosen || !matchCode || !socketRef.current) return
    setChosen(dir)
    setLaunchAnim(true)
    setTimeout(() => setLaunchAnim(false), 600)
    socketRef.current.emit("QUIDDITCH_ACTION", { matchId: matchCode, userId, direction: dir })
  }, [chosen, matchCode, userId])

  const nextTurn = useCallback(() => {
    if (!lastResult) return
    const nextT = lastResult.turn + 1
    setTurn(nextT)
    setLastResult(null)
    setScreen("playing")
  }, [lastResult])

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const phase = getPhase(turn)
  const myRoleName = role ? getPhaseName(phase, role) : ""

  const myImage = role
    ? (phase === 1
      ? (role === "attacker" ? PHASE_IMAGES.attacker_1 : PHASE_IMAGES.defender_1)
      : (role === "attacker" ? PHASE_IMAGES.attacker_2 : PHASE_IMAGES.defender_2))
    : ""

  const oppRole: QuidditchRole | null = role ? (role === "attacker" ? "defender" : "attacker") : null
  const oppImage = oppRole
    ? (phase === 1
      ? (oppRole === "attacker" ? PHASE_IMAGES.attacker_1 : PHASE_IMAGES.defender_1)
      : (oppRole === "attacker" ? PHASE_IMAGES.attacker_2 : PHASE_IMAGES.defender_2))
    : ""

  // ─── Telas ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      {/* Overlay escurecido */}
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">

        {/* ── LOBBY ── */}
        {screen === "lobby" && (
          <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-amber-700/50 bg-stone-900/90 p-8 text-center shadow-2xl">
            <h1 className="text-3xl font-bold text-amber-300">🏆 Quadribol 1v1</h1>
            <p className="text-sm text-amber-200/70">Mini-jogo de Quadribol. Sem varinhas, sem feitiços — só habilidade!</p>

            <Button
              onClick={createMatch}
              className="w-full bg-amber-700 py-6 text-lg font-bold text-white hover:bg-amber-600"
            >
              Criar Partida
            </Button>

            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-amber-700 bg-stone-800 px-3 py-2 text-center text-sm text-amber-100 placeholder:text-amber-600"
                placeholder="Código da sala (Q-XXXXX)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinMatch()}
              />
              <Button
                onClick={joinMatch}
                disabled={!joinCode.trim()}
                className="border border-amber-600 bg-stone-800 text-amber-200 hover:bg-amber-900"
              >
                Entrar
              </Button>
            </div>

            <Button variant="ghost" className="text-amber-500" onClick={onReturn}>
              ← Voltar ao Lobby
            </Button>
          </div>
        )}

        {/* ── AGUARDANDO OPONENTE ── */}
        {screen === "waiting_opponent" && (
          <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-amber-700/50 bg-stone-900/90 p-8 text-center shadow-2xl">
            <h1 className="text-2xl font-bold text-amber-300">🏆 Quadribol 1v1</h1>
            <p className="text-sm text-amber-400">Compartilhe este código com seu adversário:</p>
            <div className="rounded-lg border border-amber-600 bg-stone-800 py-4 text-3xl font-mono font-bold tracking-widest text-amber-200">
              {matchCode}
            </div>
            <div className="flex items-center justify-center gap-2 text-amber-300">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-amber-400" />
              <span className="text-sm">Aguardando adversário...</span>
            </div>
            <Button variant="ghost" className="text-amber-500" onClick={onReturn}>
              ← Cancelar
            </Button>
          </div>
        )}

        {/* ── JOGO ── */}
        {screen === "playing" && role && (
          <div className="flex w-full max-w-2xl flex-col gap-4">
            {/* Cabeçalho: placar + turno */}
            <div className="flex items-center justify-between rounded-xl border border-amber-700/40 bg-stone-900/85 px-6 py-3">
              <div className="text-center">
                <p className="text-xs text-amber-400">Artilheiro</p>
                <p className="text-3xl font-bold text-amber-200">{scores.attacker}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-amber-300">
                  Turno {turn}/6 — {phase === 1 ? "Artilheiro vs Goleiro" : "Apanhador vs Batedor"}
                </p>
                <p className="text-xs text-amber-500">Sua função: <span className="font-bold text-amber-200">{myRoleName}</span></p>
              </div>
              <div className="text-center">
                <p className="text-xs text-amber-400">Goleiro</p>
                <p className="text-3xl font-bold text-amber-200">{scores.defender}</p>
              </div>
            </div>

            {/* Personagens */}
            <div className="flex items-end justify-around gap-4">
              {/* Oponente */}
              <div className="flex flex-col items-center gap-2">
                <p className="rounded bg-stone-800/80 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {opponentName} — {oppRole ? getPhaseName(phase, oppRole) : ""}
                </p>
                <img
                  src={oppImage}
                  alt="Adversário"
                  className="h-44 w-auto animate-[float_3s_ease-in-out_infinite] drop-shadow-[0_0_18px_rgba(255,200,50,0.5)] object-contain"
                  style={{ animationDelay: "0.5s" }}
                />
                {waitingOpponent && (
                  <span className="rounded-full bg-green-700/70 px-2 py-0.5 text-xs text-green-200">✔ Escolheu</span>
                )}
              </div>

              {/* Bola no meio durante lançamento */}
              <div className="relative flex h-24 w-24 items-center justify-center">
                {launchAnim && (
                  <span
                    className="absolute text-5xl animate-[throw_0.6s_ease-out_forwards]"
                    style={{ fontSize: 48 }}
                  >
                    {phase === 1 ? "🔴" : "⚫"}
                  </span>
                )}
              </div>

              {/* Jogador */}
              <div className="flex flex-col items-center gap-2">
                <p className="rounded bg-stone-800/80 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {myName} — {myRoleName}
                </p>
                <img
                  src={myImage}
                  alt="Você"
                  className="h-44 w-auto animate-[float_3s_ease-in-out_infinite] drop-shadow-[0_0_18px_rgba(255,200,50,0.5)] object-contain"
                />
                {chosen && (
                  <span className="rounded-full bg-amber-700/70 px-2 py-0.5 text-xs text-amber-200">✔ {DIR_LABEL[chosen]}</span>
                )}
              </div>
            </div>

            {/* Botões de direção */}
            <div className="rounded-xl border border-amber-700/40 bg-stone-900/85 p-4">
              <p className="mb-3 text-center text-sm font-semibold text-amber-300">
                {role === "attacker"
                  ? (phase === 1 ? "Para onde você vai chutar?" : "Para onde você vai esquivar?")
                  : (phase === 1 ? "Para onde vai o chute?" : "Para onde você vai lançar o Balaço?")}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {DIRECTIONS.map((d) => (
                  <Button
                    key={d.key}
                    disabled={!!chosen}
                    onClick={() => submitAction(d.key)}
                    className={`flex flex-col items-center gap-1 py-4 text-xs transition-all ${
                      chosen === d.key
                        ? "scale-95 border-amber-400 bg-amber-700 text-white"
                        : "border border-amber-700/50 bg-stone-800 text-amber-200 hover:border-amber-500 hover:bg-amber-900/60"
                    }`}
                  >
                    <span className="text-xl">{d.icon}</span>
                    <span>{d.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REVELAÇÃO ── */}
        {screen === "revealing" && lastResult && role && (
          <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-amber-700/50 bg-stone-900/90 p-8 text-center shadow-2xl">
            <h2 className="text-2xl font-bold text-amber-300">
              Turno {lastResult.turn} — Resultado
            </h2>

            <div className="flex items-center justify-around rounded-lg bg-stone-800 p-4">
              <div className="text-center">
                <p className="text-xs text-amber-400">Artilheiro</p>
                <p className="text-2xl font-bold text-amber-200">{DIR_LABEL[lastResult.attackerChoice]}</p>
              </div>
              <span className="text-3xl">⚡</span>
              <div className="text-center">
                <p className="text-xs text-amber-400">Goleiro/Batedor</p>
                <p className="text-2xl font-bold text-amber-200">{DIR_LABEL[lastResult.defenderChoice]}</p>
              </div>
            </div>

            {/* Resultado */}
            <div className={`rounded-lg px-4 py-3 text-lg font-bold ${lastResult.scored === role ? "bg-green-800/70 text-green-200" : "bg-red-900/70 text-red-200"}`}>
              {lastResult.scored === "attacker"
                ? (getPhase(lastResult.turn) === 1 ? "⚡ GOL! Artilheiro marcou!" : "🦅 Esquiva! Apanhador escapou!")
                : (getPhase(lastResult.turn) === 1 ? "🛡️ Defesa! Goleiro bloqueou!" : "💥 Acertou! Balaço no Apanhador!")}
              <p className="mt-1 text-sm font-normal text-white/70">
                {lastResult.scored === role ? "Você marcou um ponto!" : "Oponente marcou um ponto."}
              </p>
            </div>

            {/* Placar */}
            <div className="flex items-center justify-center gap-8 text-amber-200">
              <div className="text-center">
                <p className="text-xs text-amber-400">Artilheiro</p>
                <p className="text-4xl font-bold">{lastResult.scores.attacker}</p>
              </div>
              <span className="text-2xl text-amber-500">✕</span>
              <div className="text-center">
                <p className="text-xs text-amber-400">Goleiro</p>
                <p className="text-4xl font-bold">{lastResult.scores.defender}</p>
              </div>
            </div>

            {lastResult.turn < 6
              ? <Button onClick={nextTurn} className="w-full bg-amber-700 py-5 font-bold text-white hover:bg-amber-600">
                  Próximo Turno →
                </Button>
              : <p className="animate-pulse text-amber-400">Calculando resultado final...</p>
            }
          </div>
        )}

        {/* ── GAME OVER ── */}
        {screen === "gameover" && winner && (
          <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-amber-700/50 bg-stone-900/92 p-8 text-center shadow-2xl">
            <div className="text-5xl">{winner.name === myName ? "🏆" : "💀"}</div>
            <h2 className={`text-3xl font-extrabold ${winner.name === myName ? "text-amber-300" : "text-red-400"}`}>
              {winner.name === myName ? "Você Venceu!" : `${winner.name} Venceu!`}
            </h2>
            <p className="text-sm text-amber-400">
              {winner.role === "attacker" ? "Artilheiro/Apanhador" : "Goleiro/Batedor"} dominou a partida!
            </p>

            <div className="flex items-center justify-center gap-10 rounded-lg bg-stone-800 py-5">
              <div className="text-center">
                <p className="text-xs text-amber-400">Artilheiro</p>
                <p className="text-5xl font-bold text-amber-200">{scores.attacker}</p>
              </div>
              <span className="text-2xl text-amber-500">✕</span>
              <div className="text-center">
                <p className="text-xs text-amber-400">Goleiro</p>
                <p className="text-5xl font-bold text-amber-200">{scores.defender}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setScreen("lobby")
                  setRole(null)
                  setMatchCode("")
                  setWinner(null)
                  setScores({ attacker: 0, defender: 0 })
                  setTurn(1)
                }}
                className="flex-1 border border-amber-600 bg-stone-800 text-amber-200 hover:bg-amber-900"
              >
                Jogar Novamente
              </Button>
              <Button onClick={onReturn} className="flex-1 bg-amber-700 text-white hover:bg-amber-600">
                Sair
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Animações globais injetadas via style tag */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes throw {
          0%   { transform: translateX(0) scale(1); opacity: 1; }
          60%  { transform: translateX(-80px) scale(1.3); opacity: 0.8; }
          100% { transform: translateX(-160px) scale(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
