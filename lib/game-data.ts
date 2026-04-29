// ============================================================================
// 🛠️ PAINEL DE BALANCEAMENTO MANUAL (GITHUB CMS)
// ============================================================================
// ATENÇÃO ADMINISTRADOR (REGRAS DE EDIÇÃO SEGURA):
// 1. Altere APENAS os valores numéricos ou palavras true/false após os dois pontos (:).
// 2. NUNCA apague as vírgulas (,) no final de cada linha.
// 3. NUNCA altere as palavras à esquerda dos dois pontos (as chaves).
// 4. NUNCA altere os "id" ou nomes internos entre aspas que servem de referência.
// 
// [GLOSSÁRIO BÁSICO DE BALANCEAMENTO]
// power: Dano base ou valor principal da magia/item.
// cost: Custo de mana/PP (geralmente 1 a 3).
// priority: Quem tem o valor maior ataca primeiro naquele turno.
// accuracy: Chance de acerto (0 a 100). 100 = nunca erra.
// canCrit: true (Pode dar dano crítico) | false (Nunca dá crítico).
// ============================================================================
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

export const WAND_PASSIVES: Record<string, { name: string; namePt?: string; description: string; descriptionPt?: string; effect: string }> = {
  // ── Núcleos Existentes (atualizados) ──────────────────────────────────────
  unicorn: {
    name: "Unicorn Hair",
    namePt: "Pelo de Unicórnio",
    description: "+10% Accuracy (except Unforgivable)",
    descriptionPt: "+10% Acerto (exceto Imperdoáveis)",
    effect: "accuracy_plus10",
  },
  dragon: {
    name: "Dragon Heartstring",
    namePt: "Coração de Dragão",
    description: "+20% Crit / -15% Accuracy",
    descriptionPt: "+20% Crit / -15% Acerto",
    effect: "crit20_acc_minus15",
  },
  phoenix: {
    name: "Phoenix Feather",
    namePt: "Pena de Fênix",
    description: "Heals 25–75 fixed HP at end of turn",
    descriptionPt: "Cura 25–75 HP fixo no fim do turno",
    effect: "phoenix_regen",
  },
  thestral: {
    name: "Thestral Hair",
    namePt: "Pelo de Testrálio",
    description: "Single damage cap: 300",
    descriptionPt: "Dano único máximo: 300",
    effect: "thestral_cap300",
  },
  basilisk: {
    name: "Basilisk Fang",
    namePt: "Presa de Basilisco",
    description: "+20% chance to apply debuffs",
    descriptionPt: "+20% chance de aplicar debuffs",
    effect: "basilisk_debuff_chance",
  },
  thunderbird: {
    name: "Pena de Pássaro Trovão",
    description: "+1 Prioridade global",
    effect: "thunder_priority",
  },
  occamy: {
    name: "Pena de Occamy",
    description: "Espelho ativo: mesmo feitiço que o alvo — −25% dano por repetição (acumula) e −10% acc por camada",
    effect: "occamy_mirror",
  },
  kelpie: {
    name: "Crina de Kelpie",
    description: "Imune a dano de Incêndio, Confringo/Confrigo e Bombarda",
    effect: "kelpie_fire_immune",
  },
  acromantula: {
    name: "Pelo de Acromântula",
    description: "+25 dano empilhável por turno completo",
    effect: "acromantula_power_stack",
  },
  rapinomonio: {
    name: "Pele de Rapinomônio",
    description: "Início: 1 spell aleatória de cada duelista com mana 0",
    effect: "rapinomonio_drain_start",
  },
  // ── Núcleos Novos ─────────────────────────────────────────────────────────
  veela: {
    name: "Cabelo de Veela",
    description: "Penalidade aleatória de Acc (0-25%) / Imune a críticos",
    effect: "veela_acc_penalty",
  },
  crupe: {
    name: "Pelo de Crupe",
    description: "Feitiços sem debuff/efeito de status: 25% chance de dano ×3",
    effect: "crupe_triple",
  },
  cinzal: {
    name: "Presa de Cinzal",
    description: "Cada golpe de 100+ de dano recebido: atacante acumula −15% dano (multiplicativo)",
    effect: "cinzal_weaken",
  },
  centauro: {
    name: "Pelo de Centauro",
    description: "Com Centauro no campo: Ferula, Episkey e Vulnera Sanetur ficam com mana 0 para todos os duelistas",
    effect: "centauro_block_heals",
  },
  hippogriff: {
    name: "Pena de Hipogrifo",
    description: "Imunidade total a MARCA e BOMBA",
    effect: "hippogriff_immune_mark_bomb",
  },
  troll: {
    name: "Pele de Trasgo",
    description: "Impede que as magias do oponente causem o dano máximo",
    effect: "troll_force_avg_damage",
  },
  oraq_orala: {
    name: "Pena de Oraqui Orala",
    description: "Ao receber Crítico: 30% chance de invulnerabilidade no próximo turno",
    effect: "oraq_orala_invuln_crit",
  },
  seminviso: {
    name: "Pelo de Seminviso",
    description: "Permite trancar 1 magia: imune a Expulso, Obliviate e Petrificus",
    effect: "seminviso_spell_lock",
  },
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
  | "crit_down"
  | "unforgivable_block"

export interface SpellInfo {
  name: string
  namePt?: string
  power?: number
  powerMin?: number
  powerMax?: number
  accuracy: number
  pp: number
  cost: number
  effect?: string
  effectPt?: string
  priority?: number
  isUnforgivable?: boolean
  debuff?: { type: SpellDebuffType; chance: number; duration?: number }
  special?: string
  /** Dano ignora a subtração de Defesa do alvo */
  ignoresDefense?: boolean
  /** false = este feitiço nunca pode causar crítico */
  canCrit?: boolean
  /** true = feitiço exclusivo para jogadores VIP */
  isVipOnly?: boolean
  /** Seminviso: magia trancada (imune a Expulso, Obliviate, Petrificus) */
  isLocked?: boolean
}

export interface PotionInfo {
  id: string
  name: string
  namePt?: string
  description: string
  descriptionPt?: string
  effect: string
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
  {
    name: "Stupefy",
    namePt: "Estupefaca",
    power: 50,                      // Dano base fixo
    accuracy: 50,                   // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "stun", chance: 100, duration: 1 },
    effect: "STUN: target loses next turn",
    effectPt: "STUN: alvo perde o próximo turno",
  },
  {
    name: "Bombarda",
    namePt: "Bombarda",
    powerMin: 50,                  // Dano mínimo
    powerMax: 150,                 // Dano máximo
    accuracy: 70,                  // Chance de acerto (0-100%)
    pp: 8,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    effect: "Area: hits all enemies",
    effectPt: "Área: atinge todos os inimigos",
  },
  {
    name: "Incendio",
    namePt: "Incêndio",
    powerMin: 25,                  // Dano mínimo
    powerMax: 80,                  // Dano máximo
    accuracy: 90,                  // Chance de acerto (0-100%)
    pp: 15,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "burn", chance: 50, duration: 2 },
    effect: "50% BURN (50 damage/turn, 2t); combo: +20% damage per consecutive use",
    effectPt: "50% BURN (50 dano/turno, 2t); combo: +20% dano por uso consecutivo",
  },
  {
    name: "Glacius",
    namePt: "Glacius",
    powerMin: 30,                  // Dano mínimo
    powerMax: 75,                  // Dano máximo
    accuracy: 70,                  // Chance de acerto (0-100%)
    pp: 15,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "freeze", chance: 20, duration: 2 },
    effect: "Critical guaranteed if target frozen; 20% FREEZE (2t)",
    effectPt: "Crítico garantido se alvo congelado; 20% FREEZE (2t)",
  },
  {
    name: "Diffindo",
    namePt: "Diffindo",
    power: 50,                     // Dano base fixo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 15,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "shield_break",
    effect: "Ignores Protego; 100 damage if target has active Protego",
    effectPt: "Ignora Protego; 100 dano se alvo tiver Protego ativo",
  },
  {
    name: "Expelliarmus",
    namePt: "Expelliarmus",
    powerMin: 25,                  // Dano mínimo
    powerMax: 80,                  // Dano máximo
    accuracy: 80,                  // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 2,                   // Modificador de ordem de turno
    debuff: { type: "damage_reduce", chance: 100, duration: 1 },
    effect: "Priority +2; -25% damage caused by target (1t)",
    effectPt: "Prioridade +2; -25% dano causado pelo alvo (1t)",
  },
  {
    name: "Depulso",
    namePt: "Depulso",
    power: 40,                     // Dano base fixo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 15,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 2,                   // Modificador de ordem de turno
    ignoresDefense: true,          // Ignora defesa do alvo
    effect: "Priority +2; never misses, damage not reduced by defense (respects Protego)",
    effectPt: "Prioridade +2; nunca erra, dano não reduzido por defesa (respeita Protego)",
  },
  {
    name: "Confrigo",
    namePt: "Confrigo",
    powerMin: 70,                  // Dano mínimo
    powerMax: 150,                 // Dano máximo
    accuracy: 65,                  // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    debuff: { type: "mark", chance: 40, duration: 2 },
    effect: "40% MARK: guaranteed crit on target (2t)",
    effectPt: "40% MARCA: crítico garantido no alvo (2t)",
  },
  {
    name: "Scarlatum",
    namePt: "Scarlatum",
    powerMin: 0,                   // Dano mínimo
    powerMax: 200,                 // Dano máximo
    accuracy: 90,                  // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    canCrit: false,                // Nunca causa crítico (0% crit fixo)
    effect: "Random damage (0-200); accuracy 90% and mana 10; cannot crit",
    effectPt: "Dano aleatório (0-200); precisão 90% e mana 10; não pode critar",
  },
  {
    name: "Subito",
    namePt: "Subito",
    powerMin: 50,                  // Dano mínimo
    powerMax: 100,                 // Dano máximo
    accuracy: 80,                  // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    debuff: { type: "bomba", chance: 100, duration: 2 },
    effect: "BOMB (2t): explosion = 25 damage per 100 HP lost by target",
    effectPt: "BOMBA (2t): explosão = 25 dano por 100 HP perdido do alvo",
  },
  {
    name: "Reducto",
    namePt: "Reducto",
    powerMin: 50,                  // Dano mínimo
    powerMax: 75,                  // Dano máximo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    debuff: { type: "silence_defense", chance: 100, duration: 2 },
    special: "reducto_buff_damage",
    effect: "DEFENSE BLOCK: disables Protegos and Salvio (2t); +50 damage per buff on target",
    effectPt: "BLOQUEIO DEFESA: desativa Protegos e Salvio (2t); +50 dano por buff no alvo",
  },
  {
    name: "Desumo Tempestas",
    namePt: "Desumo Tempestas",
    powerMin: 40,                  // Dano mínimo
    powerMax: 200,                 // Dano máximo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    effect: "Area: hits everyone on field (including self), random damage",
    effectPt: "Área: atinge todos em campo (inclusive self), dano aleatório",
  },
  {
    name: "Protego",
    namePt: "Protego",
    power: 0,                      // Dano base (escudo, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 6,                   // Modificador de ordem de turno
    special: "protego_fail_chain",
    effect: "Priority +6; fails if used in sequence; doesn't block Curses or Diffindo",
    effectPt: "Prioridade +6; falha se usado em sequência; não bloqueia Maldições nem Diffindo",
  },
  {
    name: "Ferula",
    namePt: "Ferula",
    power: 0,                      // Dano base (cura, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 2,                   // Modificador de ordem de turno
    special: "ferula_rng_heal",
    effect: "Priority +2; random heal 25-150 HP (Self)",
    effectPt: "Prioridade +2; cura aleatória de 25 a 150 HP (Self)",
  },
  {
    name: "Circum Inflamare",
    namePt: "Circum Inflamare",
    power: 0,                      // Dano base (área, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 1,                   // Modificador de ordem de turno
    debuff: { type: "burn", chance: 100, duration: 1 },
    special: "circum_area_burn",
    effect: "Area: applies BURN (50 damage/turn) to all enemies (1t)",
    effectPt: "Área: aplica BURN (50 dano/turno) em todos os inimigos (1t)",
  },
  {
    name: "Impedimenta",
    namePt: "Impedimenta",
    power: 0,                      // Dano base (debuff, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    priority: 10,                  // Modificador de ordem de turno
    debuff: { type: "no_potion", chance: 100, duration: 2 },
    effect: "Priority +10; blocks target's potion/item use (2t)",
    effectPt: "Prioridade +10; bloqueia uso de poção/item do alvo (2t)",
  },
  {
    name: "Arestum Momentum",
    namePt: "Arestum Momentum",
    powerMin: 25,                  // Dano mínimo
    powerMax: 60,                  // Dano máximo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 3,                   // Modificador de ordem de turno
    debuff: { type: "arestum_penalty", chance: 100, duration: 2 },
    effect: "Area; Priority +3; -5% enemy damage and accuracy (2t)",
    effectPt: "Área; Prioridade +3; -5% dano e acerto inimigo (2t)",
  },
  {
    name: "Obliviate",
    namePt: "Obliviate",
    power: 0,                      // Dano base (mana drain, sem dano)
    accuracy: 75,                  // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    special: "obliviate_mana",
    effect: "Halves mana of a random target spell (permanent)",
    effectPt: "Reduz pela metade a mana de um feitiço aleatório do alvo (permanente)",
  },
  {
    name: "Confundos",
    namePt: "Confundos",
    powerMin: 25,                  // Dano mínimo
    powerMax: 70,                  // Dano máximo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "confusion", chance: 40, duration: 2 },
    effect: "40% CONFUSION: target may miss turn (2t)",
    effectPt: "40% CONFUSÃO: alvo pode errar turno (2t)",
  },
  {
    name: "Crucius",
    namePt: "Crucius",
    power: 150,                    // Dano base fixo
    accuracy: 80,                  // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 3,                       // Custo de mana por uso
    isUnforgivable: true,          // Maldição imperdoável
    special: "crucius_weakness",
    effect: "CURSE: +30% damage per debuff on target (stacks)",
    effectPt: "MALDIÇÃO: +30% dano por debuff no alvo (acumula)",
  },
  {
    name: "Imperio",
    namePt: "Imperio",
    power: 0,                      // Dano base (controle, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 3,                       // Custo de mana por uso
    isUnforgivable: true,          // Maldição imperdoável
    priority: 3,                   // Modificador de ordem de turno
    debuff: { type: "taunt", chance: 100, duration: 2 },
    effect: "CURSE: blocks all spells except the last one (2t, IRREMOVABLE)",
    effectPt: "MALDIÇÃO: bloqueia todos feitiços exceto o último (2t, IRREMOVÍVEL)",
  },
  {
    name: "Avada Kedavra",
    namePt: "Avada Kedavra",
    power: 300,                    // Dano base fixo (máximo)
    accuracy: 40,                  // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 3,                       // Custo de mana por uso
    isUnforgivable: true,          // Maldição imperdoável
    special: "avada_miss_hp",
    effect: "CURSE: if missed, user loses 100 HP",
    effectPt: "MALDIÇÃO: se errar, usuário perde 100 HP",
  },
  {
    name: "Flagrate",
    namePt: "Flagrate",
    power: 50,                     // Dano base fixo
    accuracy: 50,                  // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    special: "flagrate_strip",
    effect: "Removes wand Core/passive from target",
    effectPt: "Remove Núcleo/passiva da varinha do alvo",
  },
  {
    name: "Aqua Eructo",
    namePt: "Aqua Eructo",
    power: 25,                     // Dano base fixo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 6,                   // Modificador de ordem de turno
    special: "aqua_cleanse",
    effect: "Priority +6; +25 damage per debuff on user; clears own BURN",
    effectPt: "Prioridade +6; +25 dano por debuff no usuário; limpa BURN próprio",
  },
  {
    name: "Eletricus",
    namePt: "Eletricus",
    powerMin: 50,                  // Dano mínimo
    powerMax: 100,                 // Dano máximo
    accuracy: 80,                  // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "paralysis", chance: 100, duration: 2 },
    effect: "PARALYSIS: target priority becomes 0 (2t)",
    effectPt: "PARALISIA: prioridade do alvo vira 0 (2t)",
  },
  {
    name: "Trevus",
    namePt: "Trevus",
    power: 80,                     // Dano base fixo
    accuracy: 60,                  // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "trevus_random",
    effect: "Applies 2 random debuffs on target (1t)",
    effectPt: "Aplica 2 debuffs aleatórios no alvo (1t)",
  },
  {
    name: "Pericullum",
    namePt: "Pericullum",
    powerMin: 20,                  // Dano mínimo
    powerMax: 50,                  // Dano máximo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "crit_down", chance: 100, duration: 1 },
    effect: "Reduces target crit rate by 10% (next turn)",
    effectPt: "Reduz taxa crítica do alvo em 10% (próximo turno)",
  },
  {
    name: "Rictumsempra",
    namePt: "Rictumsempra",
    powerMin: 25,                  // Dano mínimo
    powerMax: 50,                  // Dano máximo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 15,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "rictum_mana_drain",
    effect: "Reduces 1 mana from a random target spell",
    effectPt: "Reduz 1 de mana de feitiço aleatório do alvo",
  },
  {
    name: "Expulso",
    namePt: "Expulso",
    power: 0,                      // Dano base (swap, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "expulso_swap",
    effect: "Replaces 1 random target spell with another from grimoire",
    effectPt: "Substitui 1 feitiço aleatório do alvo por outro do grimório",
  },
  {
    name: "Slugs",
    namePt: "Cara de Lesma",
    power: 50,                     // Dano base fixo
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 15,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    debuff: { type: "poison", chance: 40, duration: 2 },
    effect: "40% POISON (50 damage/turn, 2t)",
    effectPt: "40% VENENO (50 dano/turno, 2t)",
  },
  {
    name: "Flagellum",
    namePt: "Flagellum",
    power: 75,                     // Dano base fixo por hit
    accuracy: 60,                  // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    canCrit: false,                // Nunca causa crítico
    special: "flagellum_multi",
    effect: "Multi-hit 1-4x; no crit; 60% accuracy per hit",
    effectPt: "Multi-hit 1-4x; sem crítico; 60% acerto por hit",
  },
  {
    name: "Lumus",
    namePt: "Lumus",
    power: 0,                      // Dano base (debuff, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "lumus_acc_down",
    effect: "Reduces 10% of target accuracy (2t)",
    effectPt: "Reduz 10% do acerto do alvo (2t)",
  },
  {
    name: "Petrificus Totales",
    namePt: "Petrificus Totales",
    power: 0,                      // Dano base (disable, sem dano)
    accuracy: 60,                  // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "petrificus_disable",
    effect: "Blocks 1 random target spell (2t)",
    effectPt: "Bloqueia 1 feitiço aleatório do alvo (2t)",
  },
  {
    name: "Salvio Hexia",
    namePt: "Salvio Hexia",
    power: 0,                      // Dano base (reflect, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    special: "salvio_reflect",
    effect: "Self: Reflect — returns up to 100% of damage received (1t)",
    effectPt: "Self: Reflect — devolve até 100% do dano recebido (1t)",
  },
  {
    name: "Sectumsempra",
    namePt: "Sectumsempra",
    power: 100,                    // Dano base fixo
    accuracy: 70,                  // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    special: "sectumsempra_lifesteal_half",
    debuff: { type: "bloqueio_cura", chance: 100, duration: 2 },
    effect: "Heals half of damage caused; HEAL_BLOCK on target (2t)",
    effectPt: "Cura metade do dano causado; BLOQUEIO_CURA no alvo (2t)",
  },
  {
    name: "Vermillious",
    namePt: "Vermillious",
    power: 25,                     // Dano base fixo por hit
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "vermillious_dynamic_hits",
    effect: "1 hit + 1 per 100 HP lost by user",
    effectPt: "1 golpe + 1 por 100 HP perdido do usuário",
  },
  {
    name: "Vulnera Sanetur",
    namePt: "Vulnera Sanetur",
    power: 0,                      // Dano base (immunity, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "vulnera_anti_debuff",
    effect: "Self: immunity to debuffs (2t)",
    effectPt: "Self: imunidade a debuffs (2t)",
  },
  {
    name: "Finite Incantatem",
    namePt: "Finite Incantatem",
    power: 0,                      // Dano base (transfer, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "finite_transfer",
    effect: "Transfers all user debuffs to target (except IRREMOVABLE)",
    effectPt: "Transfere todos os debuffs do usuário para o alvo (exceto IRREMOVÍVEIS)",
  },
  {
    name: "Fumus",
    namePt: "Fumus",
    power: 0,                      // Dano base (cleanse, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: -1,                  // Modificador de ordem de turno (age por último)
    special: "fumus_cleanse_all",
    effect: "Priority -1; clears buffs and debuffs of everyone on field (including self)",
    effectPt: "Prioridade -1; limpa buffs e debuffs de todos em campo (inclusive self)",
  },
  {
    name: "Episkey",
    namePt: "Episkey",
    power: 0,                      // Dano base (cura, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "episkey_heal_crit",
    effect: "Self: heals 50 HP and increases crit rate (2t)",
    effectPt: "Self: cura 50 HP e aumenta taxa crítica (2t)",
  },
  {
    name: "Protego Diabólico",
    namePt: "Protego Diabólico",
    power: 0,                      // Dano base (escudo, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    priority: 6,                   // Modificador de ordem de turno
    special: "protego_diabolico_shield",
    effect: "Priority +6; shield vs Curses + -15% enemy accuracy (2t)",
    effectPt: "Prioridade +6; escudo vs Maldições + -15% precisão inimiga (2t)",
  },
  {
    name: "Protego Maximo",
    namePt: "Protego Maximo",
    power: 0,                      // Dano base (escudo, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    priority: 6,                   // Modificador de ordem de turno
    special: "protego_maximo_crit_heal",
    effect: "Priority +6; Self: heals 200 HP if opponent crits on shield",
    effectPt: "Prioridade +6; Self: cura 200 HP se oponente critar no escudo",
  },
  {
    name: "Maximos",
    namePt: "Maximos",
    power: 0,                      // Dano base (buff, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 3,                   // Modificador de ordem de turno
    special: "maximos_charge",
    effect: "Priority +3; increases damage of next spell by 10-100%",
    effectPt: "Prioridade +3; aumenta dano do próximo feitiço em 10-100%",
  },
  // Novas spells
  {
    name: "Locomotor Mortis",
    namePt: "Locomotor Mortis",
    power: 0,                      // Dano base (retaliate, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 10,                        // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: -1,                  // Modificador de ordem de turno (age por último)
    canCrit: false,                // Nunca causa crítico
    special: "locomotor_retaliate",
    effect: "Priority -1; returns 25-150% of damage received in turn (no crit)",
    effectPt: "Prioridade -1; devolve 25-150% do dano recebido no turno (sem crítico)",
  },
  {
    name: "Fiantu Dure",
    namePt: "Fiantu Dure",
    power: 0,                      // Dano base (mana restore, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 3,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "fiantu_mana_restore",
    effect: "Self: restores 1-3 mana on all user spells",
    effectPt: "Self: recupera 1-3 de mana em todos os feitiços do usuário",
  },
  {
    name: "Piertotum Locomotor",
    namePt: "Piertotum Locomotor",
    power: 0,                      // Dano base (scale, sem dano base)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    priority: 4,                   // Modificador de ordem de turno
    special: "piertotum_scale",
    effect: "Priority +4; damage = 100 × opponent Curse counter",
    effectPt: "Prioridade +4; dano = 100 × contador de Maldições do oponente",
  },
  {
    name: "Branquium Remendo",
    namePt: "Branquium Remendo",
    power: 0,                      // Dano base (cura, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "branquium_heal",
    effect: "Erratic heal: heals both you and opponent",
    effectPt: "Cura errática: cura tanto você quanto o oponente",
  },
  {
    name: "Silencio",
    namePt: "Silêncio",
    power: 0,                      // Dano base (silence, sem dano)
    accuracy: 80,                  // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "silence_spell",
    effect: "If hits: silences opponent's last spell for 1 turn",
    effectPt: "Se acertar: silencia última magia do oponente por 1 turno",
  },
  {
    name: "Disillusionment",
    namePt: "Desilusão",
    power: 0,                      // Dano base (invisibility, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    special: "desilusao_invisibility",
    effect: "Self: invisibility (1t) — opponent +25% miss chance",
    effectPt: "Self: invisibilidade (1t) — oponente +25% chance de errar",
  },
  // ── Feitiços Exclusivos VIP ──────────────────────────────────────────────
  {
    name: "Legilimens",
    namePt: "Legilimens",
    power: 0,                      // Dano base (reveal, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    isVipOnly: true,               // Exclusivo para jogadores VIP
    canCrit: false,                // Nunca causa crítico
    special: "legilimens_reveal",
    effect: "👑 VIP: Reveals opponent's current Grimoire",
    effectPt: "👑 VIP: Revela o Grimório atual do oponente",
  },
  {
    name: "Fogo Maldito",
    namePt: "Fogo Maldito",
    powerMin: 80,                  // Dano mínimo
    powerMax: 300,                 // Dano máximo
    accuracy: 44,                  // Chance de acerto (0-100%)
    pp: 1,                         // Mana máxima (Power Points)
    cost: 3,                       // Custo de mana por uso
    isVipOnly: true,               // Exclusivo para jogadores VIP
    debuff: { type: "burn", chance: 100, duration: 2 },
    special: "fogo_maldito_scale",
    effect: "👑 VIP: Area; power +50 per 100 HP lost; BURN (50 damage/turn, 2t)",
    effectPt: "👑 VIP: Área; poder +50 por 100 HP perdido; BURN (50 dano/turno, 2t)",
  },
  {
    name: "Reveal Your Secrets",
    namePt: "Revele seus Segredos",
    power: 0,                      // Dano base (reveal, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    isVipOnly: true,               // Exclusivo para jogadores VIP
    canCrit: false,                // Nunca causa crítico
    special: "reveal_wand_core",
    effect: "👑 VIP: Reveals opponent's wand Core",
    effectPt: "👑 VIP: Revela o Núcleo da varinha do oponente",
  },
  {
    name: "Bombarda Maxima",
    namePt: "Bombarda Maxima",
    powerMin: 100,                 // Dano mínimo
    powerMax: 200,                 // Dano máximo
    accuracy: 65,                  // Chance de acerto (0-100%)
    pp: 8,                         // Mana máxima (Power Points)
    cost: 2,                       // Custo de mana por uso
    isVipOnly: true,               // Exclusivo para jogadores VIP
    special: "bombarda_maxima_pierce",
    effect: "👑 VIP: Area; 25% chance to ignore defense",
    effectPt: "👑 VIP: Área; 25% chance de ignorar defesa",
  },
  {
    name: "Expecto Patronum",
    namePt: "Expecto Patronum",
    power: 0,                      // Dano base (block, sem dano)
    accuracy: 100,                 // Chance de acerto (0-100%)
    pp: 5,                         // Mana máxima (Power Points)
    cost: 1,                       // Custo de mana por uso
    isVipOnly: true,               // Exclusivo para jogadores VIP
    canCrit: false,                // Nunca causa crítico
    priority: 4,                   // Modificador de ordem de turno
    debuff: { type: "unforgivable_block", chance: 100, duration: 1 },
    effect: "👑 VIP: Priority +4; blocks opponent's Curses (1t)",
    effectPt: "👑 VIP: Prioridade +4; bloqueia Maldições do alvo (1t)",
  },
]

export const POTION_DATABASE: PotionInfo[] = [
  {
    id: "wiggenweld",
    name: "Wiggenweld Potion",
    namePt: "Poção Wiggenweld",
    description: "Heals HP equal to last damage received",
    descriptionPt: "Cura HP igual ao último dano recebido",
    effect: "heal_last_damage",
  },
  {
    id: "edurus",
    name: "Edurus Potion",
    namePt: "Poção Edurus",
    description: "Clears debuffs + 1 turn of immunity",
    descriptionPt: "Limpa debuffs + 1 turno de imunidade",
    effect: "immunity_1_turn",
  },
  {
    id: "mortovivo",
    name: "Morto-Vivo Potion",
    namePt: "Poção Morto-Vivo",
    description: "HP never drops below 1 for 1 turn",
    descriptionPt: "HP não cai abaixo de 1 por 1 turno",
    effect: "undead_1_turn",
  },
  {
    id: "maxima",
    name: "Maxima Potion",
    namePt: "Poção Maxima",
    description: "+50% damage on next turn",
    descriptionPt: "+50% dano no próximo turno",
    effect: "damage_boost_50",
  },
  {
    id: "foco",
    name: "Focus Potion",
    namePt: "Poção Foco",
    description: "+10% Accuracy permanent",
    descriptionPt: "+10% Accuracy permanente",
    effect: "accuracy_plus_10",
  },
  {
    id: "merlin",
    name: "Merlin Potion",
    namePt: "Poção Merlin",
    description: "Copies opponent's last potion with +25% effectiveness",
    descriptionPt: "Copia última poção do oponente com +25% eficácia",
    effect: "copy_potion_boost",
  },
  {
    id: "dragon_tonic",
    name: "Dragon Tonic",
    namePt: "Tônico de Dragão",
    description: "Increases your priority by +4 on next turn",
    descriptionPt: "Aumenta sua prioridade em +4 no próximo turno",
    effect: "priority_plus_4",
  },
  {
    id: "despair_potion",
    name: "Despair Potion",
    namePt: "Poção do Desespero",
    description: "Reduces 3 mana from opponent based on last spell they used",
    descriptionPt: "Reduz 3 de mana do oponente baseado na última magia que ele usou",
    effect: "mana_drain_3",
  },
]
