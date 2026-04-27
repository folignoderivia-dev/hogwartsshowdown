"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient } from "@/lib/supabase"
import { SPELL_DATABASE, WAND_PASSIVES, HOUSE_GDD, HOUSE_MODIFIERS, rollSpellPower } from "@/lib/data-store"
import { calculateAccuracy, getSpellInfo, getSpellMaxPower, getTotalHP } from "@/lib/turn-engine"
import type { Duelist, HPState } from "@/lib/arena-types"
import type { PlayerBuild } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"
import type { AppLocale } from "@/contexts/language-context"
import { Swords, Heart, X, Trophy, FlaskConical, Zap } from "lucide-react"

interface WorldBossArenaProps {
  playerBuild: PlayerBuild
  currentUser: { id: string; username: string; email: string; elo: number }
  onExit: () => void
  onAuthChange: (user: any) => void
}

interface CombatLog {
  message: string
  type: "player" | "boss" | "system"
}

const BOSS_IMAGES = [
  "https://i.postimg.cc/26r79YDM/manticore.png",
  "https://i.postimg.cc/PxTQVHjB/morta.png",
  "https://i.postimg.cc/bJp9VPh5/nundu.png",
  "https://i.postimg.cc/fLDfqsN1/sphynx.png",
]

function buildHpBars(house: string): number[] {
  return house === "slytherin" ? [100, 100, 100, 100] : [100, 100, 100, 100, 100]
}

function buildSpellManaForSpells(spells: string[], house: string): Record<string, { current: number; max: number }> {
  const out: Record<string, { current: number; max: number }> = {}
  spells.forEach((sn) => {
    const spell = SPELL_DATABASE.find(s => s.name === sn)
    if (!spell) return
    // Use standard spell cost (same as regular duel arena)
    let max = spell.cost || 3
    if (house === "gryffindor") max = Math.max(1, max + HOUSE_GDD.gryffindor.manaStartDelta)
    if (house === "ravenclaw" && !spell.isUnforgivable) max += HOUSE_GDD.ravenclaw.manaBonusNonUnforgivable
    out[sn] = { current: max, max }
  })
  return out
}

export default function WorldBossArena({ playerBuild, currentUser, onExit, onAuthChange }: WorldBossArenaProps) {
  const { locale } = useLanguage()
  const supabase = getSupabaseClient()
  
  const [isLoaded, setIsLoaded] = useState(false)
  const [bossIndex, setBossIndex] = useState(0)
  const [bossHp, setBossHp] = useState(5000)
  const [maxBossHp] = useState(5000)
  const [playerHp, setPlayerHp] = useState(playerBuild.house === "slytherin" ? 400 : 500)
  const [maxPlayerHp] = useState(playerBuild.house === "slytherin" ? 400 : 500)
  const [selectedSpell, setSelectedSpell] = useState<string | null>(null)
  const [turnNumber, setTurnNumber] = useState(1)
  const [combatLog, setCombatLog] = useState<CombatLog[]>([])
  const [isCombatOver, setIsCombatOver] = useState(false)
  const [spellMana, setSpellMana] = useState<Record<string, { current: number; max: number }>>({})
  const [totalDamage, setTotalDamage] = useState(0)
  const [hasFoughtToday, setHasFoughtToday] = useState(false)
  
  const playerMaxHp = playerBuild.house === "slytherin" ? 400 : 500
  
  useEffect(() => {
    loadBossData()
  }, [])
  
  useEffect(() => {
    if (isLoaded) {
      initializeCombat()
    }
  }, [isLoaded])
  
  const loadBossData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const lastFight = localStorage.getItem(`worldboss_fight:${currentUser.id}`)
      
      if (lastFight === today) {
        setHasFoughtToday(true)
      }
      
      // Get boss index from world_boss_state table (id is always 1)
      // If table doesn't exist or query fails, use defaults
      try {
        const { data: bossData } = await supabase
          .from("world_boss_state")
          .select("boss_index, current_hp, last_reset_date")
          .eq("id", 1)
          .single()
        
        if (bossData) {
          // Check if boss needs daily reset (if not defeated today)
          const lastReset = bossData.last_reset_date ? bossData.last_reset_date.split('T')[0] : null
          const needsDailyReset = lastReset && lastReset !== today && bossData.current_hp > 0
          
          if (needsDailyReset) {
            // Reset boss for new day
            const nextBossIndex = (bossData.boss_index + 1) % BOSS_IMAGES.length
            await supabase
              .from("world_boss_state")
              .update({ 
                boss_index: nextBossIndex,
                current_hp: 5000,
                last_reset_date: new Date().toISOString()
              })
              .eq("id", 1)
            setBossIndex(nextBossIndex)
            setBossHp(5000)
            console.log(`World Boss: Daily reset - boss index ${bossData.boss_index} -> ${nextBossIndex}`)
          } else {
            setBossIndex(bossData.boss_index || 0)
            setBossHp(bossData.current_hp || 5000)
          }
        }
      } catch (bossError) {
        console.error("Failed to load boss state, using defaults:", bossError)
        // Use defaults if table doesn't exist
        setBossIndex(0)
        setBossHp(5000)
      }
      
      // Get player's total damage
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("damagewb")
          .eq("id", currentUser.id)
          .single()
        
        if (profileData?.damagewb) {
          setTotalDamage(profileData.damagewb)
        }
      } catch (profileError) {
        console.error("Failed to load player damage:", profileError)
      }
      
      setIsLoaded(true)
    } catch (error) {
      console.error("Failed to load boss data:", error)
      setIsLoaded(true)
    }
  }
  
  const initializeCombat = () => {
    setSpellMana(buildSpellManaForSpells(playerBuild.spells || [], playerBuild.house))
    setPlayerHp(playerMaxHp)
    setTurnNumber(1)
    setCombatLog([])
    setIsCombatOver(false)
    setSelectedSpell(null)
    addLog("World Boss battle begins! You have 3 turns to deal damage!", "system")
  }
  
  const addLog = (message: string, type: CombatLog["type"]) => {
    setCombatLog(prev => [...prev, { message, type }])
  }
  
  const calculateDamage = (minDmg: number, maxDmg: number): number => {
    return Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg
  }
  
  const handlePlayerAttack = async () => {
    if (!selectedSpell || isCombatOver) return
    
    // Check spell mana
    const manaInfo = spellMana[selectedSpell]
    if (!manaInfo || manaInfo.current <= 0) {
      addLog(`${selectedSpell} has no mana left!`, "system")
      return
    }
    
    const spell = SPELL_DATABASE.find(s => s.name === selectedSpell)
    if (!spell) return
    
    // Create a mock duelist for accuracy calculation
    const playerDuelist: Duelist = {
      id: currentUser.id,
      name: currentUser.username,
      house: playerBuild.house,
      wand: playerBuild.wand,
      avatar: playerBuild.avatar,
      spells: playerBuild.spells,
      hp: { bars: buildHpBars(playerBuild.house) },
      speed: 100,
      debuffs: [],
      isPlayer: true,
      team: "player",
      spellMana,
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    const bossDuelist: Duelist = {
      id: "world-boss",
      name: "World Boss",
      house: "gryffindor",
      wand: "dragon",
      avatar: "avatar1",
      spells: [],
      hp: { bars: [100, 100, 100, 100, 100] },
      speed: 80,
      debuffs: [],
      team: "enemy",
      spellMana: {},
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    // Calculate accuracy
    const accuracy = calculateAccuracy(playerDuelist, bossDuelist, spell.accuracy || 80, spell)
    const hitRoll = Math.random() * 100
    const isHit = hitRoll < accuracy
    
    if (!isHit) {
      addLog(`${spell.name} missed! (${Math.round(accuracy)}% accuracy)`, "system")
      // Decrease spell mana even on miss
      setSpellMana(prev => ({
        ...prev,
        [selectedSpell]: { ...prev[selectedSpell], current: Math.max(0, prev[selectedSpell].current - 1) }
      }))
      setSelectedSpell(null)
      
      if (turnNumber >= 3) {
        endBattle()
      } else {
        setTurnNumber(prev => prev + 1)
      }
      return
    }
    
    // Decrease spell mana
    setSpellMana(prev => ({
      ...prev,
      [selectedSpell]: { ...prev[selectedSpell], current: Math.max(0, prev[selectedSpell].current - 1) }
    }))
    
    // Calculate damage using rollSpellPower
    const baseDamage = rollSpellPower(spell)
    
    // Apply wand core passives
    const wandEffect = WAND_PASSIVES[playerBuild.wand]?.effect
    let damage = baseDamage
    if (wandEffect === "crupe_triple" && !spell.debuff && Math.random() < 0.25) {
      damage = Math.floor(baseDamage * 3)
      addLog("Crupe Hair: Triple damage!", "system")
    }
    
    // Apply house modifiers
    if (playerBuild.house === "gryffindor") {
      damage = Math.floor(damage * 1.05)
    }
    
    // Crit chance
    let critChance = 10
    if (wandEffect === "crit20_acc_minus15") critChance += 20
    if (playerBuild.house === "slytherin") critChance += 25
    
    const isCrit = Math.random() * 100 < critChance
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
      addLog(`CRITICAL HIT! ${spell.name} deals ${damage} damage!`, "player")
    } else {
      addLog(`${spell.name} deals ${damage} damage!`, "player")
    }
    
    // Apply damage to boss
    setBossHp(prev => {
      const newHp = Math.max(0, prev - damage)
      // Update world_boss_state table with the new HP
      void supabase
        .from("world_boss_state")
        .update({ current_hp: newHp })
        .eq("id", 1)
        .then(({ error }) => {
          if (error) console.error("Failed to update boss HP:", error)
        })
      
      // Check if boss is defeated (HP reaches 0)
      if (newHp === 0) {
        // Trigger defeat-based reset
        setTimeout(() => {
          const nextBossIndex = (bossIndex + 1) % BOSS_IMAGES.length
          supabase
            .from("world_boss_state")
            .update({ 
              boss_index: nextBossIndex,
              current_hp: 5000,
              last_reset_date: new Date().toISOString()
            })
            .eq("id", 1)
            .then(({ error }) => {
              if (error) {
                console.error("Failed to reset boss after defeat:", error)
              } else {
                console.log(`World Boss: Defeat reset - boss index ${bossIndex} -> ${nextBossIndex}`)
                addLog("World Boss defeated! New boss incoming!", "system")
              }
            })
        }, 1000)
      }
      
      return newHp
    })
    setTotalDamage(prev => prev + damage)
    
    setSelectedSpell(null)
    
    // Check turn count
    if (turnNumber >= 3) {
      endBattle()
    } else {
      setTurnNumber(prev => prev + 1)
    }
  }
  
  const endBattle = async () => {
    setIsCombatOver(true)
    
    // Update player's damagewb
    try {
      const { data: profileData, error: fetchError } = await supabase
        .from("profiles")
        .select("damagewb")
        .eq("id", currentUser.id)
        .single()
      
      if (fetchError) {
        console.error("Failed to fetch player damagewb:", fetchError)
        throw fetchError
      }
      
      const currentDamage = profileData?.damagewb || 0
      const newTotalDamage = currentDamage + totalDamage
      
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ damagewb: newTotalDamage })
        .eq("id", currentUser.id)
      
      if (updateError) {
        console.error("Failed to update player damagewb:", updateError)
        throw updateError
      }
      
      console.log(`World Boss: Updated damagewb for user ${currentUser.id} from ${currentDamage} to ${newTotalDamage}`)
      
      // Mark as fought today
      const today = new Date().toISOString().split('T')[0]
      localStorage.setItem(`worldboss_fight:${currentUser.id}`, today)
      
      addLog(`Battle over! You dealt ${totalDamage} total damage!`, "system")
      
      setTimeout(() => {
        onExit()
      }, 3000)
    } catch (error) {
      console.error("Failed to update player damage:", error)
      addLog("Failed to save damage to database!", "system")
    }
  }
  
  const handlePotion = () => {
    if (playerBuild.potion === "wiggenweld") {
      setPlayerHp(prev => Math.min(maxPlayerHp, prev + 200))
      addLog("Used Wiggenweld Potion and healed 200 HP!", "system")
    }
  }
  
  const playerSpells = playerBuild.spells || []
  
  if (hasFoughtToday) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(https://i.postimg.cc/4yCRvvB2/boss0.png)" }} />
        <div className="absolute inset-0 bg-black/40" />
        
        <Card className="relative z-10 max-w-md bg-stone-900/90 border-amber-800/50 backdrop-blur-sm">
          <CardContent className="p-6 text-center">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-amber-400" />
            <h2 className="text-2xl font-bold text-amber-100 mb-4">
              "Already Fought Today"
            </h2>
            <p className="text-amber-200 mb-6">
              "You can only fight the World Boss once per day. Come back tomorrow!"
            </p>
            <Button onClick={onExit} className="bg-amber-700 hover:bg-amber-600 text-white">
              "Return"
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(https://i.postimg.cc/4yCRvvB2/boss0.png)" }} />
      <div className="absolute inset-0 bg-black/40" />
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-4xl bg-stone-900/90 border-amber-800/50 backdrop-blur-sm">
          <CardHeader className="border-b border-amber-900/50 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge className="bg-purple-900/80 border-purple-700 text-purple-100">
                  <Trophy className="w-4 h-4 mr-1" />
                  WORLD BOSS
                </Badge>
                <Badge className="bg-blue-900/80 border-blue-700 text-blue-100">
                  <Zap className="w-3 h-3 mr-1" />
                  {locale === "en" ? "Turn" : "Turno"} {turnNumber}/3
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="border-amber-700 text-amber-100 hover:bg-amber-900/50" onClick={onExit}>
                <X className="w-4 h-4 mr-1" />
                {locale === "en" ? "Exit" : "Sair"}
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-6">
            {/* Boss Section */}
            <div className="flex flex-col items-center mb-6">
              <h2 className="text-xl font-bold text-amber-100 mb-2">WORLD BOSS</h2>
              <div className="relative w-[150px] h-[150px] mb-2">
                <img
                  src={BOSS_IMAGES[bossIndex]}
                  alt="World Boss"
                  className="w-full h-full object-contain"
                />
              </div>
              <Badge className="bg-red-900/80 border-red-700 text-red-100">
                <Heart className="w-3 h-3 mr-1" />
                {bossHp}/{maxBossHp}
              </Badge>
            </div>
            
            {/* Player Section */}
            <div className="flex items-center justify-between mb-4 p-4 bg-stone-800/50 rounded-lg border border-amber-900/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-800 rounded-full flex items-center justify-center overflow-hidden">
                  {playerBuild.avatar && playerBuild.avatar.startsWith('http') ? (
                    <img src={playerBuild.avatar} alt={currentUser.username} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🧙</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-100">{currentUser.username}</p>
                  <Badge className="bg-green-900/80 border-green-700 text-green-100">
                    <Heart className="w-3 h-3 mr-1" />
                    {playerHp}/{maxPlayerHp}
                  </Badge>
                </div>
              </div>
              <Badge className="bg-purple-900/80 border-purple-700 text-purple-100">
                {locale === "en" ? "Total Damage" : "Dano Total"}: {totalDamage}
              </Badge>
            </div>
            
            {/* Combat Log */}
            <div className="mb-4 p-3 bg-stone-950/50 rounded-lg border border-amber-900/30 max-h-32 overflow-y-auto">
              {combatLog.map((log, i) => (
                <p key={i} className={`text-xs mb-1 ${
                  log.type === "player" ? "text-green-400" :
                  log.type === "boss" ? "text-red-400" :
                  "text-amber-300"
                }`}>
                  {log.message}
                </p>
              ))}
            </div>
            
            {/* Spell Selection */}
            {!isCombatOver && (
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
                      disabled={isOutOfMana}
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
            
            {/* Action Buttons */}
            {!isCombatOver && (
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  className="bg-amber-700 hover:bg-amber-600 text-white px-8"
                  onClick={handlePlayerAttack}
                  disabled={!selectedSpell}
                >
                  <Swords className="w-4 h-4 mr-2" />
                  {locale === "en" ? "Cast Spell" : "Lançar Magia"}
                </Button>
                {playerBuild.potion && (
                  <Button
                    className="bg-purple-700 hover:bg-purple-600 text-white px-6"
                    onClick={handlePotion}
                  >
                    <FlaskConical className="w-4 h-4 mr-2" />
                    {locale === "en" ? "Use Potion" : "Usar Poção"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
