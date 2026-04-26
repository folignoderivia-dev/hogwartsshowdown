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
  // Status de núcleos
  | "invulnerable" // Oraqui Orala: dano recebido será 0 (1 turno)
  | "invisibility" // Desilusão: oponente tem +25% chance de errar (1 turno)

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
  potion?: string
  spells: string[]
  hp: HPState
  speed: number
  debuffs: Debuff[]
  isPlayer?: boolean
  team: "player" | "enemy"
  spellMana?: Record<string, { current: number; max: number }>
  turnsInBattle?: number
  disabledSpells?: Record<string, number>
  missStreakBySpell?: Record<string, number>
  lastSingleHitDamageReceived?: number
  lastSpellUsed?: string
  incendioCombo?: number
  lastRoundSpellWasProtego?: boolean
  lastRoundSpellWasLumus?: boolean
  nextAccBonusPct?: number
  nextDamagePotionMult?: number
  damageReceivedThisTurn?: number
  /** Núcleo Occamy: contagem de repetições por alvo+feitiço */
  occamyRepeatByTargetSpell?: Record<string, number>
  /** Poções usadas nesta batalha */
  usedPotions?: string[]
  /** Poção substituída por Amortentia */
  replacedPotion?: string
  /** Morto Vivo: imortalidade no turno de ativação */
  isUndeadThisTurn?: boolean
  /** Redução fixa de dano (bônus de defesa) */
  defense?: number
  arrestoStacks?: number
  cruciusWeakness?: boolean
  wandPassiveStripped?: boolean
  circumAura?: number
  maximosChargePct?: number
  destinyBond?: boolean
  /** Bônus permanente de acurácia (Poção Foco) */
  permanentAccBonus?: number
  /** Presa de Cinzal: cada vez que o jogador causa 100+ de dano a um portador, +1 pilha (−15% dano multiplicativo por pilha). */
  cinzalWeakenStacks?: number
  /** Tônico de Dragão: bônus de prioridade no próximo turno */
  nextTurnPriorityBonus?: number
  /** Piertotum Locomotor: contador de Maldições Imperdoáveis usadas pelo jogador */
  unforgivableUsedCount?: number
  /** Silêncio: array de magias silenciadas por 1 turno */
  silencedSpells?: string[]
  /** Parry: contador de usos do Parry (limite 3 por batalha) */
  parryUses?: number
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
