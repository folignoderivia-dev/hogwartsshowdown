"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowLeft, FlaskConical, Send, Wand2, X, Smile } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { submitReport, saveMatchHistory } from "@/lib/database"
import { HOUSE_GDD, HOUSE_MODIFIERS, rollSpellPower, SPELL_DATABASE, type SpellInfo, WAND_PASSIVES } from "@/lib/data-store"
import type { BattleStatus, Duelist, HPState, DebuffType, Point } from "@/lib/arena-types"
import type { PlayerBuild } from "@/lib/types"
import { useArenaMatchSync } from "@/hooks/useArenaMatchSync"
import type { RoundAction } from "@/lib/duelActions"
import { getSupabaseClient } from "@/lib/supabase"
import { io, type Socket } from "socket.io-client"
import { useLanguage } from "@/contexts/language-context"
import { uiTexts } from "@/lib/dictionary"
import { STICKERS } from "@/lib/stickers-data"
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
import SpellBeam, { getSpellBeamColor } from "@/components/SpellBeam"
import SelfAura, { getSelfAuraConfig } from "@/components/SelfAura"
import GlobalEffect, { getGlobalEffectConfig } from "@/components/GlobalEffect"

export type { RoundAction } from "@/lib/duelActions"

interface DuelArenaProps {
  playerBuild: PlayerBuild
  onReturn: () => void
  /** Chamado ao encerrar duelo para atualizar ELO (modo online / conta). */
  onBattleEnd?: (outcome: "win" | "lose", userId?: string) => void
  /** FFA: jogador com HP → 0; usar para +1 derrota no Supabase no momento da eliminação. */
  onFfaPlayerEliminated?: (userId: string) => void
  matchId?: string
  isSpectator?: boolean
  participantIds?: string[]
  participantNames?: string[]
  matchStatus?: "waiting" | "in_progress" | "finished"
  unlockedStickers?: string[]
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
  // Legado (mantidos para compatibilidade)
  bruxo01: "https://i.postimg.cc/x8NHhC8x/bruxo01.png",
  bruxo02: "https://i.postimg.cc/nr97gzrY/bruxo02.png",
  bruxo03: "https://i.postimg.cc/QCK5wtCg/bruxo03.png",
  bruxa01: "https://i.postimg.cc/brSbWJr6/bruxa01.png",
  bruxa02: "https://i.postimg.cc/L5gfwX5D/bruxa02.png",
  bruxa03: "https://i.postimg.cc/1XV62tXH/bruxa03.png",
  // Galeria principal (avatar1–avatar22)
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
  avatar20: "https://i.postimg.cc/vBNwCFt3/pngwing-com-(7).png",
  avatar21: "https://i.postimg.cc/Y9sBTKzf/pngwing-com-(8).png",
  avatar22: "https://i.postimg.cc/gJTb1FHD/pngwing-com-(9).png",
}
const DEFAULT_AVATARS = ["avatar1","avatar2","avatar3","avatar4","avatar5","avatar6","avatar7","avatar8"]
const TORNEIO_LABELS = ["Round of 16", "Quarter-finals", "Semi-final", "Final"]
const TORNEIO_BOTS = [
  { name: "Sentinela de Azkaban", house: "slytherin", wand: "dragon", spells: ["Bombarda", "Confrigo", "Crucius", "Imperio", "Protego", "Expelliarmus"] },
  { name: "Auror Renegado", house: "gryffindor", wand: "thunderbird", spells: ["Scarlatum", "Depulso", "Glacius", "Arestum Momentum", "Protego", "Ferula"] },
  { name: "Alquimista Sombrio", house: "ravenclaw", wand: "acromantula", spells: ["Confundos", "Flagellum", "Lumus", "Finite Incantatem", "Fumus", "Episkey"] },
  { name: "Duelista Fantasma", house: "hufflepuff", wand: "kelpie", spells: ["Incendio", "Confrigo", "Diffindo", "Sectumsempra", "Protego Diabólico", "Protego Maximo"] },
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
/** Mensagem flutuante curta ao aplicar debuff do grimório. */
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
  blindness: "BLINDED!",
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
  bleed: "BLEEDING!",
  crit_down: "CRITICAL −!",
  bomba: "BOMB!",
  bloqueio_cura: "NO HEAL!",
}
const normSpell = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

const BASE_CRIT_CHANCE = 0.1

function getCritChance(attacker: Duelist, defender?: Duelist, spellNameNorm?: string): number {
  let c = BASE_CRIT_CHANCE
  if (spellNameNorm && spellNameNorm.includes("rictumsempra")) c += 0.3
  // Dragão: +20% crit
  if (WAND_PASSIVES[attacker.wand]?.effect === "crit20_acc_minus15") c += 0.2
  // Sonserina: +25% crit chance (novo)
  if (attacker.house === "slytherin") c += HOUSE_GDD.slytherin.critBonus
  // Veela: defensor nunca pode ser critado
  if (WAND_PASSIVES[defender?.wand ?? ""]?.effect === "veela_acc_penalty") return 0
  if (attacker.debuffs.some((d) => d.type === "crit_boost")) c += 0.25
  return Math.min(0.95, c)
}

/** Alinhado ao turn-engine: Grifinória +2 / Lufa -3 em todas as magias (+ ajuste Aqua Eructo legado). */
function getSpellCastPriority(spellName: string, spell: SpellInfo | undefined, attacker: Duelist): number {
  if (!spell) return 0
  let p = spell.priority ?? 0
  const n = normSpell(spellName)
  if (n.includes("aqua") && n.includes("eructo")) p += 5
  const hg = HOUSE_GDD[attacker.house as keyof typeof HOUSE_GDD]
  if (hg && "attackPriorityBonus" in hg) p += (hg as { attackPriorityBonus: number }).attackPriorityBonus
  if (WAND_PASSIVES[attacker.wand]?.effect === "thunder_priority") p += 1
  if (attacker.debuffs.some((d) => d.type === "paralysis")) p = Math.min(0, p)
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

/** Retorna as barras de HP iniciais respeitando a passiva de cada casa.
 *  Sonserina: 4 barras (400 HP). Todas as outras: 5 barras (500 HP). */
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
  { playerBuild, onReturn, onBattleEnd, onFfaPlayerEliminated, matchId, isSpectator = false, participantIds = [], participantNames = [], matchStatus, unlockedStickers = [] }: DuelArenaProps
) => {
  const { locale, cycleLocale } = useLanguage()
  const ui = uiTexts[locale]
  const [showStickerPopup, setShowStickerPopup] = useState(false)
  const [floatingStickers, setFloatingStickers] = useState<Array<{ id: number; playerId: string; stickerUrl: string }>>([])
  if (typeof window === "undefined") return null
  const isOfflineMode = playerBuild.gameMode === "teste" || playerBuild.gameMode === "torneio-offline"
  const selfDuelistId = playerBuild.userId ?? null
  const isIdentityReady = isOfflineMode || !!selfDuelistId
  if (!isOfflineMode && !selfDuelistId) {
    return (
      <div className="min-h-screen bg-stone-800 font-serif text-amber-100">
        <main className="mx-auto flex max-w-4xl items-center justify-center p-8">
          <div className="w-full max-w-lg rounded-xl border border-amber-700 bg-stone-900/90 p-6 text-center">
            <p className="text-lg font-semibold text-amber-200">{ui.invalidCode}</p>
            <p className="mt-2 text-sm text-amber-300/90">{ui.roomNotFound}</p>
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

    const withMana = (d: Duelist): Duelist => ({
      ...d,
      hp: { bars: buildHpBars(d.house) },
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
          name: "Slytherin Rival",
          house: "slytherin",
          wand: "dragon",
          avatar: "",
          spells: enemySpells,
          hp: { bars: buildHpBars("slytherin") },
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
        const duelName = isLocal ? playerBuild.name : participantNames[idx] || `Wizard ${idx + 1}`
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
          hp: { bars: buildHpBars(duelHouse) },
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
      id: selfDuelistId ?? "",
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
    const botBase = TORNEIO_BOTS[Math.floor(Math.random() * TORNEIO_BOTS.length)]
    const POTIONS = ["wiggenweld", "mortovivo", "edurus", "maxima", "foco", "merlin", "felix", "aconito", "amortentia"]
    const potion = POTIONS[Math.floor(Math.random() * POTIONS.length)]
    const bot: Duelist = {
      id: `torneio-bot-${stage + 1}`,
      name: `${botBase.name} (${TORNEIO_LABELS[Math.min(stage, TORNEIO_LABELS.length - 1)]})`,
      house: botBase.house,
      wand: botBase.wand,
      potion,
      avatar: DEFAULT_AVATARS[(stage + 1) % DEFAULT_AVATARS.length],
      spells: botBase.spells,
      hp: { bars: buildHpBars(botBase.house) },
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
  const [timeLeft, setTimeLeft] = useState(120)
  const [pendingSpell, setPendingSpell] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<Record<string, RoundAction>>({})
  const [lockedSpell, setLockedSpell] = useState<string | null>(null)
  const [isParryingActive, setIsParryingActive] = useState(false)
  const pendingActionsRef = useRef<Record<string, RoundAction>>({})
  const [battleLog, setBattleLog] = useState<string[]>(["[Turn 0]: The duel began!"])
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([{ sender: "System", text: "Chat active." }])
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
          parryUses: old.parryUses,
        }
      })
      console.log("[Arena:init] setDuelists from participants", {
        prevCount: prev.length,
        nextCount: next.length,
        ids: next.map((d) => d.id),
      })
      return Array.from(new Map(next.map((d) => [d.id, d])).values())
    })
  }, [buildOnlineDuelists, participantIds, playerBuild.gameMode])

  useEffect(() => {
    pendingActionsRef.current = pendingActions
  }, [pendingActions])

  const [gameOver, setGameOver] = useState<"win" | "lose" | "timeout" | null>(null)
  /** Mensagem central da fila de resolução (sincronia com acertos/efeitos). */
  const [battleMessage, setBattleMessage] = useState("")
  const [statusFloater, setStatusFloater] = useState<{ text: string; targetId: string; key: number } | null>(null)
  /** Resumo de dano residual (burn/poison) antes do próximo turno. */
  const [residualBanner, setResidualBanner] = useState<string | null>(null)
  const [potionUsed, setPotionUsed] = useState(false)
  const [backgroundImage, setBackgroundImage] = useState(SCENARIOS[0])
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackTargetId, setFeedbackTargetId] = useState<string | null>(null)
  const [currentTargetId, setCurrentTargetId] = useState<string | null>(null)
  const [impactTargetId, setImpactTargetId] = useState<string | null>(null)
  /** ID do avatar recebendo animação de poção (frasco brilhante) */
  const [potionGlowId, setPotionGlowId] = useState<string | null>(null)
  const [circumFlames, setCircumFlames] = useState<Record<string, number>>({})
  
  // New animation states
  const [spellBeam, setSpellBeam] = useState<{ fromX: number; fromY: number; toX: number; toY: number; color: string } | null>(null)
  const [selfAura, setSelfAura] = useState<{ type: "shield" | "healing" | "buff" | "invisibility"; color: string } | null>(null)
  const [globalEffect, setGlobalEffect] = useState<{ type: "explosion" | "weather" | "fire" | "erratic"; color: string } | null>(null)
  
  const resolvingRef = useRef(false)
  const botTimeoutsRef = useRef<number[]>([])
  const [awaitingServerAck, setAwaitingServerAck] = useState(false)
  /** True após receber GAME_START via Socket.io. */
  const [gameStartAcknowledged, setGameStartAcknowledged] = useState(isOfflineMode)
  const [knownBroadcastPlayers, setKnownBroadcastPlayers] = useState<string[]>(isOfflineMode ? [selfDuelistId ?? ""] : selfDuelistId ? [selfDuelistId] : [])
  /** Nomes reais dos jogadores na sala (vindos do servidor via ROOM_STATUS). */
  const [roomPlayerNames, setRoomPlayerNames] = useState<string[]>([])
  /** Contador real de players na sala (via ROOM_STATUS). */
  const [roomPlayerCount, setRoomPlayerCount] = useState(1)
  /** Floating Combat Text. */
  const [floatingTexts, setFloatingTexts] = useState<Array<{ id: number; text: string; type: "damage" | "crit" | "miss" | "heal" | "block" | "skip"; x: number; y: number }>>([])
  const fctCounterRef = useRef(0)
  /** Floating Emojis. */
  const [floatingEmojis, setFloatingEmojis] = useState<Array<{ id: number; emoji: string; userId: string }>>([])
  const emojiCounterRef = useRef(0)
  /** Report modal. */
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportText, setReportText] = useState("")
  const [reportSent, setReportSent] = useState(false)
  /** Estado do socket.io */
  const [socketConnected, setSocketConnected] = useState(false)
  const [socketDisconnected, setSocketDisconnected] = useState(false)
  const [debugLastEvent, setDebugLastEvent] = useState("")
  /** Ref para a instância do socket (singleton por partida) */
  const socketRef = useRef<Socket | null>(null)
  const runResolutionRef = useRef<(actions: RoundAction[]) => Promise<void>>(async () => {})
  const handleTurnResolvedRef = useRef<((data: {
    animationsToPlay: EngineAnimation[]
    newDuelists: Duelist[]
    outcome: "win" | "lose" | null
    logs: string[]
    nextTurn: number
    circumFlames?: Record<string, number>
  }) => Promise<void>) | null>(null)
  const duelistsRef = useRef<Duelist[]>([])
  const turnNumberRef = useRef(turnNumber)
  const battleStatusRef = useRef<BattleStatus>("idle")
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
  const processCombatAction = useCallback((actionPayload: RoundAction) => {
    setPendingActions((prev) => ({ ...prev, [actionPayload.casterId]: actionPayload }))
  }, [])
  const addLog = useCallback((line: string) => {
    setBattleLog((prev) => [...prev, line])
  }, [])

  const notifyFfaEliminations = useCallback(
    (prev: Duelist[], next: Duelist[]) => {
      const mode = playerBuild.gameMode
      if (mode !== "ffa" && mode !== "ffa3") return
      if (!onFfaPlayerEliminated) return
      const roster = new Set<string>([playerBuild.userId, ...participantIds].filter(Boolean) as string[])
      for (const n of next) {
        if (!roster.has(n.id)) continue
        const o = prev.find((p) => p.id === n.id)
        if (!o) continue
        if (!isDefeated(o.hp) && isDefeated(n.hp)) {
          onFfaPlayerEliminated(n.id)
        }
      }
    },
    [onFfaPlayerEliminated, participantIds, playerBuild.gameMode, playerBuild.userId]
  )

  /** Deriva texto e tipo de FCT a partir de uma EngineAnimation.
   *  Inclui o nome do feitiço para que o FCT substitua o overlay central. */
  const getFCTFromAnim = useCallback(
    (anim: EngineAnimation): { text: string; type: "damage" | "crit" | "miss" | "heal" | "block" | "skip" } | null => {
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
    },
    []
  )

  /** Obtém posição (% relativa à arena) do HUD de um duelist para posicionar o FCT.
   *  Posiciona abaixo do rosto (60% da altura do elemento) para não cobrir o avatar. */
  const getFCTPos = useCallback((targetId: string): { x: number; y: number } => {
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
  }, [])

  const ackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearAckTimeout = useCallback(() => {
    if (ackTimeoutRef.current) {
      clearTimeout(ackTimeoutRef.current)
      ackTimeoutRef.current = null
    }
  }, [])

  /** Envia intenção de ação ao servidor Socket.io autoritativo. */
  const submitTurnAction = useCallback(
    (action: RoundAction) => {
      if (isOfflineMode || !matchId || !selfDuelistId) return
      const socket = socketRef.current
      if (!socket?.connected) {
        console.warn("[Arena] SUBMIT_ACTION: socket desconectado.")
        return
      }
      const tn = turnNumberRef.current
      const eventId = action.eventId || `${selfDuelistId}-${tn}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const payload: RoundAction = { ...action, casterId: selfDuelistId, turnId: tn, eventId }
      setAwaitingServerAck(true)
      setBattleMessage("Intent sent — awaiting server resolution...")
      setDebugLastEvent(`SUBMIT_ACTION T${tn}`)
      socket.emit("SUBMIT_ACTION", { matchId, userId: selfDuelistId, turn: tn, action: payload })

      // Timeout de segurança: se em 35s não houver resposta, desbloqueie o cliente
      if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current)
      ackTimeoutRef.current = setTimeout(() => {
        setAwaitingServerAck((prev) => {
          if (prev) {
            console.warn("[Arena] Timeout de ack — desbloqueando cliente.")
            setBattleMessage("No server response. Try again.")
            setBattleStatus("selecting")
            setPotionUsed(false)
          }
          return false
        })
      }, 35_000)
    },
    [isOfflineMode, matchId, selfDuelistId]
  )
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const hudRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const wandRefs = useRef<Record<string, HTMLImageElement>>({})

  const player = duelists.find((d) => d.id === selfDuelistId)
  const handSpellList =
    player?.spellMana && Object.keys(player.spellMana).length > 0
      ? Object.keys(player.spellMana).sort((a, b) => a.localeCompare(b))
      : playerBuild.spells
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
    selfDuelistId: selfDuelistId ?? "",
    participantIds,
    expectedOnlinePlayers,
  })
  const onlineReadyPlayers = isOnlineMatch
    ? Math.max(knownBroadcastPlayers.length, duelists.length)
    : Math.max(duelists.length, participantIds.length || 0)
  const participantRoster = participantIds.length > 0 ? participantIds : duelists.map((d) => d.id)

  useEffect(() => {
    if (!isOnlineMatch) {
      setGameStartAcknowledged(true)
    }
  }, [isOnlineMatch])

  const playSpellVfx = async (spellName: string, attacker: Duelist, targets: Duelist[]) => {
    const arena = arenaRef.current
    const rect = arena?.getBoundingClientRect()
    if (!arena || !rect) {
      await sleep(1000)
      return
    }

    // Small delay to ensure wand ref is available
    await sleep(100)

    const getWandPoint = (id: string): Point => {
      const wandEl = wandRefs.current[id]
      if (!wandEl) {
        console.log(`[playSpellVfx] Wand ref not found for ${id}, falling back to HUD center`)
        return { x: rect.width / 2, y: rect.height / 2 }
      }
      const r = wandEl.getBoundingClientRect()
      // Get center of wand hand image
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 }
    }

    const hudPoint = (id: string): Point => {
      const el = hudRefs.current[id]
      if (!el) return { x: rect.width / 2, y: rect.height / 2 }
      const r = el.getBoundingClientRect()
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 }
    }

    const from = getWandPoint(attacker.id)
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
      const to = hudPoint(targets[0].id)
      const color = getSpellBeamColor(spellName)
      setSpellBeam({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, color })
      await sleep(300)
      setSpellBeam(null)
    }
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
    // Rapinomônio: drena mana de 1 spell aleatória de cada duelista no início
    const hasCaster = next.some((d) => WAND_PASSIVES[d.wand]?.effect === "rapinomonio_drain_start")
    if (!hasCaster) return next
    for (const target of next) {
      if (!target.spellMana || Object.keys(target.spellMana).length === 0) continue
      const spellKeys = Object.keys(target.spellMana)
      const pick = spellKeys[Math.floor(Math.random() * spellKeys.length)]
      const newSm = { ...target.spellMana }
      newSm[pick] = { ...newSm[pick], current: 0 }
      next = next.map((d) => (d.id === target.id ? { ...d, spellMana: newSm } : d))
    }
    return next
  }, [])

  const applyCentauroBlock = useCallback((state: Duelist[]) => {
    const hasCentauro = state.some((d) => WAND_PASSIVES[d.wand]?.effect === "centauro_block_heals")
    if (!hasCentauro) return state
    const healSpells = ["Ferula", "Episkey", "Vulnera Sanetur"] as const
    return state.map((d) => {
      if (!d.spellMana) return d
      const sm = { ...d.spellMana }
      for (const s of healSpells) {
        if (sm[s]) sm[s] = { ...sm[s], current: 0 }
      }
      return { ...d, spellMana: sm }
    })
  }, [])

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
        parryUses: undefined,
      }))
    )
    setBattleStatus("selecting")
    // Não inicia/reinicia o timer para jogadores já eliminados
    const selfAlive = state.some((d) => d.id === selfDuelistId && !isDefeated(d.hp))
    if (selfAlive || !selfDuelistId) setTimeLeft(120)
    setPendingSpell(null)
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
          ? { casterId: bot.id, type: "cast", spellName, targetId: target.id, areaAll: isAreaSpell(spellName), turnId: rt }
          : { casterId: bot.id, type: "skip", turnId: rt }
        })
    }

    const localPlayer = state.find((d) => d.id === selfDuelistId)
    if (!isOnlineMatch && selfDuelistId) {
      if (!localPlayer || isDefeated(localPlayer.hp)) {
        initialActions[selfDuelistId] = { casterId: selfDuelistId, type: "skip", turnId: rt }
      } else if (localPlayer.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
        initialActions[selfDuelistId] = { casterId: selfDuelistId, type: "skip", turnId: rt }
      }
    }
    setPendingActions(initialActions)
  }

  /** Resolução local (somente modo offline/PvE). */
  const runResolution = async (queuedActions: RoundAction[]) => {
    if (resolvingRef.current) return
    resolvingRef.current = true
    const roundTurn = turnNumberRef.current
    try {
      setBattleStatus("resolving")
      clearAckTimeout()
      setAwaitingServerAck(false)
      setBattleMessage("")
      const snapshot = [...duelistsRef.current]

      let outcome: ReturnType<typeof calculateTurnOutcome>
      try {
        outcome = calculateTurnOutcome({
          duelists: snapshot,
          actions: queuedActions,
          spellDatabase: SPELL_DATABASE,
          turnNumber: roundTurn,
          gameMode: playerBuild.gameMode,
          circumFlames,
        })
      } catch (engineErr) {
        console.warn("[Arena] calculateTurnOutcome:", engineErr)
        addLog(`[Engine]: exception in turn ${roundTurn} — aborting resolution.`)
        setBattleStatus("selecting")
        return
      }

      const state = outcome.newDuelists
      await playAnimations(outcome.animationsToPlay, state)

      setDuelists(state)
      notifyFfaEliminations(snapshot, state)
      setBattleLog((prev) => [...prev, ...outcome.logs])

      // Flash visual para debuffs recém-aplicados (comparação com snapshot pré-turno)
      for (const newD of state) {
        const oldD = snapshot.find((d) => d.id === newD.id)
        if (!oldD) continue
        const oldTypes = new Set(oldD.debuffs.map((x) => x.type))
        const fresh = newD.debuffs.find((db) => !oldTypes.has(db.type) && DEBUFF_FLASH[db.type as DebuffType])
        if (fresh) {
          setStatusFloater({ text: DEBUFF_FLASH[fresh.type as DebuffType]!, targetId: newD.id, key: Date.now() })
          setTimeout(() => setStatusFloater(null), 1800)
        }
      }
      const resolvedTurn = roundTurn
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
      const nextTurn = roundTurn + 1
      turnNumberRef.current = nextTurn
      setTurnNumber(nextTurn)

      if (outcome.outcome) {
        if (playerBuild.gameMode === "torneio-offline" && outcome.outcome === "win" && challengeStage < TORNEIO_LABELS.length - 1) {
          const nextStage = challengeStage + 1
          setChallengeStage(nextStage)
          addLog(`[Tournament]: ${playerBuild.name} advanced to ${TORNEIO_LABELS[nextStage]}!`)
          const nextRound = applyRapinomonioBlock(buildChallengeRound(nextStage))
          setDuelists(nextRound)
          setPendingActions({})
          setPotionUsed(false)
          setPendingSpell(null)
          setGameOver(null)
          setIsParryingActive(false)
          turnNumberRef.current = 1
          setTurnNumber(1)
          setBattleStatus("selecting")
          beginRoundSelection(nextRound)
          return
        }
        if (playerBuild.gameMode === "torneio-offline" && outcome.outcome === "lose") {
          setChallengeStage(0)
        }
        setGameOver(outcome.outcome)
        setIsParryingActive(false)
        if ((outcome.outcome === "win" || outcome.outcome === "lose") && playerBuild.gameMode !== "torneio-offline") {
          onBattleEnd?.(outcome.outcome, playerBuild.userId)
        } else if (playerBuild.gameMode === "torneio-offline" && outcome.outcome === "win") {
          onBattleEnd?.(outcome.outcome, playerBuild.userId)
        }
        setBattleStatus("finished")
        return
      }
      beginRoundSelection(state)
    } catch (e) {
      console.error("[Arena] runResolution", e)
      addLog("[Engine]: error in turn resolution; state reverted to selection.")
      setBattleStatus("selecting")
    } finally {
      resolvingRef.current = false
    }
  }

  runResolutionRef.current = runResolution

  /** Reproduz resolução de turno enviada pelo servidor Socket.io (online). */
  handleTurnResolvedRef.current = async (data: {
    animationsToPlay: EngineAnimation[]
    newDuelists: Duelist[]
    outcome: "win" | "lose" | null
    logs: string[]
    nextTurn: number
    circumFlames?: Record<string, number>
  }) => {
    if (resolvingRef.current) return
    resolvingRef.current = true
    try {
      setBattleStatus("resolving")
      clearAckTimeout()
      setAwaitingServerAck(false)
      setBattleMessage("")
      setDebugLastEvent(`TURN_RESOLVED T${data.nextTurn - 1}`)

      const oldStateOnline = [...duelistsRef.current]
      const state = data.newDuelists
      await playAnimations(data.animationsToPlay, state)

      setDuelists(state)
      duelistsRef.current = state
      notifyFfaEliminations(oldStateOnline, state)
      setBattleLog((prev) => [...prev, ...data.logs])

      // Flash visual para debuffs recém-aplicados (online)
      for (const newD of state) {
        const oldD = oldStateOnline.find((d) => d.id === newD.id)
        if (!oldD) continue
        const oldTypes = new Set(oldD.debuffs.map((x) => x.type))
        const fresh = newD.debuffs.find((db) => !oldTypes.has(db.type) && DEBUFF_FLASH[db.type as DebuffType])
        if (fresh) {
          setStatusFloater({ text: DEBUFF_FLASH[fresh.type as DebuffType]!, targetId: newD.id, key: Date.now() })
          setTimeout(() => setStatusFloater(null), 1800)
        }
      }
      turnNumberRef.current = data.nextTurn
      setTurnNumber(data.nextTurn)
      if (data.circumFlames) setCircumFlames(data.circumFlames)

      if (data.outcome) {
        setGameOver(data.outcome)
        setIsParryingActive(false)
        // Em FFA, não chamamos onBattleEnd aqui para evitar múltiplas contagens de derrota
        // Apenas MATCH_RESULT deve processar o resultado final
        const isFfaMode = playerBuild.gameMode === "ffa" || playerBuild.gameMode === "ffa3"
        if (!isFfaMode && (data.outcome === "win" || data.outcome === "lose")) {
          onBattleEnd?.(data.outcome, playerBuild.userId)
        }
        setBattleStatus("finished")
        return
      }
      beginRoundSelection(state)
    } catch (e) {
      console.error("[Arena] handleTurnResolved:", e)
      setBattleStatus("selecting")
    } finally {
      resolvingRef.current = false
    }
  }

  // ─── Reprodutor de animações (compartilhado entre offline e online) ─────────
  const playAnimations = useCallback(
    async (animations: EngineAnimation[], stateSnapshot: Duelist[]) => {
      for (const anim of animations) {
        const caster = stateSnapshot.find((d) => d.id === anim.casterId)
        const resolvedTargetIds = anim.targetIds?.length ? anim.targetIds : anim.targetId ? [anim.targetId] : []
        const targets = stateSnapshot.filter((d) => resolvedTargetIds.includes(d.id))

        if (anim.type === "cast" && caster && anim.spellName) {
          if (!anim.fctOnly) {
            // VFX visual: dispara apenas uma vez (animação geral com todos os alvos)
            await sleep(500)
            await playSpellVfx(anim.spellName, caster, targets)
          }

          // FCT: cada alvo; fallback para targetId / caster se o snapshot ainda não tiver a lista
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
          // Animação de frasco/brilho sobre o avatar
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

  // ─── Ciclo de vida do Socket.io ─────────────────────────────────────────────
  // Espectadores precisam do mesmo socket (JOIN_MATCH com isSpectator) para receber GAME_START / TURN_RESOLVED.
  useEffect(() => {
    if (!isOnlineMatch || !matchId || !selfDuelistId) return

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "https://hogwartsshowdown-production.up.railway.app"
    const socket = io(socketUrl, {
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 20_000,
      timeout: 90_000,
      randomizationFactor: 0.5,
    })
    socketRef.current = socket

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id)
      setSocketConnected(true)
      setSocketDisconnected(false)
      setDebugLastEvent("socket connected")
      socket.emit("JOIN_MATCH", {
        matchId,
        userId: selfDuelistId,
        build: playerBuild,
        isSpectator: isReadOnlySpectator,
      })
    })

    socket.on("disconnect", () => {
      console.warn("[Socket] Disconnected.")
      setSocketConnected(false)
      setSocketDisconnected(true)
      setDebugLastEvent("socket DISCONNECTED")
    })

    socket.on("connect_error", (err) => {
      console.warn("[Socket] Connection error:", err.message)
      setSocketDisconnected(true)
    })

    socket.on("ROOM_STATUS", ({ playersJoined, playersExpected, playerNames }: { playersJoined: number; playersExpected: number; playerNames?: string[] }) => {
      setRoomPlayerCount(playersJoined)
      // Armazena nomes reais vindos do servidor
      if (playerNames && playerNames.length > 0) setRoomPlayerNames(playerNames)
      // Mantém lista de IDs para contagem/keying
      setKnownBroadcastPlayers((prev) => {
        if (prev.length >= playersJoined) return prev
        const next = [...prev]
        while (next.length < playersJoined) next.push(`slot-${next.length}`)
        return next
      })
      setDebugLastEvent(`ROOM_STATUS ${playersJoined}/${playersExpected}`)
    })

    socket.on("GAME_START", ({ duelists: serverDuelists, turnNumber: serverTurn, yourPlayerId }: {
      duelists: Duelist[]
      turnNumber: number
      gameMode: string
      yourPlayerId: string
    }) => {
      console.log("[Socket] GAME_START received:", serverDuelists.map((d) => d.name))
      setKnownBroadcastPlayers(serverDuelists.map((d) => d.id))
      setDuelists(serverDuelists)
      turnNumberRef.current = serverTurn
      setTurnNumber(serverTurn)
      setGameStartAcknowledged(true)
      setBattleMessage("")
      setDebugLastEvent(`GAME_START (${serverDuelists.length} duelists)`)
      // Inicia a seleção após o servidor confirmar o início
      const seeded = serverDuelists
      setBattleStatus("selecting")
      setTimeLeft(120)
      setPendingSpell(null)
      setResidualBanner(null)
      setStatusFloater(null)
      setFeedbackText("")
      setCurrentTargetId(null)
      setFeedbackTargetId(null)
    })

    socket.on("RECONNECT_STATE", ({ duelists: serverDuelists, turnNumber: serverTurn, circumFlames: cf }: {
      duelists: Duelist[]
      turnNumber: number
      circumFlames: Record<string, number>
    }) => {
      console.log("[Socket] RECONNECT_STATE recebido")
      setDuelists(serverDuelists)
      turnNumberRef.current = serverTurn
      setTurnNumber(serverTurn)
      setGameStartAcknowledged(true)
      if (cf) setCircumFlames(cf)
      setDebugLastEvent(`RECONNECT T${serverTurn}`)
      setBattleStatus("selecting")
    })

    socket.on("TURN_RESOLVED", async (data: {
      animationsToPlay: EngineAnimation[]
      newDuelists: Duelist[]
      outcome: "win" | "lose" | null
      logs: string[]
      nextTurn: number
      circumFlames?: Record<string, number>
    }) => {
      if (handleTurnResolvedRef.current) {
        await handleTurnResolvedRef.current(data)
      }
    })

    socket.on("OPPONENT_DISCONNECTED", ({ userId }: { userId: string }) => {
      const opponentName = duelistsRef.current.find((d) => d.id === userId)?.name || "Oponente"
      setBattleMessage(`${opponentName} se desconectou. Aguardando reconexão...`)
      setDebugLastEvent("OPPONENT_DISCONNECTED")
    })

    socket.on("OPPONENT_LEFT", ({ userId }: { userId: string }) => {
      const opponentName = duelistsRef.current.find((d) => d.id === userId)?.name || "Oponente"
      addLog(`[Sistema]: ${opponentName} abandonou a partida.`)
      setGameOver("win")
      setBattleStatus("finished")
    })

    socket.on("SYNC_ERROR", ({ message }: { message: string }) => {
      console.warn("[Socket] SYNC_ERROR:", message)
      setAwaitingServerAck(false)
      setBattleMessage(`Erro de sincronia: ${message}`)
      setBattleStatus("selecting")
    })

    socket.on("CHAT_MESSAGE", ({ sender, text }: { sender: string; text: string }) => {
      setChatMessages((prev) => [...prev, { sender, text }])
    })

    socket.on("ERROR", ({ message }: { message: string }) => {
      console.warn("[Socket] Erro do servidor:", message)
      // Desbloqueia o cliente se estava aguardando resposta
      setAwaitingServerAck(false)
      setPotionUsed((prev) => {
        // Se a poção foi marcada como usada mas o servidor não processou, reverte
        if (prev) {
          setBattleMessage(`Ação rejeitada: ${message}`)
          return false
        }
        return prev
      })
      setBattleStatus("selecting")
    })

    socket.on("emoji_received", ({ userId, emoji }: { userId: string; emoji: string }) => {
      const id = ++emojiCounterRef.current
      setFloatingEmojis((prev) => [...prev, { id, emoji, userId }])
      setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== id)), 2600)
    })

    socket.on("receive_sticker", ({ stickerUrl, playerId }: { stickerUrl: string; playerId: string }) => {
      setFloatingStickers((prev) => [...prev, { id: Date.now(), playerId, stickerUrl }])
      setTimeout(() => {
        setFloatingStickers((prev) => prev.filter((s) => s.id !== Date.now()))
      }, 3000)
    })

    socket.on(
      "MATCH_RESULT",
      ({
        matchId: mId,
        gameMode,
        winnerNames,
        loserNames,
        yourDelta,
        eloDeltas,
      }: {
        matchId: string
        gameMode: string
        winnerNames: string[]
        loserNames: string[]
        yourDelta?: number
        eloDeltas?: Record<string, number>
      }) => {
        if (yourDelta !== undefined) {
          const sign = yourDelta >= 0 ? "+" : ""
          addLog(`[Ranking] Variação de ELO: ${sign}${yourDelta} pts`)
        }
        // Em FFA, processamos o resultado final aqui para garantir apenas uma derrota por partida
        const isFfaMode = gameMode === "ffa" || gameMode === "ffa3"
        if (isFfaMode && yourDelta !== undefined) {
          const outcome = yourDelta > 0 ? "win" : "lose"
          onBattleEnd?.(outcome, playerBuild.userId)
        }
        saveMatchHistory({ matchId: mId, gameMode, winnerNames, loserNames }).catch(() => null)
      }
    )

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("connect_error")
      socket.off("ROOM_STATUS")
      socket.off("GAME_START")
      socket.off("RECONNECT_STATE")
      socket.off("TURN_RESOLVED")
      socket.off("OPPONENT_DISCONNECTED")
      socket.off("OPPONENT_LEFT")
      socket.off("SYNC_ERROR")
      socket.off("CHAT_MESSAGE")
      socket.off("ERROR")
      socket.off("MATCH_RESULT")
      socket.off("emoji_received")
      socket.disconnect()
      socketRef.current = null
      setSocketConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnlineMatch, matchId, selfDuelistId, isReadOnlySpectator])

  // Wake Lock: impede o celular de suspender o JS enquanto a batalha estiver ativa.
  useEffect(() => {
    if (isOfflineMode || gameOver || battleStatus === "idle") return
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return
    let lock: any = null
    let mounted = true
    void (async () => {
      try {
        lock = await (navigator as any).wakeLock.request("screen")
        console.log("[Arena] Wake Lock adquirido.")
        lock?.addEventListener?.("release", () => {
          if (mounted) console.log("[Arena] Wake Lock liberado pelo sistema.")
        })
      } catch (e) {
        console.warn("[Arena] Wake Lock não suportado ou negado:", e)
      }
    })()
    return () => {
      mounted = false
      lock?.release().catch(() => {})
    }
  }, [isOfflineMode, gameOver, battleStatus])

  useEffect(() => {
    setBackgroundImage(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)])
    if (playerBuild.gameMode === "torneio-offline") {
      setChallengeStage(0)
      setPotionUsed(false)
      setPendingSpell(null)
      setPendingActions({})
      setTurnNumber(1)
      setGameOver(null)
      const seeded = applyCentauroBlock(applyRapinomonioBlock(buildChallengeRound(0)))
      setDuelists(seeded)
      beginRoundSelection(seeded)
      return
    }
    if (isOfflineMode) {
      const seeded = applyCentauroBlock(applyRapinomonioBlock(duelists))
      setDuelists(seeded)
      beginRoundSelection(seeded)
      return
    }
    setBattleStatus("idle")
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Batalha online: GAME_START via socket.io já chama beginRoundSelection diretamente.
  // Este efeito apenas garante que o status fica "idle" enquanto aguarda o servidor.

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
              // Tempo esgotado sem agir: envia skip automático
              const skipAction: RoundAction = { casterId: selfDuelistId ?? "", type: "skip", turnId: turnNumberRef.current }
              submitTurnAction(skipAction)
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
  }, [addLog, awaitingServerAck, battleStatus, duelists, gameOver, isOnlineMatch, pendingActions, playerDefeated, selfDuelistId, submitTurnAction, turnNumber])

  useEffect(() => {
    if (isOnlineMatch) return
    if (battleStatus !== "selecting") return
    const aliveIds = duelists.filter((d) => !isDefeated(d.hp)).map((d) => d.id)
    if (aliveIds.length === 0) return
    const pendingComplete = aliveIds.every((id) => {
      const a = pendingActions[id]
      return !!a && a.turnId === turnNumber
    })
    if (!pendingComplete) return
    const actionList = Object.values(pendingActions).filter((a) => aliveIds.includes(a.casterId))
    console.log("[SHOWDOWN] Turno offline completo:", actionList)
    void runResolution(actionList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleStatus, duelists, isOnlineMatch, pendingActions, turnNumber])

  const onSpellClick = (spellName: string) => {
    if (isReadOnlySpectator) return
    if (isOnlineMatch && !gameStartAcknowledged) return
    if (!isBattleReady || isInitializing) return
    if (gameOver || battleStatus !== "selecting" || playerCannotAct || playerDefeated || awaitingServerAck) return
    if (!selfDuelistId) return
    if (!isOnlineMatch && pendingActions[selfDuelistId]) return
    if (!player || isDefeated(player.hp)) return

    // Intel tools (Legilimens, Reveal Your Secrets): free clicks, don't consume mana or end turn
    const spInfo = getSpellInfo(spellName, SPELL_DATABASE)
    if (spInfo?.special === "legilimens_reveal" || spInfo?.special === "reveal_wand_core") {
      const opponent = duelists.find((d) => d.team === "enemy" && !isDefeated(d.hp))
      if (opponent) {
        if (spInfo.special === "legilimens_reveal") {
          const spellList = Object.keys(opponent.spellMana ?? {}).join(", ") || "?"
          alert(`🔮 Legilimens! Grimoire of ${opponent.name}: [${spellList}]`)
          setBattleLog((prev) => [...prev, `[Turn ${turnNumber}] ${player?.name} used Legilimens: ${opponent.name}'s Grimoire was revealed!`])
        } else if (spInfo.special === "reveal_wand_core") {
          const passive = opponent.wand ? WAND_PASSIVES[opponent.wand] : null
          alert(`🔍 Reveal Your Secrets! Core of ${opponent.name}: ${passive?.name ?? "Unknown"} — ${passive?.description ?? ""}`)
          setBattleLog((prev) => [...prev, `[Turn ${turnNumber}] ${player?.name} used Reveal Your Secrets: ${opponent.name}'s Wand Core was revealed!`])
        }
      }
      return
    }

    const mana = player.spellMana?.[spellName]
    if (!mana || mana.current <= 0) return
    if ((player.disabledSpells?.[spellName] ?? 0) > 0) return
    if (player.debuffs.some((d) => d.type === "paralysis") && (spInfo?.priority ?? 0) > 0) return
    const taunt = player.debuffs.find((d) => d.type === "taunt")
    if (taunt && player.lastSpellUsed && spellName !== player.lastSpellUsed) return

    const sid = selfDuelistId
    const commitCast = (targetId: string, areaAll?: boolean) => {
      const spell = getSpellInfo(spellName, SPELL_DATABASE)
      const localAction: RoundAction = { casterId: sid, type: "cast", spellName, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, areaAll, turnId: turnNumber, isParrying: isParryingActive }
      if (isOnlineMatch) {
        void submitTurnAction(localAction)
      } else {
        setPendingActions((prev) => ({ ...prev, [sid]: localAction }))
      }
      setIsParryingActive(false)
    }

    if (isSelfTargetSpell(spellName)) {
      commitCast(sid)
      return
    }
    if (isAreaSpell(spellName)) {
      const isFfa = playerBuild.gameMode === "ffa" || playerBuild.gameMode === "ffa3"
      const anchor = isFfa
        ? duelists.find((d) => d.id !== player.id && !isDefeated(d.hp))
        : (duelists.find((d) => d.team !== player.team && !isDefeated(d.hp)) || duelists.find((d) => !isDefeated(d.hp)))
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
    // FFA3, FFA4, 2v2: requer seleção explícita de alvo para spells de alvo único
    if (playerBuild.gameMode === "ffa" || playerBuild.gameMode === "ffa3" || playerBuild.gameMode === "2v2") {
      const provoke = player.debuffs.find((d) => d.type === "provoke")
      if (provoke?.meta) {
        const forcedTarget = duelists.find((d) => d.id === provoke.meta && !isDefeated(d.hp))
        if (forcedTarget) {
          commitCast(forcedTarget.id)
          return
        }
      }
      // Não auto-seleciona alvo em modos com >2 jogadores - exige clique do usuário
      setPendingSpell(spellName)
      return
    }
    setPendingSpell(spellName)
  }

  const onTargetClick = (targetId: string) => {
    if (isReadOnlySpectator) return
    if (isOnlineMatch && !gameStartAcknowledged) return
    if (!isBattleReady || isInitializing) return
    if (!selfDuelistId) return
    if (!pendingSpell || !player || playerDefeated || battleStatus !== "selecting" || awaitingServerAck) return
    if (!isOnlineMatch && pendingActions[selfDuelistId]) return
    const valid = getValidTargetsForSpell(pendingSpell, player, duelists, playerBuild.gameMode).some((d) => d.id === targetId && !isDefeated(d.hp))
    if (!valid) return
    const prov = player.debuffs.find((d) => d.type === "provoke")
    if (prov?.meta && targetId !== prov.meta) return
    const spell = getSpellInfo(pendingSpell, SPELL_DATABASE)
    const localAction: RoundAction = { casterId: selfDuelistId, type: "cast", spellName: pendingSpell, baseDamage: spell ? getSpellMaxPower(spell) : 0, targetId, turnId: turnNumber, isParrying: isParryingActive }
    if (isOnlineMatch) {
      void submitTurnAction(localAction)
    } else {
      setPendingActions((prev) => ({ ...prev, [selfDuelistId!]: localAction }))
    }
    setIsParryingActive(false)
    setPendingSpell(null)
  }

  const usePotion = () => {
    if (isReadOnlySpectator) return
    if (isOnlineMatch && !gameStartAcknowledged) return
    if (!isBattleReady || isInitializing) return
    if (!selfDuelistId) return
    if (potionUsed || gameOver || !player || playerDefeated || battleStatus !== "selecting" || awaitingServerAck) return
    if (!isOnlineMatch && !!pendingActions[selfDuelistId]) return
    if (player.debuffs.some((d) => d.type === "no_potion")) return
    setPotionUsed(true)
    const localAction: RoundAction = { casterId: selfDuelistId, type: "potion", potionType: playerBuild.potion, turnId: turnNumber }
    if (isOnlineMatch) {
      void submitTurnAction(localAction)
    } else {
      setPendingActions((prev) => ({ ...prev, [selfDuelistId!]: localAction }))
    }
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatMessages((prev) => [...prev, { sender: playerBuild.name, text }])
    if (matchId && socketRef.current?.connected) {
      socketRef.current.emit("CHAT_MESSAGE", { matchId, sender: playerBuild.name, text })
    }
    setChatInput("")
  }

  const handleSendSticker = (stickerUrl: string) => {
    if (!matchId || !selfDuelistId) return
    socketRef.current?.emit("send_sticker", { matchId, playerId: selfDuelistId, stickerUrl })
    setShowStickerPopup(false)
  }

  const handleLeaveRoom = async () => {
    try {
      // Desistência voluntária durante batalha online → derrota imediata para ELO
      // Só aplica derrota se a partida realmente começou (battleStatus != idle)
      if (isOnlineMatch && battleStatus !== "finished" && battleStatus !== "idle" && !isReadOnlySpectator && !gameOver) {
        onBattleEnd?.("lose", playerBuild.userId)
      }
      // Notifica o servidor socket antes de sair
      if (isOnlineMatch && matchId && selfDuelistId && socketRef.current?.connected) {
        socketRef.current.emit("LEAVE_MATCH", { matchId, userId: selfDuelistId })
        socketRef.current.disconnect()
      }
      const supabase = getSupabaseClient()
      const leavingId = selfDuelistId
      if (matchId && leavingId && !isOfflineMode && !isReadOnlySpectator) {
        // Remove o jogador da partida no banco
        await supabase
          .from("match_players")
          .delete()
          .eq("match_id", matchId)
          .eq("player_id", leavingId)
        // Marca a partida como finalizada para TODOS os modos online
        const onlineModes = ["1v1", "2v2", "ffa", "ffa3", "quidditch"]
        if (playerBuild.gameMode && onlineModes.includes(playerBuild.gameMode)) {
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

  // Chat: recebido via socket no useEffect do ciclo de vida do socket (acima)

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
    const targetable = pendingSpell && player ? getValidTargetsForSpell(pendingSpell, player, duelists, playerBuild.gameMode).some((d) => d.id === duelist.id && !isDefeated(d.hp)) : false
    return (
      <button
        ref={(el) => {
          hudRefs.current[duelist.id] = el
        }}
        type="button"
        onClick={() => onTargetClick(duelist.id)}
        disabled={!targetable}
        className={`relative w-full touch-manipulation select-none rounded-lg border-2 bg-stone-900/85 p-2 text-center transition-transform duration-150 ${dead ? "opacity-50 border-stone-600" : targetable ? "border-amber-400 animate-pulse" : "border-amber-900/80"} ${impactTargetId === duelist.id ? "scale-[1.03] ring-2 ring-amber-300" : ""}`}
      >
        {currentTargetId === duelist.id && <div className="absolute -top-2 left-1/2 z-50 -translate-x-1/2 text-xl text-amber-300">⬇</div>}
        <div className="mb-1 flex items-start gap-2">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <img
              src={avatar}
              alt={`Avatar ${duelist.name}`}
              className={`relative z-50 h-[88px] w-[72px] rounded-md border-2 border-amber-700 object-contain ${dead ? "grayscale opacity-50" : ""}`}
            />
            {/* Animação de frasco de poção */}
            {potionGlowId === duelist.id && (
              <div className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center rounded-md animate-pulse">
                <span className="text-3xl drop-shadow-[0_0_12px_#a855f7]">🧪</span>
                <div className="absolute inset-0 rounded-md bg-purple-400/30 ring-2 ring-purple-400" />
              </div>
            )}
          </div>
          {/* Info */}
          <div className="relative z-50 flex min-w-0 flex-1 flex-col gap-1">
            {/* Nome + chama */}
            <p
              className="font-bold leading-tight text-amber-100"
              style={{ fontSize: "0.85rem", textShadow: "0 1px 3px #000, 0 0 8px rgba(0,0,0,0.8)" }}
            >
              {duelist.id === selfDuelistId && playerBuild.isVip && (
                <span className="mr-1 text-yellow-400" title={locale === 'en' ? 'VIP Player' : 'Jogador VIP'}>👑</span>
              )}
              {duelist.name}
              {((duelist.circumAura ?? 0) > 0 || (circumFlames[duelist.id] ?? 0) > 0) && (
                <span className="ml-1 text-red-500 drop-shadow-[0_0_6px_#f87171]" title="Circum Inflamare">🔥</span>
              )}
            </p>
            {/* Escudo da casa + HP */}
            <div className="flex items-center justify-between">
              {HOUSE_CREST[duelist.house] ? (
                <img src={HOUSE_CREST[duelist.house]} alt={duelist.house} className="h-10 w-10 object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" />
              ) : (
                <span className="text-2xl">🪄</span>
              )}
              <span className="text-xs font-semibold text-amber-200">{Math.max(0, Math.min(100, (getTotalHP(duelist.hp) / (duelist.house === "slytherin" ? 400 : 500)) * 100))}%</span>
            </div>
            {/* Debuffs */}
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
        {dead && <Badge className="mt-2 border border-red-700 bg-red-950 text-[10px] text-red-200">{ui.eliminated}</Badge>}
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

  return (
    <div className="min-h-screen bg-stone-800 font-serif text-amber-100">
      <header className="border-b-4 border-amber-900 bg-stone-950/90 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-300">⚔️ {locale === 'en' ? 'Duel Arena' : 'Arena de Duelo'}</h1>
          <div className="flex items-center gap-2">
            <Button onClick={cycleLocale} className="border-amber-700 bg-stone-900/80 text-amber-300 hover:bg-amber-800/60">
              {locale === 'pt' ? '🇺🇸 EN' : '🇧🇷 PT'}
            </Button>
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">{String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}</Badge>
            <Badge className="border-amber-700 bg-stone-900/80 text-amber-300">
              {{ selecting: ui.spells, resolving: ui.awaitingServer, animating: ui.awaitingServer, finished: ui.gameEnded, waiting: ui.waiting, idle: ui.offline }[battleStatus] ?? battleStatus}
            </Badge>
            {playerBuild.gameMode === "torneio-offline" && <Badge className="border-purple-700 bg-purple-950/40 text-purple-200">{TORNEIO_LABELS[Math.min(challengeStage, TORNEIO_LABELS.length - 1)]}</Badge>}
            {isReadOnlySpectator && <Badge className="border-blue-700 bg-blue-950/40 text-blue-200">{ui.spectating}</Badge>}
            {isReadOnlySpectator ? (
              <Button onClick={handleLeaveRoom} className="h-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 px-2 text-xs text-amber-200 hover:from-amber-800 hover:to-amber-900" title={ui.leave}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                {ui.leave}
              </Button>
            ) : (
              <Button onClick={handleLeaveRoom} className="h-8 w-8 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 p-0 text-amber-200 hover:from-amber-800 hover:to-amber-900" title={ui.leave}>
                <X className="h-4 w-4" />
              </Button>
            )}
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
          {residualBanner && (
            <div className="pointer-events-none absolute inset-0 z-[25] flex items-end justify-center pb-16">
              <p className="max-w-lg rounded-lg border-2 border-orange-500 bg-black/85 px-4 py-3 text-center text-sm font-bold text-orange-100 shadow-[0_0_24px_rgba(249,115,22,0.35)]">
                {residualBanner}
              </p>
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
          {/* ── Floating Combat Text ──────────────────────────────────────── */}
          {floatingTexts.map((fct) => (
            <div key={fct.id} className={`fct fct-${fct.type}`} style={{ left: `${fct.x}%`, top: `${fct.y}%`, transform: "translateX(-50%)" }}>
              {fct.text}
            </div>
          ))}

          {/* ── Floating Emojis ───────────────────────────────────────────── */}
          {floatingEmojis.map((fe) => {
            const d = duelists.find((x) => x.id === fe.userId)
            const isRight = d && !d.isPlayer
            return (
              <div key={fe.id} className="floating-emoji" style={{ [isRight ? "right" : "left"]: "25%", top: "25%" }}>
                {fe.emoji}
              </div>
            )
          })}

          {/* ── Floating Stickers ───────────────────────────────────────────── */}
          {floatingStickers.map((fs) => {
            const d = duelists.find((x) => x.id === fs.playerId)
            const isRight = d && !d.isPlayer
            return (
              <div key={fs.id} className="absolute z-[30] animate-bounce" style={{ [isRight ? "right" : "left"]: "25%", top: "25%" }}>
                <img src={fs.stickerUrl} alt="sticker" className="w-[25px] h-[25px] object-contain" />
              </div>
            )
          })}

          {!isOfflineMode && !gameStartAcknowledged && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-red-950/50">
              <div className="rounded-xl border border-red-600 bg-red-900/80 px-6 py-4 text-center shadow-[0_0_30px_rgba(239,68,68,0.45)]">
                <p className="text-xl font-bold tracking-wide text-red-100">
                  {isReadOnlySpectator
                    ? ui.connecting
                    : `${ui.waiting} (${roomPlayerCount}/${expectedOnlinePlayers})`}
                </p>
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
                      isTop ? "-top-10 left-1/2 -translate-x-1/2" : "-bottom-20 left-1/2 -translate-x-1/2",
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
                      {renderWand(d, "top", idx === 0 ? "-top-10 left-1/2 -translate-x-1/2" : "-top-10 left-1/2 -translate-x-1/2", idx === 0)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative p-3">
                <div className={`grid gap-3 ${bottomDuelists.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {bottomDuelists.map((d, idx) => (
                    <div key={d.id}>
                      {renderHUD(d)}
                      {renderWand(d, "bottom", idx === 0 ? "-bottom-20 left-1/2 -translate-x-1/2" : "-bottom-20 right-3", idx === 1)}
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
              <p className="mb-1 text-amber-300">{ui.waiting}</p>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: Math.max(knownBroadcastPlayers.length, roomPlayerCount) }).map((_, idx) => {
                  const isMe = idx === 0 && selfDuelistId
                  const name = roomPlayerNames[idx] || participantNames[idx] || (isMe ? playerBuild.name : `Bruxo ${idx + 1}`)
                  const label = name === playerBuild.name ? `${name} (${locale === 'pt' ? 'você' : 'you'})` : name
                  return (
                    <Badge key={idx} className="border-amber-700 bg-stone-800 text-amber-200">
                      {label}
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}
          {!isOfflineMode && !gameStartAcknowledged && (
            <p className="mb-2 text-xs text-amber-300">
              {isReadOnlySpectator
                ? `${ui.spectating}: ${ui.awaitingServer}`
                : `${ui.waiting} (${roomPlayerCount}/${expectedOnlinePlayers})...`}
            </p>
          )}
          {!isOfflineMode && !socketConnected && !gameStartAcknowledged && (
            <p className="mb-2 text-xs text-amber-300">{ui.connecting}</p>
          )}
          {isReadOnlySpectator && <p className="mb-2 text-xs text-blue-300">{ui.commandsDisabled}</p>}
          {playerDefeated && !gameOver && (
            <div className="mb-3 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-center">
              <p className="text-sm font-bold text-red-300">💀 {ui.eliminated}</p>
              <p className="text-xs text-red-400/80">{locale === 'pt' ? 'Agora é espectador — acompanhe a batalha até o fim.' : 'Now spectating — watch the battle until the end.'}</p>
              {(() => {
                const survivors = duelists.filter((d) => !isDefeated(d.hp) && d.id !== selfDuelistId)
                return survivors.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-300/70">{locale === 'pt' ? 'Sobreviventes:' : 'Survivors:'} {survivors.map((d) => d.name).join(", ")}</p>
                ) : null
              })()}
            </div>
          )}
          {!playerDefeated && battleStatus === "selecting" && !isOnlineMatch && selfDuelistId && pendingActions[selfDuelistId] && (
            <p className="mb-2 text-xs text-amber-300">{ui.waiting}...</p>
          )}
          {!playerDefeated && awaitingServerAck && (
            <p className="mb-2 text-xs text-amber-300">{ui.awaitingServer}</p>
          )}
          {playerCannotAct && !playerDefeated && selfDuelistId && !pendingActions[selfDuelistId] && <p className="mb-2 text-xs text-red-300">{ui.stunFreeze}</p>}
          {pendingSpell && <p className="mb-2 text-xs text-amber-300">{ui.spellSelected} {(() => {
            const spell = SPELL_DATABASE.find(s => s.name === pendingSpell)
            return spell ? (locale === 'pt' ? (spell.namePt || spell.name) : spell.name) : pendingSpell
          })()}. {ui.chooseTarget}</p>}

          {!isReadOnlySpectator && !playerDefeated && (isOnlineMatch ? !awaitingServerAck : !selfDuelistId || !pendingActions[selfDuelistId]) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {handSpellList.map((spell) => {
                const mana = player?.spellMana?.[spell]
                const info = getSpellInfo(spell, SPELL_DATABASE)
                const tauntLock = player?.debuffs.some((d) => d.type === "taunt") && player?.lastSpellUsed
                const disabledByDebuff = (player?.disabledSpells?.[spell] ?? 0) > 0
                const hasSeminviso = playerBuild.wand === "seminviso"
                const isLocked = lockedSpell === spell
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
                  <div key={spell} className="relative">
                    {hasSeminviso && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isLocked) {
                            setLockedSpell(null)
                          } else {
                            setLockedSpell(spell)
                          }
                        }}
                        className={`absolute -top-2 right-0 z-10 p-0.5 rounded text-xs ${isLocked ? "text-amber-300" : "text-stone-500 hover:text-amber-300"} transition-colors`}
                        title={isLocked ? locale === 'pt' ? "Desbloquear magia" : "Unlock spell" : locale === 'pt' ? "Bloquear magia (imune a Expulso, Obliviate, Petrificus)" : "Lock spell (immune to Expulso, Obliviate, Petrificus)"}
                      >
                        {isLocked ? "🔒" : "🔓"}
                      </button>
                    )}
                    <Button disabled={disabled} onClick={() => onSpellClick(spell)} className={`touch-manipulation select-none border border-amber-700 text-amber-100 ${pendingSpell === spell ? "bg-amber-600" : "bg-gradient-to-b from-amber-800 to-amber-900 hover:from-amber-700 hover:to-amber-800"}`}>
                      <Wand2 className="mr-1 h-3.5 w-3.5" />
                      {(() => {
                        const spellInfo = SPELL_DATABASE.find(s => s.name === spell)
                        const displayName = spellInfo ? (locale === 'pt' ? (spellInfo.namePt || spellInfo.name) : spellInfo.name) : spell
                        return displayName
                      })()} ({mana?.current}/{mana?.max} {ui.mana} | {info?.accuracy || 0}%{disabledByDebuff ? ` | 🔒${player?.disabledSpells?.[spell]}t` : ""})
                    </Button>
                  </div>
                )
              })}
              <Button
                disabled={
                  potionUsed ||
                  !!gameOver ||
                  battleStatus !== "selecting" ||
                  playerDefeated ||
                  !isBattleReady ||
                  (isOnlineMatch && !gameStartAcknowledged) ||
                  awaitingServerAck ||
                  !!(player?.debuffs.some((d) => d.type === "no_potion"))
                }
                onClick={usePotion}
                title={potionUsed ? ui.potionAlreadyUsed : undefined}
                className={`touch-manipulation select-none border border-purple-700 text-purple-100 ${potionUsed ? "bg-stone-800 opacity-50 cursor-not-allowed" : "bg-purple-900 hover:bg-purple-800"}`}
              >
                <FlaskConical className="mr-1 h-3.5 w-3.5" />
                {POTION_NAMES[playerBuild.potion] || locale === 'pt' ? "Poção" : "Potion"}
                {potionUsed && locale === 'pt' ? " (usada)" : " (used)"}
              </Button>
              <Button
                disabled={
                  !!gameOver ||
                  battleStatus !== "selecting" ||
                  playerDefeated ||
                  !isBattleReady ||
                  (isOnlineMatch && !gameStartAcknowledged) ||
                  awaitingServerAck ||
                  playerCannotAct ||
                  (player?.parryUses ?? 0) >= 3
                }
                onClick={() => setIsParryingActive(!isParryingActive)}
                title={`${ui.parry}: ${locale === 'pt' ? "Se o oponente usar o mesmo feitiço, você reflete o dobro de dano" : "If opponent uses same spell, reflect double damage"} (${ui.parryCost}). ${ui.parryUses}: ${3 - (player?.parryUses ?? 0)}/3`}
                className={`touch-manipulation select-none border border-green-700 text-green-100 ${isParryingActive ? "bg-green-600 animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.8)]" : "bg-gradient-to-b from-green-800 to-green-900 hover:from-green-700 hover:to-green-800"} ${(player?.parryUses ?? 0) >= 3 ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                ⚔️ {ui.parry} ({3 - (player?.parryUses ?? 0)}/3)
              </Button>
            </div>
          )}

          {/* ── Painel de Expressões (Emojis) ─────────────────────────────── */}
          {isOnlineMatch && !isReadOnlySpectator && selfDuelistId && socketRef.current?.connected && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-amber-400/70">{locale === 'pt' ? "Reações:" : "Reactions:"}</span>
              {["😂", "😭", "😲", "😡", "🤫", "👍"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-xl transition-transform hover:scale-125 active:scale-95"
                  title={`${locale === 'pt' ? "Enviar" : "Send"} ${emoji}`}
                  onClick={() => {
                    socketRef.current?.emit("send_emoji", { matchId, userId: selfDuelistId, emoji })
                  }}
                >
                  {emoji}
                </button>
              ))}
              {/* Emojis exclusivos VIP */}
              {playerBuild.isVip && (
                <>
                  <span className="text-[10px] text-yellow-500/70">👑</span>
                  {["✨", "🔮", "🧙", "⚡", "💀", "🏆", "🌟", "🦄"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="text-xl transition-transform hover:scale-125 active:scale-95"
                      title={`VIP: Enviar ${emoji}`}
                      onClick={() => {
                        socketRef.current?.emit("send_emoji", { matchId, userId: selfDuelistId, emoji })
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </>
              )}
              {/* Sticker Button */}
              {unlockedStickers && unlockedStickers.length > 0 && (
                <>
                  <span className="text-[10px] text-amber-400/70">🎨</span>
                  <button
                    type="button"
                    className="relative text-xl transition-transform hover:scale-125 active:scale-95"
                    title={locale === 'pt' ? "Enviar Sticker" : "Send Sticker"}
                    onClick={() => setShowStickerPopup(!showStickerPopup)}
                  >
                    <Smile className="h-5 w-5" />
                    {showStickerPopup && (
                      <div className="absolute bottom-full right-0 mb-2 rounded-lg border border-amber-700 bg-stone-900 p-2 shadow-xl">
                        <div className="grid max-h-40 grid-cols-5 gap-1 overflow-y-auto">
                          {unlockedStickers.map((sticker) => (
                            <button
                              key={sticker}
                              type="button"
                              onClick={() => handleSendSticker(sticker)}
                              className="h-10 w-10 transition-transform hover:scale-110"
                            >
                              <img src={sticker} alt="sticker" className="h-full w-full object-contain" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                </>
              )}
              {/* Botão de Denúncia */}
              <button
                type="button"
                className="ml-auto rounded border border-red-800/60 bg-red-950/40 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-900/50"
                onClick={() => { setShowReportModal(true); setReportSent(false) }}
              >
                🚨 {locale === 'pt' ? "Relatar" : "Report"}
              </button>
            </div>
          )}
        </div>
      </main>

      {!isOfflineMode && matchId && (
        <div className="pointer-events-none fixed bottom-20 right-3 z-[90] max-w-[13rem] rounded border border-stone-600/90 bg-black/85 px-2 py-1 font-mono text-[10px] leading-tight text-stone-300 shadow-md backdrop-blur-sm">
          {socketConnected ? (
            <p className="text-green-400">[Socket: Conectado]</p>
          ) : (
            <p className="text-red-400">[Socket: Aguardando...]</p>
          )}
          <p>[Players: {roomPlayerCount}/{expectedOnlinePlayers}]</p>
          <p className="truncate" title={debugLastEvent}>
            [Evento: {debugLastEvent || "—"}]
          </p>
        </div>
      )}

      <footer className="grid gap-3 border-t-4 border-amber-900 bg-stone-950/90 p-3 md:grid-cols-2">
        <div className="rounded-lg border-2 border-amber-900 bg-stone-800/90 p-3">
          <p className="mb-2 text-xs font-bold text-amber-300">{ui.battleLog}</p>
          <div className="h-32 overflow-y-auto rounded border border-amber-800 bg-stone-900 p-2">
            {battleLog.slice(-40).map((line, i) => (
              <p key={i} className={`mb-1 battle-log-text ${line.startsWith("→") ? (line.includes("CRÍTICO") ? "text-yellow-300" : line.includes("bloqueado") ? "text-blue-300" : line.includes("errou") ? "text-stone-400" : "text-red-300") : "text-amber-100/90"}`}>{line}</p>
            ))}
          </div>
        </div>
        <div className="rounded-lg border-2 border-amber-900 bg-stone-800/90 p-3">
          <p className="mb-2 text-xs font-bold text-amber-300">{ui.chat}</p>
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

      {/* Modal de desconexão — inquebrável para PvP online */}
      {isOnlineMatch && socketDisconnected && !gameOver && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border-2 border-red-700 bg-stone-900 p-8 text-center shadow-2xl">
            <div className="mb-4 text-4xl">⚡</div>
            <h2 className="mb-2 text-xl font-bold text-red-300">Conexão perdida</h2>
            <p className="text-sm text-stone-300">Tentando reconectar automaticamente...</p>
            <p className="mt-2 text-xs text-stone-500">Não feche o app. O jogo retomará assim que a conexão for restaurada.</p>
            <div className="mt-4 flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-red-400" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Report ───────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70">
          <div className="w-full max-w-sm rounded-xl border-2 border-red-800 bg-stone-900 p-6 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-red-300">
                <AlertTriangle className="h-4 w-4" />
                Relatar Bug / Denúncia
              </h3>
              <button type="button" onClick={() => setShowReportModal(false)} className="text-stone-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {reportSent ? (
              <p className="text-sm text-green-400">✅ Relatório enviado! Obrigado.</p>
            ) : (
              <>
                <Textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Descreva o bug ou o comportamento suspeito..."
                  className="mb-3 min-h-[90px] border-stone-700 bg-stone-800 text-sm text-amber-100 placeholder:text-stone-500"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="border-stone-600 text-stone-300" onClick={() => setShowReportModal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-800 text-white hover:bg-red-700"
                    disabled={!reportText.trim()}
                    onClick={async () => {
                      if (!reportText.trim()) return
                      await submitReport(playerBuild.userId ?? "", matchId ?? null, reportText.trim())
                      setReportSent(true)
                      setReportText("")
                      setTimeout(() => setShowReportModal(false), 2000)
                    }}
                  >
                    Enviar
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
          <div className="w-full max-w-md rounded-xl border-4 border-amber-900 bg-stone-900/95 p-8 text-center shadow-2xl">
            {gameOver === "win" ? (
              <>
                <div className="mb-2 text-6xl">🏆</div>
                <h2 className="text-3xl font-bold text-amber-300">Vitória!</h2>
                <p className="mt-2 text-amber-100/80">O duelo foi vencido com honra.</p>
              </>
            ) : gameOver === "timeout" ? (
              <>
                <div className="mb-2 text-6xl">⏳</div>
                <h2 className="text-3xl font-bold text-amber-400">Tempo Esgotado!</h2>
                <p className="mt-2 text-amber-100/80">O duelo terminou sem um vencedor claro.</p>
              </>
            ) : (
              <>
                <div className="mb-2 text-6xl">💀</div>
                <h2 className="text-3xl font-bold text-red-400">Derrota</h2>
                <p className="mt-2 text-amber-100/80">Você foi derrotado. Treine e volte mais forte.</p>
              </>
            )}
            <Button onClick={handleLeaveRoom} className="mt-6 border border-amber-700 bg-gradient-to-b from-amber-900 to-amber-950 px-6 text-amber-100 hover:from-amber-800 hover:to-amber-900">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {isReadOnlySpectator ? "Voltar para o Lobby" : "Voltar ao Saguão"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DuelArena
