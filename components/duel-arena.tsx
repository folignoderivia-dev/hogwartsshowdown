"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, FlaskConical, Send, Wand2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HOUSE_GDD, HOUSE_MODIFIERS, rollSpellPower, SPELL_DATABASE, type SpellInfo, WAND_PASSIVES } from "@/lib/data-store"
import type { ArenaVfxState, BattleStatus, Duelist, Point } from "@/lib/arena-types"
import type { PlayerBuild } from "@/lib/types"
import { useArenaMatchSync } from "@/hooks/useArenaMatchSync"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"
import {
  calculateTurnOutcome,
  getSpellInfo,
  getSpellMaxPower,
  getTotalHP,
  isAreaSpell,
  isDefeated,
  isSelfTargetSpell,
  getValidTargetsForSpell,
} from "@/lib/turn-engine"

export type { RoundAction } from "@/lib/duelActions"

interface DuelArenaProps {
  playerBuild: PlayerBuild
  onReturn: () => void
  /** Chamado ao encerrar duelo para atualizar ELO (modo online / conta). */
  onBattleEnd?: (outcome: "win" | "lose", userId?: string) => void
  matchId?: string
  isSpectator?: boolean
  participantIds?: string[]
  participantNames?: string[]
  matchStatus?: "waiting" | "in_progress" | "finished"
}

type MatchBroadcastMessage =
  | { event: "HERE_I_AM"; userId: string; name?: string }
  | { event: "GAME_START"; players: string[]; from: string }
  | { event: "TURN_ACTION"; action: RoundAction }

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
const CHALLENGE_LABELS = ["Oitavas", "Quartas", "Semifinal", "Final"]
const CHALLENGE_BOTS = [
  { name: "Sentinela de Azkaban", house: "slytherin", wand: "dragon", spells: ["Bombarda", "Confrigo", "Crucius", "Imperio", "Protego", "Expelliarmus"] },
  { name: "Auror Renegado", house: "gryffindor", wand: "thunderbird", spells: ["Scarlatum", "Depulso", "Glacius", "Arestum Momentum", "Protego", "Ferula"] },
  { name: "Alquimista Sombrio", house: "ravenclaw", wand: "acromantula", spells: ["Confundos", "Flagellum", "Lumus", "Finite Incantatem", "Fumus", "Episkey"] },
  { name: "Duelista Fantasma", house: "hufflepuff", wand: "kelpie", spells: ["Incendio", "Confrigo", "Diffindo", "Sectumsempra", "Protego Diabólico", "Protego Maximo"] },
]
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
const computeRoundHash = (turnId: number, state: Duelist[]) => {
  const compact = [...state]
    .map((d) => ({
      id: d.id,
      hp: d.hp.bars.join(","),
      debuffs: d.debuffs.map((x) => `${x.type}:${x.duration}:${x.meta || ""}`).sort().join("|"),
      mana: Object.entries(d.spellMana || {}).map(([k, v]) => `${k}:${v.current}/${v.max}`).sort().join("|"),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const raw = JSON.stringify({ turnId, compact })
  let h = 0
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, "0")
}

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
    const info = getSpellInfo(sn, SPELL_DATABASE)
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

const DuelArena = (
  { playerBuild, onReturn, onBattleEnd, matchId, isSpectator = false, participantIds = [], participantNames = [], matchStatus }: DuelArenaProps
) => {
  if (typeof window === "undefined") return null
  const isOfflineMode = playerBuild.gameMode === "teste" || playerBuild.gameMode === "challenge"
  const selfDuelistId = playerBuild.userId ?? null
  const isIdentityReady = isOfflineMode || !!selfDuelistId
  if (!isOfflineMode && !selfDuelistId) {
    return (
      <div className="min-h-screen bg-stone-800 font-serif text-amber-100">
        <main className="mx-auto flex max-w-4xl items-center justify-center p-8">
          <div className="w-full max-w-lg rounded-xl border border-amber-700 bg-stone-900/90 p-6 text-center">
            <p className="text-lg font-semibold text-amber-200">Identidade inválida para PvP</p>
            <p className="mt-2 text-sm text-amber-300/90">Faça login novamente para abrir a arena online.</p>
          </div>
        </main>
      </div>
    )
  }

  const [duelists, setDuelists] = useState<Duelist[]>(() => {
    const playerMod = HOUSE_MODIFIERS[playerBuild.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
    const enemySpells = ["Bombarda", "Incendio", "Glacius", "Confrigo", "Expelliarmus", "Protego"]
    const playerDuelist: Duelist = {
      id: playerBuild.userId || "",
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

    if (isOfflineMode) {
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
        const duelId = isLocal ? (playerBuild.userId as string) : id
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
  const buildChallengeRound = useCallback((stage: number): Duelist[] => {
    const playerMod = HOUSE_MODIFIERS[playerBuild.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
    const playerDuelist: Duelist = {
      id: selfDuelistId,
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
    const botBase = CHALLENGE_BOTS[Math.floor(Math.random() * CHALLENGE_BOTS.length)]
    const bot: Duelist = {
      id: `challenge-bot-${stage + 1}`,
      name: `${botBase.name} (${CHALLENGE_LABELS[Math.min(stage, CHALLENGE_LABELS.length - 1)]})`,
      house: botBase.house,
      wand: botBase.wand,
      avatar: DEFAULT_AVATARS[(stage + 1) % DEFAULT_AVATARS.length],
      spells: botBase.spells,
      hp: { bars: [100, 100, 100, 100, 100] },
      speed: 92 + stage * 3,
      debuffs: [],
      team: "enemy",
      spellMana: buildSpellManaForSpells(botBase.spells, botBase.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    return [playerDuelist, bot]
  }, [playerBuild.avatar, playerBuild.house, playerBuild.name, playerBuild.spells, playerBuild.wand, selfDuelistId])

  const [battleStatus, setBattleStatus] = useState<BattleStatus>("idle")
  const [turnNumber, setTurnNumber] = useState(1)
  const [challengeStage, setChallengeStage] = useState(0)
  const [timeLeft, setTimeLeft] = useState(60)
  const [pendingSpell, setPendingSpell] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<Record<string, RoundAction>>({})
  const [battleLog, setBattleLog] = useState<string[]>(["[Turno 0]: O duelo começou!"])
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([{ sender: "Sistema", text: "Chat ativo." }])
  const [chatInput, setChatInput] = useState("")
  const isReadOnlySpectator = isSpectator || (!!matchId && !!playerBuild.userId && participantIds.length > 0 && !participantIds.includes(playerBuild.userId))

  useEffect(() => {
    if (isOfflineMode) return
    console.log("[Arena:init] participantIds update", { participantIds, participantNames })
    const base = buildOnlineDuelists(participantIds)
    if (base.length === 0) return
    setDuelists((prev) => {
      const next = base.map((d) => {
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
      console.log("[Arena:init] setDuelists from participants", {
        prevCount: prev.length,
        nextCount: next.length,
        ids: next.map((d) => d.id),
      })
      return next
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
  const [awaitingServerAck, setAwaitingServerAck] = useState(false)
  /** Só fica true ao receber `GAME_START` via broadcast (inclui eco self:true). */
  const [gameStartAcknowledged, setGameStartAcknowledged] = useState(isOfflineMode)
  const [knownBroadcastPlayers, setKnownBroadcastPlayers] = useState<string[]>(isOfflineMode ? [selfDuelistId] : [selfDuelistId].filter(Boolean))
  const [broadcastChannelConnected, setBroadcastChannelConnected] = useState(false)
  const [debugLastEvent, setDebugLastEvent] = useState("")
  /** Chaves de ingestão (broadcast ∪ backup): Set evita dupla aplicação na mesma tarefa síncrona. */
  const ingestedActionKeysRef = useRef<Set<string>>(new Set())
  const broadcastChannelRef = useRef<any | null>(null)
  const turnActionConfirmedRef = useRef<Set<string>>(new Set())
  const duelistsRef = useRef<Duelist[]>([])
  const turnNumberRef = useRef(turnNumber)
  const battleStatusRef = useRef<BattleStatus>("idle")
  const gameStartAcknowledgedRef = useRef(isOfflineMode)
  const peerHereAtRef = useRef<Record<string, number>>({})
  const lastRoundHashRef = useRef<string>("")

  useEffect(() => {
    duelistsRef.current = duelists
  }, [duelists])
  useEffect(() => {
    turnNumberRef.current = turnNumber
  }, [turnNumber])
  useEffect(() => {
    battleStatusRef.current = battleStatus
  }, [battleStatus])
  useEffect(() => {
    gameStartAcknowledgedRef.current = gameStartAcknowledged
  }, [gameStartAcknowledged])

  const processCombatAction = useCallback((actionPayload: RoundAction) => {
    setPendingActions((prev) => ({ ...prev, [actionPayload.casterId]: actionPayload }))
  }, [])
  const addLog = useCallback((line: string) => {
    setBattleLog((prev) => [...prev, line])
  }, [])

  const mergeDuelistsFromPlayerIds = useCallback(
    (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))].sort()
      if (unique.length === 0) return
      setDuelists((prev) => {
        const base = buildOnlineDuelists(unique)
        return base.map((d) => {
          const old = prev.find((p) => p.id === d.id)
          return old ? { ...d, hp: old.hp, debuffs: old.debuffs, spellMana: old.spellMana || d.spellMana } : d
        })
      })
    },
    [buildOnlineDuelists]
  )

  const ingestTurnActionFromNetwork = useCallback(
    (incoming: RoundAction, source: "broadcast" | "backup") => {
      if (!incoming?.casterId || incoming.turnId == null) return
      if (incoming.turnId !== turnNumberRef.current) return
      if (!isOfflineMode && matchId && battleStatusRef.current !== "selecting") return
      if (!duelistsRef.current.some((d) => d.id === incoming.casterId)) return
      const dedupeKey =
        incoming.eventId != null && String(incoming.eventId).length > 0
          ? `eid:${incoming.eventId}`
          : `row:${incoming.turnId}:${incoming.casterId}:${incoming.type}:${incoming.spellName ?? ""}:${incoming.targetId ?? ""}:${incoming.potionType ?? ""}`
      const seen = ingestedActionKeysRef.current
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)
      if (seen.size > 400) {
        const arr = [...seen]
        ingestedActionKeysRef.current = new Set(arr.slice(-200))
      }
      processCombatAction(incoming)
      turnActionConfirmedRef.current.add(`${incoming.turnId}:${incoming.casterId}`)
      setDebugLastEvent(
        source === "broadcast" ? `TURN_ACTION rx ${incoming.casterId.slice(0, 8)}…` : `BACKUP rx ${incoming.casterId.slice(0, 8)}…`
      )
    },
    [isOfflineMode, matchId, processCombatAction]
  )
  const submitTurnAction = useCallback(async (action: RoundAction) => {
    if (isOfflineMode || !matchId || !selfDuelistId) return
    const supabase = getSupabaseClient()
    const eventId = action.eventId || `${selfDuelistId}-${turnNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const payload: RoundAction = { ...action, casterId: selfDuelistId, turnId: turnNumber, eventId }
    setAwaitingServerAck(true)
    setBattleMessage("Aguardando confirmação broadcast...")
    setDebugLastEvent(`TURN_ACTION enviado T${turnNumber}`)
    await broadcastChannelRef.current?.send({
      type: "broadcast",
      event: "TURN_ACTION",
      payload: { event: "TURN_ACTION", action: payload } satisfies MatchBroadcastMessage,
    })
    void supabase
      .from("match_turns")
      .upsert(
        {
          match_id: matchId,
          turn_number: turnNumber,
          player_id: selfDuelistId,
          action_payload: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "match_id,turn_number,player_id" }
      )
      .then(({ error }) => {
        if (error) addLog(`[Backup]: falha ao persistir ação do turno ${turnNumber}.`)
      })
  }, [addLog, isOfflineMode, matchId, selfDuelistId, turnNumber])
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const hudRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const player = duelists.find((d) => d.id === selfDuelistId)
  const playerDefeated = !player || isDefeated(player.hp)
  const playerCannotAct = !!player?.debuffs.some((d) => d.type === "stun" || d.type === "freeze")
  const expectedOnlinePlayers =
    playerBuild.gameMode === "2v2" || playerBuild.gameMode === "ffa"
      ? 4
      : playerBuild.gameMode === "ffa3"
        ? 3
        : 2
  const {
    isOnlineMatch,
    isBattleReady,
    isInitializing,
  } = useArenaMatchSync({
    gameMode: playerBuild.gameMode,
    matchId,
    selfDuelistId,
    participantIds,
    expectedOnlinePlayers,
  })
  const onlineReadyPlayers = Math.max(duelists.length, participantIds.length || 0)
  const participantRoster = participantIds.length > 0 ? participantIds : duelists.map((d) => d.id)

  useEffect(() => {
    if (!isOnlineMatch) {
      setGameStartAcknowledged(true)
      return
    }
    if (!matchId) {
      setGameStartAcknowledged(false)
    }
  }, [isOnlineMatch, matchId])

  useEffect(() => {
    if (!isOnlineMatch || matchStatus !== "finished") return
    resolvingRef.current = false
    setAwaitingServerAck(false)
    setBattleMessage("Partida finalizada no servidor.")
    setGameOver((prev) => prev ?? "timeout")
    setBattleStatus("finished")
  }, [isOnlineMatch, matchStatus])

  useEffect(() => {
    if (!isOnlineMatch || !matchId || !selfDuelistId) return
    const supabase = getSupabaseClient()
    let active = true
    const known = new Set<string>([selfDuelistId])
    const expectedPlayers = expectedOnlinePlayers
    const STALE_HERE_MS = 14_000
    let lastGameStartEmitAt = 0
    peerHereAtRef.current[selfDuelistId] = Date.now()

    const pruneStalePeers = () => {
      const now = Date.now()
      for (const id of [...known]) {
        if (id === selfDuelistId) continue
        const last = peerHereAtRef.current[id] ?? 0
        if (last === 0 || now - last > STALE_HERE_MS) known.delete(id)
      }
    }

    const coordinator = () => {
      pruneStalePeers()
      const alive = Array.from(known).sort()
      return alive[0] === selfDuelistId
    }

    const emitGameStart = async (players: string[]) => {
      const uniquePlayers = players.filter((id, idx) => !!id && players.indexOf(id) === idx)
      if (uniquePlayers.length < expectedPlayers) return
      setDebugLastEvent("GAME_START tx")
      await broadcastChannelRef.current?.send({
        type: "broadcast",
        event: "GAME_START",
        payload: { event: "GAME_START", players: uniquePlayers, from: selfDuelistId } satisfies MatchBroadcastMessage,
      })
    }

    const ch = supabase
      .channel(`match-${matchId}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "HERE_I_AM" }, async ({ payload }: { payload: MatchBroadcastMessage }) => {
        if (!active || payload.event !== "HERE_I_AM") return
        if (!payload.userId) return
        peerHereAtRef.current[payload.userId] = Date.now()
        known.add(payload.userId)
        pruneStalePeers()
        const ids = Array.from(known).sort()
        setKnownBroadcastPlayers(ids)
        setDebugLastEvent(`HERE_I_AM ${payload.userId.slice(0, 8)}…`)
        mergeDuelistsFromPlayerIds(ids)
        if (coordinator() && known.size >= expectedPlayers) await emitGameStart(ids)
      })
      .on("broadcast", { event: "GAME_START" }, ({ payload }: { payload: MatchBroadcastMessage }) => {
        if (!active || payload.event !== "GAME_START") return
        const players = (payload.players || []).filter((id) => !!id)
        if (players.length < expectedPlayers) return
        if (!players.includes(selfDuelistId)) return
        setKnownBroadcastPlayers(players.sort())
        mergeDuelistsFromPlayerIds(players)
        setGameStartAcknowledged(true)
        setBattleMessage("")
        setDebugLastEvent("GAME_START rx")
      })
      .on("broadcast", { event: "TURN_ACTION" }, ({ payload }: { payload: MatchBroadcastMessage }) => {
        if (!active || payload.event !== "TURN_ACTION") return
        ingestTurnActionFromNetwork(payload.action, "broadcast")
      })
      .subscribe(async (status) => {
        if (!active) return
        setBroadcastChannelConnected(status === "SUBSCRIBED")
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setDebugLastEvent(`Canal: ${status}`)
        }
        if (status !== "SUBSCRIBED") return
        setDebugLastEvent("Canal SUBSCRIBED")
        peerHereAtRef.current[selfDuelistId] = Date.now()
        await ch.send({
          type: "broadcast",
          event: "HERE_I_AM",
          payload: { event: "HERE_I_AM", userId: selfDuelistId, name: playerBuild.name } satisfies MatchBroadcastMessage,
        })
      })

    const heartbeat = window.setInterval(() => {
      if (!active) return
      peerHereAtRef.current[selfDuelistId] = Date.now()
      void ch.send({
        type: "broadcast",
        event: "HERE_I_AM",
        payload: { event: "HERE_I_AM", userId: selfDuelistId, name: playerBuild.name } satisfies MatchBroadcastMessage,
      })
    }, 8000)

    const gameStartRetry = window.setInterval(() => {
      if (!active || gameStartAcknowledgedRef.current) return
      pruneStalePeers()
      const ids = Array.from(known).sort()
      setKnownBroadcastPlayers(ids)
      mergeDuelistsFromPlayerIds(ids)
      if (known.size < expectedPlayers) return
      if (!coordinator()) return
      const now = Date.now()
      if (now - lastGameStartEmitAt < 4500) return
      lastGameStartEmitAt = now
      void emitGameStart(ids)
    }, 3200)

    broadcastChannelRef.current = ch
    return () => {
      active = false
      window.clearInterval(heartbeat)
      window.clearInterval(gameStartRetry)
      broadcastChannelRef.current = null
      setBroadcastChannelConnected(false)
      void supabase.removeChannel(ch)
    }
  }, [expectedOnlinePlayers, ingestTurnActionFromNetwork, isOnlineMatch, matchId, mergeDuelistsFromPlayerIds, playerBuild.name, selfDuelistId])

  useEffect(() => {
    if (!isOnlineMatch || !matchId || battleStatus !== "selecting") return
    const supabase = getSupabaseClient()
    const poll = async () => {
      const tn = turnNumberRef.current
      const { data, error } = await supabase
        .from("match_turns")
        .select("turn_number,player_id,action_payload")
        .eq("match_id", matchId)
        .eq("turn_number", tn)
      if (error) return
      for (const row of data || []) {
        const playerId = String((row as { player_id?: string }).player_id || "")
        const raw = (row as { action_payload?: RoundAction }).action_payload
        if (!playerId || !raw) continue
        ingestTurnActionFromNetwork({ ...raw, casterId: playerId, turnId: tn }, "backup")
      }
    }
    const id = window.setInterval(() => void poll(), 1500)
    void poll()
    return () => window.clearInterval(id)
  }, [battleStatus, ingestTurnActionFromNetwork, isOnlineMatch, matchId])

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

  const effectiveSpeed = (d: Duelist) => {
    let s = d.speed
    if (d.debuffs.some((x) => x.type === "slow")) s = Math.floor(s * 0.35)
    return s
  }

  const evaluateWinConditions = (state: Duelist[]) => {
    if (isOnlineMatch && (!gameStartAcknowledged || !isBattleReady || isInitializing)) return null
    if (!state || state.length === 0) return null
    if (state.some((d) => !d || !d.hp || !Array.isArray(d.hp.bars))) return null
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
    if (isOnlineMatch) {
      turnActionConfirmedRef.current = new Set()
      ingestedActionKeysRef.current.clear()
    }
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

    if (isOfflineMode) {
      state
        .filter((d) => !d.isPlayer && !isDefeated(d.hp))
        .forEach((bot) => {
        if (bot.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
          initialActions[bot.id] = { casterId: bot.id, type: "skip", turnId: turnNumber }
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
          ? { casterId: bot.id, type: "cast", spellName, targetId: target.id, areaAll: isAreaSpell(spellName), turnId: turnNumber }
          : { casterId: bot.id, type: "skip", turnId: turnNumber }
        })
    }

    const localPlayer = state.find((d) => d.id === selfDuelistId)
    if (!isOnlineMatch) {
      if (!localPlayer || isDefeated(localPlayer.hp)) {
        initialActions[selfDuelistId] = { casterId: selfDuelistId, type: "skip", turnId: turnNumber }
      } else if (localPlayer.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
        initialActions[selfDuelistId] = { casterId: selfDuelistId, type: "skip", turnId: turnNumber }
      }
    }
    setPendingActions(initialActions)
  }

  const runResolution = async (queuedActions: RoundAction[]) => {
    if (resolvingRef.current) return
    resolvingRef.current = true
    try {
      setBattleStatus("resolving")
      setAwaitingServerAck(false)
      setBattleMessage("")
      const snapshot = [...duelistsRef.current]
      const outcome = calculateTurnOutcome({
        duelists: snapshot,
        actions: queuedActions,
        spellDatabase: SPELL_DATABASE,
        turnNumber,
        gameMode: playerBuild.gameMode,
        circumFlames,
      })
      let state = outcome.newDuelists
      for (const anim of outcome.animationsToPlay) {
        if (isOnlineMatch && matchStatus === "finished") {
          setGameOver((prev) => prev ?? "timeout")
          setBattleStatus("finished")
          return
        }
        const caster = state.find((d) => d.id === anim.casterId)
        const resolvedTargetIds = anim.targetIds?.length ? anim.targetIds : anim.targetId ? [anim.targetId] : []
        const targets = state.filter((d) => resolvedTargetIds.includes(d.id))
        if (anim.type === "cast" && caster && anim.spellName) {
          const prefix = anim.isMiss ? "ERROU" : "CONJUROU"
          const critText = anim.isCrit ? " (CRIT!)" : ""
          setResolutionText(`${caster.name} ${prefix} ${anim.spellName}!${critText}`)
          setBattleMessage(`${caster.name} ${prefix} ${anim.spellName}!${critText}`)
          await sleep(500)
          await playSpellVfx(anim.spellName, caster, targets)
          setResolutionText("")
        } else if (anim.type === "potion" && caster) {
          setResolutionText(`${caster.name} usou poção!`)
          await sleep(500)
          setResolutionText("")
        }
        await sleep(anim.delay ?? 900)
      }

      setDuelists(state)
      setBattleLog((prev) => [...prev, ...outcome.logs])
      const resolvedTurn = turnNumber
      const roundHash = computeRoundHash(resolvedTurn, state)
      if (lastRoundHashRef.current !== roundHash) {
        console.log("[Engine] roundHash", {
          turnId: resolvedTurn,
          roundHash,
          actions: queuedActions.map((a) => ({ casterId: a.casterId, type: a.type, eventId: a.eventId, turnId: a.turnId })),
        })
        lastRoundHashRef.current = roundHash
      }
      setPendingActions({})
      const nextTurn = turnNumber + 1
      setTurnNumber(nextTurn)
      if (outcome.outcome) {
        if (playerBuild.gameMode === "challenge" && outcome.outcome === "win" && challengeStage < CHALLENGE_LABELS.length - 1) {
          const nextStage = challengeStage + 1
          setChallengeStage(nextStage)
          addLog(`[Challenge]: ${playerBuild.name} avançou para ${CHALLENGE_LABELS[nextStage]}!`)
          const nextRound = applyRapinomonioBlock(buildChallengeRound(nextStage))
          setDuelists(nextRound)
          setPendingActions({})
          setPotionUsed(false)
          setPendingSpell(null)
          setGameOver(null)
          setTurnNumber(1)
          setBattleStatus("selecting")
          beginRoundSelection(nextRound)
          return
        }
        if (playerBuild.gameMode === "challenge" && outcome.outcome === "lose") {
          setChallengeStage(0)
        }
        setGameOver(outcome.outcome)
        if ((outcome.outcome === "win" || outcome.outcome === "lose") && playerBuild.gameMode !== "challenge") {
          onBattleEnd?.(outcome.outcome, playerBuild.userId)
        }
        setBattleStatus("finished")
        return
      }
      beginRoundSelection(state)
    } catch (e) {
      console.error("[Arena] runResolution", e)
      addLog("[Engine]: erro na resolução do turno; estado revertido para seleção.")
      setBattleStatus("selecting")
    } finally {
      resolvingRef.current = false
    }
  }

  useEffect(() => {
    setBackgroundImage(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)])
    if (playerBuild.gameMode === "challenge") {
      setChallengeStage(0)
      setPotionUsed(false)
      setPendingSpell(null)
      setPendingActions({})
      setTurnNumber(1)
      setGameOver(null)
      const seeded = applyRapinomonioBlock(buildChallengeRound(0))
      setDuelists(seeded)
      beginRoundSelection(seeded)
      return
    }
    if (isOfflineMode) {
      const seeded = applyRapinomonioBlock(duelists)
      setDuelists(seeded)
      beginRoundSelection(seeded)
      return
    }
    setBattleStatus("idle")
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isOfflineMode) return
    if (!isBattleReady || isInitializing || !gameStartAcknowledged) {
      setBattleStatus("idle")
      return
    }
    if (onlineReadyPlayers < expectedOnlinePlayers) {
      setBattleStatus("idle")
      return
    }
    if (battleStatus !== "idle") return
    const seeded = applyRapinomonioBlock(duelists)
    setDuelists(seeded)
    beginRoundSelection(seeded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleStatus, playerBuild.gameMode, onlineReadyPlayers, expectedOnlinePlayers, isBattleReady, gameStartAcknowledged, isInitializing])

  useEffect(() => {
    return () => {
      botTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
      botTimeoutsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (gameOver || battleStatus !== "selecting") return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (isOnlineMatch) {
            if (!awaitingServerAck) {
              const skipAction: RoundAction = { casterId: selfDuelistId, type: "skip", turnId: turnNumber }
              void submitTurnAction(skipAction)
            }
            return 0
          }
          const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
          const unreadyIds = aliveIds.filter((id) => !pendingActions[id])
          if (unreadyIds.length > 0) {
            setDuelists((current) =>
              current.map((d) => (unreadyIds.includes(d.id) ? { ...d, hp: { bars: [0, 0, 0, 0, 0] } } : d))
            )
            unreadyIds.forEach((id) => {
              const d = duelists.find((x) => x.id === id)
              if (d) addLog(`[Turno ${turnNumber}]: ${d.name} desconectou por tempo e foi derrotado.`)
            })
            setPendingActions((current) => {
              const next = { ...current }
              unreadyIds.forEach((id) => {
                next[id] = { casterId: id, type: "skip", turnId: turnNumber }
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
  }, [awaitingServerAck, battleStatus, duelists, gameOver, isOnlineMatch, pendingActions, player?.name, playerDefeated, selfDuelistId, submitTurnAction, turnNumber])

  useEffect(() => {
    if (battleStatus !== "selecting") return
    const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
    if (aliveIds.length === 0) return
    const pendingComplete = aliveIds.every((id) => {
      const a = pendingActions[id]
      return !!a && a.turnId === turnNumber
    })
    if (!pendingComplete) return
    if (isOnlineMatch) {
      const allConfirmed = aliveIds.every((id) => turnActionConfirmedRef.current.has(`${turnNumber}:${id}`))
      if (!allConfirmed) return
    }
    const actionList = Object.values(pendingActions).filter((a) => aliveIds.includes(a.casterId))
    console.log("[SHOWDOWN] Turno Completo Recebido:", actionList)
    void runResolution(actionList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleStatus, duelists, isOnlineMatch, pendingActions, turnNumber])

  const onSpellClick = (spellName: string) => {
    if (isReadOnlySpectator) return
    if (isOnlineMatch && !gameStartAcknowledged) return
    if (!isBattleReady || isInitializing) return
    if (gameOver || battleStatus !== "selecting" || playerCannotAct || playerDefeated || pendingActions[selfDuelistId] || awaitingServerAck) return
    if (!player || isDefeated(player.hp)) return
    const mana = player.spellMana?.[spellName]
    if (!mana || mana.current <= 0) return
    if ((player.disabledSpells?.[spellName] ?? 0) > 0) return
    const spInfo = getSpellInfo(spellName, SPELL_DATABASE)
    if (player.debuffs.some((d) => d.type === "paralysis") && (spInfo?.priority ?? 0) > 0) return
    const taunt = player.debuffs.find((d) => d.type === "taunt")
    if (taunt && player.lastSpellUsed && spellName !== player.lastSpellUsed) return

    const commitCast = (targetId: string, areaAll?: boolean) => {
      const spell = getSpellInfo(spellName, SPELL_DATABASE)
      const localAction: RoundAction = { casterId: selfDuelistId, type: "cast", spellName, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, areaAll, turnId: turnNumber }
      if (isOnlineMatch) {
        void submitTurnAction(localAction)
      } else {
        setPendingActions((prev) => ({ ...prev, [selfDuelistId]: localAction }))
      }
    }

    if (isSelfTargetSpell(spellName)) {
      commitCast(selfDuelistId)
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
    if (isOnlineMatch && !gameStartAcknowledged) return
    if (!isBattleReady || isInitializing) return
    if (!pendingSpell || !player || playerDefeated || battleStatus !== "selecting" || pendingActions[selfDuelistId] || awaitingServerAck) return
    const valid = getValidTargetsForSpell(pendingSpell, player, duelists).some((d) => d.id === targetId && !isDefeated(d.hp))
    if (!valid) return
    const prov = player.debuffs.find((d) => d.type === "provoke")
    if (prov?.meta && targetId !== prov.meta) return
    const spell = getSpellInfo(pendingSpell, SPELL_DATABASE)
    const localAction: RoundAction = { casterId: selfDuelistId, type: "cast", spellName: pendingSpell, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, turnId: turnNumber }
    if (isOnlineMatch) {
      void submitTurnAction(localAction)
    } else {
      setPendingActions((prev) => ({ ...prev, [selfDuelistId]: localAction }))
    }
    setPendingSpell(null)
  }

  const usePotion = () => {
    if (isReadOnlySpectator) return
    if (isOnlineMatch && !gameStartAcknowledged) return
    if (!isBattleReady || isInitializing) return
    if (potionUsed || gameOver || !player || playerDefeated || battleStatus !== "selecting" || !!pendingActions[selfDuelistId] || awaitingServerAck) return
    if (player.debuffs.some((d) => d.type === "no_potion")) return
    setPotionUsed(true)
    const localAction: RoundAction = { casterId: selfDuelistId, type: "potion", potionType: playerBuild.potion, turnId: turnNumber }
    if (isOnlineMatch) {
      void submitTurnAction(localAction)
    } else {
      setPendingActions((prev) => ({ ...prev, [selfDuelistId]: localAction }))
    }
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

  const handleLeaveRoom = async () => {
    try {
      const supabase = getSupabaseClient()
      const leavingId = selfDuelistId
      if (matchId && leavingId && !isOfflineMode && !isReadOnlySpectator) {
        await supabase
          .from("match_players")
          .delete()
          .eq("match_id", matchId)
          .eq("player_id", leavingId)
        if (playerBuild.gameMode === "1v1") {
          const remaining = participantIds.filter((id) => id !== leavingId)
          await supabase
            .from("matches")
            .update({
              status: "finished",
              current_turn_owner: remaining[0] || null,
              updated_at: new Date().toISOString(),
            })
            .eq("match_id", matchId)
        }
      }
      if (playerBuild.userId && typeof window !== "undefined") {
        window.localStorage.removeItem(`duel:lastBuild:${playerBuild.userId}`)
      }
    } finally {
      onReturn()
    }
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
            <img src={avatar} alt={`Avatar ${duelist.name}`} className={`relative z-50 h-16 w-16 rounded-md border border-amber-700 object-cover ${dead ? "grayscale opacity-50" : ""}`} />
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
            {playerBuild.gameMode === "challenge" && <Badge className="border-purple-700 bg-purple-950/40 text-purple-200">{CHALLENGE_LABELS[Math.min(challengeStage, CHALLENGE_LABELS.length - 1)]}</Badge>}
            {isReadOnlySpectator && <Badge className="border-blue-700 bg-blue-950/40 text-blue-200">ESPECTADOR</Badge>}
            {isReadOnlySpectator ? (
              <Button onClick={handleLeaveRoom} className="h-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 px-2 text-xs text-amber-200 hover:from-amber-800 hover:to-amber-900" title="Voltar para o Lobby">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Lobby
              </Button>
            ) : (
              <Button onClick={handleLeaveRoom} className="h-8 w-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 p-0 text-amber-200 hover:from-amber-800 hover:to-amber-900" title="Sair">
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
          {!isOfflineMode && !gameStartAcknowledged && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-red-950/50">
              <div className="rounded-xl border border-red-600 bg-red-900/80 px-6 py-4 text-center shadow-[0_0_30px_rgba(239,68,68,0.45)]">
                <p className="text-xl font-bold tracking-wide text-red-100">AGUARDANDO OPONENTE...</p>
                <p className="mt-1 text-xs text-red-200/90">Conexão via broadcast ativa. A luta começa sem esperar o banco.</p>
              </div>
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
          {!isOfflineMode && (
            <div className="mb-2 rounded border border-amber-900/60 bg-stone-950/60 p-2 text-xs">
              <p className="mb-1 text-amber-300">Jogadores na sala</p>
              <div className="flex flex-wrap gap-1">
                {(knownBroadcastPlayers.length > 0 ? knownBroadcastPlayers : participantRoster).map((id, idx) => {
                  const label = id === selfDuelistId ? `${playerBuild.name} (você)` : participantNames[idx] || `Bruxo ${idx + 1}`
                  return (
                    <Badge key={`${id}-${idx}`} className="border-amber-700 bg-stone-800 text-amber-200">
                      {label}
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}
          {!isOfflineMode && !gameStartAcknowledged && (
            <p className="mb-2 text-xs text-amber-300">
              Aguardando jogadores na sala ({knownBroadcastPlayers.length || 1}/{expectedOnlinePlayers})...
            </p>
          )}
          {!isOfflineMode && !isBattleReady && (
            <p className="mb-2 text-xs text-amber-300">Conectando canal de broadcast da partida...</p>
          )}
          {isReadOnlySpectator && <p className="mb-2 text-xs text-blue-300">Modo espectador: comandos de combate desabilitados.</p>}
          {playerDefeated && <p className="mb-2 text-xs text-red-300">Você foi derrotado e agora é espectador.</p>}
          {!playerDefeated && battleStatus === "selecting" && pendingActions[selfDuelistId] && <p className="mb-2 text-xs text-amber-300">Aguardando outros bruxos...</p>}
          {!playerDefeated && awaitingServerAck && <p className="mb-2 text-xs text-amber-300">Enviando ação para o servidor...</p>}
          {playerCannotAct && !playerDefeated && !pendingActions[selfDuelistId] && <p className="mb-2 text-xs text-red-300">Você está sob Freeze/Stun e não pode agir neste turno.</p>}
          {pendingSpell && <p className="mb-2 text-xs text-amber-300">Feitiço selecionado: {pendingSpell}. Escolha um alvo.</p>}

          {!isReadOnlySpectator && !pendingActions[selfDuelistId] && (
            <div className="mb-2 flex flex-wrap gap-2">
              {playerBuild.spells.map((spell) => {
                const mana = player?.spellMana?.[spell]
                const info = getSpellInfo(spell, SPELL_DATABASE)
                const tauntLock = player?.debuffs.some((d) => d.type === "taunt") && player?.lastSpellUsed
                const disabledByDebuff = (player?.disabledSpells?.[spell] ?? 0) > 0
                const disabled =
                  !mana ||
                  mana.current <= 0 ||
                  !!gameOver ||
                  battleStatus !== "selecting" ||
                  !isBattleReady ||
                  (isOnlineMatch && !gameStartAcknowledged) ||
                  awaitingServerAck ||
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
                <Button
                  disabled={
                    !!gameOver ||
                    battleStatus !== "selecting" ||
                    playerDefeated ||
                    !isBattleReady ||
                    (isOnlineMatch && !gameStartAcknowledged) ||
                    awaitingServerAck
                  }
                  onClick={usePotion}
                  className="border border-purple-700 bg-purple-900 text-purple-100 hover:bg-purple-800"
                >
                  <FlaskConical className="mr-1 h-3.5 w-3.5" />
                  {POTION_NAMES[playerBuild.potion] || "Pocao"}
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      {!isOfflineMode && matchId && (
        <div
          className="pointer-events-none fixed bottom-20 right-3 z-[90] max-w-[13rem] rounded border border-stone-600/90 bg-black/85 px-2 py-1 font-mono text-[10px] leading-tight text-stone-300 shadow-md backdrop-blur-sm"
          aria-hidden
        >
          <p>[Conectado: {broadcastChannelConnected ? "Sim" : "Não"}]</p>
          <p>
            [Players: {knownBroadcastPlayers.length}/{expectedOnlinePlayers}]
          </p>
          <p className="truncate" title={debugLastEvent}>
            [Último Evento: {debugLastEvent || "—"}]
          </p>
        </div>
      )}

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
            <Button onClick={handleLeaveRoom} className="mt-4 border border-red-700 bg-red-900 text-amber-100 hover:bg-red-800">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {isReadOnlySpectator ? "Voltar para o Lobby" : "Voltar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DuelArena
