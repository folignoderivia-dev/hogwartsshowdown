"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlaskConical, Wand2, X, Skull } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HOUSE_GDD, HOUSE_MODIFIERS, SPELL_DATABASE, WAND_PASSIVES } from "@/lib/data-store"
import type { ArenaVfxState, BattleStatus, Duelist, HPState, DebuffType, Point } from "@/lib/arena-types"
import type { PlayerBuild } from "@/lib/types"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"
import { updateMarchRecord } from "@/lib/database"
import { useLanguage } from "@/contexts/language-context"
import {
  calculateTurnOutcome,
  type EngineAnimation,
  getSpellInfo,
  getSpellMaxPower,
  getTotalHP,
  isAreaSpell,
  isDefeated,
  isSelfTargetSpell,
  getValidTargetsForSpell,
  calculateAccuracy,
} from "@/lib/turn-engine"

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
const HOUSE_CREST: Record<string, string> = {
  gryffindor: "https://i.postimg.cc/596PnFYQ/pngwing-com-(2).png",
  slytherin:  "https://i.postimg.cc/66yHYG2L/pngwing-com-(3).png",
  ravenclaw:  "https://i.postimg.cc/nVCd0Qj4/pngwing-com-(4).png",
  hufflepuff: "https://i.postimg.cc/bYs632DQ/pngwing-com-(1).png",
}
const POTION_NAMES: Record<string, string> = {
  wiggenweld: "Wiggenweld",
  mortovivo: "Morto Vivo",
  edurus: "Edurus",
  maxima: "Maxima",
  foco: "Foco",
  merlin: "Poção de Merlin",
  felix: "Felix Felicis",
  aconito: "Acônito",
  amortentia: "Amortentia",
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
  bomba: "💣 BOMBA",
  bloqueio_cura: "🚫 SEM CURA",
  damage_reduce: "⬇️ DANO-25%",
  protego_diabol: "🛡️ DIABÓLICO",
  crit_down: "⬇️ CRIT-10%",
  undead: "💀 IMORTAL(1t)",
  immunity: "🛡️ IMUNIDADE",
  charm: "💖 ENCANTO",
  unforgivable_block: "🜏 BLOQUEIO MALDIÇÕES",
  invulnerable: "🪶 INVULNERÁVEL",
  invisibility: "👻 INVISÍVEL",
}
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
  invisibility: "INVISIBILIZOU!",
  spell_disable: "DESABILITOU!",
  salvio_reflect: "REFLEXO!",
  anti_debuff: "IMUNIZOU!",
  crit_boost: "CRÍTICO+!",
  unforgivable_acc_down: "IMPERDOÁVEIS -15% ACC!",
  protego_maximo: "PROTEGO MAXIMO!",
  undead: "IMORTAL!",
  immunity: "IMUNE!",
  charm: "ENCANTOU!",
  unforgivable_block: "PATRONUM! SEM MALDIÇÕES!",
  damage_reduce: "DANO −25%!",
  crit_down: "CRÍTICO −!",
  bomba: "BOMBA!",
  bloqueio_cura: "SEM CURA!",
}

const normSpell = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

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
  if (n.includes("lumus")) return { mode: "beam-thin", color: "#fef9c3", color2: "#fde047" }
  if (n.includes("trevus")) return { mode: "mist", color: "#7c3aed", color2: "#a78bfa" }
  if (n.includes("petrificus")) return { mode: "shield", color: "#78716c", color2: "#a8a29e" }
  if (n.includes("vermillious")) return { mode: "fireball", color: "#dc2626", color2: "#f97316" }
  return { mode: "beam", color: "#fbbf24", color2: "#fcd34d" }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function buildHpBars(house: string): number[] {
  return house === "slytherin" ? [100, 100, 100, 100] : [100, 100, 100, 100, 100]
}

function buildSpellManaForSpells(spells: string[], house: string, multiplier: number = 1): Record<string, { current: number; max: number }> {
  const out: Record<string, { current: number; max: number }> = {}
  spells.forEach((sn) => {
    const spell = SPELL_DATABASE.find(s => s.name === sn)
    if (!spell) return
    // Use standard spell cost (same as regular duel arena)
    let max = spell.cost || 3
    if (house === "gryffindor") max = Math.max(1, max + HOUSE_GDD.gryffindor.manaStartDelta)
    if (house === "ravenclaw" && !spell.isUnforgivable) max += HOUSE_GDD.ravenclaw.manaBonusNonUnforgivable
    max = Math.round(max * multiplier)
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

interface DeathMarchArenaProps {
  playerBuild: PlayerBuild
  currentUser: { id: string; username: string; email: string; elo: number }
  onExit: () => void
}

const AVATAR_IMAGES: Record<string, string> = {
  avatar1: "https://i.postimg.cc/LXbFGK31/pngwing-com-(10).png",
  avatar2: "https://i.postimg.cc/zBcY4ZFb/pngwing-com-(11).png",
  avatar3: "https://i.postimg.cc/XJz6tSkp/pngwing-com-(12).png",
  avatar4: "https://i.postimg.cc/bJBf4c9Z/pngwing-com-(13).png",
  avatar5: "https://i.postimg.cc/k4pPL3vD/pngwing-com-(14).png",
  avatar6: "https://i.postimg.cc/C1Qp9TsK/pngwing-com-(15).png",
  avatar7: "https://i.postimg.cc/SsvbHFfS/pngwing-com-(16).png",
  avatar8: "https://i.postimg.cc/LXbFGK3m/pngwing-com-(17).png",
}
const DEFAULT_AVATARS = ["avatar1","avatar2","avatar3","avatar4","avatar5","avatar6","avatar7","avatar8"]

// Field Rules
type FieldRule = { id: string; name: string; nameEn: string; description: string; descriptionEn: string }

const FIELD_RULES: FieldRule[] = [
  { id: "dreno_vital", name: "Dreno Vital", nameEn: "Vital Drain", description: "-100 HP por turno", descriptionEn: "-100 HP per turn" },
  { id: "amnesia_arcana", name: "Amnésia Arcana", nameEn: "Arcane Amnesia", description: "Trocar feitiços", descriptionEn: "Swap spells" },
  { id: "exaustao_arcana", name: "Exaustão Arcana", nameEn: "Arcane Exhaustion", description: "Custo de mana x2", descriptionEn: "Mana cost x2" },
  { id: "alquimia_infinita", name: "Alquimia Infinita", nameEn: "Infinite Alchemy", description: "Poções infinitas", descriptionEn: "Infinite potions" },
  { id: "campo_neutro", name: "Campo Neutro", nameEn: "Neutral Field", description: "Sem críticos", descriptionEn: "No critical hits" },
  { id: "maldicao_caos", name: "Maldição do Caos", nameEn: "Chaos Curse", description: "Debuff aleatório", descriptionEn: "Random debuff" },
  { id: "bencao_acaso", name: "Benção do Acaso", nameEn: "Luck Blessing", description: "Cura aleatória", descriptionEn: "Random heal" },
  { id: "selo_sangue", name: "Selo de Sangue", nameEn: "Blood Seal", description: "Debuffs permanentes", descriptionEn: "Permanent debuffs" },
]

const HOUSES = ["gryffindor", "slytherin", "ravenclaw", "hufflepuff"]
const WANDS = ["holly", "vine", "dragon", "phoenix", "unicorn", "thunderbird"]
const ALL_SPELLS = SPELL_DATABASE.filter(s => !s.isVipOnly).map(s => s.name)

export default function DeathMarchArena({ playerBuild, currentUser, onExit }: DeathMarchArenaProps) {
  const { locale } = useLanguage()
  const supabase = getSupabaseClient()
  
  const [marchWins, setMarchWins] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [currentRule, setCurrentRule] = useState<FieldRule | null>(null)
  
  const [duelists, setDuelists] = useState<Duelist[]>([])
  const [pendingActions, setPendingActions] = useState<Record<string, RoundAction>>({})
  const [pendingSpell, setPendingSpell] = useState<string | null>(null)
  const [turnNumber, setTurnNumber] = useState(1)
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [battleStatus, setBattleStatus] = useState<BattleStatus>("idle")
  const [gameOver, setGameOver] = useState<"win" | "lose" | null>(null)
  const [potionUsed, setPotionUsed] = useState(false)
  const [circumFlames, setCircumFlames] = useState<Record<string, number>>({})
  const [backgroundImage, setBackgroundImage] = useState(SCENARIOS[0])
  const [timeLeft, setTimeLeft] = useState(120)
  const [arenaVfx, setArenaVfx] = useState<ArenaVfxState | null>(null)
  const [floatingTexts, setFloatingTexts] = useState<{ id: number; text: string; type: string; x: number; y: number }[]>([])
  const [battleMessage, setBattleMessage] = useState("")
  const [potionGlowId, setPotionGlowId] = useState<string | null>(null)
  
  const duelistsRef = useRef<Duelist[]>([])
  const turnNumberRef = useRef(turnNumber)
  const hudRefs = useRef<Record<string, HTMLElement>>({})
  const arenaRef = useRef<HTMLDivElement>(null)
  const arenaVfxKeyRef = useRef(0)
  const fctCounterRef = useRef(0)
  
  useEffect(() => { duelistsRef.current = duelists }, [duelists])
  useEffect(() => { turnNumberRef.current = turnNumber }, [turnNumber])
  
  const addLog = useCallback((line: string) => { setBattleLog((prev) => [...prev, line]) }, [])
  
  const loadProgress = async () => {
    setIsLoaded(true)
  }
  
  const generateRandomBot = (): Duelist => {
    const house = HOUSES[Math.floor(Math.random() * HOUSES.length)]
    const wand = WANDS[Math.floor(Math.random() * WANDS.length)]
    const shuffled = [...ALL_SPELLS].sort(() => Math.random() - 0.5)
    const botSpells = shuffled.slice(0, 6)
    
    return {
      id: `death-march-bot-${Date.now()}`,
      name: `Bot ${Math.floor(Math.random() * 1000)}`,
      house, wand,
      avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
      spells: botSpells,
      hp: { bars: buildHpBars(house) },
      speed: 95 + Math.floor(Math.random() * 20),
      debuffs: [],
      team: "enemy",
      spellMana: buildSpellManaForSpells(botSpells, house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
  }
  
  const buildDeathMarchRound = (swapSpells: boolean = false, manaMultiplier: number = 1): Duelist[] => {
    const playerMod = HOUSE_MODIFIERS[playerBuild.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
    
    const playerDuelist: Duelist = {
      id: currentUser.id,
      name: playerBuild.name,
      house: playerBuild.house,
      wand: playerBuild.wand,
      avatar: playerBuild.avatar,
      spells: playerBuild.spells,
      hp: { bars: buildHpBars(playerBuild.house) },
      speed: Math.round(100 * playerMod.speed),
      debuffs: [],
      isPlayer: true,
      team: "player",
      spellMana: buildSpellManaForSpells(playerBuild.spells, playerBuild.house, manaMultiplier),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    const botDuelist = generateRandomBot()
    
    if (swapSpells) {
      const tempSpells = [...playerDuelist.spells]
      playerDuelist.spells = botDuelist.spells
      playerDuelist.spellMana = buildSpellManaForSpells(botDuelist.spells, playerBuild.house, manaMultiplier)
      botDuelist.spells = tempSpells
      botDuelist.spellMana = buildSpellManaForSpells(tempSpells, botDuelist.house, manaMultiplier)
    }
    
    return [playerDuelist, botDuelist]
  }
  
  const selectRandomRule = () => {
    const rule = FIELD_RULES[Math.floor(Math.random() * FIELD_RULES.length)]
    setCurrentRule(rule)
    return rule
  }
  
  const startNewBattle = () => {
    setBackgroundImage(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)])
    const rule = selectRandomRule()
    const swapSpells = rule.id === "amnesia_arcana"
    const manaMultiplier = rule.id === "exaustao_arcana" ? 2 : 1
    const round = buildDeathMarchRound(swapSpells, manaMultiplier)
    setDuelists(round)
    setPotionUsed(false)
    setPendingSpell(null)
    setPendingActions({})
    setTurnNumber(1)
    setGameOver(null)
    const currentWins = marchWinsRef.current
    const ruleName = locale === "en" ? rule.nameEn : rule.name
    addLog(locale === "en" ? `[March ${currentWins + 1}] Battle started! Field Rule: ${ruleName}` : `[Marcha ${currentWins + 1}] Batalha iniciada! Regra de Campo: ${ruleName}`)
    beginRoundSelection(round)
  }
  
  const marchWinsRef = useRef(0)
  const battleStartedRef = useRef(false)
  
  useEffect(() => {
    marchWinsRef.current = marchWins
  }, [marchWins])
  
  useEffect(() => {
    if (!battleStartedRef.current) {
      battleStartedRef.current = true
      loadProgress().then(() => {
        startNewBattle()
      })
    }
  }, [])
  
  const beginRoundSelection = (state: Duelist[] = duelists) => {
    if (gameOver) return
    const rt = turnNumberRef.current
    setBattleStatus("selecting")
    setTimeLeft(120)
    setPendingSpell(null)
    setBattleMessage("")
    
    const initialActions: Record<string, RoundAction> = {}
    
    state.filter((d) => !d.isPlayer && !isDefeated(d.hp)).forEach((bot) => {
      if (bot.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
        initialActions[bot.id] = { casterId: bot.id, type: "skip", turnId: rt }
        return
      }
      const availableBotSpells = bot.spells.filter((s) => (bot.disabledSpells?.[s] ?? 0) <= 0)
      const spellName = (availableBotSpells.length > 0 ? availableBotSpells : bot.spells)[Math.floor(Math.random() * (availableBotSpells.length > 0 ? availableBotSpells.length : bot.spells.length))]
      
      const targets = getValidTargetsForSpell(spellName, bot, state, "torneio-offline")
      const target = targets[Math.floor(Math.random() * targets.length)]
      
      initialActions[bot.id] = target
        ? { casterId: bot.id, type: "cast", spellName, targetId: target.id, areaAll: isAreaSpell(spellName), turnId: rt }
        : { casterId: bot.id, type: "skip", turnId: rt }
    })
    
    setPendingActions(initialActions)
  }
  
  const runResolution = async (queuedActions: RoundAction[]) => {
    setBattleStatus("resolving")
    const roundTurn = turnNumberRef.current
    const snapshot = [...duelistsRef.current]
    
    const outcome = calculateTurnOutcome({
      duelists: snapshot,
      actions: queuedActions,
      spellDatabase: SPELL_DATABASE,
      turnNumber: roundTurn,
      gameMode: "torneio-offline",
      circumFlames,
    })
    
    let state = outcome.newDuelists
    
    // Apply field rules
    if (currentRule?.id === "dreno_vital") {
      state = state.map((d) => {
        const total = getTotalHP(d.hp)
        if (total <= 0) return d
        const newTotal = Math.max(0, total - 100)
        const newBars: number[] = []
        let remaining = newTotal
        for (let i = 0; i < d.hp.bars.length; i++) {
          newBars.push(Math.min(100, remaining))
          remaining -= 100
        }
        return { ...d, hp: { bars: newBars } }
      })
    }
    
    if (currentRule?.id === "maldicao_caos") {
      const debuffTypes: DebuffType[] = ["burn", "poison", "slow", "damage_amp", "damage_reduce"]
      state = state.map((d) => {
        if (isDefeated(d.hp)) return d
        const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)]
        const existing = d.debuffs.find((db) => db.type === randomDebuff)
        if (existing) return d
        return { ...d, debuffs: [...d.debuffs, { type: randomDebuff, duration: 1 }] }
      })
    }
    
    if (currentRule?.id === "bencao_acaso") {
      const alive = state.filter((d) => !isDefeated(d.hp))
      if (alive.length > 0) {
        const luckyOne = alive[Math.floor(Math.random() * alive.length)]
        const healAmount = Math.floor(Math.random() * 151) + 50 // 50-200
        state = state.map((d) => {
          if (d.id !== luckyOne.id) return d
          const total = getTotalHP(d.hp)
          const newTotal = Math.min(500, total + healAmount)
          const newBars: number[] = []
          let remaining = newTotal
          for (let i = 0; i < d.hp.bars.length; i++) {
            newBars.push(Math.min(100, remaining))
            remaining -= 100
          }
          return { ...d, hp: { bars: newBars } }
        })
      }
    }
    
    setDuelists(state)
    setBattleLog((prev) => [...prev, ...outcome.logs])
    
    await playAnimations(outcome.animationsToPlay, state)
    
    const nextTurn = roundTurn + 1
    turnNumberRef.current = nextTurn
    setTurnNumber(nextTurn)
    setPendingActions({})
    
    if (outcome.outcome) {
      if (outcome.outcome === "win") handleWin()
      else if (outcome.outcome === "lose") handleLose()
      setBattleStatus("finished")
      return
    }
    
    beginRoundSelection(state)
  }
  
  const getFCTPos = (id: string): Point => {
    const el = hudRefs.current[id]
    if (!el) return { x: 0, y: 0 }
    const arena = arenaRef.current
    if (!arena) return { x: 0, y: 0 }
    const rect = arena.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 }
  }

  const getFCTFromAnim = (anim: EngineAnimation) => {
    if (anim.type === "cast" && anim.fctMessage) {
      return { text: anim.fctMessage, type: "damage" }
    }
    return null
  }

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
    await sleep(1600)
    setArenaVfx(null)
  }

  const playAnimations = useCallback(
    async (animations: EngineAnimation[], stateSnapshot: Duelist[]) => {
      for (const anim of animations) {
        const caster = stateSnapshot.find((d) => d.id === anim.casterId)
        const resolvedTargetIds = anim.targetIds?.length ? anim.targetIds : anim.targetId ? [anim.targetId] : []
        const targets = stateSnapshot.filter((d) => resolvedTargetIds.includes(d.id))

        if (anim.type === "cast" && caster && anim.spellName) {
          if (!anim.fctOnly) {
            await sleep(500)
            await playSpellVfx(anim.spellName, caster, targets)
          }

          let fctTargets = targets.length > 0 ? targets : []
          if (fctTargets.length === 0 && anim.targetId) {
            const t = stateSnapshot.find((d) => d.id === anim.targetId)
            if (t) fctTargets = [t]
          }
          if (fctTargets.length === 0 && anim.fctMessage && caster) fctTargets = [caster]
          for (const t of fctTargets) {
            const fctData = getFCTFromAnim(anim)
            if (!fctData) continue
            const pos = getFCTPos(t.id)
            const id = ++fctCounterRef.current
            setFloatingTexts((prev) => [...prev, { id, text: fctData.text, type: fctData.type, x: pos.x, y: pos.y }])
            setTimeout(() => setFloatingTexts((prev) => prev.filter((f) => f.id !== id)), 3200)
          }
        } else if (anim.type === "skip" && caster) {
          const pos = getFCTPos(caster.id)
          const id = ++fctCounterRef.current
          setFloatingTexts((prev) => [...prev, { id, text: `${caster.name} Atordoado!`, type: "skip", x: pos.x, y: pos.y }])
          setTimeout(() => setFloatingTexts((prev) => prev.filter((f) => f.id !== id)), 3200)
          await sleep(500)
        } else if (anim.type === "potion" && caster) {
          const pos = getFCTPos(caster.id)
          const id = ++fctCounterRef.current
          const potionLabel = anim.potionType ? (POTION_NAMES[anim.potionType] ?? anim.potionType) : "Poção"
          setFloatingTexts((prev) => [...prev, { id, text: `🧪 ${potionLabel}!`, type: "heal", x: pos.x, y: pos.y }])
          setTimeout(() => setFloatingTexts((prev) => prev.filter((f) => f.id !== id)), 3200)
          setPotionGlowId(caster.id)
          setTimeout(() => setPotionGlowId(null), 1800)
          await sleep(700)
        }
        await sleep(anim.delay ?? 1300)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  
  const onSpellClick = (spellName: string) => {
    if (gameOver || battleStatus !== "selecting") return
    if (!currentUser.id) return
    if (pendingActions[currentUser.id]) return
    
    const player = duelists.find((d) => d.id === currentUser.id)
    if (!player || isDefeated(player.hp)) return
    
    const mana = player.spellMana?.[spellName]
    if (!mana || mana.current <= 0) return
    
    const sid = currentUser.id
    const commitCast = (targetId: string, areaAll?: boolean) => {
      const spell = getSpellInfo(spellName, SPELL_DATABASE)
      const localAction: RoundAction = { casterId: sid, type: "cast", spellName, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, areaAll, turnId: turnNumber }
      setPendingActions((prev) => ({ ...prev, [sid]: localAction }))
    }
    
    if (isSelfTargetSpell(spellName)) { commitCast(sid); return }
    if (isAreaSpell(spellName)) {
      const target = duelists.find((d) => d.team === "enemy" && !isDefeated(d.hp))
      if (!target) return
      commitCast(target.id, true)
      return
    }
    
    const target = duelists.find((d) => d.team === "enemy" && !isDefeated(d.hp))
    if (!target) return
    commitCast(target.id)
  }
  
  const onTargetClick = (targetId: string) => {
    if (!pendingSpell) return
    if (gameOver || battleStatus !== "selecting") return
    if (!currentUser.id) return
    if (pendingActions[currentUser.id]) return
    
    const player = duelists.find((d) => d.id === currentUser.id)
    if (!player || isDefeated(player.hp)) return
    
    const valid = getValidTargetsForSpell(pendingSpell, player, duelists, "torneio-offline").some((d) => d.id === targetId && !isDefeated(d.hp))
    if (!valid) return
    
    const spell = getSpellInfo(pendingSpell, SPELL_DATABASE)
    const localAction: RoundAction = { casterId: currentUser.id, type: "cast", spellName: pendingSpell, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, turnId: turnNumber }
    setPendingActions((prev) => ({ ...prev, [currentUser.id!]: localAction }))
    setPendingSpell(null)
  }
  
  const usePotion = () => {
    if (!currentUser.id) return
    if (gameOver || battleStatus !== "selecting") return
    if (pendingActions[currentUser.id]) return
    
    const player = duelists.find((d) => d.id === currentUser.id)
    if (!player || isDefeated(player.hp)) return
    if (player.debuffs.some((d) => d.type === "no_potion")) return
    
    if (currentRule?.id !== "alquimia_infinita") setPotionUsed(true)
    
    setPotionGlowId(currentUser.id)
    setTimeout(() => setPotionGlowId(null), 1500)
    
    const localAction: RoundAction = { casterId: currentUser.id, type: "potion", potionType: playerBuild.potion, turnId: turnNumber }
    setPendingActions((prev) => ({ ...prev, [currentUser.id!]: localAction }))
  }
  
  const handleWin = async () => {
    setGameOver("win")
    addLog(locale === "en" ? "🎉 Victory!" : "🎉 Vitória!")
    
    const newMarchWins = marchWins + 1
    setMarchWins(newMarchWins)
    
    // Save march record to database
    const success = await updateMarchRecord(currentUser.id, newMarchWins)
    if (!success) {
      addLog(locale === "en" ? "⚠️ Failed to save march record!" : "⚠️ Falha ao salvar recorde de marcha!")
    }
    
    setTimeout(() => {
      setGameOver(null)
      setPotionUsed(false)
      const rule = selectRandomRule()
      const swapSpells = rule.id === "amnesia_arcana"
      const round = buildDeathMarchRound(swapSpells)
      setDuelists(round)
      setTurnNumber(1)
      turnNumberRef.current = 1
      setBattleStatus("selecting")
      const ruleName = locale === "en" ? rule.nameEn : rule.name
      addLog(locale === "en" ? `[March ${newMarchWins + 1}] New battle! Field Rule: ${ruleName}` : `[Marcha ${newMarchWins + 1}] Nova batalha! Regra de Campo: ${ruleName}`)
      beginRoundSelection(round)
    }, 2000)
  }
  
  const handleExit = async () => {
    // Save march record before exiting
    const success = await updateMarchRecord(currentUser.id, marchWins)
    if (!success) {
      addLog(locale === "en" ? "⚠️ Failed to save march record on exit!" : "⚠️ Falha ao salvar recorde de marcha ao sair!")
    }
    onExit()
  }

  const handleLose = async () => {
    setGameOver("lose")
    addLog(locale === "en" ? "You were defeated..." : "Você foi derrotado...")
    
    // Save march record on lose
    const success = await updateMarchRecord(currentUser.id, marchWins)
    if (!success) {
      addLog(locale === "en" ? "⚠️ Failed to save march record!" : "⚠️ Falha ao salvar recorde de marcha!")
    }
    
    setTimeout(() => onExit(), 2000)
  }
  
  useEffect(() => {
    if (battleStatus !== "selecting") return
    const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
    if (aliveIds.length === 0) return
    const pendingComplete = aliveIds.every((id) => !!pendingActions[id] && pendingActions[id].turnId === turnNumber)
    if (!pendingComplete) return
    const actionList = Object.values(pendingActions).filter((a) => aliveIds.includes(a.casterId))
    void runResolution(actionList)
  }, [battleStatus, duelists, pendingActions, turnNumber])
  
  useEffect(() => {
    if (gameOver || battleStatus !== "selecting") return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
          const unreadyIds = aliveIds.filter((id) => !pendingActions[id])
          if (unreadyIds.length > 0) {
            setDuelists((current) => current.map((d) => (unreadyIds.includes(d.id) ? { ...d, hp: { bars: [0, 0, 0, 0, 0] } } : d)))
            setPendingActions((current) => {
              const next = { ...current }
              unreadyIds.forEach((id) => { next[id] = { casterId: id, type: "skip", turnId: turnNumber } })
              return next
            })
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [addLog, battleStatus, duelists, gameOver, pendingActions, turnNumber])
  
  const renderHearts = (hp: HPState) => {
    const total = getTotalHP(hp)
    return (
      <div className="relative z-50 flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, idx) => {
          const fill = Math.max(0, Math.min(100, total - idx * 100))
          return <Heart key={`${idx}-${total}`} fillPercent={fill} />
        })}
      </div>
    )
  }
  
  const renderHUD = (duelist: Duelist) => {
    const avatarKey = duelist.avatar || DEFAULT_AVATARS[(duelist.id.charCodeAt(duelist.id.length - 1) || 0) % DEFAULT_AVATARS.length]
    const avatar = AVATAR_IMAGES[avatarKey]
    const dead = isDefeated(duelist.hp)
    const targetable = pendingSpell && getValidTargetsForSpell(pendingSpell, duelists.find(d => d.id === currentUser.id)!, duelists, "torneio-offline").some((d) => d.id === duelist.id && !isDefeated(d.hp))
    
    return (
      <button
        ref={(el) => { if (el) hudRefs.current[duelist.id] = el }}
        type="button"
        onClick={() => onTargetClick(duelist.id)}
        disabled={!targetable}
        className={`relative w-full touch-manipulation select-none rounded-lg border-2 bg-stone-900/85 p-2 text-left transition-transform duration-150 ${dead ? "opacity-50 border-stone-600" : targetable ? "border-amber-400 animate-pulse" : "border-amber-900/80"}`}
      >
        <div className="mb-1 flex items-start gap-2">
          <div className="relative flex-shrink-0">
            <img src={avatar} alt={duelist.name} className={`relative z-50 h-[88px] w-[72px] rounded-md border-2 border-amber-700 object-contain ${dead ? "grayscale opacity-50" : ""}`} />
          </div>
          <div className="relative z-50 flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-bold leading-tight text-amber-100" style={{ fontSize: "0.85rem", textShadow: "0 1px 3px #000, 0 0 8px rgba(0,0,0,0.8)" }}>{duelist.name}</p>
            <div className="flex items-center justify-between">
              {HOUSE_CREST[duelist.house] && <img src={HOUSE_CREST[duelist.house]} alt={duelist.house} className="h-10 w-10 object-contain" />}
              <span className="text-xs font-semibold text-amber-200">{Math.max(0, getTotalHP(duelist.hp))}%</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {duelist.debuffs.map((db, idx) => (
                <Badge key={`${duelist.id}-${idx}`} className="h-5 border border-amber-700 bg-stone-800 px-1 text-[9px] text-amber-200">{DEBUFF_LABEL[db.type]}</Badge>
              ))}
            </div>
          </div>
        </div>
        {renderHearts(duelist.hp)}
      </button>
    )
  }
  
  const topDuelists = useMemo(() => duelists.filter((d) => d.team === "enemy"), [duelists])
  const bottomDuelists = useMemo(() => duelists.filter((d) => d.team === "player"), [duelists])
  const player = useMemo(() => duelists.find((d) => d.id === currentUser.id), [duelists, currentUser.id])
  
  if (!isLoaded) return <div className="min-h-screen bg-stone-800 font-serif text-amber-100 p-6"><p>{locale === "en" ? "Loading..." : "Carregando..."}</p></div>
  
  return (
    <div className="min-h-screen bg-stone-800 font-serif text-amber-100">
      <header className="border-b-4 border-amber-900 bg-stone-950/90 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-300">💀 {locale === 'en' ? 'Death March' : 'Marcha da Morte'}</h1>
          <div className="flex items-center gap-2">
            <Badge className="border-red-700 bg-red-950/40 text-red-200"><Skull className="w-4 h-4 mr-1" />{locale === 'en' ? "Wins" : "Vitórias"}: {marchWins}</Badge>
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">{String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}</Badge>
            <Button variant="outline" size="sm" className="h-8 w-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 p-0 text-amber-200" onClick={handleExit}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      {currentRule && (
        <div className="mx-auto max-w-6xl px-4 py-2">
          <div className="rounded-lg border-2 border-red-700 bg-red-950/80 px-4 py-2 text-center">
            <p className="text-sm font-bold text-red-200">{locale === "en" ? "Field Rule:" : "Regra de Campo:"} {locale === "en" ? currentRule.nameEn : currentRule.name}</p>
            <p className="text-xs text-red-300/80">{locale === "en" ? currentRule.descriptionEn : currentRule.description}</p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl p-4">
        <div ref={arenaRef} className="relative min-h-[560px] overflow-hidden rounded-xl border-4 border-stone-700 bg-stone-700/80" style={{ backgroundImage: `linear-gradient(rgba(20,20,20,0.35), rgba(20,20,20,0.35)), url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
          {battleMessage && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[21] flex justify-center px-4">
              <p className="rounded border border-amber-600/80 bg-black/75 px-4 py-2 text-center text-sm font-semibold text-amber-100 shadow-lg">{battleMessage}</p>
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
          {floatingTexts.map((fct) => (
            <div key={fct.id} className={`fct fct-${fct.type}`} style={{ left: `${fct.x}%`, top: `${fct.y}%`, transform: "translateX(-50%)" }}>{fct.text}</div>
          ))}
          <div className="grid h-full min-h-[560px] grid-rows-2">
            <div className="relative border-b border-stone-600 p-3">
              <div className="grid gap-3 grid-cols-1">{topDuelists.map((d) => <div key={d.id}>{renderHUD(d)}</div>)}</div>
            </div>
            <div className="relative p-3">
              <div className="grid gap-3 grid-cols-1">{bottomDuelists.map((d) => <div key={d.id}>{renderHUD(d)}</div>)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border-2 border-amber-900 bg-stone-900/85 p-3">
          {!player || isDefeated(player.hp) ? (
            <div className="mb-3 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-center">
              <p className="text-sm font-bold text-red-300">💀 {locale === "en" ? "Eliminated" : "Eliminado"}</p>
            </div>
          ) : null}
          {player && battleStatus === "selecting" && !pendingActions[currentUser.id] && (
            <div className="mb-2 flex flex-wrap gap-2">
              {player.spells.map((spell) => {
                const mana = player.spellMana?.[spell]
                const info = getSpellInfo(spell, SPELL_DATABASE)
                const disabled = !mana || mana.current <= 0 || !!gameOver || battleStatus !== "selecting" || isDefeated(player.hp)
                return (
                  <Button key={spell} disabled={disabled} onClick={() => onSpellClick(spell)} className={`touch-manipulation select-none border border-amber-700 text-amber-100 ${pendingSpell === spell ? "bg-amber-600" : "bg-gradient-to-b from-amber-800 to-amber-900 hover:from-amber-700 hover:to-amber-800"}`}>
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    {info ? (locale === 'pt' ? (info.namePt || info.name) : info.name) : spell} ({mana?.current}/{mana?.max} {locale === "en" ? "MP" : "PM"} | {info?.accuracy || 0}%)
                  </Button>
                )
              })}
              <Button
                disabled={potionUsed || !!gameOver || battleStatus !== "selecting" || isDefeated(player.hp) || !!(player?.debuffs.some((d) => d.type === "no_potion"))}
                onClick={usePotion}
                className={`touch-manipulation select-none border border-purple-700 text-purple-100 ${potionUsed ? "bg-stone-800 opacity-50 cursor-not-allowed" : "bg-purple-900 hover:bg-purple-800"}`}
              >
                <FlaskConical className="mr-1 h-3.5 w-3.5" />
                {POTION_NAMES[playerBuild.potion] || locale === 'pt' ? "Poção" : "Potion"}
                {potionUsed && locale === 'pt' ? " (usada)" : " (used)"}
              </Button>
            </div>
          )}
        </div>
      </main>

      <footer className="grid gap-3 border-t-4 border-amber-900 bg-stone-950/90 p-3 md:grid-cols-2">
        <div className="rounded-lg border-2 border-amber-900 bg-stone-800/90 p-3">
          <p className="mb-2 text-xs font-bold text-amber-300">{locale === "en" ? "Battle Log" : "Log de Batalha"}</p>
          <div className="h-32 overflow-y-auto rounded border border-amber-800 bg-stone-900 p-2">
            {battleLog.slice(-40).map((line, i) => (
              <p key={i} className={`mb-1 battle-log-text ${line.startsWith("→") ? "text-red-300" : "text-amber-100/90"}`}>{line}</p>
            ))}
          </div>
        </div>
      </footer>

      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
          <div className="w-full max-w-md rounded-xl border-4 border-amber-900 bg-stone-900/95 p-8 text-center shadow-2xl">
            {gameOver === "win" ? (
              <>
                <div className="mb-2 text-6xl">🏆</div>
                <h2 className="text-3xl font-bold text-amber-300">{locale === "en" ? "Victory!" : "Vitória!"}</h2>
                <p className="mt-2 text-amber-100/80">{locale === "en" ? "Advancing..." : "Avançando..."}</p>
              </>
            ) : (
              <>
                <div className="mb-2 text-6xl">💀</div>
                <h2 className="text-3xl font-bold text-red-300">{locale === "en" ? "Defeated" : "Derrotado"}</h2>
                <p className="mt-2 text-amber-100/80">{locale === "en" ? `Record: ${marchWins} wins` : `Recorde: ${marchWins} vitórias`}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
