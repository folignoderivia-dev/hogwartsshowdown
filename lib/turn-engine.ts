import { HOUSE_GDD, WAND_PASSIVES, rollSpellPower, type SpellInfo } from "@/lib/data-store"
import type { DebuffType, Duelist, HPState } from "@/lib/arena-types"
import type { RoundAction } from "@/lib/duelActions"

/** Motor puro: recebe `RoundAction` em memória. Persistência Supabase usa `match_turns.action_payload` apenas na Arena. */

export interface EngineAnimation {
  type: "cast" | "skip" | "potion"
  casterId: string
  targetId?: string
  spellName?: string
  targetIds?: string[]
  isMiss?: boolean
  isCrit?: boolean
  delay?: number
  damage?: number
  isBlock?: boolean
  /** Se true, o cliente deve pular o VFX e apenas exibir o FCT (floating combat text). */
  fctOnly?: boolean
}

export interface TurnOutcome {
  newDuelists: Duelist[]
  logs: string[]
  animationsToPlay: EngineAnimation[]
  outcome: "win" | "lose" | "timeout" | null
  orderedActions: RoundAction[]
}

export const normSpell = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
export const getTotalHP = (hp: HPState) => hp.bars.reduce((sum, value) => sum + value, 0)
export const isDefeated = (hp: HPState) => getTotalHP(hp) <= 0
export const getSpellInfo = (name: string, spellDatabase: SpellInfo[]) => spellDatabase.find((s) => s.name === name)

export const isSelfTargetSpell = (spellName: string): boolean => {
  const n = normSpell(spellName)
  return (
    (n.includes("protego") && !n.includes("diabol")) ||
    n.includes("ferula") ||
    n.includes("episkey") ||
    n.includes("maximos") ||
    (n.includes("salvio") && n.includes("hexia")) ||
    (n.includes("vulnera") && n.includes("sanetur")) ||
    (n.includes("fiantu") && n.includes("dure"))
  )
}

export const isAreaSpell = (spellName: string): boolean => {
  const n = normSpell(spellName)
  return (
    n.includes("bombarda") ||
    (n.includes("desumo") && n.includes("tempestas")) ||
    n.includes("fumus") ||
    (n.includes("protego") && n.includes("diabol")) ||
    n.includes("circum") ||
    n.includes("arestum")
  )
}

export const getSpellMaxPower = (spell: SpellInfo): number => {
  if (spell.powerMin != null && spell.powerMax != null) return spell.powerMax
  return spell.power ?? 0
}

const applyDamage = (hp: HPState, amount: number, opts?: { thestral?: boolean }): HPState => {
  const bars = [...hp.bars]
  let remaining = amount
  for (let i = bars.length - 1; i >= 0; i--) {
    if (remaining <= 0) break
    if (bars[i] <= 0) continue
    const absorbed = Math.min(remaining, bars[i])
    if (opts?.thestral && bars[i] === 100 && absorbed >= 100) {
      bars[i] = 1
      remaining -= 99
      continue
    }
    bars[i] -= absorbed
    remaining -= absorbed
  }
  return { bars }
}

const healCurrentBar = (hp: HPState, amount: number): HPState => {
  const bars = [...hp.bars]
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i] > 0 && bars[i] < 100) {
      bars[i] = Math.min(100, bars[i] + amount)
      break
    }
  }
  return { bars }
}

const healFlatTotal = (hp: HPState, flat: number): HPState => {
  let left = Math.min(500, Math.max(0, Math.round(flat)))
  const bars = [...hp.bars]
  for (let i = bars.length - 1; i >= 0 && left > 0; i--) {
    const room = 100 - bars[i]
    if (room <= 0) continue
    const add = Math.min(room, left)
    bars[i] += add
    left -= add
  }
  return { bars }
}

const reduceDebuffs = (duelist: Duelist): Duelist => ({
  ...duelist,
  debuffs: duelist.debuffs
    .map((d) => ({ ...d, duration: d.duration - 1 }))
    .filter((d) => d.duration > 0),
})

export const calculateAccuracy = (attacker: Duelist, defender: Duelist, base: number, spell?: SpellInfo) => {
  let accuracy = base
  const un = spell?.isUnforgivable
  const wandJammed = attacker.wandPassiveStripped || attacker.debuffs.some((d) => d.type === "disarm")
  if (!un && !wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "accuracy_plus10") accuracy += 10
  if (!wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "crit20_acc_minus10") accuracy -= 10
  const spellNorm = normSpell(spell?.name || "")
  if (
    attacker.debuffs.some((d) => d.type === "unforgivable_acc_down") &&
    (spellNorm.includes("crucius") || spellNorm.includes("avada") || spellNorm.includes("imperio") || spellNorm.includes("imperius"))
  ) {
    accuracy -= 15
  }
  if (attacker.debuffs.some((d) => d.type === "lumus_acc_down")) accuracy -= 10
  const arestumOnAtk = attacker.debuffs.filter((d) => d.type === "arestum_penalty").length
  if (arestumOnAtk > 0) accuracy -= arestumOnAtk * 5
  if (attacker.nextAccBonusPct) accuracy += attacker.nextAccBonusPct
  return Math.max(5, Math.min(100, accuracy))
}

const rollHit = (attacker: Duelist, defender: Duelist, spell: SpellInfo, missStreak = 0) => {
  if (spell.accuracy >= 100) return true
  const pityBonus = Math.min(20, missStreak * 7)
  const finalAcc = Math.min(100, calculateAccuracy(attacker, defender, spell.accuracy, spell) + pityBonus)
  return Math.random() * 100 <= finalAcc
}

const calculateDamage = (attacker: Duelist, defender: Duelist, base: number, spellNorm?: string) => {
  let damage = base
  if (spellNorm && WAND_PASSIVES[defender.wand]?.effect === "kelpie_fire_immune") {
    const n = spellNorm
    if (n.includes("incendio") || n.includes("confrigo")) return 0
  }
  if (spellNorm?.includes("incendio") && defender.debuffs.some((d) => d.type === "burn")) {
    damage *= 2
  }
  if (attacker.house === "slytherin") damage *= HOUSE_GDD.slytherin.outgoingDamageMult
  if (defender.house === "hufflepuff") damage *= HOUSE_GDD.hufflepuff.incomingDamageMult
  // MARCA agora força critico garantido (getCritChance retorna 1.0) — sem multiplicador aqui
  if (attacker.debuffs.some((d) => d.type === "damage_amp")) damage *= 1.5
  // DAMAGE_REDUCE: atacante causa 25% menos dano
  if (attacker.debuffs.some((d) => d.type === "damage_reduce")) damage *= 0.75
  const arestumStacks = attacker.debuffs.filter((d) => d.type === "arestum_penalty").length
  if (arestumStacks > 0) damage *= Math.max(0.2, 1 - arestumStacks * 0.05)
  if (attacker.nextDamagePotionMult) damage *= attacker.nextDamagePotionMult
  return Math.round(damage)
}

const getCritChance = (attacker: Duelist, defender?: Duelist, spellNameNorm?: string): number => {
  // MARCA: critico garantido em qualquer dano recebido
  if (defender?.debuffs.some((d) => d.type === "mark")) return 1.0
  // Glacius: critico garantido se alvo estiver congelado
  if (spellNameNorm?.includes("glacius") && defender?.debuffs.some((d) => d.type === "freeze")) return 1.0
  let c = 0.25 // taxa crítica base nativa: 25%
  if (attacker.wand === "dragon") c += 0.2
  if (defender?.debuffs.some((d) => d.type === "crit_down")) c = Math.max(0, c - 0.1)
  if (attacker.debuffs.some((d) => d.type === "crit_boost")) c += 0.25
  if (defender?.house === "slytherin") c += HOUSE_GDD.slytherin.extraCritTakenChance
  return Math.min(0.95, c)
}

const rollCombatPower = (attacker: Duelist, spell: SpellInfo, sn: string, target: Duelist | null): number => {
  const n = normSpell(sn)
  // Diffindo: 100 de dano se alvo tiver Protego ativo (o spell ainda ignora o Protego)
  if (n.includes("diffindo") && target?.debuffs.some((d) => d.type === "protego")) return 100
  let base = rollSpellPower(spell)
  if (attacker.cruciusWeakness && !n.includes("crucius")) base *= 0.5
  if (attacker.maximosChargePct) base *= 1 + attacker.maximosChargePct / 100
  if (WAND_PASSIVES[attacker.wand]?.effect === "acromantula_power_stack") {
    base += (attacker.turnsInBattle ?? 0) * 20
  }
  return Math.round(base)
}

const getSpellCastPriority = (spellName: string, spell: SpellInfo | undefined, attacker: Duelist): number => {
  if (!spell) return 0
  let p = spell.priority ?? 0
  const n = normSpell(spellName)
  if (!isSelfTargetSpell(spellName) && getSpellMaxPower(spell) > 0) {
    const hg = HOUSE_GDD[attacker.house as keyof typeof HOUSE_GDD]
    if (hg && "attackPriorityBonus" in hg) p += hg.attackPriorityBonus as number
  }
  if (attacker.wand === "thunderbird") p += 1
  if (attacker.debuffs.some((d) => d.type === "paralysis")) p = Math.min(0, p)
  return p
}

const effectiveSpeed = (d: Duelist) => {
  let s = d.speed
  if (d.debuffs.some((x) => x.type === "slow")) s = Math.floor(s * 0.35)
  return s
}

export const getValidTargetsForSpell = (spellName: string, attacker: Duelist, state: Duelist[]) => {
  if (isSelfTargetSpell(spellName)) return state.filter((d) => d.id === attacker.id && !isDefeated(d.hp))
  if (isAreaSpell(spellName)) {
    const n = normSpell(spellName)
    if (n.includes("desumo")) return state.filter((d) => !isDefeated(d.hp))
    if (n.includes("protego") && n.includes("diabol")) return state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
    return state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
  }
  return state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
}

export function calculateTurnOutcome(params: {
  duelists: Duelist[]
  actions: RoundAction[]
  spellDatabase: SpellInfo[]
  turnNumber: number
  gameMode: "teste" | "challenge" | "1v1" | "2v2" | "ffa" | "ffa3"
  circumFlames: Record<string, number>
}): TurnOutcome {
  let state: Duelist[] = params.duelists.map((d) => ({ ...d, damageReceivedThisTurn: 0 }))
  const logs: string[] = []
  const animationsToPlay: EngineAnimation[] = []

  const evaluateOutcome = (s: Duelist[]) => {
    const playerAliveCount = s.filter((d) => d.team === "player" && !isDefeated(d.hp)).length
    const enemyAliveCount = s.filter((d) => d.team === "enemy" && !isDefeated(d.hp)).length
    const totalAliveCount = s.filter((d) => !isDefeated(d.hp)).length
    if (params.gameMode === "2v2") {
      if (enemyAliveCount === 0) return "win" as const
      if (playerAliveCount === 0) return "lose" as const
      return null
    }
    if (params.gameMode === "ffa" || params.gameMode === "ffa3") {
      if (totalAliveCount === 1) {
        const winner = s.find((d) => !isDefeated(d.hp))
        return winner?.isPlayer ? "win" : "lose"
      }
      return null
    }
    if (enemyAliveCount === 0) return "win" as const
    if (playerAliveCount === 0) return "lose" as const
    return null
  }

  const rankAction = (a: RoundAction) => {
    if (a.type === "skip") return -2_000_000_000
    if (a.type === "potion") return -1_500_000_000
    const da = state.find((d) => d.id === a.casterId)
    const sa = a.type === "cast" && a.spellName ? getSpellInfo(a.spellName, params.spellDatabase) : undefined
    if (da && sa && a.spellName) return getSpellCastPriority(a.spellName, sa, da)
    return -9999
  }

  const orderedActions = [...params.actions].sort((a, b) => {
    const ra = rankAction(a)
    const rb = rankAction(b)
    if (rb !== ra) return rb - ra
    const da = state.find((d) => d.id === a.casterId)
    const db = state.find((d) => d.id === b.casterId)
    return (db ? effectiveSpeed(db) : 0) - (da ? effectiveSpeed(da) : 0)
  })

  for (const action of orderedActions) {
    const attacker = state.find((d) => d.id === action.casterId)
    if (!attacker || isDefeated(attacker.hp)) {
      logs.push(`[Engine]: ação ignorada para caster inválido/morto (${action.casterId}).`)
      continue
    }

    if (action.type === "skip") {
      logs.push(`[Turno ${params.turnNumber}]: ${attacker.name} perdeu a vez!`)
      animationsToPlay.push({ type: "skip", casterId: attacker.id, targetIds: [], delay: 1200 })
      continue
    }

    if (action.type === "potion") {
      const potKey = action.potionType || "foco"
      logs.push(`[Turno ${params.turnNumber}]: ${attacker.name} usou poção (${potKey})!`)
      if (potKey === "wiggenweld") {
        state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healCurrentBar(d.hp, 100) } : d))
      } else if (potKey === "edurus") {
        state = state.map((d) => (d.id === attacker.id ? { ...d, debuffs: [] } : d))
      } else if (potKey === "mortovivo") {
        state = state.map((d) => (d.id === attacker.id ? { ...d, destinyBond: true } : d))
      } else if (potKey === "maxima") {
        state = state.map((d) => {
          if (d.id === attacker.id) return { ...d, nextDamagePotionMult: 2 }
          return { ...d, debuffs: [...d.debuffs, { type: "damage_amp" as const, duration: 1 }] }
        })
      } else if (potKey === "foco") {
        state = state.map((d) => (d.id === attacker.id ? { ...d, nextAccBonusPct: 30 } : d))
      }
      animationsToPlay.push({ type: "potion", casterId: attacker.id, targetIds: [attacker.id], targetId: attacker.id, delay: 1000 })
      if (evaluateOutcome(state)) return { newDuelists: state, logs, animationsToPlay, outcome: evaluateOutcome(state), orderedActions }
      continue
    }

    const sn = action.spellName || ""
    const spell = getSpellInfo(sn, params.spellDatabase)
    if (!spell) continue
    const n = normSpell(sn)

    const cannotAct = attacker.debuffs.some((d) => d.type === "stun" || d.type === "freeze")
    if (cannotAct) {
      logs.push(`[Turno ${params.turnNumber}]: ${attacker.name} está impossibilitado de agir!`)
      continue
    }

    // IMPERIO: só pode usar o último feitiço (IRREMOVÍVEL)
    if (attacker.debuffs.some((d) => d.type === "taunt") && attacker.lastSpellUsed && action.type === "cast") {
      if (normSpell(sn) !== normSpell(attacker.lastSpellUsed)) {
        logs.push(`→ ${attacker.name} está sob Imperio! Somente "${attacker.lastSpellUsed}" pode ser lançado (tentou: ${sn}).`)
        continue
      }
    }

    let targets: Duelist[] = []
    if (isSelfTargetSpell(sn)) {
      if (!isDefeated(attacker.hp)) targets = [attacker]
    } else if (isAreaSpell(sn)) {
      if (n.includes("desumo")) targets = state.filter((d) => !isDefeated(d.hp))
      else if (n.includes("protego") && n.includes("diabol")) targets = state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
      else targets = state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
    } else {
      const t = state.find((d) => d.id === action.targetId)
      if (t && !isDefeated(t.hp)) targets = [t]
    }
    if (targets.length === 0) continue

    animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetIds: targets.map((t) => t.id), targetId: targets[0]?.id, delay: 1200 })
    logs.push(`[Turno ${params.turnNumber}]: ${attacker.name} lançou ${sn}${isAreaSpell(sn) ? " em área" : ` em ${targets[0].name}`}!`)

    const protegoBlocks = (def: Duelist) => {
      const silenced = def.debuffs.some((d) => d.type === "silence_defense")
      const isDiffindo = n.includes("diffindo")
      const isUnforgivable = spell?.isUnforgivable ?? false
      if (silenced || isDiffindo) return false
      if (def.debuffs.some((d) => d.type === "protego") && !isUnforgivable) return true
      if (def.debuffs.some((d) => d.type === "protego_diabol") && isUnforgivable) return true
      return false
    }

    const applySpellDebuffTo = (defenderId: string) => {
      if (!spell.debuff) return
      const before = state.find((d) => d.id === defenderId)
      if (before?.debuffs.some((d) => d.type === "anti_debuff")) return
      if (Math.random() * 100 <= spell.debuff.chance) {
        let dur = spell.debuff.duration || 1
        if (WAND_PASSIVES[attacker.wand]?.effect === "basilisk_debuff_duration") dur += 1
        const meta = spell.debuff.type === "provoke" ? attacker.id : undefined
        const irremovable = n.includes("imperio") ? true : undefined
        state = state.map((d) =>
          d.id === defenderId
            ? { ...d, debuffs: [...d.debuffs, { type: spell.debuff!.type as DebuffType, duration: dur, meta, irremovable }] }
            : d
        )
      }
    }

    const applyDamageWithCircum = (defId: string, dmg: number, dealerId: string, sourceSpellNorm?: string) => {
      const def = state.find((d) => d.id === defId)
      if (!def) return
      state = state.map((d) =>
        d.id === defId
          ? { ...d, hp: applyDamage(d.hp, dmg, { thestral: d.wand === "thestral" }), damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + dmg }
          : d
      )
      if (def.debuffs.some((d) => d.type === "salvio_reflect") && dealerId !== defId && dmg > 0) {
        state = state.map((d) => (d.id === dealerId ? { ...d, hp: applyDamage(d.hp, Math.round(dmg), { thestral: d.wand === "thestral" }) } : d))
      }
      const circumOn = (def.circumAura ?? 0) > 0 || (params.circumFlames[defId] ?? 0) > 0
      if (circumOn && dealerId !== defId) {
        state = state.map((d) =>
          d.id === dealerId ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "burn"), { type: "burn", duration: 2 }] } : d
        )
      }
    }

    if (isSelfTargetSpell(sn)) {
      const isProtectionSpell = n.includes("protego") || (n.includes("salvio") && n.includes("hexia"))
      const silenceDefense = attacker.debuffs.some((d) => d.type === "silence_defense")
      const bloqueiosCura = attacker.debuffs.some((d) => d.type === "bloqueio_cura")

      if (isProtectionSpell && silenceDefense) {
        logs.push(`→ ${attacker.name} tentou usar ${sn}, mas suas defesas estão bloqueadas!`)
      } else if (n.includes("protego") && !n.includes("maximo") && !n.includes("diabol")) {
        if (!attacker.lastRoundSpellWasProtego) {
          state = state.map((d) =>
            d.id === attacker.id ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "protego"), { type: "protego", duration: 1 }], lastRoundSpellWasProtego: true } : d
          )
        }
      } else if (n.includes("ferula")) {
        if (!bloqueiosCura) {
          const healAmt = Math.floor(Math.random() * 126) + 25
          state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healFlatTotal(d.hp, healAmt) } : d))
        } else {
          logs.push(`→ ${attacker.name} tentou usar ${sn}, mas cura está bloqueada!`)
        }
      } else if (n.includes("maximos")) {
        const pct = Math.floor(Math.random() * 91) + 10
        state = state.map((d) => (d.id === attacker.id ? { ...d, maximosChargePct: pct } : d))
      } else if (n.includes("salvio") && n.includes("hexia")) {
        state = state.map((d) =>
          d.id === attacker.id ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "salvio_reflect"), { type: "salvio_reflect", duration: 1 }] } : d
        )
      } else if (n.includes("vulnera") && n.includes("sanetur")) {
        state = state.map((d) =>
          d.id === attacker.id ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "anti_debuff"), { type: "anti_debuff", duration: 2 }] } : d
        )
      } else if (n.includes("episkey")) {
        state = state.map((d) =>
          d.id === attacker.id
            ? {
                ...d,
                hp: bloqueiosCura ? d.hp : healFlatTotal(d.hp, 50),
                debuffs: [...d.debuffs.filter((x) => x.type !== "crit_boost"), { type: "crit_boost", duration: 2 }],
              }
            : d
        )
      } else if (n.includes("protego") && n.includes("maximo")) {
        state = state.map((d) =>
          d.id === attacker.id ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "protego_maximo"), { type: "protego_maximo", duration: 2 }] } : d
        )
      } else if (n.includes("fiantu") && n.includes("dure")) {
        const restore = Math.floor(Math.random() * 3) + 1
        state = state.map((d) => {
          if (d.id !== attacker.id) return d
          const sm = { ...(d.spellMana ?? {}) }
          for (const key of Object.keys(sm)) {
            sm[key] = { ...sm[key], current: Math.min(sm[key].max, sm[key].current + restore) }
          }
          return { ...d, spellMana: sm }
        })
        logs.push(`→ ${attacker.name} usou Fiantu Dure! Restaurou +${restore} de mana em todos os feitiços.`)
      }
    } else if (n.includes("fumus")) {
      state = state.map((d) => ({
        ...d,
        debuffs: [],
        disabledSpells: {},
        nextAccBonusPct: undefined,
        nextDamagePotionMult: undefined,
        maximosChargePct: undefined,
        circumAura: undefined,
        destinyBond: false,
      }))
    } else if (n.includes("circum")) {
      for (const t of targets) {
        const isEnemy = t.team !== attacker.team
        if (isEnemy) {
          state = state.map((d) =>
            d.id === t.id
              ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "burn"), { type: "burn" as const, duration: 1 }] }
              : d
          )
        }
      }
      logs.push(`→ ${attacker.name} lançou Circum Inflamare! Todos os inimigos em chamas (1t).`)
    } else if (n.includes("protego") && n.includes("diabol")) {
      for (const t of targets) {
        const isEnemy = t.team !== attacker.team
        if (isEnemy) {
          state = state.map((d) =>
            d.id === t.id
              ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "unforgivable_acc_down"), { type: "unforgivable_acc_down" as const, duration: 2 }] }
              : d
          )
        }
      }
      state = state.map((d) =>
        d.id === attacker.id
          ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "protego_diabol"), { type: "protego_diabol" as const, duration: 2 }] }
          : d
      )
      logs.push(`→ ${attacker.name} lançou Protego Diabólico! Escudo vs Maldições + -15% precisão inimiga (2t).`)
    } else if (isAreaSpell(sn) && getSpellMaxPower(spell) > 0) {
      const ignoresDefense = spell.ignoresDefense === true
      for (const t of targets) {
        const streak = attacker.missStreakBySpell?.[sn] ?? 0
        const hit = rollHit(attacker, t, spell, streak)
        if (!hit) {
          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: t.id, isMiss: true, isCrit: false, delay: 900, damage: 0, isBlock: false, fctOnly: true })
          continue
        }
        let damage = calculateDamage(attacker, t, rollCombatPower(attacker, spell, sn, t), n)
        let isCrit = false
        if (spell.canCrit !== false && Math.random() < getCritChance(attacker, t, n)) {
          damage *= 2
          isCrit = true
        }
        const bloqueadoArea = protegoBlocks(t)
        if (!bloqueadoArea && !ignoresDefense) damage = Math.max(0, damage - (t.defense ?? 0))
        if (bloqueadoArea) damage = 0
        applyDamageWithCircum(t.id, damage, attacker.id, n)
        animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: t.id, isMiss: false, isCrit, delay: 900, damage, isBlock: bloqueadoArea, fctOnly: true })
        applySpellDebuffTo(t.id)
      }
    } else {
      const ignoresDefense = spell.ignoresDefense === true
      const target = targets[0]

      // ── FLAGELLUM: multi-hit 1-4x, sem crítico ──────────────────────────────
      if (spell.special === "flagellum_multi") {
        const hitCount = Math.floor(Math.random() * 4) + 1
        let totalDmg = 0
        for (let h = 0; h < hitCount; h++) {
          const hitRoll = rollHit(attacker, target, spell, 0)
          if (!hitRoll) {
            animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: true, isCrit: false, delay: 400, damage: 0, isBlock: false, fctOnly: true })
            continue
          }
          let dmg = calculateDamage(attacker, target, rollCombatPower(attacker, spell, sn, target), n)
          const bloq = protegoBlocks(target)
          if (!bloq) dmg = ignoresDefense ? dmg : Math.max(0, dmg - (target.defense ?? 0))
          else dmg = 0
          if (dmg > 0) applyDamageWithCircum(target.id, dmg, attacker.id, n)
          totalDmg += dmg
          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: false, isCrit: false, delay: 400, damage: dmg, isBlock: bloq, fctOnly: true })
          applySpellDebuffTo(target.id)
        }
        logs.push(`→ Flagellum! ${hitCount} golpe(s) → ${totalDmg} dano total em ${target.name}!`)

      // ── LOCOMOTOR MORTIS: devolve 25-150% do dano recebido no turno ─────────
      } else if (spell.special === "locomotor_retaliate") {
        const freshAtk = state.find((d) => d.id === attacker.id)
        const dmgReceived = freshAtk?.damageReceivedThisTurn ?? 0
        const pct = Math.floor(Math.random() * 126) + 25
        const retalDmg = Math.round(dmgReceived * pct / 100)
        const bloq = protegoBlocks(target)
        if (retalDmg > 0 && !bloq) {
          state = state.map((d) =>
            d.id === target.id
              ? { ...d, hp: applyDamage(d.hp, retalDmg, { thestral: d.wand === "thestral" }), damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + retalDmg }
              : d
          )
          logs.push(`→ 💀 Locomotor Mortis! ${attacker.name} devolveu ${retalDmg} dano (${pct}% de ${dmgReceived}) para ${target.name}!`)
        } else if (dmgReceived === 0) {
          logs.push(`→ Locomotor Mortis: ${attacker.name} não recebeu dano neste turno.`)
        }
        animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: false, isCrit: false, delay: 1000, damage: retalDmg, isBlock: bloq, fctOnly: true })

      // ── FLUXO PADRÃO (single target) ────────────────────────────────────────
      } else {
        const streak = attacker.missStreakBySpell?.[sn] ?? 0
        const hit = rollHit(attacker, target, spell, streak)
        if (hit) {
          let damage = getSpellMaxPower(spell) > 0 ? calculateDamage(attacker, target, rollCombatPower(attacker, spell, sn, target), n) : 0
          let isCrit = false

          // CRUCIUS: +30% dano por debuff no alvo
          if (n.includes("crucius") && damage > 0 && target.debuffs.length > 0) {
            damage = Math.round(damage * (1 + 0.3 * target.debuffs.length))
          }

          if (damage > 0 && spell.canCrit !== false && Math.random() < getCritChance(attacker, target, n)) {
            damage *= 2
            isCrit = true
          }

          const bloqueado = protegoBlocks(target)
          if (bloqueado) {
            damage = 0
            logs.push(`→ ${sn} foi bloqueado pelo Protego de ${target.name}!`)
          } else if (damage > 0) {
            if (!ignoresDefense) damage = Math.max(0, damage - (target.defense ?? 0))
            if (damage > 0) logs.push(`→ ${isCrit ? "💥 CRÍTICO! " : ""}${sn} causou ${damage} de dano em ${target.name}!`)
          }
          if (damage > 0) applyDamageWithCircum(target.id, damage, attacker.id, n)

          // PROTEGO MAXIMO: cura 200 HP se atacante critar enquanto ativo
          if (isCrit && damage > 0 && !bloqueado) {
            const refreshedT = state.find((d) => d.id === target.id)
            if (refreshedT?.debuffs.some((d) => d.type === "protego_maximo")) {
              state = state.map((d) => (d.id === target.id ? { ...d, hp: healFlatTotal(d.hp, 200) } : d))
              logs.push(`→ 🛡️ Protego Maximo! ${target.name} curou 200 HP (crítico no escudo)!`)
            }
          }

          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: false, isCrit, delay: 1000, damage, isBlock: bloqueado, fctOnly: true })
          applySpellDebuffTo(target.id)

          // AQUA ERUCTO: +25 dano por debuff no atacante; limpa BURN próprio
          if (n.includes("aqua") && n.includes("eructo")) {
            const debuffBonus = attacker.debuffs.length * 25
            if (debuffBonus > 0 && !bloqueado) {
              applyDamageWithCircum(target.id, debuffBonus, attacker.id, n)
              logs.push(`→ Aqua Eructo: +${debuffBonus} dano (${attacker.debuffs.length} debuffs no usuário)!`)
            }
            state = state.map((d) =>
              d.id === attacker.id ? { ...d, debuffs: d.debuffs.filter((x) => x.type !== "burn") } : d
            )
          }

          // RICTUMSEMPRA: reduz 1 de mana de feitiço aleatório do alvo
          if (spell.special === "rictum_mana_drain" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            const sm = freshTarget?.spellMana
            if (sm) {
              const keys = Object.keys(sm).filter((k) => sm[k].current > 0)
              if (keys.length > 0) {
                const rk = keys[Math.floor(Math.random() * keys.length)]
                state = state.map((d) => {
                  if (d.id !== target.id) return d
                  const newSm = { ...(d.spellMana ?? {}) }
                  newSm[rk] = { ...newSm[rk], current: Math.max(0, newSm[rk].current - 1) }
                  return { ...d, spellMana: newSm }
                })
                logs.push(`→ Rictumsempra! ${target.name} perdeu 1 mana de "${rk}".`)
              }
            }
          }

          // OBLIVIATE: reduz pela metade a mana de feitiço aleatório do alvo (permanente)
          if (spell.special === "obliviate_mana" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            const sm = freshTarget?.spellMana
            if (sm) {
              const keys = Object.keys(sm)
              if (keys.length > 0) {
                const rk = keys[Math.floor(Math.random() * keys.length)]
                state = state.map((d) => {
                  if (d.id !== target.id) return d
                  const newSm = { ...(d.spellMana ?? {}) }
                  newSm[rk] = { current: Math.floor(newSm[rk].current / 2), max: Math.floor(newSm[rk].max / 2) }
                  return { ...d, spellMana: newSm }
                })
                logs.push(`→ Obliviate! Mana de "${rk}" de ${target.name} reduzida à metade permanentemente!`)
              }
            }
          }

          // SECTUMSEMPRA: lifesteal — cura o dano causado
          if (spell.special === "sectumsempra_lifesteal" && damage > 0 && !bloqueado) {
            state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healFlatTotal(d.hp, damage) } : d))
            logs.push(`→ Sectumsempra! ${attacker.name} curou ${damage} HP do dano causado!`)
          }

          // FINITE INCANTATEM: transfere debuffs do usuário para o alvo
          if (spell.special === "finite_transfer") {
            const freshCaster = state.find((d) => d.id === attacker.id)
            const casterDebuffs = (freshCaster?.debuffs ?? []).filter((dd) => !dd.irremovable)
            if (casterDebuffs.length > 0) {
              state = state.map((d) => {
                if (d.id === target.id) return { ...d, debuffs: [...d.debuffs, ...casterDebuffs] }
                if (d.id === attacker.id) return { ...d, debuffs: d.debuffs.filter((dd) => dd.irremovable) }
                return d
              })
              logs.push(`→ Finite Incantatem! ${attacker.name} transferiu ${casterDebuffs.length} debuff(s) para ${target.name}!`)
            } else {
              logs.push(`→ Finite Incantatem: ${attacker.name} não tinha debuffs removíveis.`)
            }
          }
        } else if (spell.special === "avada_miss_hp" && n.includes("avada")) {
          state = state.map((d) => {
            if (d.id !== attacker.id) return d
            const bars = [...d.hp.bars]
            for (let i = bars.length - 1; i >= 0; i--) {
              if (bars[i] > 0) { bars[i] = 0; break }
            }
            return { ...d, hp: { bars } }
          })
          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: true, isCrit: false, delay: 1000, damage: 0, isBlock: false, fctOnly: true })
        } else {
          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: true, isCrit: false, delay: 900, damage: 0, isBlock: false, fctOnly: true })
        }
      }
    }

    state = state.map((d) => {
      if (d.id !== attacker.id) return d
      const sm = { ...(d.spellMana || {}) }
      const slot = sm[sn]
      if (slot) sm[sn] = { ...slot, current: Math.max(0, slot.current - 1) }
      return {
        ...d,
        spellMana: sm,
        lastSpellUsed: sn,
        lastRoundSpellWasProtego: n.includes("protego") ? d.lastRoundSpellWasProtego : false,
        lastRoundSpellWasLumus: n.includes("lumus") ? d.lastRoundSpellWasLumus : false,
        nextAccBonusPct: undefined,
        nextDamagePotionMult: undefined,
      }
    })

    const atkAfter = state.find((x) => x.id === action.casterId)
    if (atkAfter && WAND_PASSIVES[atkAfter.wand]?.effect === "phoenix_regen") {
      const pct = Math.floor(Math.random() * 21) + 5
      state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healCurrentBar(d.hp, pct) } : d))
    }

    const outcomeMid = evaluateOutcome(state)
    if (outcomeMid) return { newDuelists: state, logs, animationsToPlay, outcome: outcomeMid, orderedActions }
  }

  state = state.map((d) => {
    let hp = d.hp
    if (d.debuffs.some((x) => x.type === "burn")) hp = applyDamage(hp, 25, { thestral: d.wand === "thestral" })
    if (d.debuffs.some((x) => x.type === "poison")) hp = applyDamage(hp, 50, { thestral: d.wand === "thestral" })
    return hp !== d.hp ? { ...d, hp } : d
  })
  // BOMBA: explode quando o contador expira (duration === 1, prestes a ser removido)
  const bombaTargets = state.filter((d) => d.debuffs.some((x) => x.type === "bomba" && x.duration === 1))
  for (const bd of bombaTargets) {
    const bombDmg = Math.round(((500 - getTotalHP(bd.hp)) / 100) * 25)
    if (bombDmg > 0) {
      logs.push(`💣 BOMBA explodiu em ${bd.name}! ${bombDmg} de dano!`)
      state = state.map((d) => (d.id === bd.id ? { ...d, hp: applyDamage(d.hp, bombDmg, { thestral: d.wand === "thestral" }) } : d))
      animationsToPlay.push({ type: "cast", casterId: bd.id, spellName: "Subito", targetId: bd.id, isMiss: false, isCrit: false, delay: 200, damage: bombDmg, isBlock: false, fctOnly: true })
    }
  }
  state = state.map(reduceDebuffs)
  state = state.map((d) => ({
    ...d,
    disabledSpells: Object.fromEntries(
      Object.entries(d.disabledSpells || {})
        .map(([k, v]) => [k, Math.max(0, Number(v) - 1)] as [string, number])
        .filter(([, v]) => v > 0)
    ),
    turnsInBattle: (d.turnsInBattle ?? 0) + 1,
  }))

  return { newDuelists: state, logs, animationsToPlay, outcome: evaluateOutcome(state), orderedActions }
}
