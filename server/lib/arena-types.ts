export type DebuffType =
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

export type BattleStatus = "idle" | "selecting" | "resolving" | "finished"

export interface Debuff {
  type: DebuffType
  duration: number
  meta?: string
}

export interface HPState {
  bars: number[]
}

export interface Duelist {
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
  missStreakBySpell?: Record<string, number>
  turnsInBattle?: number
  /** Oculto do frontend: absorção de dano gerada no início da partida (10–50). */
  defense?: number
  damageReceivedThisTurn?: number
  usedPotions?: string[]
  permanentAccBonus?: number
  cinzalWeakenStacks?: number
  occamyRepeatByTargetSpell?: Record<string, number>
}

export type Point = { x: number; y: number }

export type ArenaVfxState =
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
