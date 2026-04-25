export type DuelActionType = "cast" | "skip" | "potion" | "surrender"

/** Ação enfileirada por duelista (preparado para WebSockets / host remoto). */
export interface RoundAction {
  casterId: string
  type: DuelActionType
  eventId?: string
  turnId?: number
  spellName?: string
  baseDamage?: number
  targetId?: string
  areaAll?: boolean
  potionType?: string
  isParrying?: boolean
}

/** Monta ação de lançamento (ex.: fila WebSocket → cliente aplica na arena). */
export function createCastAction(
  casterId: string,
  spellName: string,
  opts?: { targetId?: string; areaAll?: boolean }
): RoundAction {
  return {
    casterId,
    type: "cast",
    spellName,
    targetId: opts?.targetId,
    areaAll: opts?.areaAll,
  }
}

export function createSkipAction(casterId: string): RoundAction {
  return { casterId, type: "skip" }
}

export function createPotionAction(casterId: string, potionType: string): RoundAction {
  return { casterId, type: "potion", potionType }
}
