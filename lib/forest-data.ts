export interface ForestMonster {
  floor: number
  name: string
  nameEn: string
  image: string
  hp: number
  minDmg: number
  maxDmg: number
  accuracy: number
  opponentAccReduction: { min: number; max: number }
  passiveDescription: string
  passiveDescriptionEn: string
  passive: string
}

export const FOREST_MONSTERS: ForestMonster[] = [
  {
    floor: 1,
    name: "Diabrete da Cornualha",
    nameEn: "Cornish Pixie",
    image: "https://i.postimg.cc/sfJ3P79M/diabrete.png",
    hp: 6,
    minDmg: 25,
    maxDmg: 60,
    accuracy: 50,
    opponentAccReduction: { min: 5, max: 10 },
    passiveDescription: "Sem passiva",
    passiveDescriptionEn: "No passive",
    passive: "none"
  },
  {
    floor: 2,
    name: "Fada Mordente",
    nameEn: "Biting Fairy",
    image: "https://i.postimg.cc/dtmnVtFw/ETk-FCI4Xs-AE5Yb-P.png",
    hp: 6,
    minDmg: 20,
    maxDmg: 75,
    accuracy: 60,
    opponentAccReduction: { min: 0, max: 10 },
    passiveDescription: "Quando ela acerta tem 40% de chance de colocar o oponente para dormir (pula o próximo turno)",
    passiveDescriptionEn: "When she hits, has 40% chance to put opponent to sleep (skips next turn)",
    passive: "sleep_on_hit"
  },
  {
    floor: 3,
    name: "Vira-Lata das Trevas",
    nameEn: "Grim",
    image: "https://i.postimg.cc/PfM8LLCR/The-Grim.png",
    hp: 6,
    minDmg: 50,
    maxDmg: 200,
    accuracy: 40,
    opponentAccReduction: { min: 10, max: 20 },
    passiveDescription: "Nenhuma",
    passiveDescriptionEn: "None",
    passive: "none"
  },
  {
    floor: 4,
    name: "Barrete Vermelho",
    nameEn: "Red Cap",
    image: "https://i.postimg.cc/QM012Hcq/BARRETE.png",
    hp: 6,
    minDmg: 70,
    maxDmg: 150,
    accuracy: 50,
    opponentAccReduction: { min: 5, max: 10 },
    passiveDescription: "Sua taxa crítica começa em 25% e aumenta em 10% a cada turno",
    passiveDescriptionEn: "Critical rate starts at 25% and increases by 10% each turn",
    passive: "critical_growth"
  },
  {
    floor: 5,
    name: "Cava Charco",
    nameEn: "Dugbog",
    image: "https://i.postimg.cc/V6f041Tr/UI-T-Cottongrass-Dugbog.png",
    hp: 7,
    minDmg: 30,
    maxDmg: 80,
    accuracy: 60,
    opponentAccReduction: { min: 5, max: 20 },
    passiveDescription: "Aplica 1 turno de envenenamento a cada acerto, e é imune a debuff de veneno",
    passiveDescriptionEn: "Applies 1 turn of poison on each hit, and is immune to poison debuff",
    passive: "poison_on_hit_immune"
  },
  {
    floor: 6,
    name: "Inferi",
    nameEn: "Inferius",
    image: "https://i.postimg.cc/Xv7yk4tL/infieri.png",
    hp: 6,
    minDmg: 60,
    maxDmg: 100,
    accuracy: 70,
    opponentAccReduction: { min: 0, max: 0 },
    passiveDescription: "Imune a todos debuffs",
    passiveDescriptionEn: "Immune to all debuffs",
    passive: "immune_all_debuffs"
  },
  {
    floor: 7,
    name: "Sereiana",
    nameEn: "Mermaid",
    image: "https://i.postimg.cc/8PX8zHDn/sere-(1).png",
    hp: 6,
    minDmg: 75,
    maxDmg: 130,
    accuracy: 40,
    opponentAccReduction: { min: 5, max: 20 },
    passiveDescription: "Tem habilidade de cura aleatória e pode usar duas vezes",
    passiveDescriptionEn: "Has random healing ability and can use it twice",
    passive: "random_heal"
  },
  {
    floor: 8,
    name: "Kelpie",
    nameEn: "Kelpie",
    image: "https://i.postimg.cc/4d2v9mdb/KELPIE.png",
    hp: 6,
    minDmg: 45,
    maxDmg: 130,
    accuracy: 70,
    opponentAccReduction: { min: 5, max: 10 },
    passiveDescription: "Sempre tem a prioridade",
    passiveDescriptionEn: "Always has priority",
    passive: "priority"
  },
  {
    floor: 9,
    name: "Vampiro",
    nameEn: "Vampire",
    image: "https://i.postimg.cc/pL1nCgxP/Vampiro.png",
    hp: 6,
    minDmg: 40,
    maxDmg: 100,
    accuracy: 60,
    opponentAccReduction: { min: 5, max: 20 },
    passiveDescription: "Cada acerto ele rouba parte da vida do oponente no dano causado",
    passiveDescriptionEn: "Each hit steals part of opponent's life from damage dealt",
    passive: "life_steal"
  },
  {
    floor: 10,
    name: "Bicho Papão",
    nameEn: "Bogeyman",
    image: "https://i.postimg.cc/tC4Tc22S/bich.png",
    hp: 8,
    minDmg: 25,
    maxDmg: 80,
    accuracy: 50,
    opponentAccReduction: { min: 20, max: 20 },
    passiveDescription: "Devolve todos os debuffs que tiverem nele para o alvo no turno seguinte",
    passiveDescriptionEn: "Returns all debuffs on it to the target on the next turn",
    passive: "reflect_debuffs"
  },
  {
    floor: 11,
    name: "Hipogrifo",
    nameEn: "Hippogriff",
    image: "https://i.postimg.cc/3JqKc7yR/hq720.png",
    hp: 7,
    minDmg: 75,
    maxDmg: 100,
    accuracy: 90,
    opponentAccReduction: { min: 25, max: 25 },
    passiveDescription: "Sempre tem a prioridade, não recebe crítico",
    passiveDescriptionEn: "Always has priority, doesn't receive critical hits",
    passive: "priority_no_crit"
  },
  {
    floor: 12,
    name: "Centauro",
    nameEn: "Centaur",
    image: "https://i.postimg.cc/cLTPbB5d/centauro.png",
    hp: 7,
    minDmg: 40,
    maxDmg: 80,
    accuracy: 100,
    opponentAccReduction: { min: 15, max: 15 },
    passiveDescription: "A cada turno recebe 10% a menos de dano total",
    passiveDescriptionEn: "Receives 10% less total damage each turn",
    passive: "damage_reduction_growth"
  },
  {
    floor: 13,
    name: "Ocammy",
    nameEn: "Occamy",
    image: "https://i.postimg.cc/NMGFwDQ9/occamy-1-1800x1248-(1).png",
    hp: 8,
    minDmg: 75,
    maxDmg: 200,
    accuracy: 90,
    opponentAccReduction: { min: 15, max: 15 },
    passiveDescription: "Reflete 20% de dano passivamente de todo dano que recebe",
    passiveDescriptionEn: "Passively reflects 20% of all damage received",
    passive: "reflect_damage"
  },
  {
    floor: 14,
    name: "Erumpente",
    nameEn: "Erumpent",
    image: "https://i.postimg.cc/dtR0DgDR/erum.png",
    hp: 8,
    minDmg: 80,
    maxDmg: 100,
    accuracy: 40,
    opponentAccReduction: { min: 0, max: 0 },
    passiveDescription: "Após 6 turnos explode um dano fixo de 400",
    passiveDescriptionEn: "After 6 turns explodes for fixed 400 damage",
    passive: "explode_after_6"
  },
  {
    floor: 15,
    name: "Trasgo",
    nameEn: "Troll",
    image: "https://i.postimg.cc/prFp0TWR/trasg-(1).png",
    hp: 8,
    minDmg: 70,
    maxDmg: 150,
    accuracy: 40,
    opponentAccReduction: { min: 0, max: 0 },
    passiveDescription: "Quando acerta tem 25% de chance de atordoar",
    passiveDescriptionEn: "When hits, has 25% chance to stun",
    passive: "stun_on_hit"
  },
  {
    floor: 16,
    name: "Rapinomonio",
    nameEn: "Rapinomonio",
    image: "https://i.postimg.cc/nVGr0CfW/rapi.png",
    hp: 7,
    minDmg: 40,
    maxDmg: 175,
    accuracy: 100,
    opponentAccReduction: { min: 20, max: 20 },
    passiveDescription: "Zera a mana de uma spell aleatória do alvo a cada acerto crítico",
    passiveDescriptionEn: "Zeros mana of a random spell on target on each critical hit",
    passive: "mana_drain_on_crit"
  },
  {
    floor: 17,
    name: "Lobisomem",
    nameEn: "Werewolf",
    image: "https://i.postimg.cc/CLptLxZp/lupin-foi-transformado-em-lobisomem-quando-era-crianca-1024x580.png",
    hp: 7,
    minDmg: 100,
    maxDmg: 300,
    accuracy: 70,
    opponentAccReduction: { min: 0, max: 0 },
    passiveDescription: "Se cura completamente uma vez na batalha",
    passiveDescriptionEn: "Heals completely once during battle",
    passive: "full_heal_once"
  },
  {
    floor: 18,
    name: "Arpeu",
    nameEn: "Arpeu",
    image: "https://i.postimg.cc/FRjyPNhy/arpeu.png",
    hp: 8,
    minDmg: 100,
    maxDmg: 200,
    accuracy: 60,
    opponentAccReduction: { min: 30, max: 30 },
    passiveDescription: "Cada vez que o oponente erra, o dano do arpeu aumenta em 50%",
    passiveDescriptionEn: "Each time opponent misses, Arpeu damage increases by 50%",
    passive: "damage_on_miss"
  },
  {
    floor: 19,
    name: "Acromantula",
    nameEn: "Acromantula",
    image: "https://i.postimg.cc/6pkzzHdB/download-(2).png",
    hp: 8,
    minDmg: 75,
    maxDmg: 300,
    accuracy: 70,
    opponentAccReduction: { min: 20, max: 20 },
    passiveDescription: "Aumenta a redução de dano recebido e dano causado em 20% a cada turno",
    passiveDescriptionEn: "Increases damage reduction and damage dealt by 20% each turn",
    passive: "growth_stats"
  },
  {
    floor: 20,
    name: "Basilisco",
    nameEn: "Basilisk",
    image: "https://i.postimg.cc/NFQQX7Jq/Basilisk-FBcases.png",
    hp: 7,
    minDmg: 100,
    maxDmg: 100,
    accuracy: 100,
    opponentAccReduction: { min: 5, max: 10 },
    passiveDescription: "Imune a dano de maldição imperdoável, imune a todos debuffs, imune a efeito de poções, imune a efeito de núcleos. Cada ataque que acerta causa 2 turnos de envenenamento",
    passiveDescriptionEn: "Immune to unforgivable curse damage, immune to all debuffs, immune to potion effects, immune to wand core effects. Each hit causes 2 turns of poison",
    passive: "basilisco_immunities"
  }
]

export function getMonsterByFloor(floor: number): ForestMonster | undefined {
  return FOREST_MONSTERS.find(m => m.floor === floor)
}
