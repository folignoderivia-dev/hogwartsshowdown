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
import { calculateTurnOutcome, isDefeated, getTotalHP } from "./lib/turn-engine"
import { HOUSE_GDD, HOUSE_MODIFIERS, WAND_PASSIVES, SPELL_DATABASE, rollSpellPower, type SpellInfo } from "./lib/data-store"
import type { Duelist, HPState, DebuffType } from "./lib/arena-types"
import type { RoundAction } from "./lib/duelActions"
import type { PlayerBuild, GameMode } from "./lib/types"

const app = express()

// 1. CORS — primeira coisa no Express
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], credentials: true }))

// 2. Health check raiz — Railway usa para saber se o container está vivo
app.get("/", (_req, res) => {
  res.status(200).json({ status: "Showdown Server Online", port: process.env.PORT })
})

app.use(express.json())

const httpServer = createServer(app)

// 3. Socket.io com liberação total de transports
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["polling", "websocket"],
})

// 4. PORT injetada pelo Railway — NUNCA hardcodar
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
  players: Map<string, PlayerSlot>     // key = userId — jogadores ativos
  spectators: Map<string, string>      // userId → socketId — espectadores
  duelists: Duelist[]                  // estado canônico server-side
  turnNumber: number
  pendingActions: Map<string, RoundAction>
  circumFlames: Record<string, number>
  gameStarted: boolean
  idleTimer?: ReturnType<typeof setTimeout>
}

interface RecentResult {
  matchId: string
  gameMode: GameMode
  winnerNames: string[]
  loserNames: string[]
  eloDeltas: Record<string, number>   // userId → delta
  finishedAt: string
}

/** Histórico das últimas 30 partidas finalizadas (em memória). */
const recentMatches: RecentResult[] = []

const activeMatches = new Map<string, MatchRoom>()

/** Emite snapshot de salas ativas para todos os sockets conectados. */
function broadcastActiveMatches() {
  const rooms = [...activeMatches.values()].map((r) => ({
    matchId: r.matchId,
    gameMode: r.gameMode,
    playersJoined: r.players.size,
    playersExpected: r.expectedPlayers,
    turnNumber: r.turnNumber,
    gameStarted: r.gameStarted,
    playerNames: [...r.players.values()].map((p) => p.build.name),
  }))
  io.emit("active_matches_update", { rooms, recentMatches: recentMatches.slice(0, 10) })
}

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
    if (house === "gryffindor") max = Math.max(1, max + HOUSE_GDD.gryffindor.manaStartDelta)
    if (house === "ravenclaw" && !info.isUnforgivable) max += HOUSE_GDD.ravenclaw.manaBonusNonUnforgivable
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
  const initiative = Math.floor(Math.random() * 10) + 1  // 1–10, oculto
  const defense = Math.floor(Math.random() * 41) + 10    // 10–50, oculto
  return {
    id: userId,
    name: build.name,
    house: build.house,
    wand: build.wand,
    avatar: build.avatar,
    spells: build.spells,
    hp: { bars: build.house === "slytherin" ? [100, 100, 100, 100] : [100, 100, 100, 100, 100] },
    speed: Math.round(100 * mod.speed) - seatIndex * 2 + initiative,
    defense,
    debuffs: [],
    isPlayer: false,
    team,
    spellMana: buildSpellManaForSpells(build.spells, build.house),
    turnsInBattle: 0,
    disabledSpells: {},
    missStreakBySpell: {},
  }
}

/** Retorna os duelistas no ponto de vista de um jogador específico (isPlayer e team corretos).
 *  - Em 2v2: preserva o time canônico do servidor, invertendo tudo se o viewer é "enemy"
 *    (garante que o viewer veja seu time embaixo e o time adversário em cima).
 *  - Em 1v1/FFA: usa o time canônico do servidor como base e inverte se necessário.
 *  - Remove o campo `defense` para manter a defesa como status oculto no cliente. */
function personalizeDuelists(duelists: Duelist[], forUserId: string): Omit<Duelist, "defense">[] {
  const viewerCanonicalTeam = duelists.find((d) => d.id === forUserId)?.team ?? "player"
  const flip = viewerCanonicalTeam === "enemy"
  return duelists.map(({ defense: _hidden, ...d }) => ({
    ...d,
    isPlayer: d.id === forUserId,
    team: flip
      ? (d.team === "player" ? "enemy" : "player")
      : d.team,
  }))
}

function expectedPlayerCount(mode: GameMode): number {
  if (mode === "2v2" || mode === "ffa") return 4
  if (mode === "ffa3") return 3
  return 2
}

// ─── Rapinomônio (novo): drena mana de 1 spell aleatória de cada duelista ────

function applyRapinomonioBlock(duelists: Duelist[]): Duelist[] {
  let next = [...duelists]
  const casters = next.filter((d) => WAND_PASSIVES[d.wand]?.effect === "rapinomonio_drain_start")
  if (casters.length === 0) return next
  // Para cada duelista no campo, drena mana de 1 spell aleatória
  for (const target of next) {
    if (!target.spellMana || Object.keys(target.spellMana).length === 0) continue
    const spellKeys = Object.keys(target.spellMana)
    const pick = spellKeys[Math.floor(Math.random() * spellKeys.length)]
    const newSm = { ...target.spellMana }
    newSm[pick] = { ...newSm[pick], current: 0 }
    next = next.map((d) => (d.id === target.id ? { ...d, spellMana: newSm } : d))
    console.log(`[Rapinomônio] ${target.name}: spell "${pick}" iniciou com mana 0.`)
  }
  return next
}

// ─── Centauro: bloqueia spells de cura dos oponentes ao início ───────────────

function applyCentauroBlock(duelists: Duelist[]): Duelist[] {
  let next = [...duelists]
  const centauros = next.filter((d) => WAND_PASSIVES[d.wand]?.effect === "centauro_block_heals")
  for (const centauro of centauros) {
    const foes = next.filter((d) => d.team !== centauro.team)
    for (const foe of foes) {
      const healSpells = ["Ferula", "Episkey", "Vulnera Sanetur"]
      const nextDisabled = { ...(foe.disabledSpells || {}) }
      healSpells.forEach((s) => { if (foe.spells.includes(s)) nextDisabled[s] = 999 })
      next = next.map((d) => (d.id === foe.id ? { ...d, disabledSpells: nextDisabled } : d))
    }
    console.log(`[Centauro] ${centauro.name}: oponentes bloqueados de usar spells de cura.`)
  }
  return next
}

// ─── Debug log de passivas ao iniciar batalha ─────────────────────────────────

function logPassivesDebug(duelists: Duelist[]): void {
  console.log("\n╔══════════════════════════════════════════════════╗")
  console.log("║         DEBUG: PASSIVAS ATIVAS AO INÍCIO         ║")
  console.log("╚══════════════════════════════════════════════════╝")
  for (const d of duelists) {
    const wandPassive = WAND_PASSIVES[d.wand]
    const houseKey = d.house as keyof typeof HOUSE_GDD
    const hg = HOUSE_GDD[houseKey]
    const hpTotal = d.hp.bars.reduce((s, v) => s + v, 0)
    console.log(`\n▶ ${d.name} [${d.house.toUpperCase()} | Núcleo: ${wandPassive?.name ?? d.wand}]`)
    console.log(`  HP inicial: ${hpTotal} (${d.hp.bars.length} barras)`)
    console.log(`  Núcleo: ${wandPassive?.description ?? "desconhecido"} (effect: ${wandPassive?.effect ?? "-"})`)
    if ("attackPriorityBonus" in hg) console.log(`  Casa: Prioridade ${(hg as { attackPriorityBonus: number }).attackPriorityBonus > 0 ? "+" : ""}${(hg as { attackPriorityBonus: number }).attackPriorityBonus}`)
    if ("critBonus" in hg)           console.log(`  Casa: +${Math.round((hg as { critBonus: number }).critBonus * 100)}% crit chance`)
    if ("thornsPercent" in hg)       console.log(`  Casa: ${Math.round((hg as { thornsPercent: number }).thornsPercent * 100)}% espinhos (thorns)`)
    if ("manaBonusNonUnforgivable" in hg) console.log(`  Casa: +${(hg as { manaBonusNonUnforgivable: number }).manaBonusNonUnforgivable} mana (não-Imperdoáveis)`)
    if ("manaStartDelta" in hg) console.log(`  Casa: ${(hg as { manaStartDelta: number }).manaStartDelta} mana inicial`)
    if (d.spellMana) {
      const manaLines = Object.entries(d.spellMana).map(([s, m]) => `${s}: ${m.current}/${m.max}`).join(", ")
      console.log(`  Mana: ${manaLines}`)
    }
  }
  console.log("\n══════════════════════════════════════════════════\n")
}

// ─── Idle timeout (W.O. por inatividade) ──────────────────────────────────────
const IDLE_TIMEOUT_MS = 120_000 // 2 minutos

function clearIdleTimer(room: MatchRoom) {
  if (room.idleTimer) {
    clearTimeout(room.idleTimer)
    room.idleTimer = undefined
  }
}

function startIdleTimer(room: MatchRoom, matchId: string) {
  clearIdleTimer(room)
  room.idleTimer = setTimeout(() => {
    if (!activeMatches.has(matchId)) return
    const aliveIds = room.duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
    const missing = aliveIds.filter((id) => !room.pendingActions.has(id))
    if (missing.length === 0) return

    const missingNames = missing
      .map((id) => room.duelists.find((d) => d.id === id)?.name ?? id.slice(0, 8))
      .join(", ")
    console.log(`[Server] W.O. por inatividade na sala ${matchId}: ${missingNames}`)

    for (const [uid, slot] of room.players) {
      const clientSocket = io.sockets.sockets.get(slot.socketId)
      if (!clientSocket) continue
      const isInactive = missing.includes(uid)
      clientSocket.emit("TURN_RESOLVED", {
        animationsToPlay: [],
        newDuelists: personalizeDuelists(room.duelists, uid),
        outcome: isInactive ? "lose" : "win",
        logs: [`[W.O.]: ${missingNames} perdeu por inatividade (2 min sem agir)!`],
        nextTurn: room.turnNumber,
        circumFlames: room.circumFlames,
      })
    }

    clearIdleTimer(room)
    setTimeout(() => activeMatches.delete(matchId), 10_000)
  }, IDLE_TIMEOUT_MS)
}

// ─── Lógica do Socket ──────────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log(`[Server] Conectado: ${socket.id}`)

  // ── JOIN_MATCH ──────────────────────────────────────────────────────────────
  socket.on(
    "JOIN_MATCH",
    ({ matchId, userId, build, isSpectator }: { matchId: string; userId: string; build: PlayerBuild; isSpectator?: boolean }) => {
      if (!matchId || !userId || !build) {
        socket.emit("ERROR", { message: "JOIN_MATCH: matchId, userId e build são obrigatórios." })
        return
      }

      socket.join(matchId)
      ;(socket as any)._arenaMatchId = matchId
      ;(socket as any)._arenaUserId = userId

      // Cria sala se não existe
      if (!activeMatches.has(matchId)) {
        activeMatches.set(matchId, {
          matchId,
          gameMode: build.gameMode,
          expectedPlayers: expectedPlayerCount(build.gameMode),
          players: new Map(),
          spectators: new Map(),
          duelists: [],
          turnNumber: 1,
          pendingActions: new Map(),
          circumFlames: {},
          gameStarted: false,
        })
      }

      const room = activeMatches.get(matchId)!

      // ── Espectador ─────────────────────────────────────────────────────────
      if (isSpectator) {
        room.spectators.set(userId, socket.id)
        console.log(`[Server] SPECTATOR entrou: ${userId.slice(0, 8)}… → sala ${matchId}`)
        if (room.gameStarted) {
          socket.emit("RECONNECT_STATE", {
            duelists: personalizeDuelists(room.duelists, userId),
            turnNumber: room.turnNumber,
            circumFlames: room.circumFlames,
          })
        }
        broadcastActiveMatches()
        return
      }

      // ── Reconexão mid-game ─────────────────────────────────────────────────
      if (room.gameStarted) {
        const pd = personalizeDuelists(room.duelists, userId)
        socket.emit("RECONNECT_STATE", {
          duelists: pd,
          turnNumber: room.turnNumber,
          circumFlames: room.circumFlames,
        })
        console.log(`[Server] Reconexão mid-game: ${userId.slice(0, 8)}… → ${matchId}`)
        return
      }

      // ── Atribui slot (ignora se já está na sala) ───────────────────────────
      if (!room.players.has(userId)) {
        const seatIndex = room.players.size
        // Em 2v2: seats 0,1 → "player" (Time A), seats 2,3 → "enemy" (Time B)
        // Em outros modos: seat 0 → "player", demais → "enemy"
        const team: "player" | "enemy" = room.gameMode === "2v2"
          ? (seatIndex < 2 ? "player" : "enemy")
          : (seatIndex === 0 ? "player" : "enemy")
        const duelist = buildDuelist(build, userId, team, seatIndex)
        room.players.set(userId, {
          socketId: socket.id,
          userId,
          build,
          duelist,
          team,
          index: seatIndex,
        })
        console.log(`[Server] Player ${seatIndex + 1} (${team}) entrou: ${build.name} (${userId.slice(0, 8)}…)`)
      } else {
        room.players.get(userId)!.socketId = socket.id
      }

      // Informa a sala quantos players já entraram (inclui nomes para exibição no lobby)
      io.to(matchId).emit("ROOM_STATUS", {
        playersJoined: room.players.size,
        playersExpected: room.expectedPlayers,
        playerNames: [...room.players.values()].map((p) => p.build.name),
      })

      broadcastActiveMatches()

      // Inicia a partida quando a sala está cheia
      if (room.players.size >= room.expectedPlayers && !room.gameStarted) {
        room.gameStarted = true
        let initialDuelists = [...room.players.values()].map((p) => p.duelist)
        initialDuelists = applyRapinomonioBlock(initialDuelists)
        initialDuelists = applyCentauroBlock(initialDuelists)
        room.duelists = initialDuelists

        // Debug: exibe passivas ativas ao iniciar a batalha
        logPassivesDebug(room.duelists)
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

        // Espectadores também recebem o estado inicial
        for (const [uid, sid] of room.spectators) {
          const specSocket = io.sockets.sockets.get(sid)
          if (specSocket) {
            specSocket.emit("GAME_START", {
              duelists: personalizeDuelists(room.duelists, uid),
              turnNumber: 1,
              gameMode: room.gameMode,
              yourPlayerId: uid,
            })
          }
        }

        startIdleTimer(room, matchId)
        broadcastActiveMatches()
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

      // Auto-skip autoritativo para jogadores incapacitados (stun, freeze, paralysis…)
      const INCAP_DEBUFFS = new Set(["stun", "freeze", "paralysis", "confusion"])
      for (const aliveId of aliveIds) {
        if (room.pendingActions.has(aliveId)) continue
        const d = room.duelists.find((x) => x.id === aliveId)
        if (d?.debuffs.some((db) => INCAP_DEBUFFS.has(db.type))) {
          room.pendingActions.set(aliveId, {
            casterId: aliveId,
            type: "skip",
            turnId: room.turnNumber,
            eventId: `auto-skip-${aliveId}-${room.turnNumber}`,
          })
          console.log(`[Server] Auto-skip para jogador incapacitado: ${aliveId.slice(0, 8)}…`)
        }
      }

      const allReady = aliveIds.length > 0 && aliveIds.every((id) => room.pendingActions.has(id))

      if (!allReady) return

      // Todos agiram — cancela o cronômetro de inatividade
      clearIdleTimer(room)

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

      console.log(`[Server] TURN_RESOLVED T${resolvedTurn} → ${room.gameMode} outcome=${outcome.outcome ?? "null"} ffaWinner=${outcome.ffaWinnerId ?? "-"}`)

      // ─── Envia resolução personalizada para cada jogador ──────────────────
      const isFfaMode = room.gameMode === "ffa" || room.gameMode === "ffa3"
      const ffaWinnerId = outcome.ffaWinnerId

      /** Personaliza outcome para cada jogador:
       * - FFA: win só para o sobrevivente final
       * - 1v1/2v2: engine retorna resultado relativo ao time "player" (seat 0/time A);
       *   jogadores no time "enemy" (seat 1 / time B) recebem o outcome invertido. */
      const personalizeOutcome = (uid: string): typeof outcome.outcome => {
        if (!outcome.outcome) return null
        if (isFfaMode) {
          return ffaWinnerId ? (uid === ffaWinnerId ? "win" : "lose") : outcome.outcome
        }
        const slot = room.players.get(uid)
        if (slot?.team === "enemy") {
          if (outcome.outcome === "win") return "lose"
          if (outcome.outcome === "lose") return "win"
        }
        return outcome.outcome
      }

      const emitResolution = (uid: string, sock: ReturnType<typeof io.sockets.sockets.get>) => {
        if (!sock) return
        sock.emit("TURN_RESOLVED", {
          animationsToPlay: outcome.animationsToPlay,
          newDuelists: personalizeDuelists(room.duelists, uid),
          outcome: personalizeOutcome(uid),
          logs: outcome.logs,
          nextTurn: room.turnNumber,
          circumFlames: room.circumFlames,
        })
      }

      for (const [uid, slot] of room.players) {
        emitResolution(uid, io.sockets.sockets.get(slot.socketId))
      }
      // Espectadores recebem o estado sem voto pessoal (outcome neutro)
      for (const [uid, sid] of room.spectators) {
        emitResolution(uid, io.sockets.sockets.get(sid))
      }

      // ─── Fim de jogo ─────────────────────────────────────────────────────
      if (outcome.outcome) {
        console.log(`[Server] Fim de jogo sala ${matchId}: ${outcome.outcome}`)

        // Calcula deltas de ELO por modo
        const eloDeltas: Record<string, number> = {}
        const winnerNames: string[] = []
        const loserNames: string[] = []

        for (const [uid, slot] of room.players) {
          let delta = 0
          let isWinner = false

          if (isFfaMode) {
            isWinner = uid === ffaWinnerId
            delta = isWinner ? 25 : 0 // FFA: sobrevivente +25, mortos sem penalidade
          } else if (room.gameMode === "2v2") {
            const playerTeam = slot.team
            // Quem está no time que ganhou recebe +20; perdedor -25
            if (outcome.outcome === "win") {
              isWinner = playerTeam === "player"
            } else {
              isWinner = playerTeam === "enemy"
            }
            delta = isWinner ? 20 : -25
          } else {
            // 1v1
            const isPlayerSide = slot.team === "player"
            isWinner = outcome.outcome === "win" ? isPlayerSide : !isPlayerSide
            delta = isWinner ? 20 : -25
          }

          eloDeltas[uid] = delta
          if (isWinner) winnerNames.push(slot.build.name)
          else loserNames.push(slot.build.name)
        }

        // Emite MATCH_RESULT para jogadores e espectadores
        const matchResultPayload = { matchId, gameMode: room.gameMode, eloDeltas, winnerNames, loserNames }
        for (const [uid, slot] of room.players) {
          const cs = io.sockets.sockets.get(slot.socketId)
          if (cs) cs.emit("MATCH_RESULT", { ...matchResultPayload, yourDelta: eloDeltas[uid] ?? 0 })
        }
        for (const [, sid] of room.spectators) {
          const ss = io.sockets.sockets.get(sid)
          if (ss) ss.emit("MATCH_RESULT", matchResultPayload)
        }

        // Guarda no histórico em memória
        recentMatches.unshift({
          matchId,
          gameMode: room.gameMode,
          winnerNames,
          loserNames,
          eloDeltas,
          finishedAt: new Date().toISOString(),
        })
        if (recentMatches.length > 30) recentMatches.splice(30)

        broadcastActiveMatches()
        setTimeout(() => activeMatches.delete(matchId), 60_000)
      } else {
        startIdleTimer(room, matchId)
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

  // ── SEND_EMOJI ────────────────────────────────────────────────────────────────
  socket.on("send_emoji", ({ matchId, userId, emoji }: { matchId: string; userId: string; emoji: string }) => {
    // Retransmite para todos na sala (incluindo o emitente via broadcast)
    io.to(matchId).emit("emoji_received", { userId, emoji })
  })

  // ── LIST_ACTIVE_MATCHES ───────────────────────────────────────────────────────
  socket.on("LIST_ACTIVE_MATCHES", () => {
    const rooms = [...activeMatches.values()].map((r) => ({
      matchId: r.matchId,
      gameMode: r.gameMode,
      playersJoined: r.players.size,
      playersExpected: r.expectedPlayers,
      turnNumber: r.turnNumber,
      gameStarted: r.gameStarted,
      playerNames: [...r.players.values()].map((p) => p.build.name),
    }))
    socket.emit("active_matches_update", { rooms, recentMatches: recentMatches.slice(0, 10) })
  })

  // ── LEAVE_MATCH ───────────────────────────────────────────────────────────────
  socket.on("LEAVE_MATCH", ({ matchId, userId }: { matchId: string; userId: string }) => {
    socket.leave(matchId)
    const room = activeMatches.get(matchId)
    if (!room) return
    console.log(`[Server] LEAVE_MATCH: ${userId.slice(0, 8)}… saiu de ${matchId}`)
    // Remove espectador se for o caso
    if (room.spectators.has(userId)) {
      room.spectators.delete(userId)
      broadcastActiveMatches()
      return
    }
    if (room.gameStarted && room.players.has(userId)) {
      clearIdleTimer(room)
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

// ─── Teste de CORS ─────────────────────────────────────────────────────────────
app.get("/test-cors", (_req, res) => {
  res.json({ cors: "ok", origin: _req.headers.origin || "no-origin", ts: new Date().toISOString() })
})

// ─── Crash guards — nunca derrubar o processo ─────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[Server] uncaughtException:", err)
})
process.on("unhandledRejection", (reason) => {
  console.error("[Server] unhandledRejection:", reason)
})

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`[PRODUÇÃO] Servidor Showdown rodando na porta ${PORT} (Host: 0.0.0.0)`)
})
