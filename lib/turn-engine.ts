import { HOUSE_GDD, WAND_PASSIVES, rollSpellPower, type SpellInfo } from "@/lib/data-store"
import type { DebuffType, Duelist, HPState } from "@/lib/arena-types"
import type { RoundAction } from "@/lib/duelActions"

/** Debuffs that Trevus can roll (1t each; 2 rolled per hit). */
const TREVUS_RANDOM_DEBUFFS: DebuffType[] = [
  "burn",
  "freeze",
  "stun",
  "confusion",
  "poison",
  "paralysis",
  "damage_reduce",
  "crit_down",
  "silence_defense",
  "no_potion",
  "arestum_penalty",
  "blindness",
  "mark",
]

/** Pure engine: receives `RoundAction` in memory. Supabase persistence uses `match_turns.action_payload` only in the Arena. */

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
  /** Texto explícito no FCT (ex.: feitiço sem dano, buff). */
  fctMessage?: string
  /** Chave da poção usada (ex: "wiggenweld", "foco"), para exibir nome correto no FCT. */
  potionType?: string
}

export interface TurnOutcome {
  newDuelists: Duelist[]
  logs: string[]
  animationsToPlay: EngineAnimation[]
  outcome: "win" | "lose" | "timeout" | null
  orderedActions: RoundAction[]
}

export const normSpell = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

/** Garante substituto para Expulso: nome ainda livre após remoção, preferindo feitiços não-VIP. */
function pickExpulsoReplacementSpell(remainingHandKeys: string[], database: SpellInfo[]): SpellInfo {
  const used = new Set(remainingHandKeys)
  const poolAll = database.filter((s) => !used.has(s.name))
  const nonVip = poolAll.filter((s) => !s.isVipOnly)
  const pool = nonVip.length > 0 ? nonVip : poolAll
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!
  return database[0]!
}
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
    n.includes("arestum") ||
    (n.includes("fogo") && n.includes("maldito"))
  )
}

export const getSpellMaxPower = (spell: SpellInfo): number => {
  if (spell.powerMin != null && spell.powerMax != null) return spell.powerMax
  return spell.power ?? 0
}

/** Pelo de Testrálio: cada pacote de dano recebido (um “hit”) é limitado a 300. */
const capThestralIncomingDamage = (wand: string | undefined, amount: number): number => {
  if (WAND_PASSIVES[wand ?? ""]?.effect === "thestral_cap300") return Math.min(Math.max(0, amount), 300)
  return amount
}

const applyDamage = (hp: HPState, amount: number, opts?: { thestral?: boolean; undead?: boolean }): HPState => {
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
    // Morto Vivo: HP não cairá abaixo de 1 no turno de ativação
    if (opts?.undead && bars[i] - absorbed < 1) {
      bars[i] = 1
      remaining = 0
      break
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

const occamyRepeatKey = (targetId: string, spellNorm: string) => `${targetId}|${spellNorm}`

/** Remove acúmulos Occamy do atacante para um alvo (troca de feitiço ou espelho inativo). */
const stripOccamyRepeatsForTarget = (duelist: Duelist, targetId: string): Duelist => {
  if (!duelist.occamyRepeatByTargetSpell) return duelist
  const prefix = `${targetId}|`
  const next = { ...duelist.occamyRepeatByTargetSpell }
  for (const k of Object.keys(next)) {
    if (k.startsWith(prefix)) delete next[k]
  }
  return Object.keys(next).length > 0 ? { ...duelist, occamyRepeatByTargetSpell: next } : { ...duelist, occamyRepeatByTargetSpell: undefined }
}

export const calculateAccuracy = (
  attacker: Duelist,
  defender: Duelist,
  base: number,
  spell?: SpellInfo,
  attackerRoundSpellName?: string,
  occamyAccRepeatStacks = 0,
  combatLogs?: string[]
) => {
  let accuracy = base
  const un = spell?.isUnforgivable
  const wandJammed = attacker.wandPassiveStripped || attacker.debuffs.some((d) => d.type === "disarm")
  // Unicórnio: +10% acerto (só para spells não-Imperdoáveis)
  if (!un && !wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "accuracy_plus10") accuracy += 10
  // Dragão: -15% acerto (atualizado de -10%)
  if (!wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "crit20_acc_minus15") accuracy -= 15
  // Veela (defensor): penalidade aleatória de 0-25% em quem ataca o Veela
  if (WAND_PASSIVES[defender.wand]?.effect === "veela_acc_penalty") {
    const penalty = Math.floor(Math.random() * 26)
    accuracy -= penalty
    if (combatLogs && penalty > 0) {
      combatLogs.push(`→ 🧚 Veela Hair: ${defender.name} reduced accuracy by -${penalty}% (random 0-25%).`)
    }
  }
  // Occamy (atacante): espelho ativo → −10% acc por "camada" de repetição (−10, −20, −30…)
  if (!wandJammed && WAND_PASSIVES[attacker.wand]?.effect === "occamy_mirror" && attackerRoundSpellName) {
    if (normSpell(defender.lastSpellUsed ?? "") === normSpell(attackerRoundSpellName)) {
      accuracy -= 10 * (1 + Math.max(0, occamyAccRepeatStacks))
    }
  }
  const spellNorm = normSpell(spell?.name || "")
  if (
    attacker.debuffs.some((d) => d.type === "unforgivable_acc_down") &&
    (spellNorm.includes("crucius") || spellNorm.includes("avada") || spellNorm.includes("imperio") || spellNorm.includes("imperius"))
  ) {
    accuracy -= 15
  }
  // Expecto Patronum: bloqueia completamente Maldições do alvo (1t)
  if (
    attacker.debuffs.some((d) => d.type === "unforgivable_block") &&
    (spellNorm.includes("crucius") || spellNorm.includes("avada") || spellNorm.includes("imperio") || spellNorm.includes("imperius"))
  ) {
    return 0
  }
  accuracy -= (defender.arrestoStacks ?? 0) * 5
  // Debuffs de redução de accuracy (aplicados corretamente)
  if (attacker.debuffs.some((d) => d.type === "blindness")) accuracy -= 10
  // DESILUSÃO: +25% chance de errar
  if (attacker.debuffs.some((d) => d.type === "invisibility")) accuracy -= 25
  // ARESTUM MOMENTUM: -5% acerto por stack
  const arestumOnAtk = attacker.debuffs.filter((d) => d.type === "arestum_penalty").length
  if (arestumOnAtk > 0) accuracy -= arestumOnAtk * 5
  if (attacker.nextAccBonusPct) accuracy += attacker.nextAccBonusPct
  if (attacker.permanentAccBonus) accuracy += attacker.permanentAccBonus
  return Math.max(5, Math.min(100, accuracy))
}

const rollHit = (
  attacker: Duelist,
  defender: Duelist,
  spell: SpellInfo,
  missStreak = 0,
  spellName?: string,
  occamyAccRepeatStacks = 0,
  combatLogs?: string[]
) => {
  if (spell.accuracy >= 100) return true
  const pityBonus = Math.min(20, missStreak * 7)
  const finalAcc = Math.min(
    100,
    calculateAccuracy(attacker, defender, spell.accuracy, spell, spellName, occamyAccRepeatStacks, combatLogs) + pityBonus
  )
  return Math.random() * 100 <= finalAcc
}

const calculateDamage = (
  attacker: Duelist,
  defender: Duelist,
  base: number,
  spellNorm?: string,
  spell?: SpellInfo,
  occamyMirrorActive?: boolean,
  combatLogs?: string[],
  occamyMirrorRepeat = 0
) => {
  let damage = base
  // Kelpie: imune a Incêndio, Confringo/Confringo e Bombarda
  if (spellNorm && WAND_PASSIVES[defender.wand]?.effect === "kelpie_fire_immune") {
    const n = spellNorm
    if (n.includes("incendio") || n.includes("confrigo") || n.includes("confringo") || n.includes("bombarda")) {
      combatLogs?.push(`→ 🐴 Kelpie Mane: ${defender.name} negated fire damage from ${attacker.name} (${spell?.name ?? "magic"}).`)
      return 0
    }
  }
  if (spellNorm?.includes("incendio") && defender.debuffs.some((d) => d.type === "burn")) damage *= 2
  // Occamy: mesmo feitiço que o alvo → −25% dano por repetição acumulada (0.75^(1+n))
  if (occamyMirrorActive) {
    const layers = 1 + Math.max(0, occamyMirrorRepeat)
    damage *= Math.pow(0.75, layers)
    combatLogs?.push(`→ 🪶 Occamy Feather: ${defender.name} mirrored — ${attacker.name} ×${layers} damage penalty (${Math.round((1 - Math.pow(0.75, layers)) * 100)}% accumulated reduction).`)
  }
  // Crupe: 25% de ×3 só em feitiços “puros” (sem debuff/efeito secundário de status no dado)
  if (WAND_PASSIVES[attacker.wand]?.effect === "crupe_triple" && spell && !spell.debuff) {
    if (Math.random() < 0.25) {
      damage *= 3
      combatLogs?.push(`→ 🐗 Crupe Fur: ${attacker.name} landed a triple strike!`)
    }
  }
  // Cinzal: pilhas de −15% dano (multiplicativo) no atacante
  const cinzalStacks = attacker.cinzalWeakenStacks ?? 0
  if (cinzalStacks > 0) damage *= Math.pow(0.85, cinzalStacks)
  if (attacker.debuffs.some((d) => d.type === "damage_amp")) damage *= 1.5
  if (attacker.debuffs.some((d) => d.type === "damage_reduce")) damage *= 0.75
  const arestumStacks = attacker.debuffs.filter((d) => d.type === "arestum_penalty").length
  if (arestumStacks > 0) damage *= Math.max(0.2, 1 - arestumStacks * 0.05)
  if (attacker.nextDamagePotionMult) damage *= attacker.nextDamagePotionMult
  return Math.round(damage)
}

const getCritChance = (attacker: Duelist, defender?: Duelist, spellNameNorm?: string, combatLogs?: string[]): number => {
  // Scarlatum: NUNCA pode causar crítico (magia caótica)
  if (spellNameNorm?.includes("scarlatum")) return 0
  // Veela: defensor nunca pode ser critado (verificado antes de mark/glacius)
  if (WAND_PASSIVES[defender?.wand ?? ""]?.effect === "veela_acc_penalty") {
    if (combatLogs) {
      combatLogs.push(`→ 🧚 Veela Hair: ${defender?.name ?? "Target"} is immune to critical hits!`)
    }
    return 0
  }
  if (defender?.debuffs.some((d) => d.type === "mark")) return 1.0
  if (spellNameNorm?.includes("glacius") && defender?.debuffs.some((d) => d.type === "freeze")) return 1.0
  let c = 0.25
  if (defender?.debuffs.some((d) => d.type === "crit_down")) c = Math.max(0, c - 0.1)
  // Dragão: +20% crit
  if (WAND_PASSIVES[attacker.wand]?.effect === "crit20_acc_minus15") c += 0.2
  // Sonserina: +25% crit chance (novo)
  if (attacker.house === "slytherin") c += HOUSE_GDD.slytherin.critBonus
  if (attacker.debuffs.some((d) => d.type === "crit_boost")) c += 0.25
  return Math.min(0.95, c)
}

const rollCombatPower = (attacker: Duelist, spell: SpellInfo, sn: string, target: Duelist | null, combatLogs?: string[]): number => {
  const n = normSpell(sn)
  if (n.includes("diffindo") && target?.debuffs.some((d) => d.type === "protego")) return 100
  let base = rollSpellPower(spell)
  // Pele de Trasgo: força dano médio (ignora RNG)
  if (WAND_PASSIVES[target?.wand ?? ""]?.effect === "troll_force_avg_damage" && spell.powerMin != null && spell.powerMax != null) {
    base = Math.floor((spell.powerMin + spell.powerMax) / 2)
    if (combatLogs) {
      combatLogs.push(`→ 🧟 Troll Hide: ${target?.name ?? "Target"} forced average damage of ${base} (instead of random).`)
    }
  }
  if (attacker.cruciusWeakness && !n.includes("crucius")) base *= 0.5
  if (attacker.maximosChargePct) base *= 1 + attacker.maximosChargePct / 100
  // Acromântula: +25 dano por turno completo (atualizado de +20)
  if (WAND_PASSIVES[attacker.wand]?.effect === "acromantula_power_stack") {
    const add = (attacker.turnsInBattle ?? 0) * 25
    base += add
    if (add > 0 && combatLogs) {
      const msg = `→ 🕷 Acromantula Hair: ${attacker.name} adds +${add} power (${attacker.turnsInBattle} turn(s) in field).`
      if (combatLogs[combatLogs.length - 1] !== msg) combatLogs.push(msg)
    }
  }
  return Math.round(base)
}

const getSpellCastPriority = (_spellName: string, spell: SpellInfo | undefined, attacker: Duelist): number => {
  if (!spell) return 0
  let p = spell.priority ?? 0
  // Tônico de Dragão: bônus de prioridade no próximo turno
  if (attacker.nextTurnPriorityBonus) {
    p += attacker.nextTurnPriorityBonus
  }
  // Casa (Grifinória/Lufa-Lufa): peso forte na ordem para prevalecer na maioria dos cenários.
  const hg = HOUSE_GDD[attacker.house as keyof typeof HOUSE_GDD]
  if (hg && "attackPriorityBonus" in hg) p += (hg as { attackPriorityBonus: number }).attackPriorityBonus * 6
  // Thunderbird: +1 prioridade global
  if (WAND_PASSIVES[attacker.wand]?.effect === "thunder_priority") p += 1
  if (attacker.debuffs.some((d) => d.type === "paralysis")) p = Math.min(0, p)
  return p
}

const effectiveSpeed = (d: Duelist) => {
  let s = d.speed
  if (d.debuffs.some((x) => x.type === "slow")) s = Math.floor(s * 0.35)
  return s
}

export const getValidTargetsForSpell = (spellName: string, attacker: Duelist, state: Duelist[], gameMode?: string) => {
  // Em FFA cada jogador luta por si só — qualquer um vivo exceto o próprio é alvo válido
  const isFfa = gameMode === "ffa" || gameMode === "ffa3"
  if (isSelfTargetSpell(spellName)) return state.filter((d) => d.id === attacker.id && !isDefeated(d.hp))
  if (isAreaSpell(spellName)) {
    const n = normSpell(spellName)
    if (n.includes("desumo")) return state.filter((d) => !isDefeated(d.hp))
    if (n.includes("protego") && n.includes("diabol")) return state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
    if (isFfa) return state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
    return state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
  }
  if (isFfa) return state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
  return state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
}

export function calculateTurnOutcome(params: {
  duelists: Duelist[]
  actions: RoundAction[]
  spellDatabase: SpellInfo[]
  turnNumber: number
  gameMode: "teste" | "torneio-offline" | "1v1" | "2v2" | "ffa" | "ffa3" | "quidditch" | "floresta"
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
      logs.push(`[Engine]: action ignored for invalid/dead caster (${action.casterId}).`)
      continue
    }

    if (action.type === "skip") {
      logs.push(`[Turn ${params.turnNumber}]: ${attacker.name} lost their turn!`)
      animationsToPlay.push({ type: "skip", casterId: attacker.id, targetIds: [], delay: 1200 })
      continue
    }

    if (action.type === "potion") {
      const potKey = action.potionType || "foco"

      // USO ÚNICO: rejeita se a poção já foi usada nesta batalha
      if (attacker.usedPotions?.includes(potKey)) {
        logs.push(`→ ${attacker.name} already used potion (${potKey}) this battle!`)
        animationsToPlay.push({
          type: "cast",
          casterId: attacker.id,
          targetId: attacker.id,
          fctOnly: true,
          delay: 400,
          fctMessage: "Potion already used",
        })
        continue
      }
      state = state.map((d) => d.id === attacker.id ? { ...d, usedPotions: [...(d.usedPotions ?? []), potKey] } : d)

      logs.push(`[Turn ${params.turnNumber}]: ${attacker.name} used potion (${potKey})!`)

      if (potKey === "wiggenweld") {
        const self = state.find((d) => d.id === attacker.id)
        const healAmt = Math.max(0, self?.lastSingleHitDamageReceived ?? 0)
        state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healAmt > 0 ? healFlatTotal(d.hp, healAmt) : d.hp } : d))
        const charmDebuff = attacker.debuffs.find((x) => x.type === "charm")
        if (charmDebuff?.meta && healAmt > 0) {
          state = state.map((d) => d.id === charmDebuff.meta ? { ...d, hp: healFlatTotal(d.hp, healAmt) } : d)
          logs.push(`→ CHARM: ${charmDebuff.meta} also recovered ${healAmt} HP!`)
        }
        logs.push(`→ ${attacker.name} used Wiggenweld! Recovered ${healAmt} HP (= last hit received).`)

      } else if (potKey === "edurus") {
        state = state.map((d) =>
          d.id === attacker.id
            ? { ...d, debuffs: [...d.debuffs.filter((x) => x.irremovable), { type: "immunity" as DebuffType, duration: 1 }] }
            : d
        )
        logs.push(`→ ${attacker.name} used Edurus! All debuffs cleared + Immunity for 1 turn.`)

      } else if (potKey === "mortovivo") {
        state = state.map((d) =>
          d.id === attacker.id
            ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "undead"), { type: "undead" as DebuffType, duration: 1 }], isUndeadThisTurn: true }
            : d
        )
        logs.push(`→ ${attacker.name} used Undead! HP won't drop below 1 for 1 turn.`)

      } else if (potKey === "maxima") {
        state = state.map((d) => (d.id === attacker.id ? { ...d, nextDamagePotionMult: 1.5 } : d))
        logs.push(`→ ${attacker.name} used Maxima! +50% damage next turn.`)

      } else if (potKey === "foco") {
        state = state.map((d) => (d.id === attacker.id ? { ...d, permanentAccBonus: (d.permanentAccBonus ?? 0) + 10 } : d))
        logs.push(`→ ${attacker.name} used Focus! +10% Accuracy permanent.`)

      } else if (potKey === "merlin") {
        // Poção de Merlin: copia a última poção utilizada pelo oponente, com eficácia aumentada em 25%
        const opponent = state.find((d) => d.team !== attacker.team && !isDefeated(d.hp))
        if (opponent?.usedPotions && opponent.usedPotions.length > 0) {
          const lastPotion = opponent.usedPotions[opponent.usedPotions.length - 1]
          if (!attacker.usedPotions?.includes(lastPotion)) {
            state = state.map((d) => d.id === attacker.id ? { ...d, usedPotions: [...(d.usedPotions ?? []), lastPotion] } : d)
            // Aplica o efeito da poção copiada com +25% de eficácia
            if (lastPotion === "wiggenweld") {
              const self = state.find((d) => d.id === attacker.id)
              const healAmt = Math.round((self?.lastSingleHitDamageReceived ?? 0) * 1.25)
              state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healAmt > 0 ? healFlatTotal(d.hp, healAmt) : d.hp } : d))
              logs.push(`→ ${attacker.name} used Merlin Potion! Copied Wiggenweld from opponent (+25%): recovered ${healAmt} HP.`)
            } else if (lastPotion === "edurus") {
              state = state.map((d) =>
                d.id === attacker.id
                  ? { ...d, debuffs: [...d.debuffs.filter((x) => x.irremovable), { type: "immunity" as DebuffType, duration: 1, irremovable: true }] }
                  : d
              )
              logs.push(`→ ${attacker.name} used Merlin Potion! Copied Edurus from opponent (+25%): Immunity for 2 turns.`)
            } else if (lastPotion === "maxima") {
              state = state.map((d) => (d.id === attacker.id ? { ...d, nextDamagePotionMult: 1.875 } : d)) // 1.5 * 1.25 = 1.875
              logs.push(`→ ${attacker.name} used Merlin Potion! Copied Maxima from opponent (+25%): +87.5% damage next turn.`)
            } else if (lastPotion === "foco") {
              state = state.map((d) => (d.id === attacker.id ? { ...d, permanentAccBonus: (d.permanentAccBonus ?? 0) + 12.5 } : d)) // 10 * 1.25 = 12.5
              logs.push(`→ ${attacker.name} used Merlin Potion! Copied Focus from opponent (+25%): +12.5% Accuracy permanent.`)
            } else if (lastPotion === "mortovivo") {
              state = state.map((d) =>
                d.id === attacker.id
                  ? { ...d, debuffs: [...d.debuffs.filter((x) => x.irremovable), { type: "undead" as DebuffType, duration: 1, irremovable: true }] }
                  : d
              )
              logs.push(`→ ${attacker.name} used Merlin Potion! Copied Undead from opponent (+25%): HP won't drop below 1 for 2 turns.`)
            } else {
              logs.push(`→ ${attacker.name} used Merlin Potion! Copied ${lastPotion} from opponent (+25% efficacy).`)
            }
          } else {
            logs.push(`→ ${attacker.name} already used potion ${lastPotion} this battle. Merlin failed.`)
          }
        } else {
          logs.push(`→ ${attacker.name} used Merlin Potion! Opponent hasn't used any potion yet. Merlin failed.`)
        }
      } else if (potKey === "dragon_tonic") {
        state = state.map((d) => d.id === attacker.id ? { ...d, nextTurnPriorityBonus: (d.nextTurnPriorityBonus ?? 0) + 4 } : d)
        logs.push(`→ 🐉 Dragon Tonic! ${attacker.name} gains +4 priority next turn.`)
      } else if (potKey === "despair_potion") {
        const opponent = state.find((d) => d.team !== attacker.team && !isDefeated(d.hp))
        if (opponent?.lastSpellUsed && opponent.spellMana) {
          const lastSpell = opponent.lastSpellUsed
          state = state.map((d) => {
            if (d.id === opponent.id && d.spellMana && lastSpell) {
              const spellMana = { ...d.spellMana }
              if (spellMana[lastSpell]) {
                spellMana[lastSpell] = {
                  current: Math.max(0, spellMana[lastSpell].current - 3),
                  max: spellMana[lastSpell].max
                }
                return { ...d, spellMana }
              }
            }
            return d
          })
          logs.push(`→ 💀 Despair Potion! ${attacker.name} reduced 3 mana from ${opponent.lastSpellUsed} of ${opponent.name}.`)
        } else {
          logs.push(`→ 💀 Despair Potion! ${opponent?.name ?? "Opponent"} hasn't used any magic yet. Effect failed.`)
        }

      } else if (potKey === "felix") {
        state = state.map((d) => {
          if (d.id !== attacker.id) return d
          const sm = { ...(d.spellMana ?? {}) }
          const entries = Object.entries(sm)
          if (!entries.length) return d
          const minEntry = entries.reduce((a, b) => (a[1].current / a[1].max) <= (b[1].current / b[1].max) ? a : b)
          sm[minEntry[0]] = { ...sm[minEntry[0]], current: sm[minEntry[0]].max }
          return { ...d, spellMana: sm }
        })
        logs.push(`→ ${attacker.name} used Felix Felicis! One spell's mana fully restored.`)

      } else if (potKey === "aconito") {
        const target = state.find((d) => d.team !== attacker.team && !isDefeated(d.hp))
        if (target) {
          state = state.map((d) =>
            d.id === target.id
              ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "poison"), { type: "poison" as DebuffType, duration: 4 }] }
              : d
          )
          logs.push(`→ ${attacker.name} used Aconite! ${target.name} poisoned for 4 turns.`)
        }

      } else if (potKey === "amortentia") {
        // Poção Amortentia: Se o oponente NÃO usou a poção dele, troca-a aleatoriamente por outra do game-data.ts
        const opponent = state.find((d) => d.team !== attacker.team && !isDefeated(d.hp))
        if (opponent) {
          if (!opponent.usedPotions || opponent.usedPotions.length === 0) {
            // Oponente ainda não usou poção - troca por uma aleatória
            const availablePotions = ["wiggenweld", "edurus", "maxima", "foco", "merlin", "felix", "aconito", "amortentia", "mortovivo"]
            const randomPotion = availablePotions[Math.floor(Math.random() * availablePotions.length)]
            state = state.map((d) => d.id === opponent.id ? { ...d, replacedPotion: randomPotion } : d)
            logs.push(`→ ${attacker.name} used Amortentia! ${opponent.name}'s potion was replaced with ${randomPotion}.`)
          } else {
            // Oponente já usou poção - Amortentia falha
            logs.push(`→ ${attacker.name} used Amortentia! ${opponent.name} already used their potion. Amortentia failed.`)
          }
        }
      }

      animationsToPlay.push({ type: "potion", casterId: attacker.id, targetIds: [attacker.id], targetId: attacker.id, delay: 1000, potionType: potKey })
      if (evaluateOutcome(state)) return { newDuelists: state, logs, animationsToPlay, outcome: evaluateOutcome(state), orderedActions }
      continue
    }

    const sn = action.spellName || ""
    const spell = getSpellInfo(sn, params.spellDatabase)
    if (!spell) {
      animationsToPlay.push({
        type: "cast",
        casterId: attacker.id,
        spellName: sn,
        targetId: attacker.id,
        isMiss: true,
        fctOnly: true,
        delay: 500,
        fctMessage: "Unknown spell",
      })
      continue
    }
    const n = normSpell(sn)

    const cannotAct = attacker.debuffs.some((d) => d.type === "stun" || d.type === "freeze")
    if (cannotAct) {
      logs.push(`[Turn ${params.turnNumber}]: ${attacker.name} is unable to act!`)
      animationsToPlay.push({
        type: "cast",
        casterId: attacker.id,
        spellName: sn,
        targetId: attacker.id,
        isMiss: true,
        fctOnly: true,
        delay: 500,
        fctMessage: "Stunned / Frozen",
      })
      continue
    }

    // IMPERIO: só pode usar o último feitiço (IRREMOVÍVEL)
    if (attacker.debuffs.some((d) => d.type === "taunt") && attacker.lastSpellUsed && action.type === "cast") {
      if (normSpell(sn) !== normSpell(attacker.lastSpellUsed)) {
        logs.push(`→ ${attacker.name} is under Imperio! Only "${attacker.lastSpellUsed}" can be cast (tried: ${sn}).`)
        animationsToPlay.push({
          type: "cast",
          casterId: attacker.id,
          spellName: sn,
          targetId: attacker.id,
          isMiss: true,
          fctOnly: true,
          delay: 500,
          fctMessage: "Imperio!",
        })
        continue
      }
    }

    // CENTAURO: com pelo de centauro no campo, Ferula/Episkey/Vulnera estão inutilizadas (mana 0 no início + bloqueio aqui)
    const centauroFieldActive = state.some((d) => !isDefeated(d.hp) && WAND_PASSIVES[d.wand]?.effect === "centauro_block_heals")
    if (centauroFieldActive && isSelfTargetSpell(sn)) {
      const nCur = normSpell(sn)
      if (nCur.includes("ferula") || nCur.includes("episkey") || (nCur.includes("vulnera") && nCur.includes("sanetur"))) {
        logs.push(`→ ${attacker.name} tried to use ${sn}, but it's blocked by Centaur!`)
        animationsToPlay.push({
          type: "cast",
          casterId: attacker.id,
          spellName: sn,
          targetId: attacker.id,
          isMiss: true,
          fctOnly: true,
          delay: 500,
          fctMessage: "Blocked (Centaur)",
        })
        continue
      }
    }

    // SILÊNCIO: verifica se a magia está silenciada
    const silencedSpells = attacker.silencedSpells ?? []
    if (silencedSpells.includes(sn)) {
      logs.push(`→ ${attacker.name} tried to use ${sn}, but it's silenced!`)
      animationsToPlay.push({
        type: "cast",
        casterId: attacker.id,
        spellName: sn,
        targetId: attacker.id,
        isMiss: true,
        fctOnly: true,
        delay: 500,
          fctMessage: "Silenciado",
      })
      continue
    }
    const isFfaMode = params.gameMode === "ffa" || params.gameMode === "ffa3"
    let targets: Duelist[] = []
    if (isSelfTargetSpell(sn)) {
      if (!isDefeated(attacker.hp)) targets = [attacker]
    } else if (isAreaSpell(sn)) {
      if (n.includes("desumo")) targets = state.filter((d) => !isDefeated(d.hp))
      else if (n.includes("protego") && n.includes("diabol")) targets = state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
      else if (isFfaMode) targets = state.filter((d) => d.id !== attacker.id && !isDefeated(d.hp))
      else targets = state.filter((d) => d.team !== attacker.team && !isDefeated(d.hp))
    } else {
      const t = state.find((d) => d.id === action.targetId)
      if (t && !isDefeated(t.hp)) targets = [t]
    }
    if (targets.length === 0) {
      animationsToPlay.push({
        type: "cast",
        casterId: attacker.id,
        spellName: sn,
        isMiss: true,
        fctOnly: true,
        delay: 500,
        fctMessage: "No valid target",
      })
      continue
    }

    animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetIds: targets.map((t) => t.id), targetId: targets[0]?.id, delay: 1200 })
    if (isSelfTargetSpell(sn)) {
      animationsToPlay.push({
        type: "cast",
        casterId: attacker.id,
        spellName: sn,
        targetId: attacker.id,
        targetIds: [attacker.id],
        fctOnly: true,
        delay: 400,
        damage: 0,
        fctMessage: `✨ ${sn}`,
      })
    }
    logs.push(`[Turn ${params.turnNumber}]: ${attacker.name} cast ${sn}${isAreaSpell(sn) ? " in area" : ` on ${targets[0].name}`}!`)

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
      // IMMUNITY (Edurus): bloqueia todos os novos debuffs por 1 turno
      if (before?.debuffs.some((d) => d.type === "immunity")) return
      // Hipogrifo: imune total a MARCA e BOMBA
      if (WAND_PASSIVES[before?.wand ?? ""]?.effect === "hippogriff_immune_mark_bomb") {
        if (spell.debuff.type === "mark" || spell.debuff.type === "bomba") {
          logs.push(
            `→ 🪶 Hippogriff Feather: ${before?.name ?? "Target"} blocked ${spell.debuff.type === "mark" ? "Mark" : "Bomb"} from ${attacker.name}.`
          )
          return
        }
      }
      // Basilisco: +20% chance de aplicar debuffs (multiplicador)
      const chanceMultiplier = WAND_PASSIVES[attacker.wand]?.effect === "basilisk_debuff_chance" ? 1.2 : 1
      if (Math.random() * 100 <= spell.debuff.chance * chanceMultiplier) {
        const baseDur = spell.debuff.duration || 1
        const dur = n.includes("imperio") ? Math.max(3, baseDur) : baseDur
        const meta = spell.debuff.type === "provoke" ? attacker.id : undefined
        const irremovable = n.includes("imperio") ? true : undefined
        state = state.map((d) =>
          d.id === defenderId
            ? { ...d, debuffs: [...d.debuffs, { type: spell.debuff!.type as DebuffType, duration: dur, meta, irremovable }] }
            : d
        )
        if (chanceMultiplier > 1) {
          logs.push(`→ 🐍 Basilisk Fang: ${attacker.name} applied debuff with bonus chance!`)
        }
      }
    }

    const applyDamageWithCircum = (defId: string, dmg: number, dealerId: string, sourceSpellNorm?: string) => {
      const def = state.find((d) => d.id === defId)
      if (!def) return
      const dealerName = state.find((d) => d.id === dealerId)?.name ?? dealerId
      let effectiveDmg = capThestralIncomingDamage(def.wand, dmg)
      if (WAND_PASSIVES[def.wand ?? ""]?.effect === "thestral_cap300" && dmg > effectiveDmg) {
        logs.push(`→ 🪶 Thestral Hair: ${def.name} capped the hit from ${dealerName} to ${effectiveDmg} (${dmg} → cap 300).`)
      }
      // UNDEAD: HP não pode cair abaixo de 1 neste turno (debuff ou flag de ativação)
      const isUndead = def.debuffs.some((x) => x.type === "undead") || def.isUndeadThisTurn
      // INVULNERABLE: Oraqi Orala - dano recebido será 0
      const isInvulnerable = def.debuffs.some((x) => x.type === "invulnerable")
      if (isUndead) {
        const totalHp = getTotalHP(def.hp)
        const beforeUndead = effectiveDmg
        effectiveDmg = Math.max(0, Math.min(effectiveDmg, totalHp - 1))
        if (beforeUndead > effectiveDmg) {
          logs.push(`→ 🧟 Undead: ${def.name} doesn't drop below 1 HP this turn (${beforeUndead} → ${effectiveDmg} received).`)
        }
      }
      if (isInvulnerable) {
        const beforeInvuln = effectiveDmg
        effectiveDmg = 0
        if (beforeInvuln > 0) {
          logs.push(`→ 🪶 Oraqui Orala Feather: ${def.name} is invulnerable! Damage received: 0.`)
        }
      }
      state = state.map((d) =>
        d.id === defId
          ? {
              ...d,
              hp: applyDamage(d.hp, effectiveDmg, { undead: isUndead }),
              damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + effectiveDmg,
              lastSingleHitDamageReceived: effectiveDmg,
            }
          : d
      )
      // Lufa-Lufa espinhos: 10% do dano reflete no atacante (Testrálio do atingido limita o reflexo)
      if (def.house === "hufflepuff" && dealerId !== defId && effectiveDmg > 0) {
        const dealer = state.find((d) => d.id === dealerId)
        const thornRaw = Math.round(effectiveDmg * HOUSE_GDD.hufflepuff.thornsPercent)
        const thornDmg = dealer ? capThestralIncomingDamage(dealer.wand, thornRaw) : thornRaw
        if (thornDmg > 0) {
          state = state.map((d) =>
            d.id === dealerId
              ? {
                  ...d,
                  hp: applyDamage(d.hp, thornDmg, { thestral: d.wand === "thestral" }),
                  damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + thornDmg,
                }
              : d
          )
          logs.push(
            `→ 🦡 Thorns (Hufflepuff): ${dealerName} received ${thornDmg} reflex damage after injuring ${def.name} (${thornRaw} raw, ${Math.round(HOUSE_GDD.hufflepuff.thornsPercent * 100)}% of the hit).`
          )
        }
      }
      // Cinzal: cada pacote de 100+ de dano recebido pelo portador → +1 pilha de −15% dano no atacante (acumula)
      if (WAND_PASSIVES[def.wand]?.effect === "cinzal_weaken" && dealerId !== defId && effectiveDmg > 100) {
        const prevStacks = state.find((d) => d.id === dealerId)?.cinzalWeakenStacks ?? 0
        const nextStacks = prevStacks + 1
        state = state.map((d) => (d.id === dealerId ? { ...d, cinzalWeakenStacks: nextStacks } : d))
        logs.push(
          `→ 🪶 Cinzal Claw: ${dealerName} accumulates damage penalty (stack ${nextStacks}): −${Math.round((1 - Math.pow(0.85, nextStacks)) * 100)}% multiplicative on next hits.`
        )
      }
      if (def.debuffs.some((d) => d.type === "salvio_reflect") && dealerId !== defId && effectiveDmg > 0) {
        const dealer = state.find((d) => d.id === dealerId)
        const refRaw = Math.round(effectiveDmg)
        const refDmg = dealer ? capThestralIncomingDamage(dealer.wand, refRaw) : refRaw
        if (refDmg > 0) {
          state = state.map((d) =>
            d.id === dealerId
              ? {
                  ...d,
                  hp: applyDamage(d.hp, refDmg, { thestral: d.wand === "thestral" }),
                  damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + refDmg,
                }
              : d
          )
          logs.push(
            `→ ✨ Salvio Hexia (reflect): ${dealerName} received ${refDmg} reflected damage from ${def.name} (${refRaw} raw before cap).`
          )
          if (dealer && WAND_PASSIVES[dealer.wand ?? ""]?.effect === "thestral_cap300" && refRaw > refDmg) {
            logs.push(`→ 🪶 Thestral Hair: ${dealerName} capped the reflect to ${refDmg} (${refRaw} → cap 300).`)
          }
        }
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
        logs.push(`→ ${attacker.name} tried to use ${sn}, but their defenses are blocked!`)
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
          // CHARM: espelha a cura para quem encantou o atacante
          const charmDebuff = attacker.debuffs.find((x) => x.type === "charm")
          if (charmDebuff?.meta) {
            state = state.map((d) => d.id === charmDebuff.meta ? { ...d, hp: healFlatTotal(d.hp, healAmt) } : d)
            logs.push(`→ CHARM: ${charmDebuff.meta} also recovered ${healAmt} HP!`)
          }
        } else {
          logs.push(`→ ${attacker.name} tried to use ${sn}, but healing is blocked!`)
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
        // CHARM: espelha a cura de Episkey para quem encantou o atacante
        if (!bloqueiosCura) {
          const charmDebuff = attacker.debuffs.find((x) => x.type === "charm")
          if (charmDebuff?.meta) {
            state = state.map((d) => d.id === charmDebuff.meta ? { ...d, hp: healFlatTotal(d.hp, 50) } : d)
            logs.push(`→ CHARM: ${charmDebuff.meta} also recovered 50 HP!`)
          }
        }
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
        logs.push(`→ ${attacker.name} used Fiantu Dure! Restored +${restore} mana in all spells.`)
      }
    } else if (n.includes("fumus")) {
      logs.push(`→ 💨 ${attacker.name} cast Fumus! All effects from all wizards were removed!`)
      state = state.map((d) => ({
        ...d,
        debuffs: [],
        disabledSpells: {},
        nextAccBonusPct: undefined,
        nextDamagePotionMult: undefined,
        maximosChargePct: undefined,
        circumAura: undefined,
        destinyBond: false,
        permanentAccBonus: undefined,
        usedPotions: [],
        cinzalWeakenStacks: undefined,
        occamyRepeatByTargetSpell: undefined,
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
      logs.push(`→ ${attacker.name} cast Circum Inflamare! All enemies on fire (1t).`)
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
      logs.push(`→ ${attacker.name} cast Protego Diabolical! Shield vs Curses + -15% enemy accuracy (2t).`)
    } else if (isAreaSpell(sn) && getSpellMaxPower(spell) > 0) {
      const ignoresDefense = spell.ignoresDefense === true
      for (const t of targets) {
        const streak = attacker.missStreakBySpell?.[sn] ?? 0
        const atkLive = state.find((d) => d.id === attacker.id) ?? attacker
        const occamyMirror = WAND_PASSIVES[atkLive.wand]?.effect === "occamy_mirror" &&
          normSpell(params.actions.find((a) => a.casterId === t.id)?.spellName ?? "") === n
        const occKey = occamyRepeatKey(t.id, n)
        const occRepeat = occamyMirror ? (atkLive.occamyRepeatByTargetSpell?.[occKey] ?? 0) : 0
        const hit = rollHit(atkLive, t, spell, streak, sn, occRepeat)
        if (!hit) {
          if (WAND_PASSIVES[atkLive.wand]?.effect === "occamy_mirror") {
            state = state.map((d) => (d.id === atkLive.id ? stripOccamyRepeatsForTarget(d, t.id) : d))
          }
          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: t.id, isMiss: true, isCrit: false, delay: 900, damage: 0, isBlock: false, fctOnly: true })
          continue
        }
        let damage = calculateDamage(
          atkLive,
          t,
          rollCombatPower(atkLive, spell, sn, t, logs),
          n,
          spell,
          occamyMirror,
          logs,
          occRepeat
        )
        // FOGO MALDITO: +50 de poder por 100 HP perdido pelo atacante
        if (n.includes("fogo") && n.includes("maldito")) {
          const lostHp = 500 - getTotalHP(attacker.hp)
          damage += Math.floor(lostHp / 100) * 50
        }
        let isCrit = false
        if (Math.random() < getCritChance(attacker, t, n)) {
          damage *= 2
          isCrit = true
        }
        const bloqueadoArea = protegoBlocks(t)
        // BOMBARDA MAXIMA: 25% chance de ignorar defesa
        const piercesDefense = ignoresDefense || (n.includes("bombarda") && n.includes("maxima") && Math.random() < 0.25)
        if (!bloqueadoArea && !piercesDefense) damage = Math.max(0, damage - (t.defense ?? 0))
        if (bloqueadoArea) damage = 0
        // Dano mínimo garantido de 25 para spells de área não bloqueadas (não aplica a imunidade 0, ex. Kelpie)
        if (!bloqueadoArea && damage > 0 && getSpellMaxPower(spell) > 0 && damage < 25) damage = 25
        applyDamageWithCircum(t.id, damage, attacker.id, n)
        animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: t.id, isMiss: false, isCrit, delay: 900, damage, isBlock: bloqueadoArea, fctOnly: true })
        applySpellDebuffTo(t.id)
        if (occamyMirror) {
          state = state.map((d) => {
            if (d.id !== atkLive.id) return d
            const m = { ...(d.occamyRepeatByTargetSpell ?? {}), [occKey]: occRepeat + 1 }
            return { ...d, occamyRepeatByTargetSpell: m }
          })
        } else {
          state = state.map((d) => (d.id === atkLive.id ? stripOccamyRepeatsForTarget(d, t.id) : d))
        }
      }
    } else {
      const ignoresDefense = spell.ignoresDefense === true
      const target = targets[0]

      // ── FLAGELLUM: multi-hit 1-4x, sem crítico ──────────────────────────────
      if (spell.special === "flagellum_multi") {
        const hitCount = Math.floor(Math.random() * 4) + 1
        let totalDmg = 0
        const atk0 = state.find((d) => d.id === attacker.id) ?? attacker
        const occamyMirrorFg =
          WAND_PASSIVES[atk0.wand]?.effect === "occamy_mirror" &&
          normSpell(params.actions.find((a) => a.casterId === target.id)?.spellName ?? "") === n
        const occKeyFg = occamyRepeatKey(target.id, n)
        const occRepFg = occamyMirrorFg ? (atk0.occamyRepeatByTargetSpell?.[occKeyFg] ?? 0) : 0
        let anyLanded = false
        for (let h = 0; h < hitCount; h++) {
          const atkL = state.find((d) => d.id === attacker.id) ?? attacker
          const hitRoll = rollHit(atkL, target, spell, 0, sn, occRepFg)
          if (!hitRoll) {
            animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: true, isCrit: false, delay: 400, damage: 0, isBlock: false, fctOnly: true })
            continue
          }
          anyLanded = true
          let dmg = calculateDamage(
            atkL,
            target,
            rollCombatPower(atkL, spell, sn, target, logs),
            n,
            spell,
            occamyMirrorFg,
            logs,
            occRepFg
          )
          const bloq = protegoBlocks(target)
          if (!bloq) dmg = ignoresDefense ? dmg : Math.max(0, dmg - (target.defense ?? 0))
          else dmg = 0
          if (dmg > 0) applyDamageWithCircum(target.id, dmg, attacker.id, n)
          totalDmg += dmg
          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: false, isCrit: false, delay: 400, damage: dmg, isBlock: bloq, fctOnly: true })
          applySpellDebuffTo(target.id)
        }
        logs.push(`→ Flagellum! ${hitCount} hit(s) → ${totalDmg} total damage on ${target.name}!`)
        if (occamyMirrorFg) {
          if (anyLanded) {
            state = state.map((d) => {
              if (d.id !== atk0.id) return d
              const m = { ...(d.occamyRepeatByTargetSpell ?? {}), [occKeyFg]: occRepFg + 1 }
              return { ...d, occamyRepeatByTargetSpell: m }
            })
          } else {
            state = state.map((d) => (d.id === atk0.id ? stripOccamyRepeatsForTarget(d, target.id) : d))
          }
        }

      // ── LOCOMOTOR MORTIS: devolve 25-150% do dano recebido no turno ─────────
      } else if (spell.special === "locomotor_retaliate") {
        const freshAtk = state.find((d) => d.id === attacker.id)
        const dmgReceived = freshAtk?.damageReceivedThisTurn ?? 0
        const pct = Math.floor(Math.random() * 126) + 25
        let retalDmg = Math.round(dmgReceived * pct / 100)
        const atkForCinzal = state.find((d) => d.id === attacker.id)
        const cinzStacks = atkForCinzal?.cinzalWeakenStacks ?? 0
        if (cinzStacks > 0) retalDmg = Math.round(retalDmg * Math.pow(0.85, cinzStacks))
        const targWand = state.find((d) => d.id === target.id)?.wand
        const retalBeforeCap = retalDmg
        retalDmg = capThestralIncomingDamage(targWand, retalDmg)
        if (WAND_PASSIVES[targWand ?? ""]?.effect === "thestral_cap300" && retalBeforeCap > retalDmg) {
          logs.push(
            `→ 🪶 Thestral Hair: ${target.name} capped Locomotor Mortis to ${retalDmg} (${retalBeforeCap} → cap 300).`
          )
        }
        const bloq = protegoBlocks(target)
        if (retalDmg > 0 && !bloq) {
          state = state.map((d) =>
            d.id === target.id
              ? {
                  ...d,
                  hp: applyDamage(d.hp, retalDmg, { thestral: d.wand === "thestral" }),
                  damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + retalDmg,
                  lastSingleHitDamageReceived: retalDmg,
                }
              : d
          )
          logs.push(`→ 💀 Locomotor Mortis! ${attacker.name} returned ${retalDmg} damage (${pct}% of ${dmgReceived}) to ${target.name}!`)
        } else if (dmgReceived === 0) {
          logs.push(`→ Locomotor Mortis: ${attacker.name} received no damage this turn.`)
        }
        animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: false, isCrit: false, delay: 1000, damage: retalDmg, isBlock: bloq, fctOnly: true })

      // ── FLUXO PADRÃO (single target) ────────────────────────────────────────
      } else {
        const streak = attacker.missStreakBySpell?.[sn] ?? 0
        const atkLive = state.find((d) => d.id === attacker.id) ?? attacker
        // Occamy: verifica se o alvo usou o mesmo feitiço nesta rodada
        const occamyMirror = WAND_PASSIVES[atkLive.wand]?.effect === "occamy_mirror" &&
          normSpell(params.actions.find((a) => a.casterId === target.id)?.spellName ?? "") === n
        const occKeySt = occamyRepeatKey(target.id, n)
        const occRepeatSt = occamyMirror ? (atkLive.occamyRepeatByTargetSpell?.[occKeySt] ?? 0) : 0
        const hit = rollHit(atkLive, target, spell, streak, sn, occRepeatSt)
        if (!hit && WAND_PASSIVES[atkLive.wand]?.effect === "occamy_mirror") {
          state = state.map((d) => (d.id === atkLive.id ? stripOccamyRepeatsForTarget(d, target.id) : d))
        }
        if (hit) {
          let damage =
            getSpellMaxPower(spell) > 0
              ? calculateDamage(
                  atkLive,
                  target,
                  rollCombatPower(atkLive, spell, sn, target, logs),
                  n,
                  spell,
                  occamyMirror,
                  logs,
                  occRepeatSt
                )
              : 0
          let isCrit = false

          if (n.includes("incendio") && damage > 0) {
            const comboStacks = atkLive.incendioCombo ?? 0
            if (comboStacks > 0) {
              const mult = 1 + comboStacks * 0.2
              damage = Math.round(damage * mult)
              logs.push(`→ 🔥 Incendio Combo: ${attacker.name} is in sequence (${comboStacks}) and amplified damage (${Math.round(mult * 100)}%).`)
            }
          }

          // CRUCIUS: +30% dano por debuff no alvo
          if (n.includes("crucius") && damage > 0 && target.debuffs.length > 0) {
            damage = Math.round(damage * (1 + 0.3 * target.debuffs.length))
          }

          // DEPULSO: +50% dano se for o único spell de poder na build
          if (n.includes("depulso") && damage > 0) {
            const playerSpells = Object.keys(atkLive.spellMana ?? {})
            const powerSpells = playerSpells.filter(spellName => {
              const spellInfo = getSpellInfo(spellName, params.spellDatabase)
              return spellInfo && getSpellMaxPower(spellInfo) > 0
            })
            if (powerSpells.length === 1 && powerSpells[0] === sn) {
              damage = Math.round(damage * 1.5)
              logs.push(`→ Depulso Solo Power! ${attacker.name}'s only damage spell - +50% damage!`)
            }
          }

          if (damage > 0 && spell.canCrit !== false && Math.random() < getCritChance(attacker, target, n, logs)) {
            damage *= 2
            isCrit = true
          }

          const bloqueado = protegoBlocks(target)
          if (bloqueado) {
            damage = 0
            logs.push(`→ ${sn} was blocked by ${target.name}'s Protego!`)
          } else if (damage > 0) {
            if (!ignoresDefense) damage = Math.max(0, damage - (target.defense ?? 0))
            // Dano mínimo garantido de 25 para spells ofensivas não bloqueadas
            if (getSpellMaxPower(spell) > 0 && damage < 25) damage = 25
            if (damage > 0) logs.push(`→ ${isCrit ? "💥 CRITICAL! " : ""}${sn} caused ${damage} damage to ${target.name}!`)
          }
          if (damage > 0) applyDamageWithCircum(target.id, damage, attacker.id, n)

          // PROTEGO MAXIMO: cura 200 HP se atacante critar enquanto ativo
          if (isCrit && damage > 0 && !bloqueado) {
            const refreshedT = state.find((d) => d.id === target.id)
            if (refreshedT?.debuffs.some((d) => d.type === "protego_maximo")) {
              state = state.map((d) => (d.id === target.id ? { ...d, hp: healFlatTotal(d.hp, 200) } : d))
              logs.push(`→ 🛡️ Protego Maximo! ${target.name} healed 200 HP (critical on shield)!`)
            }
          }

          // ORAQI ORALA: ao receber crítico, 30% chance de invulnerabilidade no próximo turno
          if (isCrit && damage > 0 && !bloqueado && WAND_PASSIVES[target.wand]?.effect === "oraq_orala_invuln_crit") {
            if (Math.random() < 0.3) {
              state = state.map((d) => (d.id === target.id ? { ...d, debuffs: [...d.debuffs, { type: "invulnerable" as DebuffType, duration: 1 }] } : d))
              logs.push(`→ 🪶 Oraqui Orala Feather! ${target.name} gains invulnerability next turn (30% active).`)
            }
          }

          // INCREMENTA CONTADOR DE MALDIÇÕES: Crucio, Imperio, Avada Kedavra
          if (spell.isUnforgivable) {
            state = state.map((d) => (d.id === attacker.id ? { ...d, unforgivableUsedCount: (d.unforgivableUsedCount ?? 0) + 1 } : d))
          }

          animationsToPlay.push({ type: "cast", casterId: attacker.id, spellName: sn, targetId: target.id, isMiss: false, isCrit, delay: 1000, damage, isBlock: bloqueado, fctOnly: true })
          applySpellDebuffTo(target.id)

          // LUMUS: −10% acerto no alvo (2t) — aplica mesmo com dano 0
          if (n.includes("lumus") && !bloqueado) {
            state = state.map((d) =>
              d.id === target.id
                ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== "blindness"), { type: "blindness", duration: 2 }] }
                : d
            )
            logs.push(`→ Lumus! ${target.name} suffers −10% accuracy on all spells (2t).`)
          }

          // PETRIFICUS TOTALES: bloqueia 1 feitiço aleatório (2t)
          // SEMINVISO: se a magia alvo estiver trancada, Petrificus falha
          if (spell.special === "petrificus_disable" && !bloqueado) {
            const ft = state.find((d) => d.id === target.id)
            const keys = ft?.spellMana ? Object.keys(ft.spellMana) : []
            if (keys.length > 0) {
              const rk = keys[Math.floor(Math.random() * keys.length)]
              // Check if the spell is locked by Seminviso
              const lockedSpellInfo = params.spellDatabase.find(s => s.name === rk)
              if (lockedSpellInfo?.isLocked) {
                logs.push(`→ Petrificus Totales! "${rk}" of ${target.name} is locked by Seminviso! Petrificus failed.`)
              } else {
                state = state.map((d) => {
                  if (d.id !== target.id) return d
                  const ds = { ...(d.disabledSpells || {}) }
                  ds[rk] = 2
                  return { ...d, disabledSpells: ds }
                })
                logs.push(`→ Petrificus Totales! "${rk}" of ${target.name} blocked (2t).`)
              }
            }
          }

          // TREVUS: 2 debuffs aleatórios (1t)
          if (spell.special === "trevus_random" && !bloqueado) {
            const pool = [...TREVUS_RANDOM_DEBUFFS].sort(() => Math.random() - 0.5)
            const a = pool[0]
            const b = pool.find((t) => t !== a) ?? pool[1]
            const tname = state.find((d) => d.id === target.id)?.name ?? target.name
            for (const dt of [a, b]) {
              state = state.map((d) =>
                d.id === target.id ? { ...d, debuffs: [...d.debuffs.filter((x) => x.type !== dt), { type: dt, duration: 1 }] } : d
              )
            }
            logs.push(`→ Trevus! ${tname} received two random effects (1t each).`)
          }

          // VERMILLIOUS: golpes extras (1 por 100 HP perdido pelo lançador, máx. 8)
          if (spell.special === "vermillious_dynamic_hits" && !bloqueado) {
            const atkNow = state.find((d) => d.id === attacker.id) ?? attacker
            const lostHp = 500 - getTotalHP(atkNow.hp)
            const extras = Math.min(8, Math.floor(lostHp / 100))
            for (let hi = 0; hi < extras; hi++) {
              const atkFresh = state.find((d) => d.id === attacker.id) ?? atkNow
              const tgtFresh = state.find((d) => d.id === target.id) ?? target
              if (!rollHit(atkFresh, tgtFresh, spell, 0, sn, occRepeatSt)) {
                animationsToPlay.push({
                  type: "cast",
                  casterId: attacker.id,
                  spellName: sn,
                  targetId: target.id,
                  isMiss: true,
                  isCrit: false,
                  delay: 320,
                  damage: 0,
                  isBlock: false,
                  fctOnly: true,
                })
                continue
              }
              let exDmg = calculateDamage(
                atkFresh,
                tgtFresh,
                rollCombatPower(atkFresh, spell, sn, tgtFresh, logs),
                n,
                spell,
                occamyMirror,
                logs,
                occRepeatSt
              )
              const exBloq = protegoBlocks(tgtFresh)
              if (exBloq) exDmg = 0
              else if (!ignoresDefense) exDmg = Math.max(0, exDmg - (tgtFresh.defense ?? 0))
              if (exDmg > 0 && getSpellMaxPower(spell) > 0 && exDmg < 25) exDmg = 25
              if (exDmg > 0) applyDamageWithCircum(target.id, exDmg, attacker.id, n)
              animationsToPlay.push({
                type: "cast",
                casterId: attacker.id,
                spellName: sn,
                targetId: target.id,
                isMiss: false,
                isCrit: false,
                delay: 350,
                damage: exDmg,
                isBlock: exBloq,
                fctOnly: true,
              })
            }
            if (extras > 0) logs.push(`→ Vermillious! +${extras} extra hit(s) (${lostHp} HP below maximum).`)
          }

          // AQUA ERUCTO: +25 dano por debuff no atacante; limpa BURN próprio
          if (n.includes("aqua") && n.includes("eructo")) {
            let debuffBonus = attacker.debuffs.length * 25
            const atkAqua = state.find((d) => d.id === attacker.id)
            const aqStacks = atkAqua?.cinzalWeakenStacks ?? 0
            if (aqStacks > 0) debuffBonus = Math.round(debuffBonus * Math.pow(0.85, aqStacks))
            if (debuffBonus > 0 && !bloqueado) {
              applyDamageWithCircum(target.id, debuffBonus, attacker.id, n)
              logs.push(`→ Aqua Eructo: +${debuffBonus} damage (${attacker.debuffs.length} debuffs on user)!`)
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
                logs.push(`→ Rictumsempra! ${target.name} lost 1 mana from "${rk}".`)
              }
            }
          }

          // OBLIVIATE: reduz pela metade a mana de feitiço aleatório do alvo (permanente)
          // SEMINVISO: se a magia alvo estiver trancada, Obliviate falha
          if (spell.special === "obliviate_mana" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            const sm = freshTarget?.spellMana
            if (sm) {
              const keys = Object.keys(sm)
              if (keys.length > 0) {
                const rk = keys[Math.floor(Math.random() * keys.length)]
                // Check if the spell is locked by Seminviso
                const lockedSpellInfo = params.spellDatabase.find(s => s.name === rk)
                if (lockedSpellInfo?.isLocked) {
                  logs.push(`→ Obliviate! "${rk}" of ${target.name} is locked by Seminviso! Obliviate failed.`)
                } else {
                  state = state.map((d) => {
                    if (d.id !== target.id) return d
                    const newSm = { ...(d.spellMana ?? {}) }
                    newSm[rk] = { current: Math.floor(newSm[rk].current / 2), max: Math.floor(newSm[rk].max / 2) }
                    return { ...d, spellMana: newSm }
                  })
                  logs.push(`→ Obliviate! Mana of "${rk}" of ${target.name} halved permanently!`)
                }
              }
            }
          }

          // SECTUMSEMPRA: lifesteal — cura metade do dano causado
          if (spell.special === "sectumsempra_lifesteal_half" && damage > 0 && !bloqueado) {
            const healAmount = Math.round(damage / 2)
            state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healFlatTotal(d.hp, healAmount) } : d))
            logs.push(`→ Sectumsempra! ${attacker.name} healed ${healAmount} HP from damage caused (half of ${damage})!`)
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
              logs.push(`→ Finite Incantatem! ${attacker.name} transferred ${casterDebuffs.length} debuff(s) to ${target.name}!`)
            } else {
              logs.push(`→ Finite Incantatem: ${attacker.name} had no removable debuffs.`)
            }
          }

          // LEGILIMENS (VIP): revela o grimório atual do oponente
          if (spell.special === "legilimens_reveal" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            const spellList = Object.keys(freshTarget?.spellMana ?? {}).join(", ") || "?"
            logs.push(`🔮 Legilimens! ${attacker.name} penetrated ${target.name}'s mind! Grimoire revealed: [${spellList}]`)
          }

          // REVELE SEUS SEGREDOS (VIP): revela o núcleo da varinha do oponente
          if (spell.special === "reveal_wand_core" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            const passive = freshTarget?.wand ? WAND_PASSIVES[freshTarget.wand] : null
            logs.push(`🔍 Reveal Your Secrets! Core of ${target.name}: ${passive?.name ?? "Unknown"} — ${passive?.description ?? ""}`)
          }

          // PIERTOTUM LOCOMOTOR: dano = 100 × contador de Maldições do oponente
          if (spell.special === "piertotum_scale" && !bloqueado) {
            const opponentCount = target.unforgivableUsedCount ?? 0
            const piertotumDamage = 100 * opponentCount
            if (piertotumDamage > 0) {
              applyDamageWithCircum(target.id, piertotumDamage, attacker.id, sn)
              logs.push(`→ Piertotum Locomotor! ${attacker.name} caused ${piertotumDamage} damage based on ${opponentCount} Curses of ${target.name}!`)
            } else {
              logs.push(`→ Piertotum Locomotor! ${target.name} hasn't used Curses yet. Damage 0.`)
            }
          }

          // BRANQUIUM REMENDO: cura errática para ambos
          if (spell.special === "branquium_heal" && !bloqueado) {
            const totalHpAttacker = getTotalHP(attacker.hp)
            const totalHpTarget = getTotalHP(target.hp)
            const multAttacker = 0.25 + Math.random() * 1.75 // 0.25 to 2.0
            const multTarget = 0.30 + Math.random() * 2.70 // 0.30 to 3.0
            const healAttacker = Math.round(totalHpAttacker * multAttacker)
            const healTarget = Math.round(totalHpTarget * multTarget)
            state = state.map((d) => {
              if (d.id === attacker.id) return { ...d, hp: healFlatTotal(d.hp, healAttacker) }
              if (d.id === target.id) return { ...d, hp: healFlatTotal(d.hp, healTarget) }
              return d
            })
            logs.push(`→ Branquium Remendo! ${attacker.name} healed ${healAttacker} HP (${(multAttacker * 100).toFixed(0)}×) and ${target.name} healed ${healTarget} HP (${(multTarget * 100).toFixed(0)}×)!`)
          }

          // SILÊNCIO: silencia última magia do oponente por 1 turno E reduz 1 de mana
          if (spell.special === "silence_spell" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            const lastSpell = freshTarget?.lastSpellUsed
            if (lastSpell) {
              state = state.map((d) => {
                if (d.id === target.id) {
                  const silenced = [...(d.silencedSpells || []), lastSpell]
                  // Also reduce 1 mana from the silenced spell
                  const newSm = { ...(d.spellMana ?? {}) }
                  if (newSm[lastSpell]) {
                    newSm[lastSpell] = { ...newSm[lastSpell], current: Math.max(0, newSm[lastSpell].current - 1) }
                  }
                  return { ...d, silencedSpells: silenced, spellMana: newSm }
                }
                return d
              })
              logs.push(`→ Silence! "${lastSpell}" of ${target.name} was silenced for 1 turn and lost 1 mana!`)
            } else {
              logs.push(`→ Silence! ${target.name} hasn't used any spell yet. Effect failed.`)
            }
          }

          // DESILUSÃO: aplica invisibilidade ao oponente (1 turno) - oponente tem +25% chance de errar
          if (spell.special === "desilusao_invisibility") {
            state = state.map((d) => {
              if (d.id === target.id) {
                return { ...d, debuffs: [...d.debuffs, { type: "invisibility" as DebuffType, duration: 1 }] }
              }
              return d
            })
            logs.push(`→ Desillusion! ${target.name} is invisible! +25% miss chance next turn.`)
          }

          // EXPULSO: remove 1 spell e insere outra imediatamente (sem "buraco" em spellMana/spells)
          // SEMINVISO: se a magia alvo estiver trancada, Expulso falha
          if (spell.special === "expulso_swap" && !bloqueado) {
            const freshTarget = state.find((d) => d.id === target.id)
            if (freshTarget?.spellMana) {
              const targetSpells = Object.keys(freshTarget.spellMana)
              if (targetSpells.length > 0) {
                const removedSpell = targetSpells[Math.floor(Math.random() * targetSpells.length)]
                // Check if the spell is locked by Seminviso
                const lockedSpellInfo = params.spellDatabase.find(s => s.name === removedSpell)
                if (lockedSpellInfo?.isLocked) {
                  logs.push(`→ Expulso! "${removedSpell}" of ${target.name} is locked by Seminviso! Expulso failed.`)
                } else {
                  const remainingKeys = targetSpells.filter((k) => k !== removedSpell)
                  const newSpell = pickExpulsoReplacementSpell(remainingKeys, params.spellDatabase)
                  state = state.map((d) => {
                    if (d.id !== target.id) return d
                    const newSm = { ...(d.spellMana ?? {}) }
                    delete newSm[removedSpell]
                    newSm[newSpell.name] = { current: newSpell.pp, max: newSpell.pp }
                    const keys = Object.keys(newSm).sort((a, b) => a.localeCompare(b))
                    return { ...d, spellMana: newSm, spells: keys }
                  })
                  logs.push(`→ Expulso! ${attacker.name} replaced "${removedSpell}" of ${target.name} with "${newSpell.name}"!`)
                }
              }
            }
          }

          // FLAGRATE: remove a passiva da varinha do alvo
          if (spell.special === "flagrate_strip" && !bloqueado && damage > 0) {
            const freshTarget = state.find((d) => d.id === target.id)
            if (freshTarget?.wand && WAND_PASSIVES[freshTarget.wand]) {
              const strippedName = WAND_PASSIVES[freshTarget.wand].name
              state = state.map((d) => (d.id === target.id ? { ...d, wand: "" } : d))
              logs.push(`→ 🔥 Flagrate! Core "${strippedName}" of ${target.name} was destroyed!`)
            } else {
              logs.push(`→ Flagrate: ${target.name} has no active core passive.`)
            }
          }

          // Occamy: uma “repetição” por lançamento acertado (Vermillious/Flagellum não somam várias no mesmo turno)
          if (occamyMirror) {
            state = state.map((d) => {
              if (d.id !== atkLive.id) return d
              const m = { ...(d.occamyRepeatByTargetSpell ?? {}), [occKeySt]: occRepeatSt + 1 }
              return { ...d, occamyRepeatByTargetSpell: m }
            })
          } else {
            state = state.map((d) => (d.id === atkLive.id ? stripOccamyRepeatsForTarget(d, target.id) : d))
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
        incendioCombo: n.includes("incendio") ? (d.incendioCombo ?? 0) + 1 : 0,
        lastRoundSpellWasProtego: n.includes("protego") ? d.lastRoundSpellWasProtego : false,
        lastRoundSpellWasLumus: n.includes("lumus") ? d.lastRoundSpellWasLumus : false,
        nextAccBonusPct: undefined,
        nextDamagePotionMult: undefined,
        silencedSpells: undefined,
        unforgivableUsedCount: undefined,
      }
    })

    const atkAfter = state.find((x) => x.id === action.casterId)
    if (atkAfter && WAND_PASSIVES[atkAfter.wand]?.effect === "phoenix_regen") {
      // Fênix: cura 25-75 HP fixo por turno (atualizado)
      const healAmt = Math.floor(Math.random() * 51) + 25
      state = state.map((d) => (d.id === attacker.id ? { ...d, hp: healFlatTotal(d.hp, healAmt) } : d))
      logs.push(`→ 🦅 Phoenix Feather! ${attacker.name} regenerated ${healAmt} HP!`)
      // CHARM: espelha a cura de Phoenix para quem encantou o atacante
      const charmDebuff = atkAfter.debuffs.find((x) => x.type === "charm")
      if (charmDebuff?.meta) {
        state = state.map((d) => d.id === charmDebuff.meta ? { ...d, hp: healFlatTotal(d.hp, healAmt) } : d)
      }
    }

    const outcomeMid = evaluateOutcome(state)
    if (outcomeMid) return { newDuelists: state, logs, animationsToPlay, outcome: outcomeMid, orderedActions }
  }

  // ── PARRY SYSTEM ─────────────────────────────────────────────────────────────
  // Check for Parry: if both players used the same spell and one is parrying
  const castActions = orderedActions.filter((a) => a.type === "cast")
  if (castActions.length === 2) {
    const actionA = castActions[0]
    const actionB = castActions[1]
    const spellA = actionA.spellName
    const spellB = actionB.spellName
    const isParryingA = actionA.isParrying
    const isParryingB = actionB.isParrying

    // Track damage dealt by each player in this turn
    const damageDealt = new Map<string, number>()
    state.forEach((d) => {
      const prev = params.duelists.find((p) => p.id === d.id)
      if (prev) {
        const prevHp = getTotalHP(prev.hp)
        const currHp = getTotalHP(d.hp)
        const damageTaken = prevHp - currHp
        if (damageTaken > 0) {
          damageDealt.set(d.id, damageTaken)
        }
      }
    })

    // Check if PlayerA is parrying and used the same spell as PlayerB
    if (isParryingA && spellA === spellB) {
      const damageA = damageDealt.get(actionB.casterId) || 0
      const damageB = damageDealt.get(actionA.casterId) || 0
      const totalDamage = damageA + damageB

      // Set PlayerA damage to ZERO
      state = state.map((d) => {
        if (d.id === actionA.casterId) {
          // Restore HP to pre-turn state
          const prev = params.duelists.find((p) => p.id === d.id)
          return prev ? { ...d, hp: prev.hp, parryUses: (d.parryUses ?? 0) + 1 } : d
        }
        return d
      })

      // Set PlayerB damage to (DamageA + DamageB)
      state = state.map((d) => {
        if (d.id === actionB.casterId) {
          const prev = params.duelists.find((p) => p.id === d.id)
          if (prev) {
            const hp = applyDamage(prev.hp, totalDamage, { thestral: d.wand === "thestral" })
            return { ...d, hp }
          }
        }
        return d
      })

      logs.push(`⚔️ PERFECT PARRY! ${state.find((d) => d.id === actionA.casterId)?.name} reflected ${spellA} from ${state.find((d) => d.id === actionB.casterId)?.name} with double force!`)
    } else if (isParryingA) {
      // Parry failed: subtract 1 mana from PlayerA (cost of attempting parry)
      state = state.map((d) => {
        if (d.id === actionA.casterId && d.spellMana && spellA) {
          const sm = { ...d.spellMana }
          if (sm[spellA]) {
            sm[spellA] = { ...sm[spellA], current: Math.max(0, sm[spellA].current - 1) }
          }
          return { ...d, spellMana: sm, parryUses: (d.parryUses ?? 0) + 1 }
        }
        return d
      })
      logs.push(`⚔️ PARRY failed! ${state.find((d) => d.id === actionA.casterId)?.name} lost 1 mana (different spells).`)
    }

    // Same logic for PlayerB parrying
    if (isParryingB && spellB === spellA && !isParryingA) {
      const damageB = damageDealt.get(actionA.casterId) || 0
      const damageA = damageDealt.get(actionB.casterId) || 0
      const totalDamage = damageB + damageA

      // Set PlayerB damage to ZERO
      state = state.map((d) => {
        if (d.id === actionB.casterId) {
          const prev = params.duelists.find((p) => p.id === d.id)
          return prev ? { ...d, hp: prev.hp, parryUses: (d.parryUses ?? 0) + 1 } : d
        }
        return d
      })

      // Set PlayerA damage to (DamageB + DamageA)
      state = state.map((d) => {
        if (d.id === actionA.casterId) {
          const prev = params.duelists.find((p) => p.id === d.id)
          if (prev) {
            const hp = applyDamage(prev.hp, totalDamage, { thestral: d.wand === "thestral" })
            return { ...d, hp }
          }
        }
        return d
      })

      logs.push(`⚔️ PERFECT PARRY! ${state.find((d) => d.id === actionB.casterId)?.name} reflected ${spellB} from ${state.find((d) => d.id === actionA.casterId)?.name} with double force!`)
    } else if (isParryingB && !isParryingA) {
      // Parry failed: subtract 1 mana from PlayerB (cost of attempting parry)
      state = state.map((d) => {
        if (d.id === actionB.casterId && d.spellMana && spellB) {
          const sm = { ...d.spellMana }
          if (sm[spellB]) {
            sm[spellB] = { ...sm[spellB], current: Math.max(0, sm[spellB].current - 1) }
          }
          return { ...d, spellMana: sm, parryUses: (d.parryUses ?? 0) + 1 }
        }
        return d
      })
      logs.push(`⚔️ PARRY failed! ${state.find((d) => d.id === actionB.casterId)?.name} lost 1 mana (different spells).`)
    }

    // Both parrying with same spell: both take 0 damage, both increment parryUses
    if (isParryingA && isParryingB && spellA === spellB) {
      state = state.map((d) => {
        if (d.id === actionA.casterId) {
          return { ...d, parryUses: (d.parryUses ?? 0) + 1 }
        }
        if (d.id === actionB.casterId) {
          return { ...d, parryUses: (d.parryUses ?? 0) + 1 }
        }
        return d
      })
      logs.push(`⚔️ TECHNICAL PARRY DRAW! Both reflected ${spellA} simultaneously!`)
    }
  }

  // ── Dano periódico (DoT) com FCT visível ───────────────────────────────────
  const dotInfo: Array<{ id: string; name: string; burnDmg: number; poisonDmg: number }> = []
  state = state.map((d) => {
    let hp = d.hp
    let burnDmg = 0,
      poisonDmg = 0
    let lastTick = d.lastSingleHitDamageReceived
    if (d.debuffs.some((x) => x.type === "burn")) {
      burnDmg = capThestralIncomingDamage(d.wand, 25)
      hp = applyDamage(hp, burnDmg, { thestral: d.wand === "thestral" })
      lastTick = burnDmg
    }
    if (d.debuffs.some((x) => x.type === "poison")) {
      poisonDmg = capThestralIncomingDamage(d.wand, 50)
      hp = applyDamage(hp, poisonDmg, { thestral: d.wand === "thestral" })
      lastTick = poisonDmg
    }
    if (burnDmg > 0 || poisonDmg > 0) dotInfo.push({ id: d.id, name: d.name, burnDmg, poisonDmg })
    return {
      ...d,
      hp,
      lastSingleHitDamageReceived: burnDmg > 0 || poisonDmg > 0 ? lastTick : d.lastSingleHitDamageReceived,
    }
  })
  for (const dot of dotInfo) {
    if (dot.burnDmg > 0) {
      logs.push(`🔥 ${dot.name} suffered ${dot.burnDmg} burn damage!`)
      animationsToPlay.push({ type: "cast", casterId: dot.id, spellName: "Queimadura", targetId: dot.id, isMiss: false, isCrit: false, delay: 500, damage: dot.burnDmg, isBlock: false, fctOnly: true })
    }
    if (dot.poisonDmg > 0) {
      logs.push(`☠️ ${dot.name} suffered ${dot.poisonDmg} poison damage!`)
      animationsToPlay.push({ type: "cast", casterId: dot.id, spellName: "Veneno", targetId: dot.id, isMiss: false, isCrit: false, delay: 500, damage: dot.poisonDmg, isBlock: false, fctOnly: true })
    }
  }
  // BOMBA: explode quando o contador expira (duration === 1, prestes a ser removido)
  const bombaTargets = state.filter((d) => d.debuffs.some((x) => x.type === "bomba" && x.duration === 1))
  for (const bd of bombaTargets) {
    const bombRaw = Math.round(((500 - getTotalHP(bd.hp)) / 100) * 25)
    const bombDmg = capThestralIncomingDamage(bd.wand, bombRaw)
    if (bombDmg > 0) {
      if (WAND_PASSIVES[bd.wand ?? ""]?.effect === "thestral_cap300" && bombRaw > bombDmg) {
        logs.push(`→ 🪶 Thestral Hair: ${bd.name} capped the BOMB to ${bombDmg} (${bombRaw} → cap 300).`)
      }
      logs.push(`💣 BOMB exploded on ${bd.name}! ${bombDmg} damage!`)
      state = state.map((d) =>
        d.id === bd.id
          ? {
              ...d,
              hp: applyDamage(d.hp, bombDmg, { thestral: d.wand === "thestral" }),
              damageReceivedThisTurn: (d.damageReceivedThisTurn ?? 0) + bombDmg,
              lastSingleHitDamageReceived: bombDmg,
            }
          : d
      )
      animationsToPlay.push({ type: "cast", casterId: bd.id, spellName: "Subito", targetId: bd.id, isMiss: false, isCrit: false, delay: 200, damage: bombDmg, isBlock: false, fctOnly: true })
    }
  }
  // ── Final do turno: limpa flags temporários e reduz debuffs ───────────────────────
  state = state.map((d) => ({
    ...d,
    isUndeadThisTurn: false, // Limpa flag de imortalidade temporária
  }))
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
