import type { PlayerBuild } from "./types"
import { HOUSE_GDD, HOUSE_MODIFIERS, WAND_PASSIVES, SPELL_DATABASE, rollSpellPower, formatSpellPower } from "./game-data"

export { HOUSE_GDD, HOUSE_MODIFIERS, WAND_PASSIVES, SPELL_DATABASE, rollSpellPower, formatSpellPower }
export type { SpellInfo, SpellDebuffType } from "./game-data"

export const INITIAL_PLAYER_BUILD: Partial<PlayerBuild> = {
  house: "ravenclaw",
  wand: "unicorn",
  potion: "foco",
  avatar: "bruxo01",
  spells: [],
  gameMode: "1v1",
}
