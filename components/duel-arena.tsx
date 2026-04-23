"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { ArrowLeft, FlaskConical, Send, Wand2, X } from "lucide-react"
import type { PlayerBuild } from "@/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SpellInfo } from "@/components/common-room"
import { HOUSE_GDD, HOUSE_MODIFIERS, rollSpellPower, SPELL_DATABASE, WAND_PASSIVES } from "@/components/common-room"
import type { RoundAction, RoundSyncSnapshot } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"

export type { RoundAction } from "@/lib/duelActions"

export interface DuelArenaHandle {
  /** Injeta ação remota (ex.: mensagem WebSocket do servidor). */
  submitRemoteAction: (casterId: string, action: RoundAction) => void
}

interface DuelArenaProps {
  playerBuild: PlayerBuild
  onReturn: () => void
  /** Chamado ao encerrar duelo para atualizar ELO (modo online / conta). */
  onBattleEnd?: (outcome: "win" | "lose", userId?: string) => void
  matchId?: string
  onDispatchAction?: (playerId: string, action: RoundAction, matchId?: string) => void
  isSpectator?: boolean
  participantIds?: string[]
  participantNames?: string[]
  localNetworkId?: string
}

type DebuffType =
  | "burn"
  | "stun"
  | "freeze"
  | "taunt"
  | "disarm"
  | "protego"
  | "slow"
  | "mark"
  | "confusion"
  | "poison"
  | "paralysis"
  | "provoke"
  | "no_potion"
  | "silence_defense"
  | "damage_amp"
  | "arestum_penalty"
  | "lumus_acc_down"
  | "spell_disable"
  | "salvio_reflect"
  | "anti_debuff"
  | "crit_boost"
  | "unforgivable_acc_down"
  | "protego_maximo"
type BattleStatus = "idle" | "selecting" | "resolving" | "finished"

interface Debuff {
  type: DebuffType
  duration: number
  /** ex.: id do provocador para Provoke */
  meta?: string
}
interface HPState {
  bars: number[]
}
interface Duelist {
  id: string
  name: string
  house: string
  wand: string
  avatar?: string
  spells: string[]
  hp: HPState
  speed: number
  debuffs: Debuff[]
  isPlayer?: boolean
  team: "player" | "enemy"
  /** Mana por feitiço (todos os duelistas). */
  spellMana?: Record<string, { current: number; max: number }>
  lastSpellUsed?: string
  lastRoundSpellWasProtego?: boolean
  lastRoundSpellWasLumus?: boolean
  arrestoStacks?: number
  cruciusWeakness?: boolean
  wandPassiveStripped?: boolean
  circumAura?: number
  maximosChargePct?: number
  nextAccBonusPct?: number
  nextDamagePotionMult?: number
  destinyBond?: boolean
  disabledSpells?: Record<string, number>
  /** Suaviza RNG: sequência de erros aumenta chance no próximo cast. */
  missStreakBySpell?: Record<string, number>
  /** Turnos de batalha completos (para passivas acumulativas). */
  turnsInBattle?: number
}
type Point = { x: number; y: number }

/** VFX exibido na arena durante ~1s após a narração central. */
type ArenaVfxState =
  | null
  | {
      key: number
      mode:
        | "beam"
        | "beam-thin"
        | "beam-thick"
        | "beam-huge"
        | "beam-pulse"
        | "fireball"
        | "shockwave"
        | "x"
        | "explosion"
        | "mist"
        | "lightning"
        | "shield"
        | "heal-rise"
        | "flames-hud"
        | "marker-bang"
        | "marker-question"
      from?: Point
      to?: Point
      center?: Point
      color: string
      color2?: string
      casterId?: string
      targetIds?: string[]
      lightningBolts?: { x1: number; y1: number; x2: number; y2: number }[]
      xSize?: "sm" | "md" | "lg"
      active: boolean
    }

const HAND_BOTTOM = "https://i.postimg.cc/hPdCk474/varinhaposicao03.png"
const HAND_TOP = "https://i.postimg.cc/3JvLsrD8/varinhaposicao02.png"
const SCENARIOS = [
  "https://i.postimg.cc/wjK6zBfh/cenario01.png",
  "https://i.postimg.cc/Gm0cRp7F/cenario02.png",
  "https://i.postimg.cc/jSVsTjgy/cenario03.png",
  "https://i.postimg.cc/rw68Tpnx/cenario04.png",
  "https://i.postimg.cc/cLqsWJ9c/cenario05.png",
  "https://i.postimg.cc/HkGpmLZ2/cenario06.png",
  "https://i.postimg.cc/wjK6zBf2/cenario07.png",
  "https://i.postimg.cc/P5GtHq3K/cenario08.png",
  "https://i.postimg.cc/QdLXDM46/cenario09.png",
  "https://i.postimg.cc/L8dHSsCQ/cenario10.png",
  "https://i.postimg.cc/Jzw18h6F/cenario11.png",
  "https://i.postimg.cc/8zhTzV9Z/cenario12.png",
]
const AVATAR_IMAGES: Record<string, string> = {
  bruxo01: "https://i.postimg.cc/x8NHhC8x/bruxo01.png",
  bruxo02: "https://i.postimg.cc/nr97gzrY/bruxo02.png",
  bruxo03: "https://i.postimg.cc/QCK5wtCg/bruxo03.png",
  bruxa01: "https://i.postimg.cc/brSbWJr6/bruxa01.png",
  bruxa02: "https://i.postimg.cc/L5gfwX5D/bruxa02.png",
  bruxa03: "https://i.postimg.cc/1XV62tXH/bruxa03.png",
}
const DEFAULT_AVATARS = ["bruxo01", "bruxo02", "bruxo03", "bruxa01"]
const HOUSE_SYMBOL: Record<string, string> = {
  gryffindor: "🦁",
  slytherin: "🐍",
  ravenclaw: "🦅",
  hufflepuff: "🦡",
}
const POTION_NAMES: Record<string, string> = {
  wiggenweld: "Wiggenweld",
  mortovivo: "Morto Vivo",
  edurus: "Edurus",
  maxima: "Maxima",
  foco: "Foco",
  merlin: "Poção de Merlin",
}
const DEBUFF_LABEL: Record<DebuffType, string> = {
  burn: "🔥 BURN",
  freeze: "❄️ FREEZE",
  stun: "⚡ STUN",
  taunt: "🧠 TAUNT",
  disarm: "🪄 DISARM",
  protego: "🛡️ PROTEGO",
  slow: "⏳ LENTO",
  mark: "◎ MARCA",
  confusion: "😵 CONFUSÃO",
  poison: "☠️ VENENO",
  paralysis: "⚡ PARALISIA",
  provoke: "👊 PROVOCAÇÃO",
  no_potion: "🚫 SEM POÇÃO",
  silence_defense: "🔇 SILÊNCIO DEF.",
  damage_amp: "⬆️ DANO+",
  arestum_penalty: "⬇️ ATK/ACC",
  lumus_acc_down: "💡 ACC-20%",
  spell_disable: "🔒 DISABLE",
  salvio_reflect: "🪞 REFLECT",
  anti_debuff: "✨ ANTI-DEBUFF",
  crit_boost: "🎯 CRIT+",
  unforgivable_acc_down: "🜏 IMPERDOÁVEIS ACC-15%",
  protego_maximo: "🛡️ MAXIMO",
}
/** Mensagem flutuante curta ao aplicar debuff do grimório. */
const DEBUFF_FLASH: Partial<Record<DebuffType, string>> = {
  burn: "QUEIMOU!",
  freeze: "CONGELOU!",
  stun: "ATORDOOU!",
  taunt: "DOMINOU!",
  disarm: "DESARMOU!",
  mark: "MARCOU!",
  confusion: "CONFUNDIU!",
  poison: "ENVENENOU!",
  paralysis: "PARALISOU!",
  provoke: "PROVOCOU!",
  no_potion: "IMPEDIU POÇÕES!",
  silence_defense: "SILENCIOU!",
  damage_amp: "AMPLIFICOU DANO!",
  arestum_penalty: "FREOU!",
  lumus_acc_down: "CEGOU!",
  spell_disable: "DESABILITOU!",
  salvio_reflect: "REFLEXO!",
  anti_debuff: "IMUNIZOU!",
  crit_boost: "CRÍTICO+!",
  unforgivable_acc_down: "IMPERDOÁVEIS -15% ACC!",
  protego_maximo: "PROTEGO MAXIMO!",
}
const normSpell = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

/** Mapeamento VFX por feitiço (nome canônico do grimório). */
function getSpellVfx(spellName: string): Omit<NonNullable<ArenaVfxState>, "key" | "active"> & { mode: NonNullable<ArenaVfxState>["mode"] } {
  const n = normSpell(spellName)
  if (n.includes("estupefa") || n.includes("glacius")) return { mode: "beam", color: "#38bdf8", color2: "#60a5fa" }
  if (n.includes("scarlatum")) return { mode: "beam", color: "#ef4444", color2: "#f87171" }
  if (n.includes("expelliarmus")) return { mode: "beam", color: "#a855f7", color2: "#c084fc" }
  if (n.includes("confundos")) return { mode: "beam", color: "#171717", color2: "#404040" }
  if (n.includes("bombarda")) return { mode: "explosion", color: "#f97316", color2: "#fb923c" }
  if (n.includes("arestum") && n.includes("momentum")) return { mode: "beam-thick", color: "#64748b", color2: "#94a3b8" }
  if (n.includes("desumo") && n.includes("tempestas")) return { mode: "lightning", color: "#facc15", color2: "#fef08a" }
  if (n.includes("diffindo")) return { mode: "beam-thin", color: "#facc15", color2: "#fde047" }
  if (n.includes("subito")) return { mode: "x", color: "#059669", color2: "#10b981", xSize: "sm" }
  if (n.includes("reducto")) return { mode: "x", color: "#0a0a0a", color2: "#171717", xSize: "lg" }
  if (n.includes("confrigo")) return { mode: "x", color: "#ea580c", color2: "#f97316", xSize: "md" }
  if (n.includes("incendio")) return { mode: "fireball", color: "#f97316", color2: "#ef4444" }
  if (n.includes("depulso")) return { mode: "shockwave", color: "#ffffff", color2: "#e5e7eb" }
  if (n.includes("crucius")) return { mode: "beam-pulse", color: "#dc2626", color2: "#991b1b" }
  if (n.includes("imperio")) return { mode: "beam-pulse", color: "#eab308", color2: "#ca8a04" }
  if (n.includes("avada")) return { mode: "beam-huge", color: "#14532d", color2: "#166534" }
  if (n.includes("protego")) return { mode: "shield", color: "#93c5fd", color2: "#3b82f6" }
  if (n.includes("ferula")) return { mode: "heal-rise", color: "#22c55e", color2: "#4ade80" }
  if (n.includes("circum")) return { mode: "flames-hud", color: "#ef4444", color2: "#f97316" }
  if (n.includes("impedimenta")) return { mode: "marker-bang", color: "#facc15", color2: "#eab308" }
  if (n.includes("obliviate")) return { mode: "marker-question", color: "#818cf8", color2: "#6366f1" }
  if (n.includes("flagellum")) return { mode: "beam-pulse", color: "#b45309", color2: "#f59e0b" }
  return { mode: "beam", color: "#fbbf24", color2: "#fcd34d" }
}

const BASE_CRIT_CHANCE = 0.1

function getCritChance(attacker: Duelist, defender?: Duelist, spellNameNorm?: string): number {
  let c = BASE_CRIT_CHANCE
  if (spellNameNorm && spellNameNorm.includes("rictumsempra")) c += 0.3
  if (attacker.wand === "dragon") c += 0.2
  if (attacker.debuffs.some((d) => d.type === "crit_boost")) c += 0.25
  if (defender?.house === "slytherin") c += HOUSE_GDD.slytherin.extraCritTakenChance
  return Math.min(0.95, c)
}

function isSelfTargetSpell(spellName: string): boolean {
  const n = normSpell(spellName)
  return (
    (n.includes("protego") && !n.includes("diabol")) ||
    n.includes("ferula") ||
    n.includes("episkey") ||
    (n.includes("finite") && n.includes("incantatem")) ||
    n.includes("circum") ||
    n.includes("maximos") ||
    (n.includes("aqua") && n.includes("eructo")) ||
    (n.includes("salvio") && n.includes("hexia")) ||
    (n.includes("vulnera") && n.includes("sanetur"))
  )
}

function isAreaSpell(spellName: string): boolean {
  const n = normSpell(spellName)
  return n.includes("bombarda") || (n.includes("desumo") && n.includes("tempestas")) || n.includes("fumus") || (n.includes("protego") && n.includes("diabol"))
}

function getSpellMaxPower(spell: SpellInfo): number {
  if (spell.powerMin != null && spell.powerMax != null) return spell.powerMax
  return spell.power ?? 0
}

function isOffensiveForHousePriority(spellName: string, spell: SpellInfo): boolean {
  const n = normSpell(spellName)
  if (isSelfTargetSpell(spellName)) return false
  if (n.includes("aqua") && n.includes("eructo")) return false
  return getSpellMaxPower(spell) > 0
}

function getSpellCastPriority(spellName: string, spell: SpellInfo | undefined, attacker: Duelist): number {
  if (!spell) return 0
  let p = spell.priority ?? 0
  const n = normSpell(spellName)
  if (n.includes("aqua") && n.includes("eructo")) p += 5
  if (isOffensiveForHousePriority(spellName, spell)) {
    const hg = HOUSE_GDD[attacker.house as keyof typeof HOUSE_GDD]
    if (hg && "attackPriorityBonus" in hg) p += hg.attackPriorityBonus as number
  }
  if (attacker.wand === "thunderbird") p += 1
  return p
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const getSpellInfo = (name: string) => SPELL_DATABASE.find((s) => s.name === name)
const getTotalHP = (hp: HPState) => hp.bars.reduce((sum, value) => sum + value, 0)
const isDefeated = (hp: HPState) => getTotalHP(hp) <= 0

const applyDamage = (hp: HPState, amount: number, opts?: { thestral?: boolean }): HPState => {
  const bars = [...hp.bars]
  let remaining = amount
  for (let i = bars.length - 1; i >= 0; i--) {
    if (remaining <= 0) break
    if (bars[i] <= 0) continue
    const absorbed = Math.min(remaining, bars[i])
    if (opts?.thestral && bars[i] === 100 && absorbed >= 100) {
      bars[i] = 1
      remaining -= 99
      continue
    }
    bars[i] -= absorbed
    remaining -= absorbed
  }
  return { bars }
}

const healCurrentBar = (hp: HPState, amount: number): HPState => {
  const bars = [...hp.bars]
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i] > 0 && bars[i] < 100) {
      bars[i] = Math.min(100, bars[i] + amount)
      break
    }
  }
  return { bars }
}

/** Cura distribuída em barras; `flat` limitado (ex.: meio coração = 50). */
const healFlatTotal = (hp: HPState, flat: number): HPState => {
  let left = Math.min(50, Math.max(0, Math.round(flat)))
  const bars = [...hp.bars]
  for (let i = bars.length - 1; i >= 0 && left > 0; i--) {
    const room = 100 - bars[i]
    if (room <= 0) continue
    const add = Math.min(room, left)
    bars[i] += add
    left -= add
  }
  return { bars }
}

const reduceDebuffs = (duelist: Duelist): Duelist => ({
  ...duelist,
  debuffs: duelist.debuffs
    .map((d) => (d.type === "arestum_penalty" ? d : { ...d, duration: d.duration - 1 }))
    .filter((d) => d.type === "arestum_penalty" || d.duration > 0),
})

function buildSpellManaForSpells(spells: string[], house: string): Record<string, { current: number; max: number }> {
  const out: Record<string, { current: number; max: number }> = {}
  spells.forEach((sn) => {
    const info = getSpellInfo(sn)
    if (!info) return
    let max = info.pp
    if (house === "gryffindor") max = Math.max(1, max + HOUSE_GDD.gryffindor.manaStartDelta)
    if (house === "ravenclaw" && !info.isUnforgivable) max += HOUSE_GDD.ravenclaw.manaBonusNonUnforgivable
    out[sn] = { current: max, max }
  })
  return out
}

function Heart({ fillPercent }: { fillPercent: number }) {
  const clamped = Math.max(0, Math.min(100, fillPercent))
  return (
    <span className="relative inline-block text-2xl leading-none">
      <span className="text-stone-500">♡</span>
      <span className="absolute inset-0 overflow-hidden text-red-500" style={{ width: `${clamped}%` }}>
        ♥
      </span>
    </span>
  )
}

const DuelArena = forwardRef<DuelArenaHandle, DuelArenaProps>(function DuelArena(
  { playerBuild, onReturn, onBattleEnd, matchId, onDispatchAction, isSpectator = false, participantIds = [], participantNames = [], localNetworkId },
  ref
) {
  const [duelists, setDuelists] = useState<Duelist[]>(() => {
    const playerMod = HOUSE_MODIFIERS[playerBuild.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
    const enemySpells = ["Bombarda", "Incendio", "Glacius", "Confrigo", "Expelliarmus", "Protego"]
    const playerDuelist: Duelist = {
      id: "player",
      name: playerBuild.name,
      house: playerBuild.house,
      wand: playerBuild.wand,
      avatar: playerBuild.avatar,
      spells: playerBuild.spells,
      hp: { bars: [100, 100, 100, 100, 100] },
      speed: Math.round(100 * playerMod.speed),
      debuffs: [],
      isPlayer: true,
      team: "player",
      spellMana: buildSpellManaForSpells(playerBuild.spells, playerBuild.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }

    const withMana = (d: Duelist): Duelist => ({
      ...d,
      spellMana: buildSpellManaForSpells(d.spells, d.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    })

    if (playerBuild.gameMode === "teste") {
      return [
        playerDuelist,
        withMana({
          id: "enemy1",
          name: "Rival Sonserino",
          house: "slytherin",
          wand: "dragon",
          avatar: "",
          spells: enemySpells,
          hp: { bars: [100, 100, 100, 100, 100] },
          speed: 92,
          debuffs: [],
          team: "enemy",
        }),
      ]
    }
    return [playerDuelist]
  })

  const buildOnlineDuelists = useCallback(
    (ids: string[]) => {
      const userId = playerBuild.userId
      const uniqueIds = ids.filter((id, idx) => !!id && ids.indexOf(id) === idx)
      const seats = userId && !uniqueIds.includes(userId) ? [userId, ...uniqueIds] : uniqueIds
      const normalizedSeats = seats.length > 0 ? seats : userId ? [userId] : []

      const resolveTeam = (id: string, seatIdx: number) => {
        if (playerBuild.gameMode === "ffa" || playerBuild.gameMode === "ffa3") return id === userId ? "player" : "enemy"
        if (playerBuild.gameMode === "2v2" && normalizedSeats.length >= 4) {
          const firstHalf = normalizedSeats.slice(0, 2)
          const secondHalf = normalizedSeats.slice(2, 4)
          const myGroup = firstHalf.includes(userId || "") ? firstHalf : secondHalf
          return myGroup.includes(id) ? "player" : "enemy"
        }
        return seatIdx === 0 || id === userId ? "player" : "enemy"
      }

      return normalizedSeats.map((id, idx) => {
        const isLocal = !!userId && id === userId
        const duelId = isLocal ? "player" : id
        const duelName = isLocal ? playerBuild.name : participantNames[idx] || `Bruxo ${idx + 1}`
        const duelHouse = isLocal ? playerBuild.house : "slytherin"
        const duelWand = isLocal ? playerBuild.wand : "dragon"
        const duelAvatar = isLocal ? playerBuild.avatar : DEFAULT_AVATARS[(idx + 1) % DEFAULT_AVATARS.length]
        const duelSpells = isLocal ? playerBuild.spells : []
        return {
          id: duelId,
          name: duelName,
          house: duelHouse,
          wand: duelWand,
          avatar: duelAvatar,
          spells: duelSpells,
          hp: { bars: [100, 100, 100, 100, 100] },
          speed: 95 - idx * 2,
          debuffs: [],
          isPlayer: isLocal,
          team: resolveTeam(id, idx),
          spellMana: buildSpellManaForSpells(duelSpells, duelHouse),
          turnsInBattle: 0,
          disabledSpells: {},
          missStreakBySpell: {},
        } as Duelist
      })
    },
    [participantNames, playerBuild.avatar, playerBuild.gameMode, playerBuild.house, playerBuild.name, playerBuild.spells, playerBuild.userId, playerBuild.wand]
  )

  const [battleStatus, setBattleStatus] = useState<BattleStatus>("idle")
  const [turnNumber, setTurnNumber] = useState(1)
  const [timeLeft, setTimeLeft] = useState(60)
  const [pendingSpell, setPendingSpell] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<string, RoundAction>>({})
  const [battleLog, setBattleLog] = useState<string[]>(["[Turno 0]: O duelo começou!"])
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([{ sender: "Sistema", text: "Chat ativo." }])
  const [chatInput, setChatInput] = useState("")
  const isReadOnlySpectator = isSpectator || (!!matchId && !!playerBuild.userId && participantIds.length > 0 && !participantIds.includes(playerBuild.userId))
  const localOnlineId = localNetworkId || playerBuild.userId || "player"
  const toNetworkId = useCallback((internalId: string) => {
    return internalId === "player" ? localOnlineId : internalId
  }, [localOnlineId])
  const fromNetworkId = useCallback((networkId?: string) => {
    if (!networkId) return undefined
    return networkId === localOnlineId ? "player" : networkId
  }, [localOnlineId])

  useEffect(() => {
    if (playerBuild.gameMode === "teste") return
    const base = buildOnlineDuelists(participantIds)
    if (base.length === 0) return
    setDuelists((prev) => {
      return base.map((d) => {
        const old = prev.find((p) => p.id === d.id)
        if (!old) return d
        return {
          ...d,
          hp: old.hp,
          debuffs: old.debuffs,
          spellMana: old.spellMana || d.spellMana,
          lastSpellUsed: old.lastSpellUsed,
          lastRoundSpellWasProtego: old.lastRoundSpellWasProtego,
          lastRoundSpellWasLumus: old.lastRoundSpellWasLumus,
          arrestoStacks: old.arrestoStacks,
          cruciusWeakness: old.cruciusWeakness,
          wandPassiveStripped: old.wandPassiveStripped,
          circumAura: old.circumAura,
          maximosChargePct: old.maximosChargePct,
          nextAccBonusPct: old.nextAccBonusPct,
          nextDamagePotionMult: old.nextDamagePotionMult,
          destinyBond: old.destinyBond,
          disabledSpells: old.disabledSpells,
          missStreakBySpell: old.missStreakBySpell,
          turnsInBattle: old.turnsInBattle,
        }
      })
    })
  }, [buildOnlineDuelists, participantIds, playerBuild.gameMode])

  const [gameOver, setGameOver] = useState<"win" | "lose" | "timeout" | null>(null)
  /** Mensagem central da fila de resolução (sincronia com acertos/efeitos). */
  const [battleMessage, setBattleMessage] = useState("")
  const [statusFloater, setStatusFloater] = useState<{ text: string; targetId: string; key: number } | null>(null)
  /** Resumo de dano residual (burn/poison) antes do próximo turno. */
  const [residualBanner, setResidualBanner] = useState<string | null>(null)
  const [potionUsed, setPotionUsed] = useState(false)
  const [backgroundImage, setBackgroundImage] = useState(SCENARIOS[0])
  const [resolutionText, setResolutionText] = useState("")
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackTargetId, setFeedbackTargetId] = useState<string | null>(null)
  const [currentTargetId, setCurrentTargetId] = useState<string | null>(null)
  const [impactTargetId, setImpactTargetId] = useState<string | null>(null)
  const [arenaVfx, setArenaVfx] = useState<ArenaVfxState>(null)
  const [circumFlames, setCircumFlames] = useState<Record<string, number>>({})
  const arenaVfxKeyRef = useRef(0)
  const resolvingRef = useRef(false)
  const botTimeoutsRef = useRef<number[]>([])
  const onlineBattleStartedRef = useRef(false)
  const [readyByPlayerId, setReadyByPlayerId] = useState<Record<string, boolean>>({})
  const lastSyncedRoundRef = useRef(0)

  const applyRoundSync = useCallback((snapshot: RoundSyncSnapshot) => {
    if (snapshot.round <= lastSyncedRoundRef.current) return
    lastSyncedRoundRef.current = snapshot.round
    setDuelists(snapshot.duelists as Duelist[])
    setBattleLog((prev) => [...prev, ...snapshot.logs])
    setTurnNumber(snapshot.turnNumber)
    setBattleStatus(snapshot.battleStatus as BattleStatus)
    setActions({})
    setPendingSpell(null)
    setCurrentTargetId(null)
    setPotionUsed(false)
    setTimeLeft(60)
    if (snapshot.gameOver) {
      setGameOver(snapshot.gameOver)
      if (snapshot.gameOver === "win" || snapshot.gameOver === "lose") {
        onBattleEnd?.(snapshot.gameOver, playerBuild.userId)
      }
    }
  }, [onBattleEnd, playerBuild.userId])

  useImperativeHandle(ref, () => ({
    submitRemoteAction: (casterId: string, action: RoundAction) => {
      const internalCaster = fromNetworkId(casterId) || casterId
      const normalized: RoundAction = {
        ...action,
        casterId: internalCaster,
        targetId: fromNetworkId(action.targetId),
      }
      if (normalized.type === "sync" && normalized.syncSnapshot) {
        applyRoundSync(normalized.syncSnapshot)
        return
      }
      setActions((prev) => ({ ...prev, [internalCaster]: normalized }))
    },
  }), [applyRoundSync, fromNetworkId])
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const hudRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const player = duelists.find((d) => d.id === "player")
  const playerDefeated = !player || isDefeated(player.hp)
  const playerCannotAct = !!player?.debuffs.some((d) => d.type === "stun" || d.type === "freeze")
  const expectedOnlinePlayers =
    playerBuild.gameMode === "2v2" || playerBuild.gameMode === "ffa"
      ? 4
      : playerBuild.gameMode === "ffa3"
        ? 3
        : 2
  const onlineReadyPlayers = Math.max(duelists.length, participantIds.length || 0)
  const participantRoster = participantIds.length > 0 ? participantIds : duelists.map((d) => d.id)
  const readyCount = participantRoster.filter((id) => !!readyByPlayerId[id]).length
  const localIsReady = !!readyByPlayerId[localOnlineId]
  const isOnlineMatch = playerBuild.gameMode !== "teste" && !!matchId
  const hostResolverId = (participantIds.length > 0 ? [...participantIds].sort()[0] : localOnlineId) || localOnlineId
  const isAuthoritativeResolver = !isOnlineMatch || localOnlineId === hostResolverId

  useEffect(() => {
    if (playerBuild.gameMode === "teste" || !matchId) return
    const supabase = getSupabaseClient()

    const pullReadyState = async () => {
      const { data } = await supabase
        .from("match_ready_states")
        .select("player_id,is_ready")
        .eq("match_id", matchId)
      const next: Record<string, boolean> = {}
      for (const row of data || []) {
        const r = row as any
        next[String(r.player_id)] = !!r.is_ready
      }
      setReadyByPlayerId(next)
    }

    void supabase.from("match_ready_states").upsert(
      { match_id: matchId, player_id: localOnlineId, is_ready: false, updated_at: new Date().toISOString() },
      { onConflict: "match_id,player_id" }
    )
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
  }, [localOnlineId, matchId, playerBuild.gameMode])

  const addLog = (line: string) => setBattleLog((prev) => [...prev, line])

  const playSpellVfx = async (spellName: string, attacker: Duelist, targets: Duelist[]) => {
    const arena = arenaRef.current
    const rect = arena?.getBoundingClientRect()
    if (!arena || !rect) {
      await sleep(1000)
      return
    }

    const hudPoint = (id: string): Point => {
      const el = hudRefs.current[id]
      if (!el) return { x: rect.width / 2, y: rect.height / 2 }
      const r = el.getBoundingClientRect()
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 }
    }

    const center: Point = { x: rect.width / 2, y: rect.height / 2 }
    const from = hudPoint(attacker.id)
    const to0 = targets[0] ? hudPoint(targets[0].id) : center
    const targetIds = targets.map((t) => t.id)
    const cfg = getSpellVfx(spellName)
    arenaVfxKeyRef.current += 1
    const key = arenaVfxKeyRef.current

    const common = { key, active: false, color: cfg.color, color2: cfg.color2, casterId: attacker.id, xSize: cfg.xSize }

    let payload: Exclude<ArenaVfxState, null>
    switch (cfg.mode) {
      case "explosion":
      case "mist":
        payload = { ...common, mode: cfg.mode, center }
        break
      case "lightning": {
        const bolts = targetIds.map((id, i) => {
          const p = hudPoint(id)
          const spread = rect.width * 0.7
          const x1 = rect.width * 0.15 + (i / Math.max(1, targetIds.length - 1 || 1)) * spread * (targetIds.length > 1 ? 1 : 0.5) + (targetIds.length === 1 ? spread * 0.25 : 0)
          return { x1: Math.min(rect.width - 8, x1), y1: 0, x2: p.x, y2: p.y }
        })
        payload = { ...common, mode: "lightning", targetIds, lightningBolts: bolts }
        break
      }
      case "shield":
      case "heal-rise":
      case "flames-hud":
        payload = { ...common, mode: cfg.mode, casterId: attacker.id, center: hudPoint(attacker.id) }
        break
      case "shockwave":
        payload = { ...common, mode: "shockwave", center: to0 }
        break
      case "x":
        payload = {
          ...common,
          mode: "x",
          center: { x: (from.x + to0.x) / 2, y: (from.y + to0.y) / 2 },
        }
        break
      case "marker-bang":
      case "marker-question":
        payload = { ...common, mode: cfg.mode, from: to0, to: to0, targetIds }
        break
      default:
        payload = { ...common, mode: cfg.mode, from, to: to0 }
        break
    }

    setArenaVfx(payload)
    requestAnimationFrame(() => {
      setArenaVfx((prev) => (prev && prev.key === key ? { ...prev, active: true } : prev))
    })
    await sleep(1000)
    setArenaVfx(null)
  }

  const getValidTargetsForSpell = (spellName: string, attacker: Duelist, state: Duelist[]) => {
    if (isSelfTargetSpell(spellName)) return state.filter((d) => d.id === attacker.id && !isDefeated(d.hp))
    if (isAreaSpell(spellName)) {
      const n = normSpell(spellName)
      if (n.includes("desumo")) return state.filter((d) => !isDefeated(d.hp))
      if (n.includes("protego") && n.includes("diabol")) return state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
      return state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
    }
    return state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
  }

  const effectiveSpeed = (d: Duelist) => {
    let s = d.speed
    if (d.debuffs.some((x) => x.type === "slow")) s = Math.floor(s * 0.35)
    return s
  }

  const calculateAccuracy = (attacker: Duelist, defender: Duelist, base: number, spell?: SpellInfo) => {
    let accuracy = base
    const un = spell?.isUnforgivable
    const wandJammed = attacker.wandPassiveStripped || attacker.debuffs.some((d) => d.type === "disarm")
    if (!un && !wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "accuracy_plus10") accuracy += 10
    if (!wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "crit20_acc_minus10") accuracy -= 10
    const spellNorm = normSpell(spell?.name || "")
    if (
      attacker.debuffs.some((d) => d.type === "unforgivable_acc_down") &&
      (spellNorm.includes("crucius") || spellNorm.includes("avada") || spellNorm.includes("imperio") || spellNorm.includes("imperius"))
    ) {
      accuracy -= 15
    }
    accuracy -= (defender.arrestoStacks ?? 0) * 5
    if (attacker.debuffs.some((d) => d.type === "lumus_acc_down")) accuracy -= 20
    if (attacker.nextAccBonusPct) accuracy += attacker.nextAccBonusPct
    return Math.max(5, Math.min(100, accuracy))
  }
  const rollHit = (attacker: Duelist, defender: Duelist, spell: SpellInfo, missStreak = 0) => {
    // Correção crítica: feitiços 100% não devem falhar por rolagem RNG.
    if (spell.accuracy >= 100) return true
    // Anti-frustração: cada erro consecutivo no mesmo feitiço aumenta um pouco a chance.
    const pityBonus = Math.min(20, missStreak * 7)
    const finalAcc = Math.min(100, calculateAccuracy(attacker, defender, spell.accuracy, spell) + pityBonus)
    return Math.random() * 100 <= finalAcc
  }

  const calculateDamage = (attacker: Duelist, defender: Duelist, base: number, spellNorm?: string) => {
    let damage = base
    if (spellNorm && WAND_PASSIVES[defender.wand]?.effect === "kelpie_fire_immune") {
      const n = spellNorm
      if (n.includes("incendio") || n.includes("confrigo")) return 0
    }
    // Segredo de design: Incendio causa dano dobrado em alvos já queimando.
    if (spellNorm?.includes("incendio") && defender.debuffs.some((d) => d.type === "burn")) {
      damage *= 2
    }
    if (attacker.house === "slytherin") damage *= HOUSE_GDD.slytherin.outgoingDamageMult
    if (defender.house === "hufflepuff") damage *= HOUSE_GDD.hufflepuff.incomingDamageMult
    if (defender.debuffs.some((d) => d.type === "mark")) damage *= 1.2
    if (attacker.debuffs.some((d) => d.type === "damage_amp")) damage *= 1.5
    damage *= Math.max(0.2, 1 - (defender.arrestoStacks ?? 0) * 0.05)
    if (attacker.nextDamagePotionMult) damage *= attacker.nextDamagePotionMult
    return Math.round(damage)
  }

  const rollCombatPower = (attacker: Duelist, spell: SpellInfo, sn: string, target: Duelist | null): number => {
    let base = rollSpellPower(spell)
    if (attacker.cruciusWeakness && !normSpell(sn).includes("crucius")) base *= 0.5
    if (attacker.maximosChargePct) base *= 1 + attacker.maximosChargePct / 100
    if (target && normSpell(sn).includes("subito") && getTotalHP(target.hp) === 500) base *= 1.5
    if (WAND_PASSIVES[attacker.wand]?.effect === "acromantula_power_stack") {
      base += (attacker.turnsInBattle ?? 0) * 20
    }
    return Math.round(base)
  }

  const evaluateWinConditions = (state: Duelist[]) => {
    const playerAliveCount = state.filter((d) => d.team === "player" && !isDefeated(d.hp)).length
    const enemyAliveCount = state.filter((d) => d.team === "enemy" && !isDefeated(d.hp)).length
    const totalAliveCount = state.filter((d) => !isDefeated(d.hp)).length

    if (playerBuild.gameMode === "2v2") {
      if (enemyAliveCount === 0) return "win"
      if (playerAliveCount === 0) return "lose"
      return null
    }
    if (playerBuild.gameMode === "ffa" || playerBuild.gameMode === "ffa3") {
      if (totalAliveCount === 1) {
        const winner = state.find((d) => !isDefeated(d.hp))
        return winner?.isPlayer ? "win" : "lose"
      }
      return null
    }
    if (enemyAliveCount === 0) return "win"
    if (playerAliveCount === 0) return "lose"
    return null
  }

  const applyRapinomonioBlock = useCallback((state: Duelist[]) => {
    let next = [...state]
    const casters = next.filter((d) => WAND_PASSIVES[d.wand]?.effect === "rapinomonio_random_block_2")
    for (const caster of casters) {
      const foes = next.filter((d) => d.id !== caster.id && d.team !== caster.team)
      for (const foe of foes) {
        if (!foe.spells || foe.spells.length === 0) continue
        const shuffled = [...foe.spells].sort(() => Math.random() - 0.5)
        const picks = shuffled.slice(0, Math.min(2, shuffled.length))
        const nextDisabled = { ...(foe.disabledSpells || {}) }
        picks.forEach((s) => {
          nextDisabled[s] = Math.max(nextDisabled[s] || 0, 999)
        })
        next = next.map((d) => (d.id === foe.id ? { ...d, disabledSpells: nextDisabled } : d))
      }
    }
    return next
  }, [])

  const beginRoundSelection = (state: Duelist[] = duelists) => {
    if (gameOver) return
    setCircumFlames((prev) => {
      const next: Record<string, number> = {}
      for (const [id, turns] of Object.entries(prev)) {
        if (turns > 1) next[id] = turns - 1
      }
      return next
    })
    setDuelists((prev) =>
      prev.map((d) => ({
        ...d,
        circumAura: d.circumAura != null && d.circumAura > 1 ? d.circumAura - 1 : d.circumAura === 1 ? undefined : d.circumAura,
      }))
    )
    setBattleStatus("selecting")
    setTimeLeft(60)
    setPendingSpell(null)
    setResolutionText("")
    setBattleMessage("")
    setResidualBanner(null)
    setStatusFloater(null)
    setFeedbackText("")
    setCurrentTargetId(null)
    setFeedbackTargetId(null)
    const initialActions: Record<string, RoundAction> = {}

    botTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
    botTimeoutsRef.current = []

    if (playerBuild.gameMode === "teste") {
      state
        .filter((d) => !d.isPlayer && !isDefeated(d.hp))
        .forEach((bot) => {
        if (bot.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
          initialActions[bot.id] = { casterId: bot.id, type: "skip" }
          return
        }
        const availableBotSpells = bot.spells.filter((s) => (bot.disabledSpells?.[s] ?? 0) <= 0)
        const botPool = availableBotSpells.length > 0 ? availableBotSpells : bot.spells
        let spellName = botPool[Math.floor(Math.random() * botPool.length)]
        if (bot.debuffs.some((d) => d.type === "taunt") && bot.lastSpellUsed && bot.spells.includes(bot.lastSpellUsed)) {
          spellName = bot.lastSpellUsed
        }
        // 2v2: 70% foco em oponente, 30% ajudar aliado se for cura/buff
        if (playerBuild.gameMode === "2v2") {
          const roll = Math.random()
          const hasFerula = bot.spells.includes("Ferula")
          if (roll < 0.3 && hasFerula) {
            spellName = "Ferula"
          }
        }
        let target: Duelist | undefined
        if (isSelfTargetSpell(spellName)) {
          target = state.find((d) => d.id === bot.id && !isDefeated(d.hp))
        } else if (isAreaSpell(spellName)) {
          const enemies = state.filter((d) => d.team !== bot.team && !isDefeated(d.hp))
          const pool = getValidTargetsForSpell(spellName, bot, state)
          target = enemies[0] || pool[0]
        } else {
          const targets = getValidTargetsForSpell(spellName, bot, state)
          target = targets[Math.floor(Math.random() * targets.length)]
        }
        initialActions[bot.id] = target
          ? { casterId: bot.id, type: "cast", spellName, targetId: target.id, areaAll: isAreaSpell(spellName) }
          : { casterId: bot.id, type: "skip" }
        })
    }

    const localPlayer = state.find((d) => d.id === "player")
    if (!localPlayer || isDefeated(localPlayer.hp)) {
      initialActions.player = { casterId: "player", type: "skip" }
    } else if (localPlayer.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
      initialActions.player = { casterId: "player", type: "skip" }
    }
    setActions(initialActions)
  }

  const runResolution = async (queuedActions: RoundAction[]) => {
    if (resolvingRef.current) return
    resolvingRef.current = true
    setBattleStatus("resolving")

    let state = [...duelists]
    const logs: string[] = []
    let combatEndedEarly = false
    const rankAction = (a: RoundAction) => {
      if (a.type === "skip") return -2_000_000_000
      if (a.type === "potion") return -1_500_000_000
      const da = state.find((d) => d.id === a.casterId)
      const sa = a.type === "cast" && a.spellName ? getSpellInfo(a.spellName) : undefined
      if (da && sa && a.spellName) return getSpellCastPriority(a.spellName, sa, da)
      return -9999
    }
    const ordered = [...queuedActions].sort((a, b) => {
      const ra = rankAction(a)
      const rb = rankAction(b)
      if (rb !== ra) return rb - ra
      const da = state.find((d) => d.id === a.casterId)
      const db = state.find((d) => d.id === b.casterId)
      return (db ? effectiveSpeed(db) : 0) - (da ? effectiveSpeed(da) : 0)
    })

    for (const action of ordered) {
      const actionStart = Date.now()
      const attacker = state.find((d) => d.id === action.casterId)
      if (!attacker || isDefeated(attacker.hp)) continue

      if (action.type === "skip") {
        logs.push(`[Turno ${turnNumber}]: ${attacker.name} perdeu a vez!`)
        setResolutionText(`${attacker.name} PERDEU A VEZ!`)
        await sleep(1500)
        setResolutionText("")
        await sleep(1000)
        const elapsed = Date.now() - actionStart
        await sleep(Math.max(0, 5000 - elapsed))
        continue
      }

      if (action.type === "potion") {
        const potKey = (action.potionType || playerBuild.potion) as keyof typeof POTION_NAMES
        const potLabel = POTION_NAMES[potKey] || "Poção"
        logs.push(`[Turno ${turnNumber}]: ${attacker.name} usou a poção ${potLabel}!`)
        setResolutionText(`${attacker.name} usou ${potLabel}!`)
        await sleep(600)
        setResolutionText("")
        if (potKey === "wiggenweld") {
          state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healCurrentBar(d.hp, 100) } : d))
        } else if (potKey === "edurus") {
          state = state.map((d) => (d.id === attacker.id ? { ...d, debuffs: [] } : d))
        } else if (potKey === "mortovivo") {
          state = state.map((d) => (d.id === attacker.id ? { ...d, destinyBond: true } : d))
        } else if (potKey === "maxima") {
          state = state.map((d) => {
            if (d.id === attacker.id) return { ...d, nextDamagePotionMult: 2 }
            return { ...d, debuffs: [...d.debuffs, { type: "damage_amp" as const, duration: 1 }] }
          })
        } else if (potKey === "foco") {
          state = state.map((d) => (d.id === attacker.id ? { ...d, nextAccBonusPct: 30 } : d))
        } else if (potKey === "merlin") {
          const foes = state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
          const donor = foes[Math.floor(Math.random() * foes.length)]
          if (donor?.spells?.length) {
            const copied = donor.spells[Math.floor(Math.random() * donor.spells.length)]
            state = state.map((d) => {
              if (d.id !== attacker.id) return d
              const nextSpells = d.spells.includes(copied) ? d.spells : [...d.spells.slice(-7), copied]
              const nextMana = { ...(d.spellMana || {}) }
              nextMana[copied] = { current: Math.max(1, nextMana[copied]?.current ?? 1), max: Math.max(1, nextMana[copied]?.max ?? 1) }
              return { ...d, spells: nextSpells, spellMana: nextMana }
            })
            logs.push(`[Poção de Merlin]: ${attacker.name} copiou ${copied} com mana 1.`)
          } else {
            logs.push(`[Poção de Merlin]: sem alvo válido para copiar feitiço.`)
          }
        }
        setDuelists(state)
        const elapsedP = Date.now() - actionStart
        await sleep(Math.max(0, 5000 - elapsedP))
        continue
      }

      const sn = action.spellName || ""
      const spell = getSpellInfo(sn)
      if (!spell) continue

      const n = normSpell(sn)
      const cannotAct = attacker.debuffs.some((d) => d.type === "stun" || d.type === "freeze")
      if (cannotAct) {
        logs.push(`[Turno ${turnNumber}]: ${attacker.name} está impossibilitado de agir!`)
        setResolutionText(`${attacker.name} NÃO CONSEGUE AGIR!`)
        await sleep(1200)
        setResolutionText("")
        const elapsed = Date.now() - actionStart
        await sleep(Math.max(0, 5000 - elapsed))
        continue
      }

      const rollSpellHit = (defender: Duelist) => {
        const casterNow = state.find((d) => d.id === attacker.id)
        if (!casterNow) return false
        const streak = casterNow.missStreakBySpell?.[sn] ?? 0
        const hit = rollHit(casterNow, defender, spell, streak)
        state = state.map((d) => {
          if (d.id !== attacker.id) return d
          const map = { ...(d.missStreakBySpell || {}) }
          map[sn] = hit ? 0 : streak + 1
          return { ...d, missStreakBySpell: map }
        })
        return hit
      }

      let targets: Duelist[] = []
      if (isSelfTargetSpell(sn)) {
        if (!isDefeated(attacker.hp)) targets = [attacker]
      } else if (isAreaSpell(sn)) {
        if (n.includes("desumo")) targets = state.filter((d) => !isDefeated(d.hp))
        else if (n.includes("protego") && n.includes("diabol")) targets = state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
        else targets = state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
      } else {
        const t = state.find((d) => d.id === action.targetId)
        if (!t || isDefeated(t.hp)) continue
        targets = [t]
      }
      if (targets.length === 0) continue

      setCurrentTargetId(targets[0].id)

      let announce = `${attacker.name} CONJUROU ${sn}!`
      if (isAreaSpell(sn)) announce = `${attacker.name} CONJUROU ${sn}!`
      if (isSelfTargetSpell(sn)) logs.push(`[Turno ${turnNumber}]: ${attacker.name} lançou ${sn} em si mesmo!`)
      else if (isAreaSpell(sn)) logs.push(`[Turno ${turnNumber}]: ${attacker.name} lançou ${sn} em área!`)
      else logs.push(`[Turno ${turnNumber}]: ${attacker.name} lançou ${sn} em ${targets[0].name}!`)

      setResolutionText(announce)
      setBattleMessage(announce)
      await sleep(1500)
      await playSpellVfx(sn, attacker, targets)

      const ignoresProtego = n.includes("diffindo")

      const protegoBlocks = (def: Duelist) =>
        def.debuffs.some((d) => d.type === "protego") && !def.debuffs.some((d) => d.type === "silence_defense") && !ignoresProtego

      const applySpellDebuffTo = (defenderId: string) => {
        if (!spell.debuff) return
        const before = state.find((d) => d.id === defenderId)
        if (before?.debuffs.some((d) => d.type === "anti_debuff")) {
          logs.push(`[Imune]: ${before.name} bloqueou novo debuff com Vulnera Sanetur.`)
          return
        }
        const chance = spell.debuff.chance
        if (Math.random() * 100 <= chance) {
          let dur = spell.debuff.duration || 1
          if (WAND_PASSIVES[attacker.wand]?.effect === "basilisk_debuff_duration") dur += 1
          const meta = spell.debuff.type === "provoke" ? attacker.id : undefined
          state = state.map((d) =>
            d.id === defenderId
              ? { ...d, debuffs: [...d.debuffs, { type: spell.debuff!.type, duration: dur, meta }] }
              : d
          )
          const dn = state.find((d) => d.id === defenderId)!
          logs.push(`[Efeito]: ${dn.name} recebeu ${DEBUFF_LABEL[spell.debuff.type]}!`)
          const fl = DEBUFF_FLASH[spell.debuff.type as DebuffType]
          if (fl) {
            setStatusFloater({ text: fl, targetId: defenderId, key: Date.now() + Math.random() })
            setFeedbackTargetId(defenderId)
            setFeedbackText((prev) => (prev ? `${prev} +${fl}` : `+${fl}`))
          }
        }
      }

      const applyDamageWithCircum = (defId: string, dmg: number, dealerId: string, sourceSpellNorm?: string) => {
        const def = state.find((d) => d.id === defId)!
        if (
          sourceSpellNorm &&
          def.debuffs.some((d) => d.type === "protego_maximo") &&
          (sourceSpellNorm.includes("crucius") || sourceSpellNorm.includes("avada") || sourceSpellNorm.includes("imperio") || sourceSpellNorm.includes("imperius"))
        ) {
          state = state.map((d) =>
            d.id === defId
              ? { ...d, hp: healFlatTotal(d.hp, 500), debuffs: d.debuffs.filter((x) => x.type !== "protego_maximo") }
              : d
          )
          logs.push(`[Protego Maximo]: ${def.name} anulou maldição imperdoável e curou totalmente a vida!`)
          return
        }
        const th = def.wand === "thestral"
        state = state.map((d) => (d.id === defId ? { ...d, hp: applyDamage(d.hp, dmg, { thestral: th }) } : d))
        if (def.debuffs.some((d) => d.type === "salvio_reflect") && dealerId !== defId && dmg > 0) {
          const ref = Math.round(dmg)
          state = state.map((d) =>
            d.id === dealerId ? { ...d, hp: applyDamage(d.hp, ref, { thestral: d.wand === "thestral" }) } : d
          )
          logs.push(`[Salvio Hexia]: ${def.name} refletiu ${ref}% de dano!`)
        }
        const circumOn = (def.circumAura ?? 0) > 0 || (circumFlames[defId] ?? 0) > 0
        if (circumOn && dealerId !== defId) {
          state = state.map((d) =>
            d.id === dealerId ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "burn"), { type: "burn", duration: 2 }] } : d
          )
          logs.push(`[Circum]: ${state.find((x) => x.id === dealerId)?.name} queimou ao atacar! [🔥 BURN]`)
        }
      }

      const atkNow = () => state.find((d) => d.id === action.casterId)!

      if (isSelfTargetSpell(sn)) {
        if (n.includes("protego") && !n.includes("maximo") && !n.includes("diabol")) {
          if (atkNow().lastRoundSpellWasProtego) {
            setFeedbackText("Protego falhou!")
            setFeedbackTargetId(attacker.id)
            logs.push(`[Falha]: ${attacker.name} não pode usar Protego em sequência.`)
          } else {
            state = state.map((d) =>
              d.id === attacker.id
                ? {
                    ...d,
                    debuffs: [...d.debuffs.filter((x) => x.type !== "protego"), { type: "protego", duration: 1 }],
                    lastRoundSpellWasProtego: true,
                  }
                : d
            )
            logs.push(`[Efeito]: ${attacker.name} está protegido por Protego.`)
          }
        } else if (n.includes("ferula")) {
          const healAmt = Math.floor(Math.random() * 141) + 10
          state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healFlatTotal(d.hp, healAmt) } : d))
          const after = state.find((d) => d.id === attacker.id)!
          setFeedbackText("CURA!")
          setFeedbackTargetId(attacker.id)
          logs.push(`[Cura]: ${attacker.name} recuperou ${healAmt}% HP total (${Math.max(0, getTotalHP(after.hp))}% HP).`)
        } else if (n.includes("circum")) {
          setCircumFlames((prev) => ({ ...prev, [attacker.id]: 3 }))
          state = state.map((d) => (d.id === attacker.id ? { ...d, circumAura: 3 } : d))
          logs.push(`[Efeito]: ${attacker.name} envolveu-se em chamas defensivas (Circum Inflamare).`)
        } else if (n.includes("maximos")) {
          const pct = Math.floor(Math.random() * 91) + 10
          state = state.map((d) => (d.id === attacker.id ? { ...d, maximosChargePct: pct } : d))
          logs.push(`[Maximos]: próximo feitiço de ${attacker.name} ganha +${pct}% de poder base.`)
        } else if (n.includes("salvio") && n.includes("hexia")) {
          state = state.map((d) =>
            d.id === attacker.id
              ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "salvio_reflect"), { type: "salvio_reflect", duration: 1 }] }
              : d
          )
          setStatusFloater({ text: "REFLECT 100%!", targetId: attacker.id, key: Date.now() + Math.random() })
          logs.push(`[Salvio Hexia]: ${attacker.name} ativou reflexão de dano por 1 turno.`)
        } else if (n.includes("vulnera") && n.includes("sanetur")) {
          state = state.map((d) =>
            d.id === attacker.id
              ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "anti_debuff"), { type: "anti_debuff", duration: 3 }] }
              : d
          )
          setStatusFloater({ text: "IMUNE A DEBUFF!", targetId: attacker.id, key: Date.now() + Math.random() })
          logs.push(`[Vulnera Sanetur]: ${attacker.name} ficou imune a novos debuffs por 3 turnos.`)
        } else if (n.includes("episkey")) {
          state = state.map((d) =>
            d.id === attacker.id
              ? {
                  ...d,
                  hp: healFlatTotal(d.hp, 50),
                  debuffs: [...d.debuffs.filter((x) => x.type !== "crit_boost"), { type: "crit_boost", duration: 2 }],
                }
              : d
          )
          setStatusFloater({ text: "CRÍTICO+ 2T!", targetId: attacker.id, key: Date.now() + Math.random() })
          logs.push(`[Episkey]: ${attacker.name} curou 50% HP e recebeu buff de crítico por 2 turnos.`)
        } else if (n.includes("protego") && n.includes("maximo")) {
          state = state.map((d) =>
            d.id === attacker.id
              ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "protego_maximo"), { type: "protego_maximo", duration: 2 }] }
              : d
          )
          setStatusFloater({ text: "PROTEGO MAXIMO!", targetId: attacker.id, key: Date.now() + Math.random() })
          logs.push(`[Protego Maximo]: ${attacker.name} preparou proteção suprema contra imperdoáveis.`)
        } else if (n.includes("finite") && n.includes("incantatem")) {
          state = state.map((d) => (d.id === attacker.id ? { ...d, debuffs: [] } : d))
          setStatusFloater({ text: "CLEANSE TOTAL!", targetId: attacker.id, key: Date.now() + Math.random() })
          logs.push(`[Finite Incantatem]: ${attacker.name} removeu todos os debuffs ativos.`)
        } else if (n.includes("aqua") && n.includes("eructo")) {
          const splash = rollCombatPower(attacker, spell, sn, attacker)
          state = state.map((d) => (d.id === attacker.id ? { ...d, debuffs: d.debuffs.filter((x) => x.type !== "burn") } : d))
          logs.push(`[Aqua Eructo]: ${attacker.name} extinguiu o BURN antes do jato.`)
          const foes = state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
          for (const f of foes) {
            applyDamageWithCircum(f.id, splash, attacker.id, n)
            const nm = state.find((x) => x.id === f.id)?.name
            logs.push(`[Aqua Eructo]: jato atingiu ${nm ?? f.name} (${splash}% pressão mágica).`)
          }
          setBattleMessage(`Aqua Eructo — jato ${splash}%`)
        }
      } else if (n.includes("fumus")) {
        setCircumFlames({})
        state = state.map((d) => ({
          ...d,
          debuffs: [],
          disabledSpells: {},
          nextAccBonusPct: undefined,
          nextDamagePotionMult: undefined,
          maximosChargePct: undefined,
          circumAura: undefined,
          destinyBond: false,
        }))
        logs.push(`[Fumus]: todos os buffs/debuffs em campo foram dissipados.`)
        setBattleMessage("Fumus — campo purificado")
      } else if (n.includes("protego") && n.includes("diabol")) {
        for (const t of targets) {
          state = state.map((d) =>
            d.id === t.id
              ? {
                  ...d,
                  debuffs: [...d.debuffs.filter((x) => x.type !== "unforgivable_acc_down"), { type: "unforgivable_acc_down", duration: 2 }],
                }
              : d
          )
          setStatusFloater({ text: "IMPERDOÁVEIS -15% ACC!", targetId: t.id, key: Date.now() + Math.random() })
          logs.push(`[Protego Diabólico]: ${t.name} sofreu -15% de precisão para Crucius/Avada/Imperio por 2 turnos.`)
        }
        setBattleMessage("Protego Diabólico — aura de supressão")
      } else if (n.includes("arestum") && n.includes("momentum")) {
        const t = targets[0]
        const hit = rollSpellHit(t)
        if (!hit) {
          logs.push(`[Falha]: Arestum Momentum não pegou em ${t.name}.`)
        } else {
          const raw = rollCombatPower(attacker, spell, sn, t)
          let damage = calculateDamage(attacker, t, raw, normSpell(sn))
          if (protegoBlocks(t)) damage = 0
          applyDamageWithCircum(t.id, damage, attacker.id, n)
          state = state.map((d) =>
            d.id === t.id
              ? {
                  ...d,
                  arrestoStacks: (d.arrestoStacks ?? 0) + 1,
                  debuffs: d.debuffs.some((x) => x.type === "arestum_penalty")
                    ? d.debuffs
                    : [...d.debuffs, { type: "arestum_penalty" as const, duration: 9999 }],
                }
              : d
          )
          logs.push(`[Resultado]: ${t.name} sofreu Arestum (⬇️ ATK/ACC, -5% dano/acerto cumulativo).`)
        }
      } else if (n.includes("impedimenta")) {
        const t = targets[0]
        state = state.map((d) => (d.id === t.id ? { ...d, debuffs: [...d.debuffs, { type: "no_potion", duration: 8 }] } : d))
        logs.push(`[Efeito]: ${t.name} não pode usar poções (Impedimenta).`)
      } else if (n.includes("obliviate")) {
        const t = targets[0]
        const hit = rollSpellHit(t)
        if (hit && t.lastSpellUsed && t.spellMana?.[t.lastSpellUsed]) {
          state = state.map((d) => {
            if (d.id !== t.id) return d
            const sm = { ...d.spellMana! }
            const slot = sm[t.lastSpellUsed!]
            if (slot) sm[t.lastSpellUsed!] = { ...slot, current: Math.max(0, slot.current - 5) }
            return { ...d, spellMana: sm }
          })
          logs.push(`[Obliviate]: ${t.name} perdeu 5 de mana em ${t.lastSpellUsed}.`)
        } else if (!hit) logs.push(`[Falha]: Obliviate não surtiu efeito.`)
      } else if (n.includes("lumus")) {
        const t = targets[0]
        if (attacker.lastRoundSpellWasLumus) {
          setFeedbackText("ERROU!")
          setFeedbackTargetId(t.id)
          logs.push(`[Falha]: ${attacker.name} usou ${sn}, mas errou! (uso consecutivo)`)
          await sleep(1500)
          setFeedbackText("")
          setFeedbackTargetId(null)
        } else {
          state = state.map((d) =>
            d.id === t.id ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "lumus_acc_down"), { type: "lumus_acc_down", duration: 2 }] } : d
          )
          setStatusFloater({ text: "ACC -20%!", targetId: t.id, key: Date.now() + Math.random() })
          logs.push(`[Lumus]: ${t.name} teve ACC reduzido em 20% por 2 turnos.`)
        }
      } else if (n.includes("petrificus") && n.includes("totales")) {
        const t = targets[0]
        const hit = rollSpellHit(t)
        if (!hit) {
          setFeedbackText("ERROU!")
          setFeedbackTargetId(t.id)
          logs.push(`[Falha]: ${attacker.name} usou ${sn}, mas errou!`)
          await sleep(1500)
          setFeedbackText("")
          setFeedbackTargetId(null)
        } else if (t.spells.length > 0) {
          const pick = t.spells[Math.floor(Math.random() * t.spells.length)]
          state = state.map((d) =>
            d.id === t.id ? { ...d, disabledSpells: { ...(d.disabledSpells || {}), [pick]: 2 }, debuffs: [...d.debuffs, { type: "spell_disable", duration: 2 }] } : d
          )
          setStatusFloater({ text: `DISABLE: ${pick}`, targetId: t.id, key: Date.now() + Math.random() })
          logs.push(`[Petrificus Totales]: ${pick} de ${t.name} foi desabilitada por 2 turnos.`)
        }
      } else if (isAreaSpell(sn) && getSpellMaxPower(spell) > 0) {
        for (const t of targets) {
          const hit = rollSpellHit(t)
          if (!hit) {
            logs.push(`[Falha]: ${attacker.name} usou ${sn}, mas errou!`)
            setBattleMessage(`Errou em ${t.name}`)
            setFeedbackText("ERROU!")
            setFeedbackTargetId(t.id)
            await sleep(1500)
            setFeedbackText("")
            setFeedbackTargetId(null)
            continue
          }
          const raw = rollCombatPower(attacker, spell, sn, t)
          let damage = calculateDamage(attacker, t, raw, normSpell(sn))
          let crit = false
          if (Math.random() < getCritChance(attacker, t, normSpell(sn))) {
            crit = true
            damage *= 2
          }
          const def = state.find((d) => d.id === t.id)!
          if (protegoBlocks(def)) damage = 0
          applyDamageWithCircum(t.id, damage, attacker.id, n)
          const targetAfter = state.find((d) => d.id === t.id)!
          const hitMsg = crit ? `CRÍTICO! -${damage}` : `-${damage}`
          setBattleMessage(hitMsg)
          setFeedbackText(hitMsg)
          setFeedbackTargetId(t.id)
          setImpactTargetId(t.id)
          logs.push(
            `[Resultado]: ${t.name} recebeu ${damage}% de dano${crit ? " (CRÍTICO!)" : ""}. (${Math.max(0, getTotalHP(targetAfter.hp))}% HP)`
          )
          applySpellDebuffTo(t.id)
          if (WAND_PASSIVES[t.wand]?.effect === "ocammy_parry" && Math.random() < 0.5 && t.spells.includes(sn)) {
            const ref = Math.round(damage * 0.5)
            if (ref > 0) {
              state = state.map((d) =>
                d.id === attacker.id ? { ...d, hp: applyDamage(d.hp, ref, { thestral: d.wand === "thestral" }) } : d
              )
              logs.push(`[Ocammy]: ${t.name} reverteu parte do feitiço!`)
            }
          }
          await sleep(1500)
          setFeedbackText("")
          setFeedbackTargetId(null)
          setImpactTargetId(null)
        }
        if (n.includes("crucius")) {
          state = state.map((d) => (d.id === attacker.id ? { ...d, cruciusWeakness: true } : d))
          logs.push(`[Crucius]: ${attacker.name} enfraqueceu seus próximos feitiços.`)
        }
      } else {
        const target = targets[0]
        const hit = rollSpellHit(target)
        if (!hit) {
          if (spell.special === "avada_miss_hp" && n.includes("avada")) {
            state = state.map((d) => {
              if (d.id !== attacker.id) return d
              const bars = [...d.hp.bars]
              for (let i = bars.length - 1; i >= 0; i--) {
                if (bars[i] > 0) {
                  bars[i] = 0
                  break
                }
              }
              return { ...d, hp: { bars } }
            })
            logs.push(`[Falha]: Avada Kedavra errou! ${attacker.name} perdeu 100% de HP (1 coração).`)
            setBattleMessage("Avada errou!")
            setFeedbackText("ERROU!")
            setFeedbackTargetId(attacker.id)
          } else {
            setBattleMessage(`Errou em ${target.name}`)
            setFeedbackText("ERROU!")
            setFeedbackTargetId(target.id)
            logs.push(`[Falha]: ${attacker.name} usou ${sn}, mas errou!`)
          }
          await sleep(1500)
          setFeedbackText("")
          setFeedbackTargetId(null)
        } else if (spell.special === "flagellum_multi" || n.includes("flagellum")) {
          const nHits = Math.floor(Math.random() * 3) + 1
          logs.push(`[Flagellum]: ${attacker.name} canaliza ${nHits} golpe(s) em ${target.name}!`)
          setBattleMessage(`Flagellum ×${nHits}`)
          for (let hi = 1; hi <= nHits; hi++) {
            const subHit = rollSpellHit(target)
            if (!subHit) {
              logs.push(`[Flagellum] Golpe ${hi}/${nHits}: errou.`)
              setBattleMessage(`Flagellum ${hi}/${nHits}: errou`)
              await sleep(1500)
              continue
            }
            const rawHit = rollCombatPower(attacker, spell, sn, target)
            let dmg = calculateDamage(attacker, target, rawHit, n)
            let critH = false
            if (dmg > 0 && Math.random() < getCritChance(attacker, target, n)) {
              critH = true
              dmg *= 2
            }
            const defH = state.find((d) => d.id === target.id)!
            if (protegoBlocks(defH)) dmg = 0
            if (dmg > 0) {
              applyDamageWithCircum(target.id, dmg, attacker.id, n)
              const targetAfterH = state.find((d) => d.id === target.id)!
              const msgH = critH ? `CRÍTICO! -${dmg}` : `-${dmg}`
              setBattleMessage(`Flagellum ${hi}/${nHits}: ${msgH}`)
              setFeedbackText(msgH)
              setFeedbackTargetId(target.id)
              setImpactTargetId(target.id)
              logs.push(
                `[Flagellum] Golpe ${hi}/${nHits}: ${target.name} recebeu ${dmg}%${critH ? " (CRÍTICO!)" : ""}. (${Math.max(0, getTotalHP(targetAfterH.hp))}% HP)`
              )
            } else {
              logs.push(`[Flagellum] Golpe ${hi}/${nHits}: sem dano (bloqueio/imunidade).`)
              setBattleMessage(`Flagellum ${hi}/${nHits}: 0 dano`)
            }
            await sleep(450)
            setFeedbackText("")
            setFeedbackTargetId(null)
            setImpactTargetId(null)
          }
          await sleep(1500)
        } else if (spell.special === "sectum_multi" || n.includes("sectumsempra")) {
          const firstHit = rollSpellHit(target)
          if (!firstHit) {
            setFeedbackText("ERROU!")
            setFeedbackTargetId(target.id)
            logs.push(`[Falha]: ${attacker.name} usou ${sn}, mas errou!`)
            await sleep(1500)
            setFeedbackText("")
            setFeedbackTargetId(null)
          } else {
            const hits = Math.floor(Math.random() * 5) + 1
            for (let i = 1; i <= hits; i++) {
              let dmg = calculateDamage(attacker, target, rollCombatPower(attacker, spell, sn, target), n)
              const defS = state.find((d) => d.id === target.id)!
              if (protegoBlocks(defS)) dmg = 0
              applyDamageWithCircum(target.id, dmg, attacker.id, n)
              setFeedbackText(`-${dmg}`)
              setFeedbackTargetId(target.id)
              logs.push(`[Sectumsempra] Hit ${i}/${hits}: ${target.name} sofreu ${dmg}.`)
              await sleep(1500)
            }
            setFeedbackText("")
            setFeedbackTargetId(null)
          }
        } else if (spell.special === "vermillious_dynamic_hits" || n.includes("vermillious")) {
          const hitVm = rollSpellHit(target)
          if (!hitVm) {
            setFeedbackText("ERROU!")
            setFeedbackTargetId(target.id)
            logs.push(`[Falha]: ${attacker.name} usou ${sn}, mas errou!`)
            await sleep(1500)
            setFeedbackText("")
            setFeedbackTargetId(null)
          } else {
            const lostHearts = Math.max(0, Math.floor((500 - getTotalHP(attacker.hp)) / 100))
            const hits = 1 + lostHearts
            for (let i = 1; i <= hits; i++) {
              let dmg = calculateDamage(attacker, target, rollCombatPower(attacker, spell, sn, target), n)
              const defV = state.find((d) => d.id === target.id)!
              if (protegoBlocks(defV)) dmg = 0
              applyDamageWithCircum(target.id, dmg, attacker.id, n)
              setFeedbackText(`-${dmg}`)
              setFeedbackTargetId(target.id)
              logs.push(`[Vermillious] Hit ${i}/${hits}: ${target.name} sofreu ${dmg}.`)
              await sleep(1500)
            }
            setFeedbackText("")
            setFeedbackTargetId(null)
          }
        } else {
          if (n.includes("trevus") && spell.special === "trevus_random") {
            const pool: DebuffType[] = ["burn", "freeze", "stun", "poison", "paralysis", "mark"]
            let r1 = Math.floor(Math.random() * pool.length)
            let r2 = Math.floor(Math.random() * pool.length)
            if (pool.length > 1) while (r2 === r1) r2 = Math.floor(Math.random() * pool.length)
            const p1 = pool[r1]
            const p2 = pool[r2]
            state = state.map((d) =>
              d.id === target.id ? { ...d, debuffs: [...d.debuffs, { type: p1, duration: 2 }, { type: p2, duration: 2 }] } : d
            )
            logs.push(`[Trevus]: ${target.name} — ${DEBUFF_LABEL[p1]} + ${DEBUFF_LABEL[p2]}!`)
          }
          const raw = rollCombatPower(attacker, spell, sn, target)
          let damage = getSpellMaxPower(spell) > 0 ? calculateDamage(attacker, target, raw, n) : 0
          let crit = false
          if (damage > 0 && Math.random() < getCritChance(attacker, target, n)) {
            crit = true
            damage *= 2
          }
          const defPre = state.find((d) => d.id === target.id)!
          if (protegoBlocks(defPre)) damage = 0
          if (
            damage === 0 &&
            WAND_PASSIVES[target.wand]?.effect === "kelpie_fire_immune" &&
            (n.includes("incendio") || n.includes("confrigo"))
          ) {
            logs.push(`[Kelpie]: ${target.name} é imune a ${sn}!`)
            setBattleMessage(`IMUNE — ${target.name}`)
          }
          if (damage > 0) {
            applyDamageWithCircum(target.id, damage, attacker.id, n)
            const targetAfter = state.find((d) => d.id === target.id)!
            const hitMsg = crit ? `CRÍTICO! -${damage}` : `-${damage}`
            setBattleMessage(hitMsg)
            setFeedbackText(hitMsg)
            setFeedbackTargetId(target.id)
            setImpactTargetId(target.id)
            logs.push(
              `[Resultado]: ${target.name} recebeu ${damage}% de dano${crit ? " (CRÍTICO!)" : ""}. (${Math.max(0, getTotalHP(targetAfter.hp))}% HP)`
            )
          }
          if (n.includes("flagrate") && spell.special === "flagrate_strip" && Math.random() * 100 <= 30) {
            state = state.map((d) =>
              d.id === target.id
                ? {
                    ...d,
                    wandPassiveStripped: true,
                    debuffs: [...d.debuffs.filter((x) => x.type !== "disarm"), { type: "disarm", duration: 3 }],
                  }
                : d
            )
            logs.push(`[Flagrate]: núcleo de ${target.name} desativado (DISARM 3 turnos)!`)
          }
          if ((spell.special === "expulso_swap" || n.includes("expulso")) && target.spells.length > 0) {
            const si = Math.floor(Math.random() * target.spells.length)
            const oldName = target.spells[si]
            const globalNames = SPELL_DATABASE.map((s) => s.name).filter((nm) => nm !== oldName)
            const nu = globalNames[Math.floor(Math.random() * Math.max(1, globalNames.length))] || oldName
            state = state.map((d) => {
              if (d.id !== target.id) return d
              const newSpells = [...d.spells]
              newSpells[si] = nu
              const sm = { ...d.spellMana! }
              delete sm[oldName]
              const info = getSpellInfo(nu)
              if (info) {
                let max = info.pp
                if (d.house === "gryffindor") max = Math.max(1, max + HOUSE_GDD.gryffindor.manaStartDelta)
                if (d.house === "ravenclaw" && !info.isUnforgivable) max += HOUSE_GDD.ravenclaw.manaBonusNonUnforgivable
                sm[nu] = { current: max, max }
              }
              return { ...d, spells: newSpells, spellMana: sm }
            })
            logs.push(`[Expulso]: build de ${target.name} — "${oldName}" virou "${nu}" até o fim do combate!`)
          }
          if (spell.special === "rictum_crit_mana" && n.includes("rictum")) {
            const keys = Object.keys(state.find((d) => d.id === target.id)?.spellMana || {})
            if (keys.length > 0 && Math.random() < 0.25) {
              const pick = keys[Math.floor(Math.random() * keys.length)]
              state = state.map((d) => {
                if (d.id !== target.id) return d
                const sm = { ...d.spellMana! }
                const slot = sm[pick]
                if (slot) sm[pick] = { ...slot, current: Math.max(0, slot.current - 1) }
                return { ...d, spellMana: sm }
              })
              logs.push(`[Rictumsempra]: ${target.name} perdeu 1 carga de mana em ${pick}!`)
            }
          }
          applySpellDebuffTo(target.id)
          if (n.includes("crucius") && damage > 0) {
            state = state.map((d) => (d.id === attacker.id ? { ...d, cruciusWeakness: true } : d))
            logs.push(`[Crucius]: ${attacker.name} enfraqueceu seus próximos feitiços.`)
          }
          const atkConf = state.find((d) => d.id === attacker.id)!
          if (atkConf.debuffs.some((d) => d.type === "confusion") && damage > 0 && Math.random() * 100 <= 40) {
            const rec = Math.round(damage * 0.25)
            if (rec > 0) {
              state = state.map((d) =>
                d.id === attacker.id ? { ...d, hp: applyDamage(d.hp, rec, { thestral: d.wand === "thestral" }) } : d
              )
              logs.push(`[Confusão]: ${attacker.name} sofreu recoil!`)
            }
          }
          await sleep(1500)
          setFeedbackText("")
          setFeedbackTargetId(null)
          setImpactTargetId(null)
        }
      }

      state = state.map((d) => {
        if (d.id !== attacker.id) return d
        const sm = { ...(d.spellMana || {}) }
        const slot = sm[sn]
        if (slot) sm[sn] = { ...slot, current: Math.max(0, slot.current - 1) }
        let lrp = d.lastRoundSpellWasProtego ?? false
        if (!n.includes("protego")) lrp = false
        let lrl = d.lastRoundSpellWasLumus ?? false
        if (!n.includes("lumus")) lrl = false
        return {
          ...d,
          spellMana: sm,
          lastSpellUsed: sn,
          lastRoundSpellWasProtego: lrp,
          lastRoundSpellWasLumus: lrl,
          nextAccBonusPct: undefined,
          nextDamagePotionMult: undefined,
          maximosChargePct:
            sn === "Maximos"
              ? d.maximosChargePct
              : isSelfTargetSpell(sn) && !(n.includes("aqua") && n.includes("eructo"))
                ? d.maximosChargePct
                : getSpellMaxPower(spell) > 0
                  ? undefined
                  : d.maximosChargePct,
        }
      })

      const atkAfter = state.find((x) => x.id === action.casterId)!
      if (WAND_PASSIVES[atkAfter.wand]?.effect === "phoenix_regen") {
        const pct = Math.floor(Math.random() * 21) + 5
        state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healCurrentBar(d.hp, pct) } : d))
        logs.push(`[Fênix]: ${atkAfter.name} recuperou ${pct}% na barra ativa.`)
      }

      setDuelists(state)

      const result = evaluateWinConditions(state)
      await sleep(1500)
      setFeedbackText("")
      setFeedbackTargetId(null)
      setImpactTargetId(null)
      setResolutionText("")
      setBattleMessage("")
      setCurrentTargetId(null)

      if (result) {
        setGameOver(result)
        if (result === "win" || result === "lose") onBattleEnd?.(result, playerBuild.userId)
        setBattleStatus("finished")
        combatEndedEarly = true
        break
      }

      const elapsed = Date.now() - actionStart
      await sleep(Math.max(0, 5000 - elapsed))
    }

    if (!combatEndedEarly) {
      const residualLines: string[] = []
      state = state.map((d) => {
        let hp = d.hp
        if (d.debuffs.some((x) => x.type === "burn")) {
          hp = applyDamage(hp, 15, { thestral: d.wand === "thestral" })
          logs.push(`[BURN] (fim do turno): ${d.name} −15% HP (${Math.max(0, getTotalHP(hp))}% restante)`)
          residualLines.push(`−15% HP por QUEIMADURA (${d.name})`)
        }
        if (d.debuffs.some((x) => x.type === "poison")) {
          hp = applyDamage(hp, 10, { thestral: d.wand === "thestral" })
          logs.push(`[VENENO] (fim do turno): ${d.name} −10% HP (${Math.max(0, getTotalHP(hp))}% restante)`)
          residualLines.push(`−10% HP por VENENO (${d.name})`)
        }
        return hp !== d.hp ? { ...d, hp } : d
      })
      state = state.map(reduceDebuffs)
      state = state.map((d) => ({
        ...d,
        disabledSpells: Object.fromEntries(
          Object.entries(d.disabledSpells || {})
            .map(([k, v]) => [k, Math.max(0, Number(v) - 1)] as [string, number])
            .filter(([, v]) => v > 0)
        ),
      }))
      state = state.map((d) => ({ ...d, turnsInBattle: (d.turnsInBattle ?? 0) + 1 }))
      setDuelists(state)
      if (residualLines.length > 0) {
        setBattleMessage("Dano de status — fim da rodada")
        setResidualBanner(residualLines.join(" · "))
        await sleep(3200)
        setResidualBanner(null)
        setBattleMessage("")
      }
    }

    setBattleLog((prev) => [...prev, ...logs])
    setActions({})
    const nextTurn = turnNumber + 1
    setTurnNumber(nextTurn)
    resolvingRef.current = false
    const outcome = evaluateWinConditions(state)
    if (!outcome) beginRoundSelection(state)
    if (isOnlineMatch && isAuthoritativeResolver) {
      const syncAction: RoundAction = {
        casterId: toNetworkId("player"),
        type: "sync",
        syncSnapshot: {
          round: turnNumber,
          turnNumber: nextTurn,
          duelists: state,
          logs,
          gameOver: outcome,
          battleStatus: outcome ? "finished" : "selecting",
        },
      }
      onDispatchAction?.(toNetworkId("player"), syncAction, matchId)
    }
  }

  useEffect(() => {
    setBackgroundImage(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)])
    if (playerBuild.gameMode === "teste") {
      const seeded = applyRapinomonioBlock(duelists)
      setDuelists(seeded)
      beginRoundSelection(seeded)
      return
    }
    setBattleStatus("idle")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (playerBuild.gameMode === "teste") return
    if (onlineBattleStartedRef.current) return
    if (onlineReadyPlayers < expectedOnlinePlayers) {
      setBattleStatus("idle")
      return
    }
    if (readyCount < expectedOnlinePlayers) {
      setBattleStatus("idle")
      return
    }
    onlineBattleStartedRef.current = true
    const seeded = applyRapinomonioBlock(duelists)
    setDuelists(seeded)
    beginRoundSelection(seeded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerBuild.gameMode, onlineReadyPlayers, readyCount, expectedOnlinePlayers])

  useEffect(() => {
    return () => {
      botTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
      botTimeoutsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (gameOver || battleStatus !== "selecting") return
    if (!isAuthoritativeResolver) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
          const unreadyIds = aliveIds.filter((id) => !actions[id])
          if (unreadyIds.length > 0) {
            setDuelists((current) =>
              current.map((d) => (unreadyIds.includes(d.id) ? { ...d, hp: { bars: [0, 0, 0, 0, 0] } } : d))
            )
            unreadyIds.forEach((id) => {
              const d = duelists.find((x) => x.id === id)
              if (d) addLog(`[Turno ${turnNumber}]: ${d.name} desconectou por tempo e foi derrotado.`)
            })
            setActions((current) => {
              const next = { ...current }
              unreadyIds.forEach((id) => {
                next[id] = { casterId: id, type: "skip" }
              })
              return next
            })
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [actions, battleStatus, duelists, gameOver, isAuthoritativeResolver, player?.name, playerDefeated, turnNumber])

  useEffect(() => {
    if (battleStatus !== "selecting") return
    if (!isAuthoritativeResolver) return
    const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
    const ready = Object.keys(actions).filter((id) => aliveIds.includes(id)).length
    if (aliveIds.length > 0 && ready >= aliveIds.length) {
      void runResolution(Object.values(actions))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, battleStatus, duelists, isAuthoritativeResolver])

  const onSpellClick = (spellName: string) => {
    if (isReadOnlySpectator) return
    if (gameOver || battleStatus !== "selecting" || playerCannotAct || playerDefeated || actions.player) return
    if (!player || isDefeated(player.hp)) return
    const mana = player.spellMana?.[spellName]
    if (!mana || mana.current <= 0) return
    if ((player.disabledSpells?.[spellName] ?? 0) > 0) return
    const spInfo = getSpellInfo(spellName)
    if (player.debuffs.some((d) => d.type === "paralysis") && (spInfo?.priority ?? 0) > 0) return
    const taunt = player.debuffs.find((d) => d.type === "taunt")
    if (taunt && player.lastSpellUsed && spellName !== player.lastSpellUsed) return

    const commitCast = (targetId: string, areaAll?: boolean) => {
      const localAction: RoundAction = { casterId: "player", type: "cast", spellName, targetId, areaAll }
      const netAction: RoundAction = { ...localAction, casterId: toNetworkId("player"), targetId: toNetworkId(targetId) }
      onDispatchAction?.(toNetworkId("player") || "player", netAction, matchId)
      setActions((prev) => ({ ...prev, player: localAction }))
    }

    if (isSelfTargetSpell(spellName)) {
      commitCast("player")
      return
    }
    if (isAreaSpell(spellName)) {
      const anchor =
        duelists.find((d) => d.team !== player.team && !isDefeated(d.hp)) ||
        duelists.find((d) => !isDefeated(d.hp))
      if (!anchor) return
      commitCast(anchor.id, true)
      return
    }

    if (playerBuild.gameMode === "1v1") {
      const provoke = player.debuffs.find((d) => d.type === "provoke")
      const target = provoke?.meta
        ? duelists.find((d) => d.id === provoke.meta && !isDefeated(d.hp))
        : duelists.find((d) => d.team === "enemy" && !isDefeated(d.hp))
      if (!target) return
      commitCast(target.id)
      return
    }
    setPendingSpell(spellName)
  }

  const onTargetClick = (targetId: string) => {
    if (isReadOnlySpectator) return
    if (!pendingSpell || !player || playerDefeated || battleStatus !== "selecting" || actions.player) return
    const valid = getValidTargetsForSpell(pendingSpell, player, duelists).some((d) => d.id === targetId && !isDefeated(d.hp))
    if (!valid) return
    const prov = player.debuffs.find((d) => d.type === "provoke")
    if (prov?.meta && targetId !== prov.meta) return
    const localAction: RoundAction = { casterId: "player", type: "cast", spellName: pendingSpell, targetId }
    const netAction: RoundAction = { ...localAction, casterId: toNetworkId("player"), targetId: toNetworkId(targetId) }
    onDispatchAction?.(toNetworkId("player") || "player", netAction, matchId)
    setActions((prev) => ({ ...prev, player: localAction }))
    setPendingSpell(null)
  }

  const usePotion = () => {
    if (isReadOnlySpectator) return
    if (potionUsed || gameOver || !player || playerDefeated || battleStatus !== "selecting" || !!actions.player) return
    if (player.debuffs.some((d) => d.type === "no_potion")) return
    setPotionUsed(true)
    const localAction: RoundAction = { casterId: "player", type: "potion", potionType: playerBuild.potion }
    const netAction: RoundAction = { ...localAction, casterId: toNetworkId("player") }
    onDispatchAction?.(toNetworkId("player") || "player", netAction, matchId)
    setActions((prev) => ({ ...prev, player: localAction }))
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatMessages((prev) => [...prev, { sender: playerBuild.name, text }])
    if (matchId) {
      const supabase = getSupabaseClient()
      void supabase.channel(`match-chat-${matchId}`).send({
        type: "broadcast",
        event: "chat_message",
        payload: { sender: playerBuild.name, text, senderId: playerBuild.userId || "anon" },
      })
    }
    setChatInput("")
  }

  const markReady = async () => {
    if (playerBuild.gameMode === "teste" || !matchId) return
    const supabase = getSupabaseClient()
    await supabase.from("match_ready_states").upsert(
      { match_id: matchId, player_id: localOnlineId, is_ready: true, updated_at: new Date().toISOString() },
      { onConflict: "match_id,player_id" }
    )
    setReadyByPlayerId((prev) => ({ ...prev, [localOnlineId]: true }))
  }

  useEffect(() => {
    if (!matchId) return
    const supabase = getSupabaseClient()
    const chatChannel = supabase
      .channel(`match-chat-${matchId}`)
      .on("broadcast", { event: "chat_message" }, ({ payload }: any) => {
        if (!payload?.text || payload.senderId === (playerBuild.userId || "anon")) return
        setChatMessages((prev) => [...prev, { sender: payload.sender || "Bruxo", text: payload.text }])
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(chatChannel)
    }
  }, [matchId, playerBuild.userId])

  const renderHearts = (hp: HPState) => {
    const total = getTotalHP(hp)
    return (
      <div className="relative z-50 flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, idx) => {
          const fill = Math.max(0, Math.min(100, total - idx * 100))
          return <Heart key={`${idx}-${total}-${hp.bars[idx] ?? 0}`} fillPercent={fill} />
        })}
      </div>
    )
  }

  const renderHUD = (duelist: Duelist) => {
    const avatarKey = duelist.avatar || DEFAULT_AVATARS[(duelist.id.charCodeAt(duelist.id.length - 1) || 0) % DEFAULT_AVATARS.length]
    const avatar = AVATAR_IMAGES[avatarKey]
    const dead = isDefeated(duelist.hp)
    const targetable = pendingSpell && player ? getValidTargetsForSpell(pendingSpell, player, duelists).some((d) => d.id === duelist.id && !isDefeated(d.hp)) : false
    return (
      <button
        ref={(el) => {
          hudRefs.current[duelist.id] = el
        }}
        type="button"
        onClick={() => onTargetClick(duelist.id)}
        disabled={!targetable}
        className={`relative w-full rounded-lg border-2 bg-stone-900/85 p-2 text-left transition-transform duration-150 ${dead ? "opacity-50 border-stone-600" : targetable ? "border-amber-400 animate-pulse" : "border-amber-900/80"} ${impactTargetId === duelist.id ? "scale-[1.03] ring-2 ring-amber-300" : ""}`}
      >
        {currentTargetId === duelist.id && <div className="absolute -top-2 left-1/2 z-50 -translate-x-1/2 text-xl text-amber-300">⬇</div>}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={avatar} alt={`Avatar ${duelist.name}`} className={`relative z-50 h-10 w-10 rounded-md border border-amber-700 object-cover ${dead ? "grayscale opacity-50" : ""}`} />
            <div className="text-xs">
              <p className="relative z-50 font-semibold text-amber-100">
                {duelist.name}{" "}
                {((duelist.circumAura ?? 0) > 0 || (circumFlames[duelist.id] ?? 0) > 0) && (
                  <span className="ml-1 inline-block text-red-500 drop-shadow-[0_0_6px_#f87171]" title="Circum Inflamare">
                    🔥
                  </span>
                )}{" "}
                <span className="text-amber-300/80">{HOUSE_SYMBOL[duelist.house] || "🪄"}</span>
              </p>
              <div className="relative z-50 mt-0.5 flex flex-wrap gap-1">
                {duelist.debuffs.map((db, idx) => (
                  <Badge key={`${duelist.id}-${idx}`} className="h-5 border border-amber-700 bg-stone-800 px-1 text-[9px] text-amber-200">
                    {DEBUFF_LABEL[db.type]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <span className="relative z-50 text-xs text-amber-200">{Math.max(0, getTotalHP(duelist.hp))}%</span>
        </div>
        {renderHearts(duelist.hp)}
        {statusFloater?.targetId === duelist.id && (
          <div
            key={statusFloater.key}
            className="pointer-events-none absolute -right-0.5 top-0 z-[60] max-w-[140px] animate-pulse rounded border border-amber-300 bg-amber-950/95 px-1.5 py-0.5 text-center text-[9px] font-extrabold uppercase leading-tight text-amber-100 shadow-md"
          >
            {statusFloater.text}
          </div>
        )}
        {feedbackTargetId === duelist.id && feedbackText && (
          <div
            className={`mt-1 rounded px-2 py-1 text-center font-bold ${
              feedbackText.startsWith("CRÍTICO")
                ? "border border-yellow-500/70 bg-black/80 text-lg text-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.5)]"
                : "bg-black/70 text-xs text-amber-200"
            }`}
            style={feedbackText.startsWith("CRÍTICO") ? { animation: "duel-crit-shake 0.14s ease-in-out 10" } : undefined}
          >
            {feedbackText}
          </div>
        )}
        {dead && <Badge className="mt-2 border border-red-700 bg-red-950 text-[10px] text-red-200">DERROTADO</Badge>}
      </button>
    )
  }

  const renderWand = (duelist: Duelist, side: "top" | "bottom", positionClass: string, mirror = false) => {
    const dead = isDefeated(duelist.hp)
    const image = side === "top" ? HAND_TOP : HAND_BOTTOM
    const size = side === "top" ? "h-[230px]" : "h-[285px]"
    return (
      <img src={image} alt={`Varinha de ${duelist.name}`} className={`pointer-events-none absolute z-10 ${positionClass} ${size} w-auto object-contain ${mirror ? "-scale-x-100" : ""} ${dead ? "grayscale opacity-50" : "opacity-95"}`} />
    )
  }

  const topDuelists = useMemo(() => duelists.filter((d) => d.team === "enemy"), [duelists])
  const bottomDuelists = useMemo(() => duelists.filter((d) => d.team === "player"), [duelists])

  return (
    <div className="min-h-screen bg-stone-800 font-serif text-amber-100">
      <header className="border-b border-amber-900/80 bg-stone-950/80 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-2xl text-amber-300">Arena de Duelo</h1>
          <div className="flex items-center gap-2">
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">{String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}</Badge>
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">{battleStatus.toUpperCase()}</Badge>
            {isReadOnlySpectator && <Badge className="border-blue-700 bg-blue-950/40 text-blue-200">ESPECTADOR</Badge>}
            {isReadOnlySpectator ? (
              <Button onClick={onReturn} className="h-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 px-2 text-xs text-amber-200 hover:from-amber-800 hover:to-amber-900" title="Voltar para o Lobby">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Lobby
              </Button>
            ) : (
              <Button onClick={onReturn} className="h-8 w-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 p-0 text-amber-200 hover:from-amber-800 hover:to-amber-900" title="Sair">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <div ref={arenaRef} className="relative min-h-[560px] overflow-hidden rounded-xl border-4 border-stone-700 bg-stone-700/80" style={{ backgroundImage: `linear-gradient(rgba(20,20,20,0.35), rgba(20,20,20,0.35)), url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
          {resolutionText && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <p className="rounded bg-black/70 px-5 py-3 text-4xl font-bold text-amber-200 md:text-5xl">{resolutionText}</p>
            </div>
          )}
          {battleMessage && !resolutionText && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[21] flex justify-center px-4">
              <p className="rounded border border-amber-600/80 bg-black/75 px-4 py-2 text-center text-sm font-semibold text-amber-100 shadow-lg md:text-base">
                {battleMessage}
              </p>
            </div>
          )}
          {residualBanner && (
            <div className="pointer-events-none absolute inset-0 z-[25] flex items-end justify-center pb-16">
              <p className="max-w-lg rounded-lg border-2 border-orange-500 bg-black/85 px-4 py-3 text-center text-sm font-bold text-orange-100 shadow-[0_0_24px_rgba(249,115,22,0.35)]">
                {residualBanner}
              </p>
            </div>
          )}
          <style dangerouslySetInnerHTML={{ __html: `@keyframes duel-crit-shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-4px,1px)}40%{transform:translate(4px,-1px)}60%{transform:translate(-3px,-1px)}80%{transform:translate(3px,1px)}}` }} />
          {arenaVfx && arenaVfx.from && arenaVfx.to && (arenaVfx.mode === "beam" || arenaVfx.mode.startsWith("beam-") || arenaVfx.mode === "fireball") && (() => {
            const { from, to, active, color, color2, mode } = arenaVfx
            const dx = to.x - from.x
            const dy = to.y - from.y
            const len = Math.max(8, Math.hypot(dx, dy))
            const ang = (Math.atan2(dy, dx) * 180) / Math.PI
            const w = active ? len : 0
            const h = mode === "beam-thin" ? 2 : mode === "beam-thick" ? 7 : mode === "beam-huge" ? 14 : mode === "beam-pulse" ? 10 : mode === "fireball" ? 0 : 5
            const dur = mode === "beam-huge" ? "480ms" : "780ms"
            if (mode === "fireball") {
              return (
                <div
                  key={arenaVfx.key}
                  className="pointer-events-none absolute z-30 rounded-full shadow-[0_0_28px_rgba(251,146,60,0.9)] transition-all ease-out"
                  style={{
                    width: active ? 52 : 18,
                    height: active ? 52 : 18,
                    left: active ? to.x - 26 : from.x - 9,
                    top: active ? to.y - 26 : from.y - 9,
                    background: `radial-gradient(circle at 30% 30%, ${color2}, ${color})`,
                    transitionDuration: dur,
                  }}
                />
              )
            }
            return (
              <div
                key={arenaVfx.key}
                className={`pointer-events-none absolute z-30 rounded-full shadow-[0_0_22px_currentColor] ease-out ${mode === "beam-pulse" ? "animate-pulse" : ""}`}
                style={{
                  color,
                  background: `linear-gradient(90deg,${color2},${color})`,
                  width: w,
                  height: h,
                  left: from.x,
                  top: from.y,
                  transform: `translate(0,-50%) rotate(${ang}deg)`,
                  transformOrigin: "0 50%",
                  transitionProperty: "width, opacity",
                  transitionDuration: dur,
                  opacity: active ? 1 : 0.85,
                }}
              />
            )
          })()}
          {arenaVfx && arenaVfx.mode === "shockwave" && arenaVfx.center && (
            <div
              key={arenaVfx.key}
              className="pointer-events-none absolute z-30 rounded-full border-4 bg-white/10 shadow-[0_0_40px_rgba(255,255,255,0.6)] transition-all ease-out"
              style={{
                width: arenaVfx.active ? 220 : 24,
                height: arenaVfx.active ? 220 : 24,
                left: arenaVfx.center.x - (arenaVfx.active ? 110 : 12),
                top: arenaVfx.center.y - (arenaVfx.active ? 110 : 12),
                borderColor: `${arenaVfx.color}99`,
                transitionDuration: "900ms",
              }}
            />
          )}
          {arenaVfx && arenaVfx.mode === "x" && arenaVfx.center && (
            <div key={arenaVfx.key} className="pointer-events-none absolute z-30" style={{ left: arenaVfx.center.x, top: arenaVfx.center.y, transform: "translate(-50%,-50%)" }}>
              {(["45deg", "-45deg"] as const).map((rot) => (
                <div
                  key={rot}
                  className={`absolute left-1/2 top-1/2 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_12px_currentColor] transition-all ease-out ${arenaVfx.xSize === "lg" ? "w-32" : arenaVfx.xSize === "sm" ? "w-16" : "w-24"}`}
                  style={{
                    backgroundColor: arenaVfx.color,
                    color: arenaVfx.color,
                    transform: `translate(-50%,-50%) rotate(${rot}) scaleX(${arenaVfx.active ? 1 : 0.2})`,
                    transitionDuration: "520ms",
                  }}
                />
              ))}
            </div>
          )}
          {arenaVfx && arenaVfx.mode === "explosion" && arenaVfx.center && (
            <div
              key={arenaVfx.key}
              className="pointer-events-none absolute z-30 rounded-full transition-all ease-out"
              style={{
                width: arenaVfx.active ? 280 : 40,
                height: arenaVfx.active ? 280 : 40,
                left: arenaVfx.center.x - (arenaVfx.active ? 140 : 20),
                top: arenaVfx.center.y - (arenaVfx.active ? 140 : 20),
                background: `radial-gradient(circle, ${arenaVfx.color2}cc, ${arenaVfx.color}55, transparent 70%)`,
                transitionDuration: "900ms",
              }}
            />
          )}
          {arenaVfx && arenaVfx.mode === "mist" && (
            <div
              key={arenaVfx.key}
              className={`pointer-events-none absolute inset-0 z-30 bg-gradient-to-b transition-opacity duration-1000 ease-in-out ${arenaVfx.active ? "opacity-95" : "opacity-0"}`}
              style={{ backgroundImage: `linear-gradient(to bottom, ${arenaVfx.color}33, #0f172a99, ${arenaVfx.color2}44)` }}
            />
          )}
          {arenaVfx && arenaVfx.mode === "lightning" && arenaVfx.lightningBolts && (
            <svg key={arenaVfx.key} className="pointer-events-none absolute inset-0 z-30 h-full w-full">
              {arenaVfx.lightningBolts.map((b, i) => (
                <line
                  key={i}
                  x1={b.x1}
                  y1={b.y1}
                  x2={arenaVfx.active ? b.x2 : b.x1}
                  y2={arenaVfx.active ? b.y2 : b.y1}
                  stroke={arenaVfx.color}
                  strokeWidth={arenaVfx.active ? 5 : 2}
                  className="transition-all duration-500 ease-out"
                  style={{ filter: "drop-shadow(0 0 8px gold)" }}
                />
              ))}
            </svg>
          )}
          {arenaVfx && arenaVfx.mode === "shield" && arenaVfx.center && (
            <div
              key={arenaVfx.key}
              className="pointer-events-none absolute z-30 rounded-full border-[3px] transition-all duration-700 ease-out"
              style={{
                width: arenaVfx.active ? 120 : 40,
                height: arenaVfx.active ? 120 : 40,
                left: arenaVfx.center.x - (arenaVfx.active ? 60 : 20),
                top: arenaVfx.center.y - (arenaVfx.active ? 60 : 20),
                borderColor: `${arenaVfx.color}`,
                backgroundColor: `${arenaVfx.color2}22`,
                boxShadow: `0 0 24px ${arenaVfx.color}`,
              }}
            />
          )}
          {arenaVfx && arenaVfx.mode === "heal-rise" && arenaVfx.center && (
            <div
              key={arenaVfx.key}
              className="pointer-events-none absolute z-30 w-10 transition-all duration-1000 ease-out"
              style={{
                left: arenaVfx.center.x - 20,
                top: arenaVfx.center.y,
                height: arenaVfx.active ? 140 : 8,
                transform: "translateY(-100%)",
                background: `linear-gradient(to top, transparent, ${arenaVfx.color2}88, ${arenaVfx.color})`,
                opacity: arenaVfx.active ? 0.9 : 0,
              }}
            />
          )}
          {arenaVfx && arenaVfx.mode === "flames-hud" && arenaVfx.center && (
            <div key={arenaVfx.key} className="pointer-events-none absolute z-30 flex gap-0.5 transition-opacity duration-700" style={{ left: arenaVfx.center.x - 28, top: arenaVfx.center.y - 40, opacity: arenaVfx.active ? 1 : 0 }}>
              <span className="text-2xl drop-shadow-[0_0_6px_red]">🔥</span>
              <span className="text-2xl drop-shadow-[0_0_6px_orange]">🔥</span>
            </div>
          )}
          {arenaVfx && arenaVfx.mode === "marker-bang" && arenaVfx.from && (
            <div
              key={arenaVfx.key}
              className="pointer-events-none absolute z-40 text-4xl font-black text-yellow-300 transition-all duration-500 ease-out"
              style={{
                left: arenaVfx.from.x - 20,
                top: arenaVfx.from.y - 28,
                transform: arenaVfx.active ? "scale(1.1)" : "scale(0.4)",
                textShadow: "0 0 12px #facc15",
              }}
            >
              [!]
            </div>
          )}
          {arenaVfx && arenaVfx.mode === "marker-question" && arenaVfx.from && (
            <div
              key={arenaVfx.key}
              className="pointer-events-none absolute z-40 text-4xl font-black transition-all duration-500 ease-out"
              style={{
                left: arenaVfx.from.x - 20,
                top: arenaVfx.from.y - 28,
                color: arenaVfx.color,
                transform: arenaVfx.active ? "scale(1.05)" : "scale(0.4)",
                textShadow: `0 0 14px ${arenaVfx.color2}`,
              }}
            >
              [?]
            </div>
          )}

          {playerBuild.gameMode === "ffa" || playerBuild.gameMode === "ffa3" ? (
            <div className="grid h-full min-h-[560px] grid-cols-2 grid-rows-2 gap-3 p-3">
              {duelists.slice(0, playerBuild.gameMode === "ffa3" ? 3 : 4).map((duelist, idx) => {
                const isTop = idx < 2
                return (
                  <div key={duelist.id} className="relative overflow-hidden rounded-lg border border-stone-500 bg-black/30 p-2">
                    {renderHUD(duelist)}
                    {renderWand(
                      duelist,
                      isTop ? "top" : "bottom",
                      isTop ? (idx === 0 ? "-top-10 -left-16" : "-top-10 -right-[20px]") : "-bottom-20 left-1/2 -translate-x-1/2",
                      idx % 2 === 1
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid h-full min-h-[560px] grid-rows-2">
              <div className="relative border-b border-stone-600 p-3">
                <div className={`grid gap-3 ${topDuelists.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {topDuelists.map((d, idx) => (
                    <div key={d.id}>
                      {renderHUD(d)}
                      {renderWand(d, "top", idx === 0 ? "-top-10 -left-16" : "-top-10 -right-[20px]", idx === 1)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative p-3">
                <div className={`grid gap-3 ${bottomDuelists.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {bottomDuelists.map((d, idx) => (
                    <div key={d.id}>
                      {renderHUD(d)}
                      {renderWand(d, "bottom", idx === 0 ? "-bottom-20 left-3" : "-bottom-20 right-3", idx === 1)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border-2 border-amber-900 bg-stone-900/85 p-3">
          {playerBuild.gameMode !== "teste" && (
            <div className="mb-2 rounded border border-amber-900/60 bg-stone-950/60 p-2 text-xs">
              <p className="mb-1 text-amber-300">Jogadores na sala</p>
              <div className="flex flex-wrap gap-1">
                {participantRoster.map((id, idx) => {
                  const label = id === playerBuild.userId ? `${playerBuild.name} (você)` : participantNames[idx] || `Bruxo ${idx + 1}`
                  const ready = !!readyByPlayerId[id]
                  return (
                    <Badge key={`${id}-${idx}`} className={`${ready ? "border-green-700 bg-green-950/50 text-green-200" : "border-amber-700 bg-stone-800 text-amber-200"}`}>
                      {label} {ready ? "✓" : "…"}
                    </Badge>
                  )
                })}
              </div>
              {onlineReadyPlayers >= expectedOnlinePlayers && !localIsReady && !isReadOnlySpectator && (
                <Button size="sm" className="mt-2 border border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50" onClick={() => void markReady()}>
                  Preparar
                </Button>
              )}
            </div>
          )}
          {playerBuild.gameMode !== "teste" && onlineReadyPlayers < expectedOnlinePlayers && (
            <p className="mb-2 text-xs text-amber-300">
              Aguardando jogadores na sala ({onlineReadyPlayers}/{expectedOnlinePlayers})...
            </p>
          )}
          {isReadOnlySpectator && <p className="mb-2 text-xs text-blue-300">Modo espectador: comandos de combate desabilitados.</p>}
          {playerDefeated && <p className="mb-2 text-xs text-red-300">Você foi derrotado e agora é espectador.</p>}
          {!playerDefeated && battleStatus === "selecting" && actions.player && <p className="mb-2 text-xs text-amber-300">Aguardando outros bruxos...</p>}
          {playerCannotAct && !playerDefeated && !actions.player && <p className="mb-2 text-xs text-red-300">Você está sob Freeze/Stun e não pode agir neste turno.</p>}
          {pendingSpell && <p className="mb-2 text-xs text-amber-300">Feitiço selecionado: {pendingSpell}. Escolha um alvo.</p>}

          {!isReadOnlySpectator && !actions.player && (
            <div className="mb-2 flex flex-wrap gap-2">
              {playerBuild.spells.map((spell) => {
                const mana = player?.spellMana?.[spell]
                const info = getSpellInfo(spell)
                const tauntLock = player?.debuffs.some((d) => d.type === "taunt") && player?.lastSpellUsed
                const disabledByDebuff = (player?.disabledSpells?.[spell] ?? 0) > 0
                const disabled =
                  !mana ||
                  mana.current <= 0 ||
                  !!gameOver ||
                  battleStatus !== "selecting" ||
                  playerCannotAct ||
                  playerDefeated ||
                  disabledByDebuff ||
                  (!!tauntLock && spell !== player.lastSpellUsed)
                return (
                  <Button key={spell} disabled={disabled} onClick={() => onSpellClick(spell)} className={`border border-amber-700 text-amber-100 ${pendingSpell === spell ? "bg-amber-600" : "bg-gradient-to-b from-amber-800 to-amber-900 hover:from-amber-700 hover:to-amber-800"}`}>
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    {spell} ({mana?.current}/{mana?.max} MANA | {info?.accuracy || 0}%{disabledByDebuff ? ` | 🔒${player?.disabledSpells?.[spell]}t` : ""})
                  </Button>
                )
              })}
              {!potionUsed && (
                <Button disabled={!!gameOver || battleStatus !== "selecting" || playerDefeated} onClick={usePotion} className="border border-purple-700 bg-purple-900 text-purple-100 hover:bg-purple-800">
                  <FlaskConical className="mr-1 h-3.5 w-3.5" />
                  {POTION_NAMES[playerBuild.potion] || "Pocao"}
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="grid gap-3 border-t-4 border-amber-900 bg-stone-950/90 p-3 md:grid-cols-2">
        <div className="rounded-lg border-2 border-amber-900 bg-stone-800/90 p-3">
          <p className="mb-2 text-xs font-bold text-amber-300">Log de Batalha</p>
          <div className="h-32 overflow-y-auto rounded border border-amber-800 bg-stone-900 p-2">
            {battleLog.slice(-40).map((line, i) => (
              <p key={i} className="mb-1 text-xs text-amber-100/90">{line}</p>
            ))}
          </div>
        </div>
        <div className="rounded-lg border-2 border-amber-900 bg-stone-800/90 p-3">
          <p className="mb-2 text-xs font-bold text-amber-300">Chat</p>
          <div className="mb-2 h-24 overflow-y-auto rounded border border-amber-800 bg-stone-900 p-2">
            {chatMessages.map((msg, i) => (
              <p key={i} className="mb-1 text-xs text-amber-100/90"><span className="font-semibold text-amber-300">{msg.sender}:</span> {msg.text}</p>
            ))}
          </div>
          <div className="flex gap-1">
            <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Escreva..." className="h-8 border-amber-800 bg-stone-900 text-amber-100 placeholder:text-stone-500" />
            <Button onClick={sendChat} className="h-8 border border-amber-700 bg-amber-800 px-2 hover:bg-amber-700">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </footer>

      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-xl border border-amber-700 bg-stone-900 p-8 text-center">
            <h2 className="text-2xl text-amber-300">{gameOver === "win" ? "Vitoria!" : gameOver === "timeout" ? "Time Out!" : "Derrota"}</h2>
            <Button onClick={onReturn} className="mt-4 border border-red-700 bg-red-900 text-amber-100 hover:bg-red-800">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {isReadOnlySpectator ? "Voltar para o Lobby" : "Voltar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})

export default DuelArena
