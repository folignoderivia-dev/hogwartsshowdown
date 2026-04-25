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
  // Novos status effects
  | "bomba"
  | "bloqueio_cura"
  | "damage_reduce"
  | "protego_diabol"
  | "crit_down"
  // Status de poções
  | "undead"    // HP não cai abaixo de 1 (1 turno)
  | "immunity"  // Imune a novos debuffs (1 turno)
  | "charm"     // Se receber buff/cura, o usuário da Amortentia recebe igual
  | "unforgivable_block" // Expecto Patronum: bloqueia Maldições do alvo (1t)

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
  /** Redução fixa de dano (bônus de defesa) */
  defense?: number
  /** Dano recebido neste turno (para Locomotor Mortis) */
  damageReceivedThisTurn?: number
  /** Poções já usadas nesta batalha (uso único garantido pelo servidor) */
  usedPotions?: string[]
  /** Bônus permanente de acurácia (Poção Foco) */
  permanentAccBonus?: number
  /** Presa de Cinzal: cada vez que o jogador causa 100+ de dano a um portador, +1 pilha (−15% dano multiplicativo por pilha). */
  cinzalWeakenStacks?: number
  /** Pena de Occamy (atacante): repetições do mesmo feitiço espelhado contra o mesmo alvo acumulam penalidade. Chave `alvoId|spellNorm`. */
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
