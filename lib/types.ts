export type GameMode = "teste" | "torneio-offline" | "historia" | "death-march" | "1v1" | "2v2" | "ffa" | "ffa3" | "quidditch" | "floresta" | "worldboss"

export interface CustomRoomSettings {
  bannedSpells: string[]
  bannedWands: string[]
  bannedPotions: string[]
  turnTimeout: 30 | 60 | 120 | 0
  potionLimit: number
}

export interface PlayerBuild {
  name: string
  house: string
  wand: string
  potion: string
  spells: string[]
  avatar: string
  gameMode?: GameMode
  userId?: string
  username?: string
  elo?: number
  isVip?: boolean
  isVipRoom?: boolean
  customRoomSettings?: CustomRoomSettings
}
