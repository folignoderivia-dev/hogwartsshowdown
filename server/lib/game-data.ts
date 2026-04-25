export const HOUSE_MODIFIERS: Record<string, { speed: number; mana: number; damage: number; defense: number }> = {
  gryffindor: { speed: 1.15, mana: 1, damage: 1, defense: 1 },
  slytherin: { speed: 1.05, mana: 1, damage: 1, defense: 1 },
  ravenclaw: { speed: 1, mana: 1, damage: 1, defense: 1 },
  hufflepuff: { speed: 0.95, mana: 1, damage: 1, defense: 1 },
}

export const HOUSE_GDD = {
  // Grifinória: +2 prioridade global / -2 mana em todas as spells
  gryffindor: { attackPriorityBonus: 2, manaStartDelta: -2 },
  // Sonserina: +25% crit chance / começa com 400 HP (4 barras)
  slytherin: { critBonus: 0.25, startHpBars: 4 },
  // Corvinal: +3 mana máximo em spells não-Imperdoáveis
  ravenclaw: { manaBonusNonUnforgivable: 3 },
  // Lufa-Lufa: 10% espinhos (reflete dano) / -3 prioridade global
  hufflepuff: { thornsPercent: 0.10, attackPriorityBonus: -3 },
} as const

export const WAND_PASSIVES: Record<string, { name: string; description: string; effect: string }> = {
  // ── Núcleos Existentes (atualizados) ──────────────────────────────────────
  unicorn:     { name: "Pelo de Unicórnio",       description: "+10% Acerto (exceto Imperdoáveis)",                      effect: "accuracy_plus10" },
  dragon:      { name: "Coração de Dragão",        description: "+20% Crit / -15% Acerto",                               effect: "crit20_acc_minus15" },
  phoenix:     { name: "Pena de Fênix",            description: "Cura 25–75 HP fixo no fim do turno",                    effect: "phoenix_regen" },
  thestral:    { name: "Pelo de Testrálio",         description: "Dano único máximo: 300",                                effect: "thestral_cap300" },
  basilisk:    { name: "Presa de Basilisco",        description: "+20% chance de aplicar debuffs",                        effect: "basilisk_debuff_chance" },
  thunderbird: { name: "Pena de Pássaro Trovão",   description: "+1 Prioridade global",                                  effect: "thunder_priority" },
  occamy:      { name: "Pena de Occamy",            description: "Espelho ativo: mesmo feitiço que o alvo — −25% dano por repetição (acumula) e −10% acc por camada", effect: "occamy_mirror" },
  kelpie:      { name: "Crina de Kelpie",           description: "Imune a dano de Incêndio, Confringo/Confrigo e Bombarda", effect: "kelpie_fire_immune" },
  acromantula: { name: "Pelo de Acromântula",       description: "+25 dano empilhável por turno completo",               effect: "acromantula_power_stack" },
  rapinomonio: { name: "Pele de Rapinomônio",       description: "Início: 1 spell aleatória de cada duelista com mana 0", effect: "rapinomonio_drain_start" },
  // ── Núcleos Novos ─────────────────────────────────────────────────────────
  veela:       { name: "Cabelo de Veela",           description: "Penalidade aleatória de Acc (0-25%) / Imune a críticos", effect: "veela_acc_penalty" },
  crupe:       { name: "Pelo de Crupe",             description: "Feitiços sem debuff/efeito de status: 25% chance de dano ×3", effect: "crupe_triple" },
  cinzal:      { name: "Presa de Cinzal",           description: "Cada golpe de 100+ de dano recebido: atacante acumula −15% dano (multiplicativo)", effect: "cinzal_weaken" },
  centauro:    { name: "Pelo de Centauro",           description: "Com Centauro no campo: Ferula, Episkey e Vulnera Sanetur ficam com mana 0 para todos os duelistas", effect: "centauro_block_heals" },
  hippogriff:  { name: "Pena de Hipogrifo",          description: "Imunidade total a MARCA e BOMBA",                     effect: "hippogriff_immune_mark_bomb" },
  troll:       { name: "Pele de Trasgo",            description: "Impede que as magias do oponente causem o dano máximo", effect: "troll_force_avg_damage" },
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
  | "unforgivable_block"

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
  /** true = feitiço exclusivo para jogadores VIP */
  isVipOnly?: boolean
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
  { name: "Estupefaca", powerMin: 15, powerMax: 60, accuracy: 50, pp: 7, cost: 1, debuff: { type: "stun", chance: 100, duration: 1 }, effect: "100% STUN (proximo turno)" },
  { name: "Bombarda", powerMin: 50, powerMax: 140, accuracy: 70, pp: 8, cost: 1, debuff: { type: "burn", chance: 50, duration: 2 }, effect: "Area: todos inimigos" },
  { name: "Incendio", powerMin: 25, powerMax: 60, accuracy: 90, pp: 15, cost: 1, debuff: { type: "burn", chance: 50, duration: 2 }, effect: "50% BURN; combo: +20% dano por uso consecutivo" },
  { name: "Glacius", powerMin: 30, powerMax: 70, accuracy: 70, pp: 15, cost: 1, debuff: { type: "freeze", chance: 20, duration: 2 }, effect: "20% [FREEZE] - pula o próximo turno" },
  { name: "Diffindo", power: 50, accuracy: 100, pp: 15, cost: 1, special: "shield_break", effect: "Ignora Protego" },
  { name: "Expelliarmus", powerMin: 10, powerMax: 50, accuracy: 80, pp: 10, cost: 1, priority: 1, debuff: { type: "disarm", chance: 100, duration: 3 }, effect: "DISARM nucleo 3 turnos" },
  { name: "Depulso", power: 40, accuracy: 100, pp: 15, cost: 1 },
  { name: "Confrigo", powerMin: 70, powerMax: 150, accuracy: 70, pp: 10, cost: 1, debuff: { type: "mark", chance: 15, duration: 2 }, effect: "MARCA +20% dano recebido" },
  { name: "Scarlatum", powerMin: 1, powerMax: 300, accuracy: 65, pp: 2, cost: 1, priority: 1, effect: "Dano aleatório; precisão 65% e mana 2" },
  { name: "Subito", powerMin: 30, powerMax: 90, accuracy: 100, pp: 10, cost: 1, debuff: { type: "bomba", chance: 100, duration: 2 }, effect: "BOMBA (2t): explosão escala com HP perdido do alvo" },
  { name: "Reducto", power: 100, accuracy: 50, pp: 5, cost: 1, debuff: { type: "silence_defense", chance: 100, duration: 2 }, effect: "Desativa defesas 2 turnos" },
  { name: "Desumo Tempestas", powerMin: 50, powerMax: 200, accuracy: 100, pp: 5, cost: 2, effect: "Todos em campo incl. atacante" },
  { name: "Protego", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 4, special: "protego_fail_chain", effect: "Self, falha se consecutivo" },
  { name: "Ferula", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 1, special: "ferula_rng_heal", effect: "Self, cura RNG de 10 a 150% HP" },
  { name: "Circum Inflamare", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 1, special: "circum_thorns", effect: "Self, atacantes ganham BURN 1t" },
  { name: "Impedimenta", power: 0, accuracy: 100, pp: 10, cost: 1, debuff: { type: "no_potion", chance: 100, duration: 99 }, effect: "Alvo nao usa pocao" },
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
  // ── Feitiços Exclusivos VIP ──────────────────────────────────────────────
  { name: "Legilimens", power: 0, accuracy: 100, pp: 5, cost: 2, isVipOnly: true, special: "legilimens_reveal", effect: "VIP: Revela o Grimório atual do oponente" },
  { name: "Fogo Maldito", powerMin: 100, powerMax: 100, accuracy: 44, pp: 5, cost: 2, isVipOnly: true, debuff: { type: "burn", chance: 100, duration: 2 }, special: "fogo_maldito_scale", effect: "VIP: Área; poder +50 por 100 HP perdido; BURN (2t)" },
  { name: "Revele seus Segredos", power: 0, accuracy: 100, pp: 5, cost: 2, isVipOnly: true, special: "reveal_wand_core", effect: "VIP: Revela o Núcleo da varinha do oponente" },
  { name: "Bombarda Maxima", powerMin: 100, powerMax: 200, accuracy: 65, pp: 8, cost: 3, isVipOnly: true, special: "bombarda_maxima_pierce", effect: "VIP: Área; 25% chance de ignorar defesa" },
  { name: "Expecto Patronum", power: 0, accuracy: 100, pp: 5, cost: 2, isVipOnly: true, priority: 4, debuff: { type: "unforgivable_block", chance: 100, duration: 1 }, effect: "VIP: Prioridade +4; bloqueia Maldições do alvo (1t)" },
]
