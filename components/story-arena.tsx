"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient } from "@/lib/supabase"
import { getBossByStage, getNextStage, STORY_BOSSES, type StoryBoss } from "@/lib/story-data"
import { SPELL_DATABASE, HOUSE_GDD, HOUSE_MODIFIERS } from "@/lib/data-store"
import type { PlayerBuild } from "@/lib/types"
import type { Duelist, HPState } from "@/lib/arena-types"
import type { RoundAction } from "@/lib/duelActions"
import { calculateTurnOutcome, getSpellInfo, getTotalHP, isDefeated } from "@/lib/turn-engine"
import { useLanguage } from "@/contexts/language-context"
import { Swords, Heart, X, Trophy, Zap } from "lucide-react"

interface StoryArenaProps {
  playerBuild: PlayerBuild
  currentUser: { id: string; username: string; email: string; elo: number }
  onExit: () => void
  onAuthChange: (user: any) => void
}

interface CombatLog {
  message: string
  type: "player" | "boss" | "system" | "passive"
}

const AVATAR_IMAGES: Record<string, string> = {
  // Legado (mantidos para compatibilidade)
  bruxo01: "https://i.postimg.cc/x8NHhC8x/bruxo01.png",
  bruxo02: "https://i.postimg.cc/nr97gzrY/bruxo02.png",
  bruxo03: "https://i.postimg.cc/QCK5wtCg/bruxo03.png",
  bruxa01: "https://i.postimg.cc/brSbWJr6/bruxa01.png",
  bruxa02: "https://i.postimg.cc/L5gfwX5D/bruxa02.png",
  bruxa03: "https://i.postimg.cc/1XV62tXH/bruxa03.png",
  // Galeria principal (avatar1–avatar22)
  avatar1:  "https://i.postimg.cc/LXbFGK31/pngwing-com-(10).png",
  avatar2:  "https://i.postimg.cc/zBcY4ZFb/pngwing-com-(11).png",
  avatar3:  "https://i.postimg.cc/XJz6tSkp/pngwing-com-(12).png",
  avatar4:  "https://i.postimg.cc/bJBf4c9Z/pngwing-com-(13).png",
  avatar5:  "https://i.postimg.cc/k4pPL3vD/pngwing-com-(14).png",
  avatar6:  "https://i.postimg.cc/C1Qp9TsK/pngwing-com-(15).png",
  avatar7:  "https://i.postimg.cc/SsvbHFfS/pngwing-com-(16).png",
  avatar8:  "https://i.postimg.cc/LXbFGK3m/pngwing-com-(17).png",
  avatar9:  "https://i.postimg.cc/RFFzPVKN/pngwing-com-(18).png",
  avatar10: "https://i.postimg.cc/B66GhQHZ/pngwing-com-(19).png",
  avatar11: "https://i.postimg.cc/j55r8dPK/pngwing-com-(20).png",
  avatar12: "https://i.postimg.cc/yddzfYcH/pngwing-com-(21).png",
  avatar13: "https://i.postimg.cc/9MMjxFZ2/pngwing-com-(22).png",
  avatar14: "https://i.postimg.cc/d11KWtdg/pngwing-com-(23).png",
  avatar15: "https://i.postimg.cc/xCCSsTHh/pngwing-com-(24).png",
  avatar16: "https://i.postimg.cc/C11VvLD6/pngwing-com-(25).png",
  avatar17: "https://i.postimg.cc/gJJPMkRf/pngwing-com-(26).png",
  avatar18: "https://i.postimg.cc/SRYbhTgc/pngwing-com-(5).png",
  avatar19: "https://i.postimg.cc/rsR2knfx/pngwing-com-(6).png",
  avatar20: "https://i.postimg.cc/449YCsHz/barty-crouch-jr-1-1800x1248-(1).png",
  avatar21: "https://i.postimg.cc/Y9sBTKzf/pngwing-com-(8).png",
  avatar22: "https://i.postimg.cc/gJTb1FHD/pngwing-com-(9).png",
  flitwick: "https://i.postimg.cc/J40d7YmZ/flitwich-quiz-image.png",
}

function buildHpBars(hp: number): number[] {
  const bars: number[] = []
  const fullBars = Math.floor(hp / 100)
  for (let i = 0; i < fullBars; i++) bars.push(100)
  const remainder = hp % 100
  if (remainder > 0) bars.push(remainder)
  return bars
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

export default function StoryArena({ playerBuild, currentUser, onExit, onAuthChange }: StoryArenaProps) {
  const { locale } = useLanguage()
  const supabase = getSupabaseClient()
  
  const [currentStage, setCurrentStage] = useState(1)
  const [isLoaded, setIsLoaded] = useState(false)
  const [attempts, setAttempts] = useState(3)
  
  const [duelists, setDuelists] = useState<Duelist[]>([])
  const [selectedSpell, setSelectedSpell] = useState<string | null>(null)
  const [turnNumber, setTurnNumber] = useState(0)
  const [combatLog, setCombatLog] = useState<CombatLog[]>([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [isCombatOver, setIsCombatOver] = useState(false)
  const [combatResult, setCombatResult] = useState<"win" | "lose" | null>(null)
  const [boss, setBoss] = useState<StoryBoss | null>(null)
  
  // Calculate duelists for UI display
  const playerDuelist = duelists.find(d => d.isPlayer)
  const bossDuelist = duelists.find(d => !d.isPlayer)
  const playerHpTotal = playerDuelist ? getTotalHP(playerDuelist.hp) : 0
  const bossHpTotal = bossDuelist ? getTotalHP(bossDuelist.hp) : 0
  const maxPlayerHp = playerBuild.house === "slytherin" ? 400 : 500
  const maxBossHp = boss ? boss.hp : 0
  
  // Load attempts and current stage from Supabase
  const loadProgress = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("tentativas_historia, modo_historia")
        .eq("id", currentUser.id)
        .single()
      
      if (data) {
        // Check if it's a new day (after 00:01) and reset attempts to 3
        const today = new Date().toISOString().split('T')[0]
        const lastReset = localStorage.getItem(`story_reset:${currentUser.id}`)
        
        if (lastReset !== today) {
          // Reset attempts to 3 for new day
          const { error: resetError } = await supabase
            .from("profiles")
            .update({ tentativas_historia: 3 })
            .eq("id", currentUser.id)
          
          if (!resetError) {
            localStorage.setItem(`story_reset:${currentUser.id}`, today)
            setAttempts(3)
          }
        } else {
          setAttempts(data.tentativas_historia || 3)
        }
        
        if (data.modo_historia) {
          setCurrentStage(data.modo_historia)
        }
      }
      
      setIsLoaded(true)
    } catch (error) {
      console.error("Failed to load progress:", error)
      setIsLoaded(true)
    }
  }
  
  // Initialize combat
  useEffect(() => {
    loadProgress()
  }, [])
  
  // Initialize combat after loading progress
  useEffect(() => {
    if (isLoaded) {
      initializeCombat()
    }
  }, [isLoaded])
  
  const initializeCombat = () => {
    const currentBoss = getBossByStage(currentStage)
    if (!currentBoss) return
    
    setBoss(currentBoss)
    
    const playerMod = HOUSE_MODIFIERS[playerBuild.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
    const playerDuelist: Duelist = {
      id: currentUser.id,
      name: playerBuild.name,
      house: playerBuild.house,
      wand: playerBuild.wand,
      avatar: playerBuild.avatar,
      spells: playerBuild.spells,
      hp: { bars: buildHpBars(playerBuild.house === "slytherin" ? 400 : 500) },
      speed: Math.round(100 * playerMod.speed),
      debuffs: [],
      isPlayer: true,
      team: "player",
      spellMana: buildSpellManaForSpells(playerBuild.spells, playerBuild.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    const bossSpells = currentBoss.spells.length > 0 ? currentBoss.spells : SPELL_DATABASE.filter(s => !s.isVipOnly).map(s => s.name)
    const bossDuelist: Duelist = {
      id: `boss-${currentBoss.id}`,
      name: locale === "en" ? currentBoss.nameEn : currentBoss.name,
      house: currentBoss.house,
      wand: currentBoss.wand,
      avatar: currentBoss.avatar,
      spells: bossSpells,
      hp: { bars: buildHpBars(currentBoss.hp) },
      speed: 95,
      debuffs: [],
      team: "enemy",
      spellMana: buildSpellManaForSpells(bossSpells, currentBoss.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    setDuelists([playerDuelist, bossDuelist])
    setTurnNumber(0)
    setCombatLog([])
    setIsPlayerTurn(true)
    setIsCombatOver(false)
    setCombatResult(null)
    
    addLog(locale === "en" ? `Stage ${currentStage}: ${currentBoss.nameEn} appears!` : `Etapa ${currentStage}: ${currentBoss.name} aparece!`, "system")
  }
  
  const addLog = (message: string, type: CombatLog["type"]) => {
    setCombatLog(prev => [...prev, { message, type }])
  }
  
  const handlePlayerAttack = async () => {
    if (!selectedSpell || !isPlayerTurn || isCombatOver || duelists.length < 2) return
    
    setIsPlayerTurn(false)
    
    const playerDuelist = duelists.find(d => d.isPlayer)
    const bossDuelist = duelists.find(d => !d.isPlayer)
    
    if (!playerDuelist || !bossDuelist) return
    
    // Create player action
    const playerAction: RoundAction = {
      casterId: playerDuelist.id,
      type: "cast",
      spellName: selectedSpell,
      targetId: bossDuelist.id,
    }
    
    // Boss AI: select random spell
    const bossSpells = bossDuelist.spells
    const randomSpellName = bossSpells[Math.floor(Math.random() * bossSpells.length)]
    const bossAction: RoundAction = {
      casterId: bossDuelist.id,
      type: "cast",
      spellName: randomSpellName,
      targetId: playerDuelist.id,
    }
    
    // Use turn-engine to calculate outcome
    const outcome = calculateTurnOutcome({
      duelists,
      actions: [playerAction, bossAction],
      spellDatabase: SPELL_DATABASE,
      turnNumber,
      gameMode: "torneio-offline",
      circumFlames: {},
    })
    
    // Update duelists with new state
    setDuelists(outcome.newDuelists)
    
    // Add logs
    outcome.logs.forEach(log => {
      addLog(log, "system")
    })
    
    setTurnNumber(prev => prev + 1)
    
    // Check if combat is over
    const newPlayer = outcome.newDuelists.find(d => d.isPlayer)
    const newBoss = outcome.newDuelists.find(d => !d.isPlayer)
    
    if (newBoss && isDefeated(newBoss.hp)) {
      handleWin()
      return
    }
    
    if (newPlayer && isDefeated(newPlayer.hp)) {
      handleLose()
      return
    }
    
    setIsPlayerTurn(true)
    setSelectedSpell(null)
  }
  
  const handleWin = async () => {
    setIsCombatOver(true)
    setCombatResult("win")
    addLog(locale === "en" ? "🎉 Victory!" : "🎉 Vitória!", "system")
    
    // Update progress in Supabase
    try {
      const nextStage = getNextStage(currentStage)
      if (nextStage) {
        await supabase
          .from("profiles")
          .update({ modo_historia: nextStage })
          .eq("id", currentUser.id)
        
        setTimeout(() => {
          setCurrentStage(nextStage)
          setIsCombatOver(false)
          setCombatResult(null)
          initializeCombat()
        }, 2000)
      } else {
        // Completed all stages
        addLog(locale === "en" ? "🏆 You completed Story Mode!" : "🏆 Você completou o Modo História!", "system")
        setTimeout(() => {
          onExit()
        }, 3000)
      }
    } catch (error) {
      console.error("Failed to update progress:", error)
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
        .update({ tentativas_historia: newAttempts })
        .eq("id", currentUser.id)
      setAttempts(newAttempts)
      
      setTimeout(() => {
        onExit()
      }, 2000)
    } catch (error) {
      console.error("Failed to update attempts:", error)
    }
  }
  
  const handleExit = () => {
    onExit()
  }
  
  const playerSpells = playerBuild.spells || []
  
  if (!isLoaded) {
    return (
      <div className="min-h-screen wood-bg p-6 text-amber-100">
        <p>{locale === "en" ? "Loading..." : "Carregando..."}</p>
      </div>
    )
  }
  
  if (attempts <= 0) {
    return (
      <div className="min-h-screen wood-bg p-6 flex items-center justify-center">
        <Card className="bg-stone-900/90 border-amber-800/50 backdrop-blur-sm max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-amber-100 mb-4">{locale === "en" ? "No attempts left. Come back tomorrow!" : "Sem tentativas restantes. Volte amanhã!"}</p>
            <Button onClick={handleExit} className="border-amber-700 text-amber-100 hover:bg-amber-900/50">
              {locale === "en" ? "Exit" : "Sair"}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(https://i.postimg.cc/wjK6zBfh/cenario01.png)" }}
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
                {locale === "en" ? "Stage" : "Etapa"} {currentStage}/10
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
        {boss && (
          <Card className="w-full max-w-4xl bg-stone-900/90 border-amber-800/50 backdrop-blur-sm">
            <CardContent className="p-6">
              {/* Boss Section */}
              <div className="flex flex-col items-center mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-bold text-amber-100">
                    {locale === "en" ? boss.nameEn : boss.name}
                  </h2>
                  <Badge className="bg-red-900/80 border-red-700 text-red-100">
                    <Heart className="w-3 h-3 mr-1" />
                    {getTotalHP(bossDuelist?.hp || { bars: [] })}/{boss?.hp || 0}
                  </Badge>
                </div>
                
                {/* Boss Avatar */}
                <div className="relative w-[75px] h-[75px] mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={AVATAR_IMAGES[boss.avatar] || AVATAR_IMAGES.bruxo01}
                    alt={locale === "en" ? boss.nameEn : boss.name}
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
                          e.currentTarget.src = "https://i.postimg.cc/x8NHhC8x/bruxo01.png"
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
                        {playerHpTotal}/{maxPlayerHp}
                      </Badge>
                      <Badge className="bg-blue-900/80 border-blue-700 text-blue-100">
                        <Zap className="w-3 h-3 mr-1" />
                        {locale === "en" ? "Turn" : "Turno"} {turnNumber}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Combat Log */}
              <div className="mb-4 p-3 bg-stone-950/50 rounded-lg border border-amber-900/30 max-h-32 overflow-y-auto">
                {combatLog.map((log, i) => (
                  <p key={i} className={`text-xs mb-1 ${
                    log.type === "player" ? "text-green-400" :
                    log.type === "boss" ? "text-red-400" :
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
                    
                    return (
                      <Button
                        key={spell.name}
                        variant={selectedSpell === spell.name ? "default" : "outline"}
                        className={`h-auto py-3 px-2 text-xs border-amber-700 ${
                          selectedSpell === spell.name
                            ? "bg-amber-700 text-white"
                            : "text-amber-100 hover:bg-amber-900/50"
                        }`}
                        onClick={() => setSelectedSpell(spell.name)}
                        disabled={!isPlayerTurn}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-bold">{spell.name}</span>
                          <span className="text-[10px] opacity-80">
                            {spell.powerMin || spell.power}-{spell.powerMax || spell.power}
                          </span>
                          <span className="text-[10px] opacity-60">{spell.cost} pts</span>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              )}
              
              {/* Action Button */}
              {!isCombatOver && isPlayerTurn && selectedSpell && (
                <div className="mt-4 flex justify-center">
                  <Button
                    onClick={handlePlayerAttack}
                    className="bg-red-800 hover:bg-red-700 text-amber-100 border-amber-700"
                  >
                    <Swords className="w-4 h-4 mr-2" />
                    {locale === "en" ? "Attack" : "Atacar"}
                  </Button>
                </div>
              )}
              
              {/* Combat Result */}
              {isCombatOver && combatResult && (
                <div className="mt-4 p-4 bg-stone-800/50 rounded-lg border border-amber-900/30 text-center">
                  {combatResult === "win" ? (
                    <div>
                      <p className="text-2xl font-bold text-green-400 mb-2">
                        {locale === "en" ? "🎉 Victory!" : "🎉 Vitória!"}
                      </p>
                      <p className="text-amber-300 text-sm">
                        {getNextStage(currentStage) 
                          ? (locale === "en" ? "Advancing to next stage..." : "Avançando para próxima etapa...")
                          : (locale === "en" ? "You completed Story Mode!" : "Você completou o Modo História!")
                        }
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl font-bold text-red-400 mb-2">
                        {locale === "en" ? "💀 Defeated" : "💀 Derrotado"}
                      </p>
                      <p className="text-amber-300 text-sm">
                        {locale === "en" ? "Returning to lobby..." : "Voltando para o lobby..."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
