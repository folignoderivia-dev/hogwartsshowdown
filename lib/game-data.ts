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
  unicorn:     { name: "Unicorn Hair", namePt: "Pelo de Unicórnio", description: "+10% Accuracy (except Unforgivable)", descriptionPt: "+10% Acerto (exceto Imperdoáveis)", effect: "accuracy_plus10" },
  dragon:      { name: "Dragon Heartstring", namePt: "Coração de Dragão", description: "+20% Crit / -15% Accuracy", descriptionPt: "+20% Crit / -15% Acerto", effect: "crit20_acc_minus15" },
  phoenix:     { name: "Phoenix Feather", namePt: "Pena de Fênix", description: "Heals 25–75 fixed HP at end of turn", descriptionPt: "Cura 25–75 HP fixo no fim do turno", effect: "phoenix_regen" },
  thestral:    { name: "Thestral Hair", namePt: "Pelo de Testrálio", description: "Single damage cap: 300", descriptionPt: "Dano único máximo: 300", effect: "thestral_cap300" },
  basilisk:    { name: "Basilisk Fang", namePt: "Presa de Basilisco", description: "+20% chance to apply debuffs", descriptionPt: "+20% chance de aplicar debuffs", effect: "basilisk_debuff_chance" },
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
  oraq_orala:  { name: "Pena de Oraqui Orala",      description: "Ao receber Crítico: 30% chance de invulnerabilidade no próximo turno", effect: "oraq_orala_invuln_crit" },
  seminviso:   { name: "Pelo de Seminviso",         description: "Permite trancar 1 magia: imune a Expulso, Obliviate e Petrificus", effect: "seminviso_spell_lock" },
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
  { name: "Stupefy", namePt: "Estupefaca", power: 50, accuracy: 50, pp: 10, cost: 1, debuff: { type: "stun", chance: 100, duration: 1 }, effect: "STUN: target loses next turn", effectPt: "STUN: alvo perde o próximo turno" },
  { name: "Bombarda", namePt: "Bombarda", powerMin: 50, powerMax: 150, accuracy: 70, pp: 8, cost: 1, effect: "Area: hits all enemies", effectPt: "Área: atinge todos os inimigos" },
  { name: "Incendio", namePt: "Incêndio", powerMin: 25, powerMax: 80, accuracy: 90, pp: 15, cost: 1, debuff: { type: "burn", chance: 50, duration: 2 }, effect: "50% BURN (25 damage/turn, 2t); combo: +20% damage per consecutive use", effectPt: "50% BURN (25 dano/turno, 2t); combo: +20% dano por uso consecutivo" },
  { name: "Glacius", namePt: "Glacius", powerMin: 30, powerMax: 75, accuracy: 60, pp: 15, cost: 1, debuff: { type: "freeze", chance: 20, duration: 2 }, effect: "Critical guaranteed if target frozen; 20% FREEZE (2t)", effectPt: "Crítico garantido se alvo congelado; 20% FREEZE (2t)" },
  { name: "Diffindo", namePt: "Diffindo", power: 50, accuracy: 100, pp: 15, cost: 1, special: "shield_break", effect: "Ignores Protego; 100 damage if target has active Protego", effectPt: "Ignora Protego; 100 dano se alvo tiver Protego ativo" },
  { name: "Expelliarmus", powerMin: 25, powerMax: 80, accuracy: 80, pp: 10, cost: 1, priority: 2, debuff: { type: "damage_reduce", chance: 100, duration: 1 }, effect: "Prioridade +2; -25% dano causado pelo alvo (1t)" },
  { name: "Depulso", power: 40, accuracy: 100, pp: 15, cost: 1, priority: 2, ignoresDefense: true, effect: "Prioridade +2; nunca erra, dano não reduzido por defesa (respeita Protego)" },
  { name: "Confrigo", powerMin: 70, powerMax: 150, accuracy: 65, pp: 10, cost: 1, debuff: { type: "mark", chance: 40, duration: 2 }, effect: "40% MARCA: crítico garantido no alvo (2t)" },
  { name: "Scarlatum", powerMin: 0, powerMax: 200, accuracy: 65, pp: 2, cost: 1, effect: "Dano aleatório (0-200); precisão 65% e mana 2" },
  { name: "Subito", powerMin: 50, powerMax: 100, accuracy: 80, pp: 10, cost: 1, debuff: { type: "bomba", chance: 100, duration: 2 }, effect: "BOMBA (2t): explosão = 25 dano por 100 HP perdido do alvo" },
  { name: "Reducto", power: 100, accuracy: 50, pp: 5, cost: 1, debuff: { type: "silence_defense", chance: 100, duration: 2 }, effect: "BLOQUEIO DEFESA: desativa Protegos e Salvio (2t)" },
  { name: "Desumo Tempestas", powerMin: 40, powerMax: 200, accuracy: 100, pp: 5, cost: 2, effect: "Área: atinge todos em campo (inclusive self), dano aleatório" },
  { name: "Protego", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 6, special: "protego_fail_chain", effect: "Prioridade +6; falha se usado em sequência; não bloqueia Maldições nem Diffindo" },
  { name: "Ferula", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 2, special: "ferula_rng_heal", effect: "Prioridade +2; cura aleatória de 25 a 150 HP (Self)" },
  { name: "Circum Inflamare", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 1, debuff: { type: "burn", chance: 100, duration: 1 }, special: "circum_area_burn", effect: "Área: aplica BURN em todos os inimigos (1t)" },
  { name: "Impedimenta", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 10, debuff: { type: "no_potion", chance: 100, duration: 2 }, effect: "Prioridade +10; bloqueia uso de poção/item do alvo (2t)" },
  { name: "Arestum Momentum", powerMin: 25, powerMax: 60, accuracy: 100, pp: 5, cost: 1, priority: 3, debuff: { type: "arestum_penalty", chance: 100, duration: 2 }, effect: "Área; Prioridade +3; -5% dano e acerto inimigo (2t)" },
  { name: "Obliviate", power: 0, accuracy: 75, pp: 3, cost: 1, special: "obliviate_mana", effect: "Reduz pela metade a mana de um feitiço aleatório do alvo (permanente)" },
  { name: "Confundos", powerMin: 25, powerMax: 70, accuracy: 100, pp: 10, cost: 1, debuff: { type: "confusion", chance: 40, duration: 2 }, effect: "40% CONFUSÃO: alvo pode errar turno (2t)" },
  { name: "Crucius", power: 150, accuracy: 80, pp: 3, cost: 3, isUnforgivable: true, special: "crucius_weakness", effect: "MALDIÇÃO: +30% dano por debuff no alvo (acumula)" },
  { name: "Imperio", power: 0, accuracy: 100, pp: 3, cost: 3, isUnforgivable: true, priority: 3, debuff: { type: "taunt", chance: 100, duration: 3 }, effect: "MALDIÇÃO: bloqueia todos feitiços exceto o último (3t, IRREMOVÍVEL)" },
  { name: "Avada Kedavra", power: 300, accuracy: 40, pp: 3, cost: 3, isUnforgivable: true, special: "avada_miss_hp", effect: "MALDIÇÃO: se errar, usuário perde 100 HP" },
  { name: "Flagrate", power: 50, accuracy: 70, pp: 10, cost: 1, special: "flagrate_strip", effect: "Remove Núcleo/passiva da varinha do alvo" },
  { name: "Aqua Eructo", power: 25, accuracy: 100, pp: 10, cost: 1, priority: 6, special: "aqua_cleanse", effect: "Prioridade +6; +25 dano por debuff no usuário; limpa BURN próprio" },
  { name: "Eletricus", powerMin: 50, powerMax: 100, accuracy: 80, pp: 10, cost: 1, debuff: { type: "paralysis", chance: 100, duration: 2 }, effect: "PARALISIA: prioridade do alvo vira 0 (2t)" },
  { name: "Trevus", power: 80, accuracy: 60, pp: 10, cost: 1, special: "trevus_random", effect: "Aplica 2 debuffs aleatórios no alvo (1t)" },
  { name: "Pericullum", powerMin: 20, powerMax: 50, accuracy: 100, pp: 10, cost: 1, debuff: { type: "crit_down", chance: 100, duration: 1 }, effect: "Reduz taxa crítica do alvo em 10% (próximo turno)" },
  { name: "Rictumsempra", powerMin: 25, powerMax: 50, accuracy: 100, pp: 15, cost: 1, special: "rictum_mana_drain", effect: "Reduz 1 de mana de feitiço aleatório do alvo" },
  { name: "Expulso", power: 0, accuracy: 100, pp: 5, cost: 1, special: "expulso_swap", effect: "Substitui 1 feitiço aleatório do alvo por outro do grimório" },
  { name: "Cara de Lesma", power: 50, accuracy: 100, pp: 15, cost: 1, debuff: { type: "poison", chance: 40, duration: 2 }, effect: "40% VENENO (50 dano/turno, 2t)" },
  { name: "Flagellum", power: 75, accuracy: 70, pp: 10, cost: 1, canCrit: false, special: "flagellum_multi", effect: "Multi-hit 1-4x; sem crítico" },
  { name: "Lumus", power: 0, accuracy: 100, pp: 10, cost: 1, special: "lumus_acc_down", effect: "Reduz 10% do acerto do alvo (2t)" },
  { name: "Petrificus Totales", power: 0, accuracy: 60, pp: 3, cost: 1, special: "petrificus_disable", effect: "Bloqueia 1 feitiço aleatório do alvo (2t)" },
  { name: "Salvio Hexia", power: 0, accuracy: 100, pp: 5, cost: 1, special: "salvio_reflect", effect: "Self: Reflect — devolve até 100% do dano recebido (1t)" },
  { name: "Sectumsempra", power: 100, accuracy: 60, pp: 5, cost: 1, special: "sectumsempra_lifesteal", debuff: { type: "bloqueio_cura", chance: 100, duration: 2 }, effect: "Cura o dano causado; BLOQUEIO_CURA no alvo (2t)" },
  { name: "Vermillious", power: 25, accuracy: 100, pp: 10, cost: 1, special: "vermillious_dynamic_hits", effect: "1 golpe + 1 por 100 HP perdido do usuário" },
  { name: "Vulnera Sanetur", power: 0, accuracy: 100, pp: 3, cost: 1, special: "vulnera_anti_debuff", effect: "Self: imunidade a debuffs (2t)" },
  { name: "Finite Incantatem", power: 0, accuracy: 100, pp: 5, cost: 1, special: "finite_transfer", effect: "Transfere todos os debuffs do usuário para o alvo (exceto IRREMOVÍVEIS)" },
  { name: "Fumus", power: 0, accuracy: 100, pp: 10, cost: 1, priority: -1, special: "fumus_cleanse_all", effect: "Prioridade -1; limpa buffs e debuffs de todos em campo (inclusive self)" },
  { name: "Episkey", power: 0, accuracy: 100, pp: 5, cost: 1, special: "episkey_heal_crit", effect: "Self: cura 50 HP e aumenta taxa crítica (2t)" },
  { name: "Protego Diabólico", power: 0, accuracy: 100, pp: 3, cost: 1, priority: 6, special: "protego_diabolico_shield", effect: "Prioridade +6; escudo vs Maldições + -15% precisão inimiga (2t)" },
  { name: "Protego Maximo", power: 0, accuracy: 100, pp: 3, cost: 1, priority: 6, special: "protego_maximo_crit_heal", effect: "Prioridade +6; Self: cura 200 HP se oponente critar no escudo" },
  { name: "Maximos", power: 0, accuracy: 100, pp: 5, cost: 1, priority: 3, special: "maximos_charge", effect: "Prioridade +3; aumenta dano do próximo feitiço em 10-100%" },
  // Novas spells
  { name: "Locomotor Mortis", power: 0, accuracy: 100, pp: 10, cost: 1, priority: -1, canCrit: false, special: "locomotor_retaliate", effect: "Prioridade -1; devolve 25-150% do dano recebido no turno (sem crítico)" },
  { name: "Fiantu Dure", power: 0, accuracy: 100, pp: 3, cost: 1, special: "fiantu_mana_restore", effect: "Self: recupera 1-3 de mana em todos os feitiços do usuário" },
  { name: "Piertotum Locomotor", power: 0, accuracy: 100, pp: 5, cost: 1, priority: 4, special: "piertotum_scale", effect: "Prioridade +4; dano = 100 × contador de Maldições do oponente" },
  { name: "Branquium Remendo", power: 0, accuracy: 100, pp: 5, cost: 2, special: "branquium_heal", effect: "Cura errática: cura tanto você quanto o oponente" },
  { name: "Silêncio", power: 0, accuracy: 80, pp: 5, cost: 1, special: "silence_spell", effect: "Se acertar: silencia última magia do oponente por 1 turno" },
  { name: "Desilusão", power: 0, accuracy: 100, pp: 5, cost: 1, special: "desilusao_invisibility", effect: "Self: invisibilidade (1t) — oponente +25% chance de errar" },
  // ── Feitiços Exclusivos VIP ──────────────────────────────────────────────
  { name: "Legilimens", power: 0, accuracy: 100, pp: 5, cost: 2, isVipOnly: true, canCrit: false, special: "legilimens_reveal", effect: "👑 VIP: Revela o Grimório atual do oponente" },
  { name: "Fogo Maldito", powerMin: 100, powerMax: 100, accuracy: 44, pp: 5, cost: 2, isVipOnly: true, debuff: { type: "burn", chance: 100, duration: 2 }, special: "fogo_maldito_scale", effect: "👑 VIP: Área; poder +50 por 100 HP perdido; BURN (2t)" },
  { name: "Revele seus Segredos", power: 0, accuracy: 100, pp: 5, cost: 2, isVipOnly: true, canCrit: false, special: "reveal_wand_core", effect: "👑 VIP: Revela o Núcleo da varinha do oponente" },
  { name: "Bombarda Maxima", powerMin: 100, powerMax: 200, accuracy: 65, pp: 8, cost: 3, isVipOnly: true, special: "bombarda_maxima_pierce", effect: "👑 VIP: Área; 25% chance de ignorar defesa" },
  { name: "Expecto Patronum", power: 0, accuracy: 100, pp: 5, cost: 2, isVipOnly: true, canCrit: false, priority: 4, debuff: { type: "unforgivable_block", chance: 100, duration: 1 }, effect: "👑 VIP: Prioridade +4; bloqueia Maldições do alvo (1t)" },
]

export const POTION_DATABASE: PotionInfo[] = [
  { id: "wiggenweld", name: "Wiggenweld Potion", namePt: "Poção Wiggenweld", description: "Heals HP equal to last damage received", descriptionPt: "Cura HP igual ao último dano recebido", effect: "heal_last_damage" },
  { id: "edurus", name: "Edurus Potion", namePt: "Poção Edurus", description: "Clears debuffs + 1 turn of immunity", descriptionPt: "Limpa debuffs + 1 turno de imunidade", effect: "immunity_1_turn" },
  { id: "mortovivo", name: "Morto-Vivo Potion", namePt: "Poção Morto-Vivo", description: "HP never drops below 1 for 1 turn", descriptionPt: "HP não cai abaixo de 1 por 1 turno", effect: "undead_1_turn" },
  { id: "maxima", name: "Maxima Potion", namePt: "Poção Maxima", description: "+50% damage on next turn", descriptionPt: "+50% dano no próximo turno", effect: "damage_boost_50" },
  { id: "foco", name: "Focus Potion", namePt: "Poção Foco", description: "+10% Accuracy permanent", descriptionPt: "+10% Accuracy permanente", effect: "accuracy_plus_10" },
  { id: "merlin", name: "Merlin Potion", namePt: "Poção Merlin", description: "Copies opponent's last potion with +25% effectiveness", descriptionPt: "Copia última poção do oponente com +25% eficácia", effect: "copy_potion_boost" },
  { id: "dragon_tonic", name: "Dragon Tonic", namePt: "Tônico de Dragão", description: "Increases your priority by +4 on next turn", descriptionPt: "Aumenta sua prioridade em +4 no próximo turno", effect: "priority_plus_4" },
  { id: "despair_potion", name: "Despair Potion", namePt: "Poção do Desespero", description: "Reduces 3 mana from opponent based on last spell they used", descriptionPt: "Reduz 3 de mana do oponente baseado na última magia que ele usou", effect: "mana_drain_3" },
]
