export interface StoryBoss {
  id: number
  name: string
  nameEn: string
  avatar: string
  hp: number
  house: string
  wand: string
  potion: string
  spells: string[]
}

export const STORY_BOSSES: StoryBoss[] = [
  {
    id: 1,
    name: "Gilderoy Lockhart",
    nameEn: "Gilderoy Lockhart",
    avatar: "avatar7",
    hp: 500, // 5 Corações
    house: "ravenclaw",
    wand: "seminviso",
    potion: "despair_potion",
    spells: ["Obliviate", "Expulso", "Flagellum", "Scarlatum", "Silêncio", "Desilusão"]
  },
  {
    id: 2,
    name: "Harry Potter",
    nameEn: "Harry Potter",
    avatar: "avatar3",
    hp: 600, // 6 Corações
    house: "gryffindor",
    wand: "phoenix",
    potion: "wiggenweld",
    spells: ["Expelliarmus", "Expecto Patronum", "Estupefaca", "Protego", "Protego Maximo", "Lumus"]
  },
  {
    id: 3,
    name: "Draco Malfoy",
    nameEn: "Draco Malfoy",
    avatar: "avatar22",
    hp: 600, // 6 Corações
    house: "slytherin",
    wand: "dragon",
    potion: "aconito",
    spells: ["Cara de Lesma", "Confringo", "Estupefaca", "Trevus", "Maximos", "Flagrate"]
  },
  {
    id: 4,
    name: "Lucius Malfoy",
    nameEn: "Lucius Malfoy",
    avatar: "avatar11",
    hp: 700, // 7 Corações
    house: "slytherin",
    wand: "centauro",
    potion: "dragon_tonic",
    spells: ["Crucius", "Confundos", "Confrigo", "Subito"]
  },
  {
    id: 5,
    name: "Sirius Black",
    nameEn: "Sirius Black",
    avatar: "avatar1",
    hp: 700, // 7 Corações
    house: "gryffindor",
    wand: "oraq_orala",
    potion: "mortovivo",
    spells: ["Impedimenta", "Flagrate", "Expulso", "Obliviate", "Reducto", "Incendio"]
  },
  {
    id: 6,
    name: "Bellatrix Lestrange",
    nameEn: "Bellatrix Lestrange",
    avatar: "avatar19",
    hp: 700, // 7 Corações
    house: "slytherin",
    wand: "crupe",
    potion: "foco",
    spells: ["Desumo Tempestas", "Avada Kedavra", "Subito"]
  },
  {
    id: 7,
    name: "Crouch Junior",
    nameEn: "Crouch Junior",
    avatar: "avatar20",
    hp: 700, // 7 Corações
    house: "slytherin",
    wand: "cinzal",
    potion: "edurus",
    spells: ["Imperio", "Crucius", "Trevus"]
  },
  {
    id: 8,
    name: "Severo Snape",
    nameEn: "Severus Snape",
    avatar: "avatar14",
    hp: 700, // 7 Corações
    house: "slytherin",
    wand: "thestral",
    potion: "merlin",
    spells: ["Sectumsempra", "Vulnera Sanetur", "Salvio Hexia", "Avada Kedavra"]
  },
  {
    id: 9,
    name: "Filius Flitwick",
    nameEn: "Filius Flitwick",
    avatar: "flitwick",
    hp: 700, // 7 Corações
    house: "ravenclaw",
    wand: "hippogriff",
    potion: "maxima",
    spells: [] // "Todos do grimorio" - bot can choose any spell
  },
  {
    id: 10,
    name: "Lorde Voldemort",
    nameEn: "Lord Voldemort",
    avatar: "avatar8",
    hp: 700, // 7 Corações
    house: "slytherin",
    wand: "troll",
    potion: "mortovivo",
    spells: ["Avada Kedavra", "Imperio", "Crucius"]
  }
]

export function getBossByStage(stage: number): StoryBoss | undefined {
  return STORY_BOSSES.find(b => b.id === stage)
}

export function getNextStage(currentStage: number): number | null {
  const nextStage = currentStage + 1
  if (nextStage > STORY_BOSSES.length) return null
  return nextStage
}
