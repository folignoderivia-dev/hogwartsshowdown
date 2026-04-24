/**
 * Servidor autoritativo PvP — protocolo Pokémon Showdown.
 * Regra de Ouro: calculateTurnOutcome() SÓ RODA AQUI. O cliente é burro.
 *
 * Deploy: Railway — define PORT automaticamente via process.env.PORT.
 */
import express from "express"
import { createServer } from "http"
import { Server, type Socket } from "socket.io"
import cors from "cors"
import { calculateTurnOutcome, isDefeated, getTotalHP } from "@/lib/turn-engine"
import { HOUSE_GDD, HOUSE_MODIFIERS, WAND_PASSIVES, SPELL_DATABASE, rollSpellPower, type SpellInfo } from "@/lib/data-store"
import type { Duelist, HPState, DebuffType } from "@/lib/arena-types"
import type { RoundAction } from "@/lib/duelActions"
import type { PlayerBuild, GameMode } from "@/lib/types"

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
})

const PORT = process.env.PORT || 3001

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface PlayerSlot {
  socketId: string
  userId: string
  build: PlayerBuild
  duelist: Duelist
  team: "player" | "enemy"
  index: number
}

interface MatchRoom {
  matchId: string
  gameMode: GameMode
  expectedPlayers: number
  players: Map<string, PlayerSlot> // key = userId
  duelists: Duelist[]              // estado canônico server-side
  turnNumber: number
  pendingActions: Map<string, RoundAction>
  circumFlames: Record<string, number>
  gameStarted: boolean
}

const activeMatches = new Map<string, MatchRoom>()

// ─── Helpers de construção de Duelist ─────────────────────────────────────────

function buildSpellManaForSpells(
  spells: string[],
  house: string
): Record<string, { current: number; max: number }> {
  const out: Record<string, { current: number; max: number }> = {}
  spells.forEach((sn) => {
    const info = SPELL_DATABASE.find((s: SpellInfo) => s.name === sn)
    if (!info) return
    let max = info.pp
    if (house === "gryffindor") max = Math.max(1, max + (HOUSE_GDD.gryffindor as any).manaStartDelta)
    if (house === "ravenclaw" && !(info as any).isUnforgivable) max += (HOUSE_GDD.ravenclaw as any).manaBonusNonUnforgivable
    out[sn] = { current: max, max }
  })
  return out
}

function buildDuelist(
  build: PlayerBuild,
  userId: string,
  team: "player" | "enemy",
  seatIndex: number
): Duelist {
  const mod = HOUSE_MODIFIERS[build.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
  return {
    id: userId,
    name: build.name,
    house: build.house,
    wand: build.wand,
    avatar: build.avatar,
    spells: build.spells,
    hp: { bars: [100, 100, 100, 100, 100] },
    speed: Math.round(100 * mod.speed) - seatIndex * 2,
    debuffs: [],
    isPlayer: false,
    team,
    spellMana: buildSpellManaForSpells(build.spells, build.house),
    turnsInBattle: 0,
    disabledSpells: {},
    missStreakBySpell: {},
  }
}

/** Retorna os duelistas no ponto de vista de um jogador específico (isPlayer e team corretos). */
function personalizeDuelists(duelists: Duelist[], forUserId: string): Duelist[] {
  return duelists.map((d) => ({
    ...d,
    isPlayer: d.id === forUserId,
    team: d.id === forUserId ? "player" : "enemy",
  }))
}

function expectedPlayerCount(mode: GameMode): number {
  if (mode === "2v2" || mode === "ffa") return 4
  if (mode === "ffa3") return 3
  return 2
}

// ─── Rapinomonio block (aplica no início da partida) ─────────────────────────

function applyRapinomonioBlock(duelists: Duelist[]): Duelist[] {
  let next = [...duelists]
  const casters = next.filter((d) => WAND_PASSIVES[d.wand]?.effect === "rapinomonio_random_block_2")
  for (const caster of casters) {
    const foes = next.filter((d) => d.id !== caster.id && d.team !== caster.team)
    for (const foe of foes) {
      if (!foe.spells || foe.spells.length === 0) continue
      const shuffled = [...foe.spells].sort(() => Math.random() - 0.5)
      const picks = shuffled.slice(0, Math.min(2, shuffled.length))
      const nextDisabled = { ...(foe.disabledSpells || {}) }
      picks.forEach((s) => { nextDisabled[s] = Math.max(nextDisabled[s] || 0, 999) })
      next = next.map((d) => (d.id === foe.id ? { ...d, disabledSpells: nextDisabled } : d))
    }
  }
  return next
}

// ─── Lógica do Socket ──────────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log(`[Server] Conectado: ${socket.id}`)

  // ── JOIN_MATCH ──────────────────────────────────────────────────────────────
  socket.on(
    "JOIN_MATCH",
    ({ matchId, userId, build }: { matchId: string; userId: string; build: PlayerBuild }) => {
      if (!matchId || !userId || !build) {
        socket.emit("ERROR", { message: "JOIN_MATCH: matchId, userId e build são obrigatórios." })
        return
      }

      socket.join(matchId)
      console.log(`[Server] JOIN_MATCH: ${userId.slice(0, 8)}… → sala ${matchId}`)

      // Cria sala se não existe
      if (!activeMatches.has(matchId)) {
        activeMatches.set(matchId, {
          matchId,
          gameMode: build.gameMode,
          expectedPlayers: expectedPlayerCount(build.gameMode),
          players: new Map(),
          duelists: [],
          turnNumber: 1,
          pendingActions: new Map(),
          circumFlames: {},
          gameStarted: false,
        })
      }

      const room = activeMatches.get(matchId)!
      if (room.gameStarted) {
        // Reconexão mid-game: reenvia o estado atual para o jogador
        const pd = personalizeDuelists(room.duelists, userId)
        socket.emit("RECONNECT_STATE", {
          duelists: pd,
          turnNumber: room.turnNumber,
          circumFlames: room.circumFlames,
        })
        console.log(`[Server] Reconexão mid-game: ${userId.slice(0, 8)}… → ${matchId}`)
        return
      }

      // Atribui slot (ignora se já está na sala)
      if (!room.players.has(userId)) {
        const seatIndex = room.players.size
        const team: "player" | "enemy" = seatIndex === 0 ? "player" : "enemy"
        const duelist = buildDuelist(build, userId, team, seatIndex)
        room.players.set(userId, {
          socketId: socket.id,
          userId,
          build,
          duelist,
          team,
          index: seatIndex,
        })
        console.log(`[Server] Player ${seatIndex + 1} entrou: ${build.name} (${userId.slice(0, 8)}…)`)
      } else {
        // Atualiza socketId (reconexão antes de iniciar)
        room.players.get(userId)!.socketId = socket.id
      }

      // Associa socket → userId para desconexão
      ;(socket as any)._arenaMatchId = matchId
      ;(socket as any)._arenaUserId = userId

      // Informa a sala quantos players já entraram
      io.to(matchId).emit("ROOM_STATUS", {
        playersJoined: room.players.size,
        playersExpected: room.expectedPlayers,
      })

      // Inicia a partida quando a sala está cheia
      if (room.players.size >= room.expectedPlayers && !room.gameStarted) {
        room.gameStarted = true
        room.duelists = applyRapinomonioBlock([...room.players.values()].map((p) => p.duelist))

        console.log(`[Server] GAME_START → sala ${matchId} (${room.players.size} jogadores)`)

        // Envia estado personalizado para cada jogador
        for (const [uid, slot] of room.players) {
          const clientSocket = io.sockets.sockets.get(slot.socketId)
          if (clientSocket) {
            clientSocket.emit("GAME_START", {
              duelists: personalizeDuelists(room.duelists, uid),
              turnNumber: 1,
              gameMode: room.gameMode,
              yourPlayerId: uid,
            })
          }
        }
      }
    }
  )

  // ── SUBMIT_ACTION ───────────────────────────────────────────────────────────
  socket.on(
    "SUBMIT_ACTION",
    ({
      matchId,
      userId,
      turn,
      action,
    }: {
      matchId: string
      userId: string
      turn: number
      action: RoundAction
    }) => {
      const room = activeMatches.get(matchId)
      if (!room || !room.gameStarted) {
        socket.emit("ERROR", { message: "Sala não encontrada ou partida não iniciada." })
        return
      }
      if (turn !== room.turnNumber) {
        console.warn(`[Server] SUBMIT_ACTION turno errado: esperado ${room.turnNumber}, recebido ${turn}`)
        return
      }

      const normalizedAction: RoundAction = {
        ...action,
        casterId: userId,
        turnId: turn,
        eventId: action.eventId || `${userId}-${turn}-${Date.now()}`,
      }
      room.pendingActions.set(userId, normalizedAction)
      console.log(`[Server] SUBMIT_ACTION T${turn}: ${userId.slice(0, 8)}… → ${action.type}${action.spellName ? " " + action.spellName : ""}`)

      // Verifica se todos os vivos enviaram ação
      const aliveIds = room.duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
      const allReady = aliveIds.length > 0 && aliveIds.every((id) => room.pendingActions.has(id))

      if (!allReady) return

      // ─── Resolução autoritativa ─────────────────────────────────────────────
      const actions = aliveIds.map((id) => room.pendingActions.get(id)!)
      room.pendingActions.clear()

      let outcome: ReturnType<typeof calculateTurnOutcome>
      try {
        outcome = calculateTurnOutcome({
          duelists: room.duelists,
          actions,
          spellDatabase: SPELL_DATABASE,
          turnNumber: room.turnNumber,
          gameMode: room.gameMode,
          circumFlames: room.circumFlames,
        })
      } catch (e) {
        console.error("[Server] calculateTurnOutcome falhou:", e)
        io.to(matchId).emit("SYNC_ERROR", { message: "Erro na engine. Turno será repetido." })
        return
      }

      // Atualiza estado canônico
      room.duelists = Array.from(new Map(outcome.newDuelists.map((d) => [d.id, d])).values())
      const resolvedTurn = room.turnNumber
      room.turnNumber = resolvedTurn + 1

      // Atualiza circumFlames (decrementa a cada turno resolvido)
      const newCircumFlames: Record<string, number> = {}
      for (const [id, turns] of Object.entries(room.circumFlames)) {
        if (turns > 1) newCircumFlames[id] = turns - 1
      }
      room.circumFlames = newCircumFlames

      console.log(`[Server] TURN_RESOLVED T${resolvedTurn} → ${room.gameMode} outcome=${outcome.outcome ?? "null"}`)

      // Envia resolução personalizada para cada jogador
      for (const [uid, slot] of room.players) {
        const clientSocket = io.sockets.sockets.get(slot.socketId)
        if (clientSocket) {
          clientSocket.emit("TURN_RESOLVED", {
            animationsToPlay: outcome.animationsToPlay,
            newDuelists: personalizeDuelists(room.duelists, uid),
            outcome: outcome.outcome,
            logs: outcome.logs,
            nextTurn: room.turnNumber,
            circumFlames: room.circumFlames,
          })
        }
      }

      // Limpa sala ao fim do jogo
      if (outcome.outcome) {
        console.log(`[Server] Fim de jogo sala ${matchId}: ${outcome.outcome}`)
        setTimeout(() => activeMatches.delete(matchId), 60_000)
      }
    }
  )

  // ── CHAT_MESSAGE ─────────────────────────────────────────────────────────────
  socket.on(
    "CHAT_MESSAGE",
    ({ matchId, sender, text }: { matchId: string; sender: string; text: string }) => {
      socket.to(matchId).emit("CHAT_MESSAGE", { sender, text })
    }
  )

  // ── LEAVE_MATCH ───────────────────────────────────────────────────────────────
  socket.on("LEAVE_MATCH", ({ matchId, userId }: { matchId: string; userId: string }) => {
    socket.leave(matchId)
    const room = activeMatches.get(matchId)
    if (!room) return
    console.log(`[Server] LEAVE_MATCH: ${userId.slice(0, 8)}… saiu de ${matchId}`)
    if (room.gameStarted && room.players.has(userId)) {
      socket.to(matchId).emit("OPPONENT_LEFT", { userId })
    }
  })

  // ── disconnect ────────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const matchId = (socket as any)._arenaMatchId as string | undefined
    const userId = (socket as any)._arenaUserId as string | undefined
    console.log(`[Server] Desconectado: ${socket.id} (userId=${userId?.slice(0, 8)}…)`)
    if (!matchId || !userId) return
    const room = activeMatches.get(matchId)
    if (!room) return
    if (room.gameStarted) {
      socket.to(matchId).emit("OPPONENT_DISCONNECTED", { userId })
    }
  })
})

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms: activeMatches.size, ts: new Date().toISOString() })
})

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\n🟢 Servidor Showdown rodando em 0.0.0.0:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/health`)
})
