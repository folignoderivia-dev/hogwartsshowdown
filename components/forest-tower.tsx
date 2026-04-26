import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient } from "@/lib/supabase"
import { FOREST_MONSTERS, getMonsterByFloor, type ForestMonster } from "@/lib/forest-data"
import { SPELL_DATABASE, INITIAL_PLAYER_BUILD, WAND_PASSIVES, HOUSE_GDD, HOUSE_MODIFIERS, rollSpellPower } from "@/lib/data-store"
import { getSpellInfo } from "@/lib/turn-engine"
import type { PlayerBuild } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"
import type { AppLocale } from "@/contexts/language-context"
import { Swords, Heart, Shield, Zap, X, Trophy, FlaskConical } from "lucide-react"

interface ForestTowerProps {
  playerBuild: PlayerBuild
  currentUser: { id: string; username: string; email: string; elo: number }
  onExit: () => void
  onAuthChange: (user: any) => void
}

interface CombatLog {
  message: string
  type: "player" | "monster" | "system" | "passive"
}

function buildSpellManaForSpells(spells: string[], house: string): Record<string, { current: number; max: number }> {
  const out: Record<string, { current: number; max: number }> = {}
  spells.forEach((sn) => {
    const info = getSpellInfo(sn, SPELL_DATABASE)
    if (!info) return
    let max = info.pp
    if (house === "gryffindor") max = Math.max(1, max + HOUSE_GDD.gryffindor.manaStartDelta)
    if (house === "ravenclaw" && !info.isUnforgivable) max += HOUSE_GDD.ravenclaw.manaBonusNonUnforgivable
    out[sn] = { current: max, max }
  })
  return out
}

export default function ForestTower({ playerBuild, currentUser, onExit, onAuthChange }: ForestTowerProps) {
  const { locale } = useLanguage()
  const supabase = getSupabaseClient()
  
  const [currentFloor, setCurrentFloor] = useState(1)
  const [isLoaded, setIsLoaded] = useState(false)
  // Calculate player HP based on house: 5 hearts (500 HP) or 4 hearts (400 HP) if Slytherin
  const playerMaxHp = playerBuild.house === "slytherin" ? 400 : 500
  const [playerHp, setPlayerHp] = useState(playerMaxHp)
  const [maxPlayerHp] = useState(playerMaxHp)
  const [monsterHp, setMonsterHp] = useState(0)
  const [maxMonsterHp, setMaxMonsterHp] = useState(0)
  const [selectedSpell, setSelectedSpell] = useState<string | null>(null)
  const [turnNumber, setTurnNumber] = useState(0)
  const [combatLog, setCombatLog] = useState<CombatLog[]>([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [isCombatOver, setIsCombatOver] = useState(false)
  const [combatResult, setCombatResult] = useState<"win" | "lose" | null>(null)
  const [monster, setMonster] = useState<ForestMonster | null>(null)
  
  // Debuff states
  const [playerDebuffs, setPlayerDebuffs] = useState<Set<string>>(new Set())
  const [monsterDebuffs, setMonsterDebuffs] = useState<Set<string>>(new Set())
  
  // Passive states
  const [monsterDamageMultiplier, setMonsterDamageMultiplier] = useState(1)
  const [monsterDamageReduction, setMonsterDamageReduction] = useState(0)
  const [arpeuMissCount, setArpeuMissCount] = useState(0)
  const [barreteCritRate, setBarreteCritRate] = useState(25)
  const [centaurTurnCount, setCentaurTurnCount] = useState(0)
  const [erumpentTurnCount, setErumpentTurnCount] = useState(0)
  const [werewolfHealed, setWerewolfHealed] = useState(false)
  const [acromantulaTurnCount, setAcromantulaTurnCount] = useState(0)
  const [playerSleepTurns, setPlayerSleepTurns] = useState(0)
  const [playerPoisonTurns, setPlayerPoisonTurns] = useState(0)
  const [monsterStunTurns, setMonsterStunTurns] = useState(0)
  const [monsterFreezeTurns, setMonsterFreezeTurns] = useState(0)
  const [monsterPoisonTurns, setMonsterPoisonTurns] = useState(0)
  const [monsterBurnTurns, setMonsterBurnTurns] = useState(0)
  
  const [attempts, setAttempts] = useState(3)
  const [spellMana, setSpellMana] = useState<Record<string, { current: number; max: number }>>({})
  
  // Initialize combat
  useEffect(() => {
    loadAttempts()
  }, [])
  
  // Initialize combat after loading attempts
  useEffect(() => {
    if (isLoaded) {
      initializeCombat()
    }
  }, [isLoaded])
  
  const loadAttempts = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("tentativas_floresta, floresta")
        .eq("id", currentUser.id)
        .single()
      
      if (data) {
        // Check if it's a new day (after 00:01) and reset attempts to 3
        const today = new Date().toISOString().split('T')[0]
        const lastReset = localStorage.getItem(`forest_reset:${currentUser.id}`)
        
        if (lastReset !== today) {
          // Reset attempts to 3 for new day
          const { error: resetError } = await supabase
            .from("profiles")
            .update({ tentativas_floresta: 3 })
            .eq("id", currentUser.id)
          
          if (!resetError) {
            localStorage.setItem(`forest_reset:${currentUser.id}`, today)
            setAttempts(3)
          } else {
            setAttempts(data.tentativas_floresta ?? 3)
          }
        } else {
          setAttempts(data.tentativas_floresta ?? 3)
        }
        
        if (data.floresta) {
          setCurrentFloor(data.floresta)
        }
        
        setIsLoaded(true)
      }
    } catch (error) {
      console.error("Failed to load attempts:", error)
      setIsLoaded(true)
    }
  }
  
  const initializeCombat = () => {
    const currentMonster = getMonsterByFloor(currentFloor)
    if (!currentMonster) return
    
    setMonster(currentMonster)
    setMonsterHp(currentMonster.hp)
    setMaxMonsterHp(currentMonster.hp)
    setPlayerHp(maxPlayerHp)
    setTurnNumber(0)
    setCombatLog([])
    setIsPlayerTurn(true)
    setIsCombatOver(false)
    setCombatResult(null)
    setPlayerDebuffs(new Set())
    setMonsterDebuffs(new Set())
    setMonsterDamageMultiplier(1)
    setMonsterDamageReduction(0)
    setArpeuMissCount(0)
    setBarreteCritRate(25)
    setCentaurTurnCount(0)
    setErumpentTurnCount(0)
    setWerewolfHealed(false)
    setAcromantulaTurnCount(0)
    setPlayerSleepTurns(0)
    setPlayerPoisonTurns(0)
    setMonsterPoisonTurns(0)
    
    // Initialize spell mana
    setSpellMana(buildSpellManaForSpells(playerBuild.spells || [], playerBuild.house))
    
    addLog(locale === "en" ? `Floor ${currentFloor}: ${currentMonster.nameEn} appears!` : `Andar ${currentFloor}: ${currentMonster.name} aparece!`, "system")
  }
  
  const addLog = (message: string, type: CombatLog["type"]) => {
    setCombatLog(prev => [...prev, { message, type }])
  }
  
  const rollAccuracy = (accuracy: number): boolean => {
    return Math.random() * 100 < accuracy
  }
  
  const calculateDamage = (minDmg: number, maxDmg: number): number => {
    return Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg
  }
  
  const applyMonsterPassives = useCallback(() => {
    if (!monster) return
    
    // Kelpie and Hippogrifo always have priority
    if (monster.passive === "priority" || monster.passive === "priority_no_crit") {
      return true // Monster acts first
    }
    return false
  }, [monster])
  
  const handlePlayerAttack = async () => {
    if (!selectedSpell || !monster || !isPlayerTurn || isCombatOver) return
    
    // Check spell mana
    const manaInfo = spellMana[selectedSpell]
    if (!manaInfo || manaInfo.current <= 0) {
      addLog(locale === "en" ? `${selectedSpell} has no mana left!` : `${selectedSpell} não tem mana restante!`, "system")
      return
    }
    
    setIsPlayerTurn(false)
    
    // Check if player is sleeping
    if (playerSleepTurns > 0) {
      addLog(locale === "en" ? "You are sleeping and skip this turn!" : "Você está dormindo e perde este turno!", "system")
      setPlayerSleepTurns(prev => prev - 1)
      setTimeout(() => handleMonsterAttack(), 1000)
      return
    }
    
    const spell = SPELL_DATABASE.find(s => s.name === selectedSpell)
    if (!spell) return
    
    // Decrease spell mana
    setSpellMana(prev => ({
      ...prev,
      [selectedSpell]: { ...prev[selectedSpell], current: Math.max(0, prev[selectedSpell].current - 1) }
    }))
    
    // Calculate player accuracy with monster's reduction
    const accReduction = Math.random() * (monster.opponentAccReduction.max - monster.opponentAccReduction.min) + monster.opponentAccReduction.min
    let playerAccuracy = 100 - accReduction
    
    // Apply wand core passives to accuracy
    const wandEffect = WAND_PASSIVES[playerBuild.wand]?.effect
    if (!spell.isUnforgivable && wandEffect === "accuracy_plus10") {
      playerAccuracy += 10
    }
    if (wandEffect === "crit20_acc_minus15") {
      playerAccuracy -= 15
    }
    
    // Basilisco immunity to unforgivable curses
    if (monster.passive === "basilisco_immunities" && spell.isUnforgivable) {
      addLog(locale === "en" ? "The Basilisk is immune to unforgivable curses!" : "O Basilisco é imune a maldições imperdoáveis!", "passive")
      setTimeout(() => handleMonsterAttack(), 1000)
      return
    }
    
    // Check if monster is immune to debuffs
    const monsterImmuneToDebuffs = monster.passive === "immune_all_debuffs" || monster.passive === "basilisco_immunities"
    
    // Hippogrifo doesn't receive critical hits
    const canCrit = monster.passive !== "priority_no_crit" && spell.canCrit !== false
    
    // Calculate crit chance
    let critChance = 10
    if (wandEffect === "crit20_acc_minus15") {
      critChance += 20
    }
    if (playerBuild.house === "slytherin") {
      critChance += 25 // Slytherin gets +25% crit chance
    }
    
    const isCrit = canCrit && Math.random() * 100 < critChance
    
    if (rollAccuracy(playerAccuracy)) {
      let damage = calculateDamage(spell.powerMin || spell.power || 0, spell.powerMax || spell.power || 0)
      
      // Apply wand core passives to damage
      if (wandEffect === "crupe_triple" && !spell.debuff && Math.random() < 0.25) {
        damage *= 3
        addLog(locale === "en" ? "Crupe Hair: Triple damage!" : "Pelo de Crupe: Dano triplicado!", "passive")
      }
      
      // Apply house GDD to damage
      if (playerBuild.house === "gryffindor") {
        damage *= 1.05 // Gryffindor slight damage bonus
      }
      
      // Apply Arpeu damage growth on miss (opposite - player hit, so no growth)
      if (monster.passive === "damage_on_miss") {
        // No growth on hit
      }
      
      // Rapinomonio mana drain on crit
      if (monster.passive === "mana_drain_on_crit" && isCrit) {
        addLog(locale === "en" ? "Rapinomonio drains your spell mana on critical hit!" : "Rapinomonio drena a mana da sua magia no acerto crítico!", "passive")
      }
      
      // Centaur damage reduction
      if (monster.passive === "damage_reduction_growth") {
        const reduction = centaurTurnCount * 10
        damage = Math.floor(damage * (1 - reduction / 100))
      }
      
      // Acromantula damage reduction
      if (monster.passive === "growth_stats") {
        const reduction = acromantulaTurnCount * 20
        damage = Math.floor(damage * (1 - reduction / 100))
      }
      
      // Ocammy reflect damage
      if (monster.passive === "reflect_damage") {
        const reflectedDamage = Math.floor(damage * 0.2)
        setPlayerHp(prev => Math.max(0, prev - reflectedDamage))
        addLog(locale === "en" ? `Ocammy reflects ${reflectedDamage} damage to you!` : `Ocammy reflete ${reflectedDamage} de dano para você!`, "passive")
      }
      
      if (isCrit) {
        damage = Math.floor(damage * 1.5)
        addLog(locale === "en" ? `CRITICAL HIT! ${spell.name} deals ${damage} damage!` : `ACERTO CRÍTICO! ${spell.name} causa ${damage} de dano!`, "player")
      } else {
        addLog(locale === "en" ? `${spell.name} deals ${damage} damage!` : `${spell.name} causa ${damage} de dano!`, "player")
      }
      
      // Apply spell effects (burn, stun, freeze, etc)
      if (spell.effect && !monsterImmuneToDebuffs) {
        if (spell.effect === "burn") {
          setMonsterBurnTurns(2)
          addLog(locale === "en" ? `${spell.name} burns the monster for 2 turns!` : `${spell.name} queima o monstro por 2 turnos!`, "passive")
        } else if (spell.effect === "stun") {
          setMonsterStunTurns(1)
          addLog(locale === "en" ? `${spell.name} stuns the monster for 1 turn!` : `${spell.name} atordoa o monstro por 1 turno!`, "passive")
        } else if (spell.effect === "freeze") {
          setMonsterFreezeTurns(1)
          addLog(locale === "en" ? `${spell.name} freezes the monster for 1 turn!` : `${spell.name} congela o monstro por 1 turno!`, "passive")
        }
      }
      
      // Apply self-target spells (healing, protection)
      const spellNorm = spell.name.toLowerCase()
      if (spellNorm.includes("ferula")) {
        const healAmt = Math.floor(Math.random() * 126) + 25
        setPlayerHp(prev => Math.min(maxPlayerHp, prev + healAmt))
        addLog(locale === "en" ? `Ferula heals ${healAmt} HP!` : `Ferula cura ${healAmt} HP!`, "passive")
      } else if (spellNorm.includes("episkey")) {
        setPlayerHp(prev => Math.min(maxPlayerHp, prev + 50))
        addLog(locale === "en" ? `Episkey heals 50 HP!` : `Episkey cura 50 HP!`, "passive")
      } else if (spellNorm.includes("vulnera") && spellNorm.includes("sanetur")) {
        setPlayerHp(prev => Math.min(maxPlayerHp, prev + 100))
        addLog(locale === "en" ? `Vulnera Sanetur heals 100 HP!` : `Vulnera Sanetur cura 100 HP!`, "passive")
      } else if (spellNorm.includes("protego") && !spellNorm.includes("maximo") && !spellNorm.includes("diabol")) {
        addLog(locale === "en" ? `Protego activated!` : `Protego ativado!`, "passive")
      }
      
      // Apply spell debuffs
      if (spell.debuff && !monsterImmuneToDebuffs) {
        const debuffChance = spell.debuff.chance || 0
        if (Math.random() * 100 < debuffChance) {
          if (spell.debuff.type === "stun") {
            setMonsterStunTurns(spell.debuff.duration || 1)
            addLog(locale === "en" ? `${spell.name} stuns the monster!` : `${spell.name} atordoa o monstro!`, "passive")
          } else if (spell.debuff.type === "freeze") {
            setMonsterFreezeTurns(spell.debuff.duration || 1)
            addLog(locale === "en" ? `${spell.name} freezes the monster!` : `${spell.name} congela o monstro!`, "passive")
          } else if (spell.debuff.type === "burn") {
            setMonsterBurnTurns(spell.debuff.duration || 2)
            addLog(locale === "en" ? `${spell.name} burns the monster!` : `${spell.name} queima o monstro!`, "passive")
          } else {
            addLog(locale === "en" ? `${spell.name} applies ${spell.debuff.type}!` : `${spell.name} aplica ${spell.debuff.type}!`, "passive")
          }
        }
      }
      
      // Apply poison if spell has it
      if (monster.passive !== "poison_on_hit_immune" && spell.effect === "poison") {
        setMonsterPoisonTurns(2)
        addLog(locale === "en" ? "Monster is poisoned for 2 turns!" : "Monstro está envenenado por 2 turnos!", "system")
      }
      
      setMonsterHp(prev => {
        const newHp = Math.max(0, prev - damage)
        if (newHp === 0) {
          handleWin()
        }
        return newHp
      })
    } else {
      addLog(locale === "en" ? `${spell.name} misses!` : `${spell.name} erra!`, "player")
      
      // Arpeu damage on miss
      if (monster.passive === "damage_on_miss") {
        setArpeuMissCount(prev => prev + 1)
        addLog(locale === "en" ? "Arpeu's damage increases!" : "O dano do Arpeu aumenta!", "passive")
      }
    }
    
    setSelectedSpell(null)
    
    if (!isCombatOver) {
      setTimeout(() => handleMonsterAttack(), 1000)
    }
  }
  
  const handleMonsterAttack = () => {
    if (!monster || isCombatOver) return
    
    setTurnNumber(prev => prev + 1)
    
    // Get wand effect for damage cap
    const wandEffect = WAND_PASSIVES[playerBuild.wand]?.effect
    
    // Check if monster is stunned or frozen
    if (monsterStunTurns > 0) {
      setMonsterStunTurns(prev => prev - 1)
      addLog(locale === "en" ? "Monster is stunned and skips its turn!" : "Monstro está atordoado e perde o turno!", "system")
      
      // Apply burn damage even if stunned
      if (monsterBurnTurns > 0) {
        const burnDamage = 10
        setMonsterHp(prev => {
          const newHp = Math.max(0, prev - burnDamage)
          if (newHp === 0) {
            handleWin()
          }
          return newHp
        })
        setMonsterBurnTurns(prev => prev - 1)
        addLog(locale === "en" ? `Monster takes ${burnDamage} burn damage!` : `Monstro recebe ${burnDamage} de dano de queima!`, "system")
      }
      
      setIsPlayerTurn(true)
      return
    }
    
    if (monsterFreezeTurns > 0) {
      setMonsterFreezeTurns(prev => prev - 1)
      addLog(locale === "en" ? "Monster is frozen and skips its turn!" : "Monstro está congelado e perde o turno!", "system")
      
      // Apply burn damage even if frozen
      if (monsterBurnTurns > 0) {
        const burnDamage = 10
        setMonsterHp(prev => {
          const newHp = Math.max(0, prev - burnDamage)
          if (newHp === 0) {
            handleWin()
          }
          return newHp
        })
        setMonsterBurnTurns(prev => prev - 1)
        addLog(locale === "en" ? `Monster takes ${burnDamage} burn damage!` : `Monstro recebe ${burnDamage} de dano de queima!`, "system")
      }
      
      setIsPlayerTurn(true)
      return
    }
    
    // Apply monster turn-based passives
    if (monster.passive === "critical_growth") {
      setBarreteCritRate(prev => Math.min(100, prev + 10))
    }
    
    if (monster.passive === "damage_reduction_growth") {
      setCentaurTurnCount(prev => prev + 1)
    }
    
    if (monster.passive === "growth_stats") {
      setAcromantulaTurnCount(prev => prev + 1)
    }
    
    if (monster.passive === "explode_after_6") {
      setErumpentTurnCount(prev => prev + 1)
      if (erumpentTurnCount + 1 >= 6) {
        addLog(locale === "en" ? "Erumpent explodes for 400 damage!" : "Erumpente explode causando 400 de dano!", "passive")
        // Apply Thestral cap to explosion damage
        const explosionDamage = wandEffect === "thestral_cap300" ? Math.min(400, 300) : 400
        setPlayerHp(prev => Math.max(0, prev - explosionDamage))
        if (playerHp <= explosionDamage) {
          handleLose()
          return
        }
      }
    }
    
    // Apply Phoenix regeneration at end of player turn
    if (wandEffect === "phoenix_regen" && playerHp < maxPlayerHp) {
      const regenAmount = Math.floor(Math.random() * (75 - 25 + 1)) + 25
      setPlayerHp(prev => Math.min(maxPlayerHp, prev + regenAmount))
      addLog(locale === "en" ? `Phoenix Feather regenerates ${regenAmount} HP!` : `Pena de Fênix regenera ${regenAmount} de HP!`, "passive")
    }
    
    // Apply poison damage to monster
    if (monsterPoisonTurns > 0) {
      const poisonDamage = 1
      setMonsterHp(prev => {
        const newHp = Math.max(0, prev - poisonDamage)
        setMonsterPoisonTurns(p => p - 1)
        if (newHp === 0) {
          handleWin()
        }
        return newHp
      })
      addLog(locale === "en" ? `Monster takes ${poisonDamage} poison damage!` : `Monstro recebe ${poisonDamage} de dano de veneno!`, "system")
    }
    
    // Apply burn damage to monster
    if (monsterBurnTurns > 0) {
      const burnDamage = 10
      setMonsterHp(prev => {
        const newHp = Math.max(0, prev - burnDamage)
        setMonsterBurnTurns(p => p - 1)
        if (newHp === 0) {
          handleWin()
        }
        return newHp
      })
      addLog(locale === "en" ? `Monster takes ${burnDamage} burn damage!` : `Monstro recebe ${burnDamage} de dano de queima!`, "system")
    }
    
    if (isCombatOver) return
    
    // Check if monster is immune to debuffs (Inferi, Basilisco)
    const monsterImmuneToDebuffs = monster.passive === "immune_all_debuffs" || monster.passive === "basilisco_immunities"
    
    // Apply poison damage to player
    if (playerPoisonTurns > 0) {
      const poisonDamage = 1
      setPlayerHp(prev => Math.max(0, prev - poisonDamage))
      setPlayerPoisonTurns(p => p - 1)
      addLog(locale === "en" ? `You take ${poisonDamage} poison damage!` : `Você recebe ${poisonDamage} de dano de veneno!`, "system")
      
      if (playerHp <= poisonDamage) {
        handleLose()
        return
      }
    }
    
    if (isCombatOver) return
    
    // Calculate monster damage
    let damage = calculateDamage(monster.minDmg, monster.maxDmg)
    
    // Apply Thestral cap to monster damage
    if (wandEffect === "thestral_cap300") {
      damage = Math.min(damage, 300)
    }
    
    // Apply Arpeu damage on miss
    if (monster.passive === "damage_on_miss" && arpeuMissCount > 0) {
      damage = Math.floor(damage * (1 + arpeuMissCount * 0.5))
    }
    
    // Apply Acromantula growth
    if (monster.passive === "growth_stats") {
      damage = Math.floor(damage * (1 + acromantulaTurnCount * 0.2))
    }
    
    // Apply Barrete critical
    if (monster.passive === "critical_growth" && Math.random() * 100 < barreteCritRate) {
      damage = Math.floor(damage * 1.5)
      addLog(locale === "en" ? "Red Cap critical hit!" : "Acerto crítico do Barrete Vermelho!", "passive")
    }
    
    // Vampire life steal
    if (monster.passive === "life_steal") {
      const stolen = Math.floor(damage * 0.3)
      setMonsterHp(prev => Math.min(maxMonsterHp, prev + stolen))
      addLog(locale === "en" ? `Vampire steals ${stolen} HP!` : `Vampiro rouba ${stolen} de HP!`, "passive")
    }
    
    // Sereiana random heal
    if (monster.passive === "random_heal" && Math.random() < 0.3) {
      const heal = Math.floor(damage * 0.5)
      setMonsterHp(prev => Math.min(maxMonsterHp, prev + heal))
      addLog(locale === "en" ? `Mermaid heals for ${heal} HP!` : `Sereiana cura ${heal} de HP!`, "passive")
    }
    
    // Werewolf full heal once
    if (monster.passive === "full_heal_once" && !werewolfHealed && monsterHp < maxMonsterHp * 0.3) {
      setMonsterHp(maxMonsterHp)
      setWerewolfHealed(true)
      addLog(locale === "en" ? "Werewolf heals completely!" : "Lobisomem se cura completamente!", "passive")
    }
    
    if (rollAccuracy(monster.accuracy)) {
      setPlayerHp(prev => {
        const newHp = Math.max(0, prev - damage)
        if (newHp === 0) {
          handleLose()
        }
        return newHp
      })
      addLog(locale === "en" ? `${monster.name} deals ${damage} damage!` : `${monster.name} causa ${damage} de dano!`, "monster")
      
      // Apply monster passives on hit
      if (!monsterImmuneToDebuffs) {
        // Fada sleep on hit
        if (monster.passive === "sleep_on_hit" && Math.random() < 0.4) {
          setPlayerSleepTurns(1)
          addLog(locale === "en" ? "Fairy puts you to sleep! You skip next turn!" : "Fada coloca você para dormir! Você perde o próximo turno!", "passive")
        }
        
        // Cava Charco poison on hit
        if (monster.passive === "poison_on_hit_immune") {
          setPlayerPoisonTurns(2)
          addLog(locale === "en" ? "Dugbog poisons you for 2 turns!" : "Cava Charco envenena você por 2 turnos!", "passive")
        }
        
        // Trasgo stun on hit
        if (monster.passive === "stun_on_hit" && Math.random() < 0.25) {
          setPlayerSleepTurns(1)
          addLog(locale === "en" ? "Troll stuns you! You skip next turn!" : "Trasgo atordoa você! Você perde o próximo turno!", "passive")
        }
      }
      
      // Basilisco poison on hit (always applies, immune check is for debuffs from player)
      if (monster.passive === "basilisco_immunities") {
        setPlayerPoisonTurns(2)
        addLog(locale === "en" ? "Basilisk poisons you for 2 turns!" : "Basilisco envenena você por 2 turnos!", "passive")
      }
      
      // Bicho Papão reflect debuffs
      if (monster.passive === "reflect_debuffs" && playerDebuffs.size > 0) {
        addLog(locale === "en" ? "Bogeyman reflects debuffs back to you!" : "Bicho Papão reflete debuffs de volta para você!", "passive")
        // Simplified: just add a message
      }
    } else {
      addLog(locale === "en" ? `${monster.name} misses!` : `${monster.name} erra!`, "monster")
    }
    
    setIsPlayerTurn(true)
  }
  
  const handleWin = async () => {
    setIsCombatOver(true)
    setCombatResult("win")
    addLog(locale === "en" ? "You defeated the monster!" : "Você derrotou o monstro!", "system")
    
    // Recover 100% HP
    setPlayerHp(maxPlayerHp)
    
    // Update floor in Supabase
    try {
      const newFloor = currentFloor + 1
      await supabase
        .from("profiles")
        .update({ floresta: newFloor })
        .eq("id", currentUser.id)
      
      setCurrentFloor(newFloor)
      
      // Check if completed all floors
      if (newFloor > 20) {
        addLog(locale === "en" ? "🎉 Congratulations! You completed the Forbidden Forest Tower!" : "🎉 Parabéns! Você completou a Torre da Floresta Proibida!", "system")
      } else {
        addLog(locale === "en" ? `Advancing to floor ${newFloor}...` : `Avançando para o andar ${newFloor}...`, "system")
        setTimeout(() => {
          initializeCombat()
        }, 2000)
      }
    } catch (error) {
      console.error("Failed to update floor:", error)
    }
  }
  
  const handleLose = async () => {
    setIsCombatOver(true)
    setCombatResult("lose")
    addLog(locale === "en" ? "You were defeated..." : "Você foi derrotado...", "system")
    
    // Decrease attempts
    try {
      const newAttempts = Math.max(0, attempts - 1)
      await supabase
        .from("profiles")
        .update({ tentativas_floresta: newAttempts })
        .eq("id", currentUser.id)
      setAttempts(newAttempts)
      
      setTimeout(() => {
        onExit()
      }, 2000)
    } catch (error) {
      console.error("Failed to update attempts:", error)
    }
  }
  
  const handleExit = async () => {
    // Anti-cheat: subtract attempt if exiting during unfinished fight
    if (!isCombatOver && attempts > 0) {
      try {
        const newAttempts = Math.max(0, attempts - 1)
        await supabase
          .from("profiles")
          .update({ tentativas_floresta: newAttempts })
          .eq("id", currentUser.id)
        setAttempts(newAttempts)
      } catch (error) {
        console.error("Failed to update attempts:", error)
      }
    }
    onExit()
  }
  
  const playerSpells = playerBuild.spells || []
  
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(https://i.postimg.cc/4yCRvvB2/floresta-noite.jpg)" }}
      />
      <div className="absolute inset-0 bg-black/40" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        {/* Header */}
        <div className="w-full max-w-4xl mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge className="bg-amber-900/80 border-amber-700 text-amber-100">
                <Trophy className="w-4 h-4 mr-1" />
                {locale === "en" ? "Floor" : "Andar"} {currentFloor}/20
              </Badge>
              <Badge className="bg-purple-900/80 border-purple-700 text-purple-100">
                {locale === "en" ? "Attempts" : "Tentativas"}: {attempts}/3
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-700 text-amber-100 hover:bg-amber-900/50"
              onClick={handleExit}
            >
              <X className="w-4 h-4 mr-1" />
              {locale === "en" ? "Exit" : "Sair"}
            </Button>
          </div>
        </div>
        
        {/* Arena */}
        {monster && (
          <Card className="w-full max-w-4xl bg-stone-900/90 border-amber-800/50 backdrop-blur-sm">
            <CardContent className="p-6">
              {/* Monster Section */}
              <div className="flex flex-col items-center mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-bold text-amber-100">
                    {locale === "en" ? monster.nameEn : monster.name}
                  </h2>
                  <Badge className="bg-red-900/80 border-red-700 text-red-100">
                    <Heart className="w-3 h-3 mr-1" />
                    {monsterHp}/{maxMonsterHp}
                  </Badge>
                </div>
                
                {/* Monster Avatar */}
                <div className="relative w-[75px] h-[75px] mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={monster.image}
                    alt={locale === "en" ? monster.nameEn : monster.name}
                    className="w-full h-full object-contain animate-bounce"
                  />
                </div>
              </div>
              
              {/* Player HUD */}
              <div className="flex items-center justify-between mb-4 p-4 bg-stone-800/50 rounded-lg border border-amber-900/30">
                <div className="flex items-center gap-4">
                  {/* Player Avatar */}
                  <div className="w-12 h-12 bg-amber-800 rounded-full flex items-center justify-center overflow-hidden">
                    {playerBuild.avatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={playerBuild.avatar}
                        alt={currentUser.username}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23f59e0b'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='white' font-size='30'%3E🧙%3C/text%3E%3C/svg%3E"
                        }}
                      />
                    ) : (
                      <span className="text-2xl">🧙</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-100">{currentUser.username}</p>
                    <div className="flex items-center gap-2 text-xs text-amber-300/80">
                      <span>{playerBuild.house}</span>
                      <span>•</span>
                      <span>{playerBuild.wand}</span>
                      <span>•</span>
                      <span>{playerBuild.potion}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-green-900/80 border-green-700 text-green-100">
                        <Heart className="w-3 h-3 mr-1" />
                        {playerHp}/{maxPlayerHp}
                      </Badge>
                      <Badge className="bg-blue-900/80 border-blue-700 text-blue-100">
                        <Zap className="w-3 h-3 mr-1" />
                        {locale === "en" ? "Turn" : "Turno"} {turnNumber}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                {playerSleepTurns > 0 && (
                  <Badge className="bg-purple-900/80 border-purple-700 text-purple-100">
                    💤 {playerSleepTurns} {locale === "en" ? "turn" : "turno"}
                  </Badge>
                )}
                
                {playerPoisonTurns > 0 && (
                  <Badge className="bg-green-900/80 border-green-700 text-green-100">
                    ☠️ {playerPoisonTurns} {locale === "en" ? "turn" : "turno"}
                  </Badge>
                )}
              </div>
              
              {/* Combat Log */}
              <div className="mb-4 p-3 bg-stone-950/50 rounded-lg border border-amber-900/30 max-h-32 overflow-y-auto">
                {combatLog.map((log, i) => (
                  <p key={i} className={`text-xs mb-1 ${
                    log.type === "player" ? "text-green-400" :
                    log.type === "monster" ? "text-red-400" :
                    log.type === "passive" ? "text-purple-400" :
                    "text-amber-300"
                  }`}>
                    {log.message}
                  </p>
                ))}
              </div>
              
              {/* Spell Selection */}
              {!isCombatOver && isPlayerTurn && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {playerSpells.map((spellName: string) => {
                    const spell = SPELL_DATABASE.find(s => s.name === spellName)
                    if (!spell) return null
                    const mana = spellMana[spell.name]
                    const isOutOfMana = mana && mana.current <= 0
                    
                    return (
                      <Button
                        key={spell.name}
                        variant={selectedSpell === spell.name ? "default" : "outline"}
                        className={`h-auto py-3 px-2 text-xs border-amber-700 ${
                          selectedSpell === spell.name
                            ? "bg-amber-700 text-white"
                            : isOutOfMana
                              ? "bg-stone-800 text-stone-500 cursor-not-allowed"
                              : "text-amber-100 hover:bg-amber-900/50"
                        }`}
                        onClick={() => setSelectedSpell(spell.name)}
                        disabled={playerSleepTurns > 0 || isOutOfMana}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-bold">{spell.name}</span>
                          <span className="text-[10px] opacity-80">
                            {spell.powerMin || spell.power}-{spell.powerMax || spell.power}
                          </span>
                          <span className="text-[10px] opacity-60">
                            {mana ? `${mana.current}/${mana.max} MP` : `${spell.cost} pts`}
                          </span>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              )}
              
              {/* Attack Button */}
              {!isCombatOver && isPlayerTurn && selectedSpell && (
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    className="bg-amber-700 hover:bg-amber-600 text-white px-8"
                    onClick={handlePlayerAttack}
                  >
                    <Swords className="w-4 h-4 mr-2" />
                    {locale === "en" ? "Cast Spell" : "Lançar Magia"}
                  </Button>
                  {playerBuild.potion && (
                    <Button
                      className="bg-purple-700 hover:bg-purple-600 text-white px-6"
                      onClick={() => {
                        // Apply potion effect based on potion type
                        const potion = playerBuild.potion
                        if (potion === "wiggenweld") {
                          setPlayerHp(prev => Math.min(prev + 200, maxPlayerHp))
                          addLog(locale === "en" ? "Used Wiggenweld Potion and healed 200 HP!" : "Usou Poção Wiggenweld e curou 200 HP!", "system")
                        } else if (potion === "felix") {
                          setPlayerHp(prev => Math.min(prev + 300, maxPlayerHp))
                          addLog(locale === "en" ? "Used Felix Felicis and healed 300 HP!" : "Usou Felix Felicis e curou 300 HP!", "system")
                        } else if (potion === "antidote") {
                          setPlayerPoisonTurns(0)
                          setPlayerSleepTurns(0)
                          addLog(locale === "en" ? "Used Antidote and cleared debuffs!" : "Usou Antídoto e limpou debuffs!", "system")
                        } else {
                          setPlayerHp(prev => Math.min(prev + 150, maxPlayerHp))
                          addLog(locale === "en" ? `Used ${potion} and healed 150 HP!` : `Usou ${potion} e curou 150 HP!`, "system")
                        }
                      }}
                    >
                      <FlaskConical className="w-4 h-4 mr-2" />
                      {playerBuild.potion}
                    </Button>
                  )}
                </div>
              )}
              
              {/* Combat Over */}
              {isCombatOver && (
                <div className="mt-4 text-center">
                  {combatResult === "win" && (
                    <div className="text-green-400 text-lg font-bold mb-4">
                      🎉 {locale === "en" ? "Victory!" : "Vitória!"}
                    </div>
                  )}
                  {combatResult === "lose" && (
                    <div className="text-red-400 text-lg font-bold mb-4">
                      💀 {locale === "en" ? "Defeated..." : "Derrotado..."}
                    </div>
                  )}
                  <Button
                    className="bg-amber-700 hover:bg-amber-600 text-white"
                    onClick={handleExit}
                  >
                    {locale === "en" ? "Return to Lobby" : "Voltar ao Lobby"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
