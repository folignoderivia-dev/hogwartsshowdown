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
  | "bomba"
  | "bloqueio_cura"
  | "damage_reduce"
  | "protego_diabol"
  | "crit_down"
  | "undead"
  | "immunity"
  | "charm"
  | "unforgivable_block"
  | "invulnerable" // Oraqui Orala: dano recebido será 0 (1 turno)

export type BattleStatus = "idle" | "selecting" | "resolving" | "finished"

export interface Debuff {
  type: DebuffType
  duration: number
  meta?: string
  /** Não pode ser removido por Finite Incantatem nem transferido */
  irremovable?: boolean
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
  /** Último dano em um único evento (Wiggenweld). */
  lastSingleHitDamageReceived?: number
  usedPotions?: string[]
  /** Poção substituída por Amortentia */
  replacedPotion?: string
  /** Morto Vivo: imortalidade no turno de ativação */
  isUndeadThisTurn?: boolean
  permanentAccBonus?: number
  cinzalWeakenStacks?: number
  occamyRepeatByTargetSpell?: Record<string, number>
  incendioCombo?: number
  /** Tônico de Dragão: bônus de prioridade no próximo turno */
  nextTurnPriorityBonus?: number
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
