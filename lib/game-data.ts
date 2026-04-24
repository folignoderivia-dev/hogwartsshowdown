export const HOUSE_MODIFIERS: Record<string, { speed: number; mana: number; damage: number; defense: number }> = {
  gryffindor: { speed: 1.15, mana: 1, damage: 1, defense: 1 },
  slytherin: { speed: 1.05, mana: 1, damage: 1, defense: 1 },
  ravenclaw: { speed: 1, mana: 1, damage: 1, defense: 1 },
  hufflepuff: { speed: 0.95, mana: 1, damage: 1, defense: 1 },
}

export const HOUSE_GDD = {
  gryffindor: { attackPriorityBonus: 1, manaStartDelta: -2 },
  slytherin: { outgoingDamageMult: 1.15, extraCritTakenChance: 0.15 },
  ravenclaw: { manaBonusNonUnforgivable: 3 },
  hufflepuff: { incomingDamageMult: 0.85, attackPriorityBonus: -1 },
} as const

export const WAND_PASSIVES: Record<string, { name: string; description: string; effect: string }> = {
  unicorn: { name: "Pelo de Unicornio", description: "+10% Acerto (exceto Imperdoaveis)", effect: "accuracy_plus10" },
  dragon: { name: "Coracao de Dragao", description: "+20% crit / -10% acerto", effect: "crit20_acc_minus10" },
  phoenix: { name: "Pena de Fenix", description: "Cura 5-25% HP no fim do turno", effect: "phoenix_regen" },
  thestral: { name: "Pelo de Trestalio", description: "Endure: coracao nao zera exato (1% salvo)", effect: "thestral_endure" },
  basilisk: { name: "Presa de Basilisco", description: "+1 turno em debuffs aplicados", effect: "basilisk_debuff_duration" },
  thunderbird: { name: "Pena de Passaro Trovao", description: "+1 Prioridade", effect: "thunder_priority" },
  ocammy: { name: "Pena de Ocammy", description: "50% recoil 50% se atacado com feitico do grimorio", effect: "ocammy_parry" },
  kelpie: { name: "Crina de Kelpie", description: "Imune a Incendio e Confrigo", effect: "kelpie_fire_immune" },
  acromantula: { name: "Pelo de Acromantula", description: "+20 poder base por turno de batalha completo", effect: "acromantula_power_stack" },
  rapinomonio: { name: "Pele de Rapinomonio", description: "2 feitiços aleatórios bloqueados", effect: "rapinomonio_random_block_2" },
}

export type SpellDebuffType =
  | "burn"
  | "stun"
  | "freeze"
  | "taunt"
  | "disarm"
  | "mark"
  | "confusion"
  | "poison"
  | "paralysis"
  | "provoke"
  | "no_potion"
  | "silence_defense"
  | "damage_amp"
  | "arestum_penalty"
  | "bomba"
  | "bloqueio_cura"
  | "damage_reduce"

export interface SpellInfo {
  name: string
  power?: number
  powerMin?: number
  powerMax?: number
  accuracy: number
  pp: number
  cost: number
  effect?: string
  priority?: number
  isUnforgivable?: boolean
  debuff?: { type: SpellDebuffType; chance: number; duration?: number }
  special?: string
  /** Dano ignora a subtração de Defesa do alvo */
  ignoresDefense?: boolean
}

export function rollSpellPower(spell: SpellInfo): number {
  if (spell.powerMin != null && spell.powerMax != null) {
    return Math.floor(Math.random() * (spell.powerMax - spell.powerMin + 1)) + spell.powerMin
  }
  return spell.power ?? 0
}

export function formatSpellPower(spell: SpellInfo): string {
  if (spell.powerMin != null && spell.powerMax != null) return `${spell.powerMin}-${spell.powerMax}`
  if ((spell.power ?? 0) > 0) return String(spell.power)
  return "-"
}

export const SPELL_DATABASE: SpellInfo[] = [
  { name: "Estupefaca", power: 50, accuracy: 50, pp: 10, cost: 1, debuff: { type: "stun", chance: 100, duration: 1 }, effect: "100% STUN (proximo turno)" },
  { name: "Bombarda", powerMin: 50, powerMax: 150, accuracy: 70, pp: 8, cost: 1, effect: "Area: todos inimigos" },
  { name: "Incendio", powerMin: 25, powerMax: 80, accuracy: 90, pp: 15, cost: 1, debuff: { type: "burn", chance: 50, duration: 2 }, effect: "50% BURN (25 dano/turno, 2t)" },
  { name: "Glacius", powerMin: 30, powerMax: 75, accuracy: 60, pp: 15, cost: 1, debuff: { type: "freeze", chance: 20, duration: 2 }, effect: "Critico garantido se alvo congelado; 20% FREEZE" },
  { name: "Diffindo", power: 50, accuracy: 100, pp: 15, cost: 1, special: "shield_break", effect: "Ignora Protego; 100 dano se alvo tiver Protego ativo" },
  { name: "Expelliarmus", powerMin: 25, powerMax: 80, accuracy: 80, pp: 10, cost: 1, priority: 2, debuff: { type: "damage_reduce", chance: 100, duration: 1 }, effect: "-25% dano causado pelo alvo por 1 turno" },
  { name: "Depulso", power: 40, accuracy: 100, pp: 15, cost: 1, priority: 2, ignoresDefense: true, effect: "Dano ignora Defesa do alvo" },
  { name: "Confrigo", powerMin: 70, powerMax: 150, accuracy: 65, pp: 10, cost: 1, debuff: { type: "mark", chance: 40, duration: 2 }, effect: "40% MARCA: critico garantido no alvo" },
  { name: "Scarlatum", powerMin: 1, powerMax: 300, accuracy: 100, pp: 15, cost: 1, priority: 1, effect: "RNG puro de dano" },
  { name: "Subito", powerMin: 50, powerMax: 100, accuracy: 80, pp: 10, cost: 1, debuff: { type: "bomba", chance: 100, duration: 2 }, effect: "BOMBA: explode em 2 turnos (dano = HP faltando / 4)" },
  { name: "Reducto", power: 100, accuracy: 50, pp: 5, cost: 1, debuff: { type: "silence_defense", chance: 100, duration: 2 }, effect: "BLOQUEIO_DEFESA: desativa proteções 2 turnos" },
  { name: "Desumo Tempestas", powerMin: 50, powerMax: 200, accuracy: 100, pp: 5, cost: 2, effect: "Todos em campo incl. atacante" },
  { name: "Protego", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 6, special: "protego_fail_chain", effect: "Self, falha se consecutivo; nao bloqueia Maldições nem Diffindo" },
  { name: "Ferula", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 2, special: "ferula_rng_heal", effect: "Self, cura RNG de 25 a 150 HP" },
  { name: "Circum Inflamare", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 1, special: "circum_thorns", effect: "Self, atacantes ganham BURN 1t" },
  { name: "Impedimenta", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 10, debuff: { type: "no_potion", chance: 100, duration: 2 }, effect: "Alvo nao usa poção por 2 turnos" },
  { name: "Arestum Momentum", power: 40, accuracy: 100, pp: 5, cost: 1, special: "arestum_penalty", effect: "-5% dano e acerto do alvo (partida)" },
  { name: "Obliviate", power: 0, accuracy: 55, pp: 3, cost: 1, special: "obliviate_mana", effect: "-5 mana ultimo feitico alvo" },
  { name: "Confundos", powerMin: 30, powerMax: 80, accuracy: 100, pp: 10, cost: 1, debuff: { type: "confusion", chance: 40, duration: 2 }, effect: "40% confusao, 25% recoil proprio" },
  { name: "Crucius", powerMin: 150, powerMax: 200, accuracy: 70, pp: 3, cost: 3, isUnforgivable: true, special: "crucius_weakness", effect: "Outros feiticos -50% poder apos uso" },
  { name: "Imperio", power: 0, accuracy: 80, pp: 3, cost: 3, isUnforgivable: true, priority: 3, debuff: { type: "taunt", chance: 100, duration: 3 }, effect: "TAUNT: so ultimo feitico 3 turnos" },
  { name: "Avada Kedavra", power: 300, accuracy: 40, pp: 5, cost: 3, isUnforgivable: true, special: "avada_miss_hp", effect: "Erro: perde 100% HP (1 coracao)" },
  { name: "Flagrate", powerMin: 10, powerMax: 70, accuracy: 50, pp: 10, cost: 1, special: "flagrate_strip", effect: "30% remove passiva nucleo + DISARM 3t" },
  { name: "Aqua Eructo", powerMin: 5, powerMax: 25, accuracy: 100, pp: 10, cost: 1, priority: 0, special: "aqua_cleanse", effect: "Self, limpa BURN (prioridade +5 na arena)" },
  { name: "Eletricus", powerMin: 40, powerMax: 80, accuracy: 80, pp: 15, cost: 1, debuff: { type: "paralysis", chance: 20, duration: 2 }, effect: "PARALISIA: sem prioridade >0" },
  { name: "Trevus", power: 80, accuracy: 50, pp: 10, cost: 1, special: "trevus_random", effect: "2 debuffs aleatorios 1 turno" },
  { name: "Pericullum", powerMin: 0, powerMax: 40, accuracy: 100, pp: 15, cost: 1, debuff: { type: "provoke", chance: 100, duration: 1 }, effect: "PROVOQUE proximo turno" },
  { name: "Rictumsempra", powerMin: 10, powerMax: 40, accuracy: 90, pp: 15, cost: 1, debuff: { type: "provoke", chance: 100, duration: 1 }, special: "rictum_crit_mana", effect: "+30% crit base; 25% -1 mana feitico aleatorio alvo" },
  { name: "Expulso", power: 0, accuracy: 65, pp: 5, cost: 1, special: "expulso_swap", effect: "Substitui 1 feitico do oponente por um aleatorio do grimorio global" },
  { name: "Cara de Lesma", powerMin: 20, powerMax: 50, accuracy: 100, pp: 15, cost: 1, debuff: { type: "poison", chance: 40, duration: 3 }, effect: "40% POISON -10%/turno" },
  { name: "Flagellum", powerMin: 10, powerMax: 75, accuracy: 65, pp: 15, cost: 1, special: "flagellum_multi", effect: "Multi-hit: 1 a 3 golpes no mesmo turno (RNG)" },
  { name: "Lumus", power: 0, accuracy: 100, pp: 15, cost: 1, special: "lumus_acc_down", effect: "Reduz ACC do alvo em 20% por 2 turnos. Falha se consecutivo." },
  { name: "Petrificus Totales", power: 0, accuracy: 70, pp: 3, cost: 1, special: "petrificus_disable", effect: "Desabilita magia aleatória do alvo por 2 turnos." },
  { name: "Salvio Hexia", power: 0, accuracy: 100, pp: 5, cost: 1, special: "salvio_reflect", effect: "Self: reflete 100% do dano recebido por 1 turno." },
  { name: "Sectumsempra", power: 50, accuracy: 50, pp: 5, cost: 1, special: "sectum_multi", effect: "Se acerta, desfere de 1 a 5 golpes no mesmo turno." },
  { name: "Vermillious", power: 25, accuracy: 90, pp: 15, cost: 1, special: "vermillious_dynamic_hits", effect: "1 hit + 1 por coração perdido." },
  { name: "Vulnera Sanetur", power: 0, accuracy: 100, pp: 5, cost: 1, special: "vulnera_anti_debuff", effect: "Self: imunidade a novos debuffs por 3 turnos." },
  { name: "Finite Incantatem", power: 0, accuracy: 100, pp: 5, cost: 1, special: "finite_cleanse", effect: "Self: remove todo e qualquer debuff em si mesmo." },
  { name: "Fumus", power: 0, accuracy: 100, pp: 10, cost: 1, special: "fumus_cleanse_all", effect: "Limpa buffs e debuffs de todos em campo." },
  { name: "Episkey", power: 0, accuracy: 100, pp: 5, cost: 1, special: "episkey_heal_crit", effect: "Self: cura fixa de 50 e ganha buff de crítico por 2 turnos." },
  { name: "Protego Diabólico", power: 0, accuracy: 100, pp: 3, cost: 1, priority: 4, special: "protego_diabolico_unforgivable_acc_down", effect: "Área (exceto em si): reduz em 15% a precisão de Crucius, Avada Kedavra e Imperio por 2 turnos." },
  { name: "Protego Maximo", power: 0, accuracy: 100, pp: 2, cost: 1, priority: 6, special: "protego_maximo_unforgivable_heal", effect: "Self: ao receber Crucius/Avada/Imperio, cura totalmente a vida." },
  { name: "Maximos", power: 0, accuracy: 100, pp: 5, cost: 1, priority: 0, special: "maximos_charge", effect: "Self: proximo feitico +10% a +100% poder" },
]
