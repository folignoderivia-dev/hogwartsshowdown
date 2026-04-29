"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlaskConical, Wand2, X, Skull } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HOUSE_GDD, HOUSE_MODIFIERS, SPELL_DATABASE, WAND_PASSIVES } from "@/lib/data-store"
import type { BattleStatus, Duelist, HPState, DebuffType, Point } from "@/lib/arena-types"
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
import SpellBeam, { getSpellBeamColor } from "@/components/SpellBeam"
import SelfAura, { getSelfAuraConfig } from "@/components/SelfAura"
import GlobalEffect, { getGlobalEffectConfig } from "@/components/GlobalEffect"

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
  mortovivo: "Undead",
  edurus: "Edurus",
  maxima: "Maxima",
  foco: "Focus",
  merlin: "Merlin Potion",
  felix: "Felix Felicis",
  aconito: "Aconite",
  amortentia: "Amortentia"
}
const DEBUFF_LABEL: Record<DebuffType, string> = {
  burn: "🔥 BURN",
  freeze: "❄️ FREEZE",
  stun: "⚡ STUN",
  taunt: "🧠 TAUNT",
  disarm: "🪄 DISARM",
  protego: "🛡️ PROTEGO",
  slow: "⏳ SLOW",
  mark: "◎ MARK",
  confusion: "😵 CONFUSION",
  poison: "☠️ POISON",
  paralysis: "⚡ PARALYSIS",
  provoke: "👊 PROVOKE",
  no_potion: "🚫 NO POTION",
  silence_defense: "🔇 SILENCE DEF.",
  damage_amp: "⬆️ DAMAGE+",
  arestum_penalty: "⬇️ ATK/ACC",
  lumus_acc_down: "💡 ACC-20%",
  blindness: "💡 BLINDNESS",
  spell_disable: "🔒 DISABLE",
  salvio_reflect: "🪞 REFLECT",
  anti_debuff: "✨ ANTI-DEBUFF",
  crit_boost: "🎯 CRIT+",
  unforgivable_acc_down: "🜏 UNFORGIVABLE ACC-15%",
  protego_maximo: "🛡️ MAXIMO",
  bomba: "💣 BOMB",
  bloqueio_cura: "🚫 NO HEAL",
  damage_reduce: "⬇️ DAMAGE-25%",
  protego_diabol: "🛡️ DIABOLICAL",
  crit_down: "⬇️ CRIT-10%",
  bleed: "🩸 BLEED",
  undead: "💀 UNDEAD(1t)",
  immunity: "🛡️ IMMUNITY",
  charm: "💖 CHARM",
  unforgivable_block: "🜏 CURSE BLOCK",
  invulnerable: "🪶 INVULNERABLE",
  invisibility: "👻 INVISIBLE",
}
const DEBUFF_FLASH: Partial<Record<DebuffType, string>> = {
  burn: "BURNED!",
  freeze: "FROZE!",
  stun: "STUNNED!",
  taunt: "DOMINATED!",
  disarm: "DISARMED!",
  mark: "MARKED!",
  confusion: "CONFUSED!",
  poison: "POISONED!",
  paralysis: "PARALYZED!",
  provoke: "PROVOKED!",
  no_potion: "BLOCKED POTIONS!",
  silence_defense: "SILENCED!",
  damage_amp: "AMPLIFIED DAMAGE!",
  arestum_penalty: "SLOWED!",
  lumus_acc_down: "BLINDED!",
  invisibility: "INVISIBILIZED!",
  spell_disable: "DISABLED!",
  salvio_reflect: "REFLECTED!",
  anti_debuff: "IMMUNIZED!",
  crit_boost: "CRITICAL+!",
  unforgivable_acc_down: "UNFORGIVABLE -15% ACC!",
  protego_maximo: "PROTEGO MAXIMO!",
  undead: "UNDEAD!",
  immunity: "IMMUNE!",
  charm: "CHARMED!",
  unforgivable_block: "PATRONUM! NO CURSES!",
  damage_reduce: "DAMAGE −25%!",
  crit_down: "CRITICAL −!",
  bomba: "BOMB!",
  bloqueio_cura: "NO HEAL!",
  bleed: "BLEEDING!",
}

const normSpell = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

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
    // For exaustao_arcana rule, multiplier should increase cost, not max mana
    // So we divide by multiplier to effectively increase cost when multiplier > 1
    max = multiplier > 1 ? Math.round(max / multiplier) : Math.round(max * multiplier)
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
const ALL_SPELLS = SPELL_DATABASE.map(s => s.name)

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
  const [floatingTexts, setFloatingTexts] = useState<{ id: number; text: string; type: string; x: number; y: number }[]>([])
  const [battleMessage, setBattleMessage] = useState("")
  const [potionGlowId, setPotionGlowId] = useState<string | null>(null)
  
  // New animation states
  const [spellBeam, setSpellBeam] = useState<{ fromX: number; fromY: number; toX: number; toY: number; color: string } | null>(null)
  const [selfAura, setSelfAura] = useState<{ type: "shield" | "healing" | "buff" | "invisibility"; color: string } | null>(null)
  const [globalEffect, setGlobalEffect] = useState<{ type: "explosion" | "weather" | "fire" | "erratic"; color: string } | null>(null)
  
  const duelistsRef = useRef<Duelist[]>([])
  const turnNumberRef = useRef(turnNumber)
  const hudRefs = useRef<Record<string, HTMLElement>>({})
  const wandRefs = useRef<Record<string, HTMLImageElement>>({})
  const arenaRef = useRef<HTMLDivElement>(null)
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
    const POTIONS = ["wiggenweld", "mortovivo", "edurus", "maxima", "foco", "merlin", "felix", "aconito", "amortentia"]
    const potion = POTIONS[Math.floor(Math.random() * POTIONS.length)]
    
    return {
      id: `death-march-bot-${Date.now()}`,
      name: `Bot ${Math.floor(Math.random() * 1000)}`,
      house, wand, potion,
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
      
      // Decide whether to use potion (20% chance if potion available and not used yet)
      const shouldUsePotion = bot.potion && !(bot.usedPotions?.includes(bot.potion)) && Math.random() < 0.2
      
      if (shouldUsePotion && bot.potion) {
        initialActions[bot.id] = { casterId: bot.id, type: "potion", potionType: bot.potion, turnId: rt }
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

  const getFCTFromAnim = (anim: EngineAnimation): { text: string; type: "damage" | "crit" | "miss" | "heal" | "block" | "skip" } | null => {
    const spell = anim.spellName ? `${anim.spellName} ` : ""
    if (anim.fctMessage) return { text: anim.fctMessage, type: anim.isMiss ? "miss" : "heal" }
    if (anim.isMiss) return { text: `${spell}MISSED!`, type: "miss" }
    if (anim.isBlock) return { text: `${spell}🛡 BLOCKED!`, type: "block" }
    const dmg = anim.damage ?? 0
    if (dmg <= 0) {
      if (anim.fctOnly) return { text: `${spell}✨`, type: "heal" }
      return null
    }
    if (anim.isCrit) return { text: `${spell}${anim.damage} 💥 CRITICAL DAMAGE!`, type: "crit" }
    return { text: `${spell}-${anim.damage}`, type: "damage" }
  }

  const playSpellVfx = async (spellName: string, attacker: Duelist, targets: Duelist[]) => {
    const arena = arenaRef.current
    const rect = arena?.getBoundingClientRect()
    if (!arena || !rect) {
      await sleep(1000)
      return
    }

    console.log(`[playSpellVfx] Starting spell animation for ${spellName} by ${attacker.id}`)

    // Small delay before animation
    await sleep(100)

    const getHudPoint = (id: string): Point => {
      const el = hudRefs.current[id]
      if (!el) {
        console.log(`[playSpellVfx] HUD ref not found for ${id}, falling back to arena center`)
        return { x: rect.width / 2, y: rect.height / 2 }
      }
      const r = el.getBoundingClientRect()
      // Get center of HUD button
      const centerX = r.left - rect.left + r.width / 2
      const centerY = r.top - rect.top + r.height / 2
      console.log(`[playSpellVfx] HUD point for ${id}:`, { centerX, centerY })
      return { x: centerX, y: centerY }
    }

    const from = getHudPoint(attacker.id)
    const targetIds = targets.map((t) => t.id)
    
    // Check if it's a self-target spell
    const selfAuraConfig = getSelfAuraConfig(spellName)
    if (selfAuraConfig && targetIds.includes(attacker.id)) {
      setSelfAura(selfAuraConfig)
      await sleep(500)
      setSelfAura(null)
      return
    }

    // Check if it's an area/global spell
    const globalEffectConfig = getGlobalEffectConfig(spellName)
    if (globalEffectConfig) {
      setGlobalEffect(globalEffectConfig)
      await sleep(800)
      setGlobalEffect(null)
      return
    }

    // Otherwise, use beam animation for target spells
    if (targets.length > 0) {
      const to = getHudPoint(targets[0].id)
      const color = getSpellBeamColor(spellName)
      setSpellBeam({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, color })
      await sleep(300)
      setSpellBeam(null)
    }
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
          setFloatingTexts((prev) => [...prev, { id, text: `${caster.name} Stunned!`, type: "skip", x: pos.x, y: pos.y }])
          setTimeout(() => setFloatingTexts((prev) => prev.filter((f) => f.id !== id)), 3200)
          await sleep(500)
        } else if (anim.type === "potion" && caster) {
          const pos = getFCTPos(caster.id)
          const id = ++fctCounterRef.current
          const potionLabel = anim.potionType ? (POTION_NAMES[anim.potionType] ?? anim.potionType) : "Potion"
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
    // Save march record before exiting (only updates if higher than existing record)
    const success = await updateMarchRecord(currentUser.id, marchWins)
    if (!success) {
      addLog(locale === "en" ? "⚠️ Failed to save march record on exit!" : "⚠️ Falha ao salvar recorde de marcha ao sair!")
    }
    
    // Do NOT reset marchWins on exit - only reset on explicit loss or give up
    // This protects against disconnect wipes
    
    onExit()
  }

  const handleLose = async () => {
    setGameOver("lose")
    addLog(locale === "en" ? "You were defeated..." : "Você foi derrotado...")
    
    // Save march record on lose (only updates if higher than existing record)
    const success = await updateMarchRecord(currentUser.id, marchWins)
    if (!success) {
      addLog(locale === "en" ? "⚠️ Failed to save march record!" : "⚠️ Falha ao salvar recorde de marcha!")
    }
    
    // Reset marchWins to 0 for next session
    setMarchWins(0)
    
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
        className={`relative w-full touch-manipulation select-none rounded-lg border-2 bg-stone-900/85 p-2 text-center transition-transform duration-150 ${dead ? "opacity-50 border-stone-600" : targetable ? "border-amber-400 animate-pulse" : "border-amber-900/80"}`}
      >
        <div className="mb-1 flex items-start gap-2">
          <div className="relative flex-shrink-0">
            <img src={avatar} alt={duelist.name} className={`relative z-50 h-[88px] w-[72px] rounded-md border-2 border-amber-700 object-contain ${dead ? "grayscale opacity-50" : ""}`} />
          </div>
          <div className="relative z-50 flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-bold leading-tight text-amber-100" style={{ fontSize: "0.85rem", textShadow: "0 1px 3px #000, 0 0 8px rgba(0,0,0,0.8)" }}>{duelist.name}</p>
            <div className="flex items-center justify-between">
              {HOUSE_CREST[duelist.house] && <img src={HOUSE_CREST[duelist.house]} alt={duelist.house} className="h-10 w-10 object-contain" />}
              <span className="text-xs font-semibold text-amber-200">{Math.max(0, Math.min(100, (getTotalHP(duelist.hp) / (duelist.house === "slytherin" ? 400 : 500)) * 100))}%</span>
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

  const renderWand = (duelist: Duelist, side: "top" | "bottom", positionClass: string, mirror = false) => {
    const dead = isDefeated(duelist.hp)
    const image = side === "top" ? HAND_TOP : HAND_BOTTOM
    const size = side === "top" ? "h-[230px]" : "h-[285px]"
    return (
      <img 
        ref={(el) => {
          if (el) wandRefs.current[duelist.id] = el
        }}
        src={image} 
        alt={`${duelist.name}'s Wand`} 
        className={`pointer-events-none absolute z-10 ${positionClass} ${size} w-auto object-contain ${mirror ? "-scale-x-100" : ""} ${dead ? "grayscale opacity-50" : "opacity-95 animate-float"} style={{ animationDuration: "3s" }}`} 
      />
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
          
          {/* New Animation Components */}
          {spellBeam && (
            <SpellBeam
              fromX={spellBeam.fromX}
              fromY={spellBeam.fromY}
              toX={spellBeam.toX}
              toY={spellBeam.toY}
              color={spellBeam.color}
              onComplete={() => setSpellBeam(null)}
            />
          )}
          {selfAura && (
            <SelfAura
              type={selfAura.type}
              color={selfAura.color}
              onComplete={() => setSelfAura(null)}
            />
          )}
          {globalEffect && (
            <GlobalEffect
              type={globalEffect.type}
              color={globalEffect.color}
              onComplete={() => setGlobalEffect(null)}
            />
          )}
          {floatingTexts.map((fct) => (
            <div key={fct.id} className={`fct fct-${fct.type}`} style={{ left: `${fct.x}%`, top: `${fct.y}%`, transform: "translateX(-50%)" }}>{fct.text}</div>
          ))}
          <div className="grid h-full min-h-[560px] grid-rows-2">
            <div className="relative border-b border-stone-600 p-3">
              <div className="grid gap-3 grid-cols-1">
                {topDuelists.map((d) => (
                  <div key={d.id}>
                    {renderHUD(d)}
                    {renderWand(d, "top", "-top-10 left-1/2 -translate-x-1/2", false)}
                  </div>
                ))}
              </div>
            </div>
            <div className="relative p-3">
              <div className="grid gap-3 grid-cols-1">
                {bottomDuelists.map((d) => (
                  <div key={d.id}>
                    {renderHUD(d)}
                    {renderWand(d, "bottom", "-bottom-20 left-1/2 -translate-x-1/2", false)}
                  </div>
                ))}
              </div>
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
              <Button
                disabled={!!gameOver || battleStatus !== "selecting" || isDefeated(player?.hp)}
                onClick={() => {
                  setPendingActions((prev) => ({ ...prev, [currentUser.id]: { casterId: currentUser.id, type: "skip", turnId: turnNumber } }))
                }}
                className="touch-manipulation select-none border border-red-700 text-red-100 bg-red-900 hover:bg-red-800"
              >
                {locale === "en" ? "⏭ Skip Turn" : "⏭ Pular Turno"}
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
              <p key={i} className={`mb-1 battle-log-text ${line.startsWith("→") ? (line.includes("CRITICAL DAMAGE") ? "text-yellow-300" : line.includes("BLOCKED") ? "text-blue-300" : line.includes("errou") ? "text-stone-400" : "text-red-300") : "text-amber-100/90"}`}>{line}</p>
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
