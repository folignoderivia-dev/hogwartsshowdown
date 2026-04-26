"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlaskConical, Wand2, X, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HOUSE_GDD, HOUSE_MODIFIERS, SPELL_DATABASE, type SpellInfo } from "@/lib/data-store"
import type { ArenaVfxState, BattleStatus, Duelist, HPState } from "@/lib/arena-types"
import type { PlayerBuild } from "@/lib/types"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"
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
} from "@/lib/turn-engine"
import { getBossByStage, getNextStage, STORY_BOSSES, type StoryBoss } from "@/lib/story-data"

interface StoryArenaProps {
  playerBuild: PlayerBuild
  currentUser: { id: string; username: string; email: string; elo: number }
  onExit: () => void
  onAuthChange: (user: any) => void
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
  avatar1:  "https://i.postimg.cc/LXbFGK31/pngwing-com-(10).png",
  avatar2:  "https://i.postimg.cc/zBcY4ZFb/pngwing-com-(11).png",
  avatar3:  "https://i.postimg.cc/XJz6tSkp/pngwing-com-(12).png",
  avatar4:  "https://i.postimg.cc/bJBf4c9Z/pngwing-com-(13).png",
  avatar5:  "https://i.postimg.cc/k4pPL3vD/pngwing-com-(14).png",
  avatar6:  "https://i.postimg.cc/C1Qp9TsK/pngwing-com-(15).png",
  avatar7:  "https://i.postimg.cc/SsvbHFfS/pngwing-com-(16).png",
  avatar8:  "https://i.postimg.cc/LXbFGK3m/pngwing-com-(17).png",
  avatar9:  "https://i.postimg.cc/RFFzPVKN/pngwing-com-(18).png",
  avatar10: "https://i.postimg.cc/B66GhQHZ/pngwing-com-(19).png",
  avatar11: "https://i.postimg.cc/j55r8dPK/pngwing-com-(20).png",
  avatar12: "https://i.postimg.cc/yddzfYcH/pngwing-com-(21).png",
  avatar13: "https://i.postimg.cc/9MMjxFZ2/pngwing-com-(22).png",
  avatar14: "https://i.postimg.cc/d11KWtdg/pngwing-com-(23).png",
  avatar15: "https://i.postimg.cc/xCCSsTHh/pngwing-com-(24).png",
  avatar16: "https://i.postimg.cc/C11VvLD6/pngwing-com-(25).png",
  avatar17: "https://i.postimg.cc/gJJPMkRf/pngwing-com-(26).png",
  avatar18: "https://i.postimg.cc/SRYbhTgc/pngwing-com-(5).png",
  avatar19: "https://i.postimg.cc/rsR2knfx/pngwing-com-(6).png",
  avatar20: "https://i.postimg.cc/449YCsHz/barty-crouch-jr-1-1800x1248-(1).png",
  avatar21: "https://i.postimg.cc/Y9sBTKzf/pngwing-com-(8).png",
  avatar22: "https://i.postimg.cc/gJTb1FHD/pngwing-com-(9).png",
  flitwick: "https://i.postimg.cc/J40d7YmZ/flitwich-quiz-image.png",
}
const DEFAULT_AVATARS = ["avatar1","avatar2","avatar3","avatar4","avatar5","avatar6","avatar7","avatar8"]
const HOUSE_CREST: Record<string, string> = {
  gryffindor: "https://i.postimg.cc/596PnFYQ/pngwing-com-(2).png",
  slytherin:  "https://i.postimg.cc/66yHYG2L/pngwing-com-(3).png",
  ravenclaw:  "https://i.postimg.cc/nVCd0Qj4/pngwing-com-(4).png",
  hufflepuff: "https://i.postimg.cc/bYs632DQ/pngwing-com-(1).png",
}
const DEBUFF_LABEL: Record<string, string> = {
  burn: "🔥 BURN",
  freeze: "❄️ FREEZE",
  stun: "⚡ STUN",
  taunt: "🧠 TAUNT",
  disarm: "🪄 DISARM",
  protego: "�️ PROTEGO",
  slow: "⏳ LENTO",
  mark: "◎ MARCA",
  confusion: "😵 CONFUSÃO",
  poison: "☠️ VENENO",
  paralysis: "⚡ PARALISIA",
  provoke: "👊 PROVOCAÇÃO",
  no_potion: "� SEM POÇÃO",
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
  undead: "� IMORTAL(1t)",
  immunity: "🛡️ IMUNIDADE",
  charm: "💖 ENCANTO",
  unforgivable_block: "🜏 BLOQUEIO MALDIÇÕES",
  invulnerable: "🪶 INVULNERÁVEL",
  invisibility: "👻 INVISÍVEL",
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
const DEBUFF_FLASH: Record<string, string> = {
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
  if (n.includes("protego")) return { mode: "shield", color: "#3b82f6", color2: "#60a5fa" }
  if (n.includes("ferula") || n.includes("episkey") || n.includes("vulnera")) return { mode: "heal-rise", color: "#22c55e", color2: "#4ade80" }
  if (n.includes("circum") && n.includes("inflamare")) return { mode: "flames-hud", color: "#ef4444", color2: "#f97316" }
  if (n.includes("lumus")) return { mode: "mist", color: "#fbbf24", color2: "#f59e0b" }
  if (n.includes("sectumsempra")) return { mode: "marker-bang", color: "#dc2626", color2: "#ef4444" }
  if (n.includes("expecto") && n.includes("patronum")) return { mode: "marker-question", color: "#facc15", color2: "#fef08a" }
  return { mode: "beam", color: "#fbbf24", color2: "#f59e0b" }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function buildHpBars(house: string): number[] {
  return house === "slytherin" ? [100, 100, 100, 100] : [100, 100, 100, 100, 100]
}

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

const Heart = ({ fillPercent }: { fillPercent: number }) => {
  const color = fillPercent > 50 ? "#22c55e" : fillPercent > 25 ? "#eab308" : "#ef4444"
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={color}
        opacity={fillPercent / 100}
      />
    </svg>
  )
}

export default function StoryArena({ playerBuild, currentUser, onExit, onAuthChange }: StoryArenaProps) {
  const { locale } = useLanguage()
  const supabase = getSupabaseClient()
  
  const [currentStage, setCurrentStage] = useState(1)
  const [isLoaded, setIsLoaded] = useState(false)
  const [attempts, setAttempts] = useState(3)
  
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
  const [statusFloater, setStatusFloater] = useState<{ text: string; targetId: string; key: number } | null>(null)
  const [potionGlowId, setPotionGlowId] = useState<string | null>(null)
  const [impactTargetId, setImpactTargetId] = useState<string | null>(null)
  const [currentTargetId, setCurrentTargetId] = useState<string | null>(null)
  const [boss, setBoss] = useState<StoryBoss | null>(null)
  
  const duelistsRef = useRef<Duelist[]>([])
  const turnNumberRef = useRef(turnNumber)
  const hudRefs = useRef<Record<string, HTMLElement>>({})
  const arenaRef = useRef<HTMLDivElement>(null)
  const arenaVfxKeyRef = useRef(0)
  const fctCounterRef = useRef(0)
  
  useEffect(() => {
    duelistsRef.current = duelists
  }, [duelists])
  useEffect(() => {
    turnNumberRef.current = turnNumber
  }, [turnNumber])
  
  const addLog = useCallback((line: string) => {
    setBattleLog((prev) => [...prev, line])
  }, [])
  
  const playSpellVfx = async (spellName: string, attacker: Duelist, targets: Duelist[]) => {
    const arena = arenaRef.current
    const rect = arena?.getBoundingClientRect()
    if (!arena || !rect) {
      await sleep(1000)
      return
    }

    const hudPoint = (id: string): { x: number; y: number } => {
      const el = hudRefs.current[id]
      if (!el) return { x: rect.width / 2, y: rect.height / 2 }
      const r = el.getBoundingClientRect()
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 }
    }

    const center: { x: number; y: number } = { x: rect.width / 2, y: rect.height / 2 }
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
  
  const getFCTFromAnim = (anim: EngineAnimation): { text: string; type: "damage" | "crit" | "miss" | "heal" | "block" | "skip" } | null => {
    const spell = anim.spellName ? `${anim.spellName} ` : ""
    if (anim.fctMessage) return { text: anim.fctMessage, type: anim.isMiss ? "miss" : "heal" }
    if (anim.isMiss) return { text: `${spell}ERROU!`, type: "miss" }
    if (anim.isBlock) return { text: `${spell}🛡 BLOQUEADO!`, type: "block" }
    const dmg = anim.damage ?? 0
    if (dmg <= 0) {
      if (anim.fctOnly) return { text: `${spell}✨`, type: "heal" }
      return null
    }
    if (anim.isCrit) return { text: `${spell}${anim.damage} 💥 CRÍTICO!`, type: "crit" }
    return { text: `${spell}-${anim.damage}`, type: "damage" }
  }
  
  const getFCTPos = (targetId: string): { x: number; y: number } => {
    const arena = arenaRef.current
    if (!arena) return { x: 50, y: 55 }
    const rect = arena.getBoundingClientRect()
    const el = hudRefs.current[targetId]
    if (!el) return { x: 50, y: 55 }
    const r = el.getBoundingClientRect()
    return {
      x: ((r.left - rect.left + r.width / 2) / rect.width) * 100,
      y: ((r.top - rect.top + r.height * 0.6) / rect.height) * 100,
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
    []
  )
  
  // Load attempts and current stage from Supabase
  const loadProgress = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("tentativas_historia, modo_historia")
        .eq("id", currentUser.id)
        .single()
      
      if (data) {
        const today = new Date().toISOString().split('T')[0]
        const lastReset = localStorage.getItem(`story_reset:${currentUser.id}`)
        
        if (lastReset !== today) {
          const { error: resetError } = await supabase
            .from("profiles")
            .update({ tentativas_historia: 3 })
            .eq("id", currentUser.id)
          
          if (!resetError) {
            localStorage.setItem(`story_reset:${currentUser.id}`, today)
            setAttempts(3)
          }
        } else {
          setAttempts(data.tentativas_historia || 3)
        }
        
        if (data.modo_historia) {
          setCurrentStage(data.modo_historia)
        }
      }
      
      setIsLoaded(true)
    } catch (error) {
      console.error("Failed to load progress:", error)
      setIsLoaded(true)
    }
  }
  
  const buildStoryRound = useCallback((stage: number): Duelist[] => {
    const currentBoss = getBossByStage(stage)
    if (!currentBoss) return []
    
    setBoss(currentBoss)
    
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
      spellMana: buildSpellManaForSpells(playerBuild.spells, playerBuild.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    const bossSpells = currentBoss.spells.length > 0 ? currentBoss.spells : SPELL_DATABASE.filter(s => !s.isVipOnly).map(s => s.name)
    const bossDuelist: Duelist = {
      id: `boss-${currentBoss.id}`,
      name: locale === "en" ? currentBoss.nameEn : currentBoss.name,
      house: currentBoss.house,
      wand: currentBoss.wand,
      avatar: currentBoss.avatar,
      spells: bossSpells,
      hp: { bars: buildHpBars(currentBoss.house) },
      speed: 95,
      debuffs: [],
      team: "enemy",
      spellMana: buildSpellManaForSpells(bossSpells, currentBoss.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    return [playerDuelist, bossDuelist]
  }, [currentUser.id, playerBuild, locale])
  
  useEffect(() => {
    loadProgress()
  }, [])
  
  useEffect(() => {
    if (isLoaded) {
      setBackgroundImage(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)])
      const round = buildStoryRound(currentStage)
      setDuelists(round)
      setPotionUsed(false)
      setPendingSpell(null)
      setPendingActions({})
      setTurnNumber(1)
      setGameOver(null)
      addLog(locale === "en" ? `[Stage ${currentStage}] Battle started!` : `[Etapa ${currentStage}] Batalha iniciada!`)
      beginRoundSelection(round)
    }
  }, [isLoaded, currentStage, buildStoryRound, locale, addLog])
  
  const beginRoundSelection = (state: Duelist[] = duelists) => {
    if (gameOver) return
    const rt = turnNumberRef.current
    
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
    setTimeLeft(120)
    setPendingSpell(null)
    setBattleMessage("")
    setStatusFloater(null)
    setCurrentTargetId(null)
    
    const initialActions: Record<string, RoundAction> = {}
    
    // Bot AI: select random spell
    state
      .filter((d) => !d.isPlayer && !isDefeated(d.hp))
      .forEach((bot) => {
        if (bot.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
          initialActions[bot.id] = { casterId: bot.id, type: "skip", turnId: rt }
          return
        }
        const availableBotSpells = bot.spells.filter((s) => (bot.disabledSpells?.[s] ?? 0) <= 0)
        const botPool = availableBotSpells.length > 0 ? availableBotSpells : bot.spells
        const spellName = botPool[Math.floor(Math.random() * botPool.length)]
        
        let target: Duelist | undefined
        if (isSelfTargetSpell(spellName)) {
          target = state.find((d) => d.id === bot.id && !isDefeated(d.hp))
        } else if (isAreaSpell(spellName)) {
          const enemies = state.filter((d) => d.team !== bot.team && !isDefeated(d.hp))
          const pool = getValidTargetsForSpell(spellName, bot, state, "torneio-offline")
          target = enemies[0] || pool[0]
        } else {
          const targets = getValidTargetsForSpell(spellName, bot, state, "torneio-offline")
          target = targets[Math.floor(Math.random() * targets.length)]
        }
        
        initialActions[bot.id] = target
          ? { casterId: bot.id, type: "cast", spellName, targetId: target.id, areaAll: isAreaSpell(spellName), turnId: rt }
          : { casterId: bot.id, type: "skip", turnId: rt }
      })
    
    const localPlayer = state.find((d) => d.id === currentUser.id)
    if (localPlayer && isDefeated(localPlayer.hp)) {
      initialActions[currentUser.id] = { casterId: currentUser.id, type: "skip", turnId: rt }
    }
    
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
    
    const state = outcome.newDuelists
    setDuelists(state)
    setBattleLog((prev) => [...prev, ...outcome.logs])
    
    // Flash visual para debuffs recém-aplicados
    for (const newD of state) {
      const oldD = snapshot.find((d) => d.id === newD.id)
      if (!oldD) continue
      const oldTypes = new Set(oldD.debuffs.map((x) => x.type))
      const fresh = newD.debuffs.find((db) => !oldTypes.has(db.type))
      if (fresh) {
        const flashText = DEBUFF_FLASH[fresh.type]
        if (flashText) {
          setStatusFloater({ text: flashText, targetId: newD.id, key: Date.now() })
          setTimeout(() => setStatusFloater(null), 1800)
        }
      }
    }
    
    // Play animations
    await playAnimations(outcome.animationsToPlay, state)
    
    const nextTurn = roundTurn + 1
    turnNumberRef.current = nextTurn
    setTurnNumber(nextTurn)
    
    setPendingActions({})
    
    if (outcome.outcome) {
      if (outcome.outcome === "win") {
        handleWin()
      } else if (outcome.outcome === "lose") {
        handleLose()
      }
      setBattleStatus("finished")
      return
    }
    
    beginRoundSelection(state)
  }
  
  const onSpellClick = (spellName: string) => {
    if (gameOver || battleStatus !== "selecting") return
    if (!currentUser.id) return
    if (pendingActions[currentUser.id]) return
    
    const player = duelists.find((d) => d.id === currentUser.id)
    if (!player || isDefeated(player.hp)) return
    
    const mana = player.spellMana?.[spellName]
    if (!mana || mana.current <= 0) return
    if ((player.disabledSpells?.[spellName] ?? 0) > 0) return
    const spInfo = getSpellInfo(spellName, SPELL_DATABASE)
    if (player.debuffs.some((d) => d.type === "paralysis") && (spInfo?.priority ?? 0) > 0) return
    const taunt = player.debuffs.find((d) => d.type === "taunt")
    if (taunt && player.lastSpellUsed && spellName !== player.lastSpellUsed) return
    
    const sid = currentUser.id
    const commitCast = (targetId: string, areaAll?: boolean) => {
      const spell = getSpellInfo(spellName, SPELL_DATABASE)
      const localAction: RoundAction = { casterId: sid, type: "cast", spellName, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, areaAll, turnId: turnNumber }
      setPendingActions((prev) => ({ ...prev, [sid]: localAction }))
    }
    
    if (isSelfTargetSpell(spellName)) {
      commitCast(sid)
      return
    }
    if (isAreaSpell(spellName)) {
      const target = duelists.find((d) => d.team === "enemy" && !isDefeated(d.hp))
      if (!target) return
      commitCast(target.id, true)
      return
    }
    
    const provoke = player.debuffs.find((d) => d.type === "provoke")
    const target = provoke?.meta
      ? duelists.find((d) => d.id === provoke.meta && !isDefeated(d.hp))
      : duelists.find((d) => d.team === "enemy" && !isDefeated(d.hp))
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
    const prov = player.debuffs.find((d) => d.type === "provoke")
    if (prov?.meta && targetId !== prov.meta) return
    
    const spell = getSpellInfo(pendingSpell, SPELL_DATABASE)
    const localAction: RoundAction = { casterId: currentUser.id, type: "cast", spellName: pendingSpell, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, turnId: turnNumber }
    setPendingActions((prev) => ({ ...prev, [currentUser.id!]: localAction }))
    setPendingSpell(null)
  }
  
  const usePotion = () => {
    if (!currentUser.id) return
    if (potionUsed || gameOver || battleStatus !== "selecting") return
    if (pendingActions[currentUser.id]) return
    
    const player = duelists.find((d) => d.id === currentUser.id)
    if (!player || isDefeated(player.hp)) return
    if (player.debuffs.some((d) => d.type === "no_potion")) return
    
    setPotionUsed(true)
    setPotionGlowId(currentUser.id)
    setTimeout(() => setPotionGlowId(null), 1500)
    
    const localAction: RoundAction = { casterId: currentUser.id, type: "potion", potionType: playerBuild.potion, turnId: turnNumber }
    setPendingActions((prev) => ({ ...prev, [currentUser.id!]: localAction }))
  }
  
  const handleWin = async () => {
    setGameOver("win")
    addLog(locale === "en" ? "🎉 Victory!" : "🎉 Vitória!")
    
    try {
      const nextStage = getNextStage(currentStage)
      if (nextStage) {
        await supabase
          .from("profiles")
          .update({ modo_historia: nextStage })
          .eq("id", currentUser.id)
        
        setTimeout(() => {
          setCurrentStage(nextStage)
          setGameOver(null)
          setPotionUsed(false)
          const round = buildStoryRound(nextStage)
          setDuelists(round)
          setTurnNumber(1)
          turnNumberRef.current = 1
          setBattleStatus("selecting")
          beginRoundSelection(round)
        }, 2000)
      } else {
        addLog(locale === "en" ? "🏆 You completed Story Mode!" : "🏆 Você completou o Modo História!")
        setTimeout(() => {
          onExit()
        }, 3000)
      }
    } catch (error) {
      console.error("Failed to update progress:", error)
    }
  }
  
  const handleLose = async () => {
    setGameOver("lose")
    addLog(locale === "en" ? "You were defeated..." : "Você foi derrotado...")
    
    try {
      const newAttempts = Math.max(0, attempts - 1)
      await supabase
        .from("profiles")
        .update({ tentativas_historia: newAttempts })
        .eq("id", currentUser.id)
      setAttempts(newAttempts)
      
      setTimeout(() => {
        onExit()
      }, 2000)
    } catch (error) {
      console.error("Failed to update attempts:", error)
    }
  }
  
  const handleExit = async () => {
    // Anti-cheat: subtract attempt if exiting during unfinished fight
    if (!gameOver && attempts > 0) {
      try {
        const newAttempts = Math.max(0, attempts - 1)
        await supabase
          .from("profiles")
          .update({ tentativas_historia: newAttempts })
          .eq("id", currentUser.id)
        setAttempts(newAttempts)
      } catch (error) {
        console.error("Failed to update attempts:", error)
      }
    }
    onExit()
  }
  
  // Auto-resolve turn when both actions are ready
  useEffect(() => {
    if (battleStatus !== "selecting") return
    const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
    if (aliveIds.length === 0) return
    const pendingComplete = aliveIds.every((id) => {
      const a = pendingActions[id]
      return !!a && a.turnId === turnNumber
    })
    if (!pendingComplete) return
    const actionList = Object.values(pendingActions).filter((a) => aliveIds.includes(a.casterId))
    void runResolution(actionList)
  }, [battleStatus, duelists, pendingActions, turnNumber])
  
  // Timer
  useEffect(() => {
    if (gameOver || battleStatus !== "selecting") return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
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
  }, [addLog, battleStatus, duelists, gameOver, pendingActions, turnNumber])
  
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
    const targetable = pendingSpell && duelists.find(d => d.id === currentUser.id) && getValidTargetsForSpell(pendingSpell, duelists.find(d => d.id === currentUser.id)!, duelists, "torneio-offline").some((d) => d.id === duelist.id && !isDefeated(d.hp))
    
    return (
      <button
        ref={(el) => {
          if (el) hudRefs.current[duelist.id] = el
        }}
        type="button"
        onClick={() => onTargetClick(duelist.id)}
        disabled={!targetable}
        className={`relative w-full touch-manipulation select-none rounded-lg border-2 bg-stone-900/85 p-2 text-left transition-transform duration-150 ${dead ? "opacity-50 border-stone-600" : targetable ? "border-amber-400 animate-pulse" : "border-amber-900/80"} ${impactTargetId === duelist.id ? "scale-[1.03] ring-2 ring-amber-300" : ""}`}
      >
        {currentTargetId === duelist.id && <div className="absolute -top-2 left-1/2 z-50 -translate-x-1/2 text-xl text-amber-300">⬇</div>}
        <div className="mb-1 flex items-start gap-2">
          <div className="relative flex-shrink-0">
            <img
              src={avatar}
              alt={`Avatar ${duelist.name}`}
              className={`relative z-50 h-[88px] w-[72px] rounded-md border-2 border-amber-700 object-contain ${dead ? "grayscale opacity-50" : ""}`}
            />
            {potionGlowId === duelist.id && (
              <div className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center rounded-md animate-pulse">
                <span className="text-3xl drop-shadow-[0_0_12px_#a855f7]">🧪</span>
                <div className="absolute inset-0 rounded-md bg-purple-400/30 ring-2 ring-purple-400" />
              </div>
            )}
          </div>
          <div className="relative z-50 flex min-w-0 flex-1 flex-col gap-1">
            <p
              className="font-bold leading-tight text-amber-100"
              style={{ fontSize: "0.85rem", textShadow: "0 1px 3px #000, 0 0 8px rgba(0,0,0,0.8)" }}
            >
              {duelist.name}
              {((duelist.circumAura ?? 0) > 0 || (circumFlames[duelist.id] ?? 0) > 0) && (
                <span className="ml-1 text-red-500 drop-shadow-[0_0_6px_#f87171]" title="Circum Inflamare">🔥</span>
              )}
            </p>
            <div className="flex items-center justify-between">
              {HOUSE_CREST[duelist.house] ? (
                <img src={HOUSE_CREST[duelist.house]} alt={duelist.house} className="h-10 w-10 object-contain drop-shadow-[0_1px 3px_rgba(0,0,0,0.9)]" />
              ) : (
                <span className="text-2xl">🪄</span>
              )}
              <span className="text-xs font-semibold text-amber-200">{Math.max(0, getTotalHP(duelist.hp))}%</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {duelist.debuffs.map((db, idx) => (
                <Badge key={`${duelist.id}-${idx}`} className="h-5 border border-amber-700 bg-stone-800 px-1 text-[9px] text-amber-200">
                  {DEBUFF_LABEL[db.type]}
                </Badge>
              ))}
            </div>
          </div>
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
        {dead && <Badge className="mt-2 border border-red-700 bg-red-950 text-[10px] text-red-200">{locale === "en" ? "Eliminated" : "Eliminado"}</Badge>}
      </button>
    )
  }
  
  const renderWand = (duelist: Duelist, side: "top" | "bottom", positionClass: string, mirror = false) => {
    const dead = isDefeated(duelist.hp)
    const image = side === "top" ? HAND_TOP : HAND_BOTTOM
    const size = side === "top" ? "h-[230px]" : "h-[285px]"
    return (
      <img src={image} alt={`${duelist.name}'s Wand`} className={`pointer-events-none absolute z-10 ${positionClass} ${size} w-auto object-contain ${mirror ? "-scale-x-100" : ""} ${dead ? "grayscale opacity-50" : "opacity-95"}`} />
    )
  }
  
  const topDuelists = useMemo(() => duelists.filter((d) => d.team === "enemy"), [duelists])
  const bottomDuelists = useMemo(() => duelists.filter((d) => d.team === "player"), [duelists])
  const player = useMemo(() => duelists.find((d) => d.id === currentUser.id), [duelists, currentUser.id])
  const playerDefeated = useMemo(() => player ? isDefeated(player.hp) : false, [player])
  const playerCannotAct = useMemo(() => player ? (player.debuffs.some((d) => d.type === "stun" || d.type === "freeze" || d.type === "paralysis")) : false, [player])
  
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-stone-800 font-serif text-amber-100 p-6">
        <p>{locale === "en" ? "Loading..." : "Carregando..."}</p>
      </div>
    )
  }
  
  if (attempts <= 0) {
    return (
      <div className="min-h-screen bg-stone-800 font-serif text-amber-100 p-6 flex items-center justify-center">
        <div className="bg-stone-900/90 border-amber-800/50 backdrop-blur-sm max-w-md p-6 text-center rounded-lg">
          <p className="text-amber-100 mb-4">{locale === "en" ? "No attempts left. Come back tomorrow!" : "Sem tentativas restantes. Volte amanhã!"}</p>
          <Button onClick={handleExit} className="border-amber-700 text-amber-100 hover:bg-amber-900/50">
            {locale === "en" ? "Exit" : "Sair"}
          </Button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-stone-800 font-serif text-amber-100">
      <header className="border-b-4 border-amber-900 bg-stone-950/90 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-300">📖 {locale === 'en' ? 'Story Mode' : 'Modo História'}</h1>
          <div className="flex items-center gap-2">
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">
              <Trophy className="w-4 h-4 mr-1" />
              {locale === 'en' ? "Stage" : "Etapa"} {currentStage}/10
            </Badge>
            <Badge className="border-purple-700 bg-purple-950/40 text-purple-200">
              {locale === 'en' ? "Attempts" : "Tentativas"}: {attempts}/3
            </Badge>
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">{String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}</Badge>
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">
              {battleStatus === "selecting" ? locale === "en" ? "Select spell" : "Selecione feitiço" : battleStatus}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 p-0 text-amber-200 hover:from-amber-800 hover:to-amber-900"
              onClick={handleExit}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <div ref={arenaRef} className="relative min-h-[560px] overflow-hidden rounded-xl border-4 border-stone-700 bg-stone-700/80" style={{ backgroundImage: `linear-gradient(rgba(20,20,20,0.35), rgba(20,20,20,0.35)), url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
          {battleMessage && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[21] flex justify-center px-4">
              <p className="rounded border border-amber-600/80 bg-black/75 px-4 py-2 text-center text-sm font-semibold text-amber-100 shadow-lg md:text-base">
                {battleMessage}
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
          {floatingTexts.map((fct) => (
            <div key={fct.id} className={`fct fct-${fct.type}`} style={{ left: `${fct.x}%`, top: `${fct.y}%`, transform: "translateX(-50%)" }}>
              {fct.text}
            </div>
          ))}
          
          <div className="grid h-full min-h-[560px] grid-rows-2">
            <div className="relative border-b border-stone-600 p-3">
              <div className="grid gap-3 grid-cols-1">
                {topDuelists.map((d, idx) => (
                  <div key={d.id}>
                    {renderHUD(d)}
                    {renderWand(d, "top", idx === 0 ? "-top-10 -right-[20px]" : "-top-10 -left-16", idx === 0)}
                  </div>
                ))}
              </div>
            </div>
            <div className="relative p-3">
              <div className="grid gap-3 grid-cols-1">
                {bottomDuelists.map((d, idx) => (
                  <div key={d.id}>
                    {renderHUD(d)}
                    {renderWand(d, "bottom", idx === 0 ? "-bottom-20 left-3" : "-bottom-20 right-3", idx === 1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border-2 border-amber-900 bg-stone-900/85 p-3">
          {playerDefeated && !gameOver && (
            <div className="mb-3 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-center">
              <p className="text-sm font-bold text-red-300">💀 {locale === "en" ? "Eliminated" : "Eliminado"}</p>
            </div>
          )}
          {playerCannotAct && !playerDefeated && !pendingActions[currentUser.id] && <p className="mb-2 text-xs text-red-300">{locale === "en" ? "Stunned/Freezed" : "Atordoado/Congelado"}</p>}
          {pendingSpell && <p className="mb-2 text-xs text-amber-300">{locale === "en" ? "Spell selected" : "Feitiço selecionado"} - {locale === "en" ? "Click target" : "Clique no alvo"}</p>}

          {!playerDefeated && battleStatus === "selecting" && !pendingActions[currentUser.id] && (
            <div className="mb-2 flex flex-wrap gap-2">
              {player?.spells.map((spell) => {
                const mana = player.spellMana?.[spell]
                const info = getSpellInfo(spell, SPELL_DATABASE)
                const disabledByDebuff = (player?.disabledSpells?.[spell] ?? 0) > 0
                const disabled =
                  !mana ||
                  mana.current <= 0 ||
                  !!gameOver ||
                  battleStatus !== "selecting" ||
                  playerDefeated ||
                  disabledByDebuff
                return (
                  <Button
                    key={spell}
                    disabled={disabled}
                    onClick={() => onSpellClick(spell)}
                    className={`touch-manipulation select-none border border-amber-700 text-amber-100 ${pendingSpell === spell ? "bg-amber-600" : "bg-gradient-to-b from-amber-800 to-amber-900 hover:from-amber-700 hover:to-amber-800"}`}
                  >
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    {info ? (locale === 'pt' ? (info.namePt || info.name) : info.name) : spell} ({mana?.current}/{mana?.max} {locale === "en" ? "MP" : "PM"} | {info?.accuracy || 0}%{disabledByDebuff ? ` | 🔒${player?.disabledSpells?.[spell]}t` : ""})
                  </Button>
                )
              })}
              <Button
                disabled={
                  potionUsed ||
                  !!gameOver ||
                  battleStatus !== "selecting" ||
                  playerDefeated ||
                  !!(player?.debuffs.some((d) => d.type === "no_potion"))
                }
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
              <p key={i} className={`mb-1 battle-log-text ${line.startsWith("→") ? (line.includes("CRÍTICO") ? "text-yellow-300" : line.includes("bloqueado") ? "text-blue-300" : line.includes("errou") ? "text-stone-400" : "text-red-300") : "text-amber-100/90"}`}>{line}</p>
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
                <p className="mt-2 text-amber-100/80">{getNextStage(currentStage) ? (locale === "en" ? "Advancing to next stage..." : "Avançando para próxima etapa...") : (locale === "en" ? "You completed Story Mode!" : "Você completou o Modo História!")}</p>
              </>
            ) : (
              <>
                <div className="mb-2 text-6xl">💀</div>
                <h2 className="text-3xl font-bold text-red-300">{locale === "en" ? "Defeated" : "Derrotado"}</h2>
                <p className="mt-2 text-amber-100/80">{locale === "en" ? "Returning to lobby..." : "Voltando para o lobby..."}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
