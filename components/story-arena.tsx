"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient } from "@/lib/supabase"
import { getBossByStage, getNextStage, STORY_BOSSES, type StoryBoss } from "@/lib/story-data"
import { SPELL_DATABASE, HOUSE_MODIFIERS, HOUSE_GDD } from "@/lib/data-store"
import type { PlayerBuild } from "@/lib/types"
import type { Duelist, HPState } from "@/lib/arena-types"
import type { RoundAction } from "@/lib/duelActions"
import { calculateTurnOutcome, getSpellInfo, getTotalHP, isDefeated, isSelfTargetSpell, isAreaSpell, getValidTargetsForSpell } from "@/lib/turn-engine"
import { useLanguage } from "@/contexts/language-context"
import { Swords, Heart, X, Trophy, FlaskConical } from "lucide-react"

interface StoryArenaProps {
  playerBuild: PlayerBuild
  currentUser: { id: string; username: string; email: string; elo: number }
  onExit: () => void
  onAuthChange: (user: any) => void
}

const AVATAR_IMAGES: Record<string, string> = {
  bruxo01: "https://i.postimg.cc/x8NHhC8x/bruxo01.png",
  bruxo02: "https://i.postimg.cc/nr97gzrY/bruxo02.png",
  bruxo03: "https://i.postimg.cc/QCK5wtCg/bruxo03.png",
  bruxa01: "https://i.postimg.cc/brSbWJr6/bruxa01.png",
  bruxa02: "https://i.postimg.cc/L5gfwX5D/bruxa02.png",
  bruxa03: "https://i.postimg.cc/1XV62tXH/bruxa03.png",
  avatar1: "https://i.postimg.cc/LXbFGK31/pngwing-com-(10).png",
  avatar2: "https://i.postimg.cc/zBcY4ZFb/pngwing-com-(11).png",
  avatar3: "https://i.postimg.cc/XJz6tSkp/pngwing-com-(12).png",
  avatar4: "https://i.postimg.cc/bJBf4c9Z/pngwing-com-(13).png",
  avatar5: "https://i.postimg.cc/k4pPL3vD/pngwing-com-(14).png",
  avatar6: "https://i.postimg.cc/C1Qp9TsK/pngwing-com-(15).png",
  avatar7: "https://i.postimg.cc/SsvbHFfS/pngwing-com-(16).png",
  avatar8: "https://i.postimg.cc/LXbFGK3m/pngwing-com-(17).png",
  avatar9: "https://i.postimg.cc/RFFzPVKN/pngwing-com-(18).png",
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

function buildHpBars(house: string): number[] {
  return house === "slytherin" ? [100, 100, 100, 100] : [100, 100, 100, 100, 100]
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
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [turnNumber, setTurnNumber] = useState(1)
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [battleStatus, setBattleStatus] = useState<"idle" | "selecting" | "resolving" | "finished">("idle")
  const [gameOver, setGameOver] = useState<"win" | "lose" | null>(null)
  const [potionUsed, setPotionUsed] = useState(false)
  const [circumFlames, setCircumFlames] = useState<Record<string, number>>({})
  
  const [boss, setBoss] = useState<StoryBoss | null>(null)
  
  const duelistsRef = useRef<Duelist[]>([])
  const turnNumberRef = useRef(turnNumber)
  
  useEffect(() => {
    duelistsRef.current = duelists
  }, [duelists])
  useEffect(() => {
    turnNumberRef.current = turnNumber
  }, [turnNumber])
  
  const addLog = useCallback((line: string) => {
    setBattleLog((prev) => [...prev, line])
  }, [])
  
  // Load attempts and current stage from Supabase
  const loadProgress = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("tentativas_historia, modo_historia")
        .eq("id", currentUser.id)
        .single()
      
      if (data) {
        const today = new Date().toISOString().split('T')[0]
        const lastReset = localStorage.getItem(`story_reset:${currentUser.id}`)
        
        if (lastReset !== today) {
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
  
  const buildStoryRound = useCallback((stage: number): Duelist[] => {
    const currentBoss = getBossByStage(stage)
    if (!currentBoss) return []
    
    setBoss(currentBoss)
    
    const playerMod = HOUSE_MODIFIERS[playerBuild.house] || { speed: 1, mana: 1, damage: 1, defense: 1 }
    const playerDuelist: Duelist = {
      id: currentUser.id,
      name: playerBuild.name,
      house: playerBuild.house,
      wand: playerBuild.wand,
      avatar: playerBuild.avatar,
      spells: playerBuild.spells,
      hp: { bars: buildHpBars(playerBuild.house) },
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
      hp: { bars: buildHpBars(currentBoss.house) },
      speed: 95,
      debuffs: [],
      team: "enemy",
      spellMana: buildSpellManaForSpells(bossSpells, currentBoss.house),
      turnsInBattle: 0,
      disabledSpells: {},
      missStreakBySpell: {},
    }
    
    return [playerDuelist, bossDuelist]
  }, [currentUser.id, playerBuild, locale])
  
  useEffect(() => {
    loadProgress()
  }, [])
  
  useEffect(() => {
    if (isLoaded) {
      const round = buildStoryRound(currentStage)
      setDuelists(round)
      setBattleStatus("selecting")
      addLog(locale === "en" ? `[Stage ${currentStage}] Battle started!` : `[Etapa ${currentStage}] Batalha iniciada!`)
    }
  }, [isLoaded, currentStage, buildStoryRound, locale, addLog])
  
  const beginRoundSelection = (state: Duelist[] = duelists) => {
    if (gameOver) return
    const rt = turnNumberRef.current
    
    setDuelists((prev) =>
      prev.map((d) => ({
        ...d,
        circumAura: d.circumAura != null && d.circumAura > 1 ? d.circumAura - 1 : d.circumAura === 1 ? undefined : d.circumAura,
      }))
    )
    setBattleStatus("selecting")
    setSelectedSpell(null)
    setSelectedTargetId(null)
    
    const initialActions: Record<string, RoundAction> = {}
    
    // Bot AI: select random spell
    state
      .filter((d) => !d.isPlayer && !isDefeated(d.hp))
      .forEach((bot) => {
        if (bot.debuffs.some((d) => d.type === "stun" || d.type === "freeze")) {
          initialActions[bot.id] = { casterId: bot.id, type: "skip", turnId: rt }
          return
        }
        const availableBotSpells = bot.spells.filter((s) => (bot.disabledSpells?.[s] ?? 0) <= 0)
        const botPool = availableBotSpells.length > 0 ? availableBotSpells : bot.spells
        const spellName = botPool[Math.floor(Math.random() * botPool.length)]
        
        let target: Duelist | undefined
        if (isSelfTargetSpell(spellName)) {
          target = state.find((d) => d.id === bot.id && !isDefeated(d.hp))
        } else if (isAreaSpell(spellName)) {
          const enemies = state.filter((d) => d.team !== bot.team && !isDefeated(d.hp))
          const pool = getValidTargetsForSpell(spellName, bot, state, "torneio-offline")
          target = enemies[0] || pool[0]
        } else {
          const targets = getValidTargetsForSpell(spellName, bot, state, "torneio-offline")
          target = targets[Math.floor(Math.random() * targets.length)]
        }
        
        initialActions[bot.id] = target
          ? { casterId: bot.id, type: "cast", spellName, targetId: target.id, areaAll: isAreaSpell(spellName), turnId: rt }
          : { casterId: bot.id, type: "skip", turnId: rt }
      })
    
    const localPlayer = state.find((d) => d.id === currentUser.id)
    if (localPlayer && isDefeated(localPlayer.hp)) {
      initialActions[currentUser.id] = { casterId: currentUser.id, type: "skip", turnId: rt }
    }
    
    setDuelists(state)
  }
  
  const runResolution = async (queuedActions: RoundAction[]) => {
    setBattleStatus("resolving")
    const roundTurn = turnNumberRef.current
    const snapshot = [...duelistsRef.current]
    
    const outcome = calculateTurnOutcome({
      duelists: snapshot,
      actions: queuedActions,
      spellDatabase: SPELL_DATABASE,
      turnNumber: roundTurn,
      gameMode: "torneio-offline",
      circumFlames,
    })
    
    const state = outcome.newDuelists
    setDuelists(state)
    setBattleLog((prev) => [...prev, ...outcome.logs])
    
    const nextTurn = roundTurn + 1
    turnNumberRef.current = nextTurn
    setTurnNumber(nextTurn)
    
    if (outcome.outcome) {
      if (outcome.outcome === "win") {
        handleWin()
      } else if (outcome.outcome === "lose") {
        handleLose()
      }
      setBattleStatus("finished")
      return
    }
    
    beginRoundSelection(state)
  }
  
  const handleSpellSelect = (spellName: string) => {
    const spell = getSpellInfo(spellName, SPELL_DATABASE)
    if (!spell) return
    
    setSelectedSpell(spellName)
    if (isSelfTargetSpell(spellName)) {
      setSelectedTargetId(currentUser.id)
    } else if (isAreaSpell(spellName)) {
      setSelectedTargetId(null)
    } else {
      const targets = getValidTargetsForSpell(spellName, duelists.find(d => d.id === currentUser.id)!, duelists, "torneio-offline")
      if (targets.length > 0) {
        setSelectedTargetId(targets[0].id)
      }
    }
  }
  
  const handleConfirmAction = () => {
    if (!selectedSpell || battleStatus !== "selecting") return
    
    const player = duelists.find(d => d.id === currentUser.id)
    if (!player) return
    
    const action: RoundAction = isSelfTargetSpell(selectedSpell)
      ? { casterId: currentUser.id, type: "cast", spellName: selectedSpell, targetId: currentUser.id, turnId: turnNumber }
      : isAreaSpell(selectedSpell)
      ? { casterId: currentUser.id, type: "cast", spellName: selectedSpell, areaAll: true, turnId: turnNumber }
      : { casterId: currentUser.id, type: "cast", spellName: selectedSpell, targetId: selectedTargetId!, turnId: turnNumber }
    
    // Get bot action
    const bot = duelists.find(d => !d.isPlayer)
    if (!bot) return
    
    const availableBotSpells = bot.spells.filter((s) => (bot.disabledSpells?.[s] ?? 0) <= 0)
    const botPool = availableBotSpells.length > 0 ? availableBotSpells : bot.spells
    const botSpellName = botPool[Math.floor(Math.random() * botPool.length)]
    
    let botTarget: Duelist | undefined
    if (isSelfTargetSpell(botSpellName)) {
      botTarget = duelists.find((d) => d.id === bot.id && !isDefeated(d.hp))
    } else if (isAreaSpell(botSpellName)) {
      const enemies = duelists.filter((d) => d.team !== bot.team && !isDefeated(d.hp))
      const pool = getValidTargetsForSpell(botSpellName, bot, duelists, "torneio-offline")
      botTarget = enemies[0] || pool[0]
    } else {
      const targets = getValidTargetsForSpell(botSpellName, bot, duelists, "torneio-offline")
      botTarget = targets[Math.floor(Math.random() * targets.length)]
    }
    
    const botAction: RoundAction = botTarget
      ? { casterId: bot.id, type: "cast", spellName: botSpellName, targetId: botTarget.id, areaAll: isAreaSpell(botSpellName), turnId: turnNumber }
      : { casterId: bot.id, type: "skip", turnId: turnNumber }
    
    runResolution([action, botAction])
  }
  
  const handlePotion = () => {
    if (potionUsed) return
    
    const player = duelists.find(d => d.id === currentUser.id)
    if (!player) return
    
    const potion = getSpellInfo(playerBuild.potion, SPELL_DATABASE)
    if (!potion) return
    
    const action: RoundAction = {
      casterId: currentUser.id,
      type: "potion",
      potionType: playerBuild.potion,
      turnId: turnNumber,
    }
    
    // Get bot action
    const bot = duelists.find(d => !d.isPlayer)
    if (!bot) return
    
    const availableBotSpells = bot.spells.filter((s) => (bot.disabledSpells?.[s] ?? 0) <= 0)
    const botPool = availableBotSpells.length > 0 ? availableBotSpells : bot.spells
    const botSpellName = botPool[Math.floor(Math.random() * botPool.length)]
    
    let botTarget: Duelist | undefined
    if (isSelfTargetSpell(botSpellName)) {
      botTarget = duelists.find((d) => d.id === bot.id && !isDefeated(d.hp))
    } else if (isAreaSpell(botSpellName)) {
      const enemies = duelists.filter((d) => d.team !== bot.team && !isDefeated(d.hp))
      const pool = getValidTargetsForSpell(botSpellName, bot, duelists, "torneio-offline")
      botTarget = enemies[0] || pool[0]
    } else {
      const targets = getValidTargetsForSpell(botSpellName, bot, duelists, "torneio-offline")
      botTarget = targets[Math.floor(Math.random() * targets.length)]
    }
    
    const botAction: RoundAction = botTarget
      ? { casterId: bot.id, type: "cast", spellName: botSpellName, targetId: botTarget.id, areaAll: isAreaSpell(botSpellName), turnId: turnNumber }
      : { casterId: bot.id, type: "skip", turnId: turnNumber }
    
    setPotionUsed(true)
    runResolution([action, botAction])
  }
  
  const handleWin = async () => {
    setGameOver("win")
    addLog(locale === "en" ? "🎉 Victory!" : "🎉 Vitória!")
    
    try {
      const nextStage = getNextStage(currentStage)
      if (nextStage) {
        await supabase
          .from("profiles")
          .update({ modo_historia: nextStage })
          .eq("id", currentUser.id)
        
        setTimeout(() => {
          setCurrentStage(nextStage)
          setGameOver(null)
          setPotionUsed(false)
          const round = buildStoryRound(nextStage)
          setDuelists(round)
          setTurnNumber(1)
          turnNumberRef.current = 1
          setBattleStatus("selecting")
          beginRoundSelection(round)
        }, 2000)
      } else {
        addLog(locale === "en" ? "🏆 You completed Story Mode!" : "🏆 Você completou o Modo História!")
        setTimeout(() => {
          onExit()
        }, 3000)
      }
    } catch (error) {
      console.error("Failed to update progress:", error)
    }
  }
  
  const handleLose = async () => {
    setGameOver("lose")
    addLog(locale === "en" ? "You were defeated..." : "Você foi derrotado...")
    
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
  
  const playerDuelist = duelists.find(d => d.isPlayer)
  const bossDuelist = duelists.find(d => !d.isPlayer)
  
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
        <div className="bg-stone-900/90 border-amber-800/50 backdrop-blur-sm max-w-md p-6 text-center rounded-lg">
          <p className="text-amber-100 mb-4">{locale === "en" ? "No attempts left. Come back tomorrow!" : "Sem tentativas restantes. Volte amanhã!"}</p>
          <Button onClick={handleExit} className="border-amber-700 text-amber-100 hover:bg-amber-900/50">
            {locale === "en" ? "Exit" : "Sair"}
          </Button>
        </div>
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
        {boss && playerDuelist && bossDuelist && (
          <div className="w-full max-w-4xl bg-stone-900/90 border-amber-800/50 backdrop-blur-sm rounded-lg p-6">
            {/* Boss HUD */}
            <div className="flex items-center justify-between mb-4 p-4 bg-stone-800/50 rounded-lg border border-amber-900/30">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-red-900 rounded-full flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={AVATAR_IMAGES[boss.avatar] || AVATAR_IMAGES.bruxo01}
                    alt={locale === "en" ? boss.nameEn : boss.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-lg font-bold text-red-300">{locale === "en" ? boss.nameEn : boss.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-red-900/80 border-red-700 text-red-100">
                      <Heart className="w-3 h-3 mr-1" />
                      {getTotalHP(bossDuelist.hp)}/{boss.hp}
                    </Badge>
                    {bossDuelist.spellMana && Object.keys(bossDuelist.spellMana).length > 0 && (
                      <Badge className="bg-blue-900/80 border-blue-700 text-blue-100">
                        MP: {Object.values(bossDuelist.spellMana).reduce((sum, m) => sum + m.current, 0)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Player HUD */}
            <div className="flex items-center justify-between mb-4 p-4 bg-stone-800/50 rounded-lg border border-amber-900/30">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center overflow-hidden">
                  {playerBuild.avatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={playerBuild.avatar}
                      alt={currentUser.username}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = AVATAR_IMAGES.bruxo01
                      }}
                    />
                  ) : (
                    <span className="text-2xl">🧙</span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold text-green-300">{currentUser.username}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-green-900/80 border-green-700 text-green-100">
                      <Heart className="w-3 h-3 mr-1" />
                      {getTotalHP(playerDuelist.hp)}/{playerBuild.house === "slytherin" ? 400 : 500}
                    </Badge>
                    {playerDuelist.spellMana && Object.keys(playerDuelist.spellMana).length > 0 && (
                      <Badge className="bg-blue-900/80 border-blue-700 text-blue-100">
                        MP: {Object.values(playerDuelist.spellMana).reduce((sum, m) => sum + m.current, 0)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Combat Log */}
            <div className="mb-4 p-3 bg-stone-950/50 rounded-lg border border-amber-900/30 max-h-32 overflow-y-auto">
              {battleLog.map((log, i) => (
                <p key={i} className="text-xs mb-1 text-amber-300">{log}</p>
              ))}
            </div>
            
            {/* Spell Selection */}
            {!gameOver && battleStatus === "selecting" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {playerDuelist.spells.map((spellName) => {
                    const spell = getSpellInfo(spellName, SPELL_DATABASE)
                    if (!spell) return null
                    const mana = playerDuelist.spellMana?.[spellName]?.current || 0
                    
                    return (
                      <Button
                        key={spell.name}
                        variant={selectedSpell === spell.name ? "default" : "outline"}
                        className={`h-auto py-3 px-2 text-xs border-amber-700 ${
                          selectedSpell === spell.name
                            ? "bg-amber-700 text-white"
                            : mana < spell.cost
                            ? "text-gray-500 cursor-not-allowed"
                            : "text-amber-100 hover:bg-amber-900/50"
                        }`}
                        onClick={() => mana >= spell.cost && handleSpellSelect(spell.name)}
                        disabled={mana < spell.cost}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-bold">{spell.name}</span>
                          <span className="text-[10px] opacity-80">{spell.powerMin || spell.power}-{spell.powerMax || spell.power}</span>
                          <span className="text-[10px] opacity-60">{spell.cost} MP</span>
                        </div>
                      </Button>
                    )
                  })}
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    onClick={handlePotion}
                    disabled={potionUsed}
                    className="bg-purple-800 hover:bg-purple-700 text-amber-100 border-purple-700"
                  >
                    <FlaskConical className="w-4 h-4 mr-2" />
                    {playerBuild.potion}
                  </Button>
                  
                  {selectedSpell && (
                    <Button
                      onClick={handleConfirmAction}
                      className="bg-red-800 hover:bg-red-700 text-amber-100 border-red-700"
                    >
                      <Swords className="w-4 h-4 mr-2" />
                      {locale === "en" ? "Cast" : "Lançar"}
                    </Button>
                  )}
                </div>
              </div>
            )}
            
            {/* Game Over */}
            {gameOver && (
              <div className="mt-4 p-4 bg-stone-800/50 rounded-lg border border-amber-900/30 text-center">
                {gameOver === "win" ? (
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
          </div>
        )}
      </div>
    </div>
  )
}
