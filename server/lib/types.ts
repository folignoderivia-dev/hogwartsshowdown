export type GameMode = "teste" | "challenge" | "1v1" | "2v2" | "ffa" | "ffa3" | "quidditch"

export interface PlayerBuild {
  name: string
  house: string
  wand: string
  potion: string
  spells: string[]
  avatar: string
  gameMode: GameMode
  userId?: string
  username?: string
  elo?: number
}
