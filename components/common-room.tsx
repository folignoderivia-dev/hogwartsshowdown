"use client"

import { useState, useMemo, useEffect, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Wand2, FlaskConical, BookOpen, Sparkles, User, Search, Swords, AlertTriangle, Shield, Zap, Heart, Wind, LogIn, Trophy, Bug } from "lucide-react"
import type { PlayerBuild } from "@/app/page"
import type { DbUser, FriendMessage, FriendProfile } from "@/lib/database"
import {
  addFriendByUsername,
  getFriendMessages,
  getFriendsWithStats,
  getRankingTop,
  loginUser,
  registerUser,
  removeFriend,
  searchUsersByUsername,
  sendFriendMessage,
  signOutUser,
} from "@/lib/database"
import { getSupabaseClient } from "@/lib/supabase"

interface CommonRoomProps {
  onStartDuel: (build: PlayerBuild) => void
  onSpectateMatch: (matchId: string, mode: PlayerBuild["gameMode"]) => void
  onResumeMatch?: () => void
  resumableMatch?: { matchId: string; mode: PlayerBuild["gameMode"]; status: "waiting" | "in_progress" } | null
  /** Conta logada (obrigatória para entrar na arena). */
  currentUser: DbUser | null
  onAuthChange: (user: DbUser | null) => void
}

/** Velocidade base na arena (GDD V15 — passivas de casa aplicam-se na batalha). */
export const HOUSE_MODIFIERS: Record<string, { speed: number; mana: number; damage: number; defense: number }> = {
  gryffindor: { speed: 1.15, mana: 1, damage: 1, defense: 1 },
  slytherin: { speed: 1.05, mana: 1, damage: 1, defense: 1 },
  ravenclaw: { speed: 1, mana: 1, damage: 1, defense: 1 },
  hufflepuff: { speed: 0.95, mana: 1, damage: 1, defense: 1 },
}

/** Passivas GDD V15 (aplicadas no duel-arena). */
export const HOUSE_GDD = {
  gryffindor: { attackPriorityBonus: 1, manaStartDelta: -2 },
  slytherin: { outgoingDamageMult: 1.15, extraCritTakenChance: 0.15 },
  ravenclaw: { manaBonusNonUnforgivable: 3 },
  hufflepuff: { incomingDamageMult: 0.85, attackPriorityBonus: -1 },
} as const

const HOUSES = [
  { value: "gryffindor", label: "Grifinoria", color: "bg-red-800", modifiers: "+1 prioridade em ataques / mana inicial -2 por magia", icon: "🦁" },
  { value: "slytherin", label: "Sonserina", color: "bg-green-800", modifiers: "+15% dano / +15% chance de critico recebido", icon: "🐍" },
  { value: "ravenclaw", label: "Corvinal", color: "bg-blue-800", modifiers: "+3 mana max (nao-imperdoaveis)", icon: "🦅" },
  { value: "hufflepuff", label: "Lufa-Lufa", color: "bg-yellow-700", modifiers: "-15% dano recebido / -1 prioridade em ataques", icon: "🦡" },
]

// Wand core passives (GDD V15)
export const WAND_PASSIVES: Record<string, { name: string; description: string; effect: string }> = {
  unicorn: { name: "Pelo de Unicornio", description: "+10% Acerto (exceto Imperdoaveis)", effect: "accuracy_plus10" },
  dragon: { name: "Coracao de Dragao", description: "+20% crit / -10% acerto", effect: "crit20_acc_minus10" },
  phoenix: { name: "Pena de Fenix", description: "Cura 5-25% HP no fim do turno", effect: "phoenix_regen" },
  thestral: { name: "Pelo de Trestalio", description: "Endure: coracao nao zera exato (1% salvo)", effect: "thestral_endure" },
  basilisk: { name: "Presa de Basilisco", description: "+1 turno em debuffs aplicados", effect: "basilisk_debuff_duration" },
  thunderbird: { name: "Pena de Passaro Trovao", description: "+1 Prioridade", effect: "thunder_priority" },
  ocammy: { name: "Pena de Ocammy", description: "50% recoil 50% se atacado com feitico do grimorio", effect: "ocammy_parry" },
  kelpie: { name: "Crina de Kelpie", description: "Imune a Incendio e Confrigo", effect: "kelpie_fire_immune" },
  acromantula: { name: "Pelo de Acromantula", description: "+20 poder base por turno de batalha completo", effect: "acromantula_power_stack" },
}

const WAND_CORES = [
  { value: "unicorn", label: "Pelo de Unicornio", desc: "+10% acerto (nao-imperdoaveis)", icon: Shield },
  { value: "dragon", label: "Coracao de Dragao", desc: "+20% crit, -10% acerto", icon: Zap },
  { value: "phoenix", label: "Pena de Fenix", desc: "Cura 5-25% HP fim do turno", icon: Heart },
  { value: "thestral", label: "Pelo de Trestalio", desc: "Endure (1% no coracao)", icon: Wind },
  { value: "basilisk", label: "Presa de Basilisco", desc: "+1 turno em debuffs", icon: AlertTriangle },
  { value: "thunderbird", label: "Pena de Passaro Trovao", desc: "+1 prioridade", icon: Zap },
  { value: "ocammy", label: "Pena de Ocammy", desc: "50% recoil se mesmo feitico", icon: Shield },
  { value: "kelpie", label: "Crina de Kelpie", desc: "Imune a Incendio e Confrigo", icon: Wind },
  { value: "acromantula", label: "Pelo de Acromantula", desc: "+20 poder/turno de batalha", icon: Bug },
]

const POTIONS = [
  { value: "wiggenweld", label: "Wiggenweld", effect: "Cura 100% HP (1 coracao)" },
  { value: "mortovivo", label: "Morto Vivo", effect: "Destiny Bond: perde coracao = atacante perde coracao" },
  { value: "edurus", label: "Edurus", effect: "Limpa todos os debuffs" },
  { value: "maxima", label: "Maxima", effect: "Proximo feitico x2 dano; rivais +50% dano 1 turno" },
  { value: "foco", label: "Foco", effect: "Proximo feitico +30% acerto" },
]

export type SpellDebuffType =
  | "burn"
  | "stun"
  | "freeze"
  | "taunt"
  | "disarm"
  | "mark"
  | "confusion"
  | "poison"
  | "paralysis"
  | "provoke"
  | "no_potion"
  | "silence_defense"
  | "damage_amp"
  | "arestum_penalty"

export interface SpellInfo {
  name: string
  /** Dano fixo (use sozinho OU com powerMin/powerMax). */
  power?: number
  powerMin?: number
  powerMax?: number
  accuracy: number
  /** Mana maxima / custo de uso por lancamento (GDD). */
  pp: number
  cost: number
  effect?: string
  priority?: number
  isUnforgivable?: boolean
  debuff?: { type: SpellDebuffType; chance: number; duration?: number }
  special?: string
}

/** Rola poder base (range ou fixo). */
export function rollSpellPower(spell: SpellInfo): number {
  if (spell.powerMin != null && spell.powerMax != null) {
    return Math.floor(Math.random() * (spell.powerMax - spell.powerMin + 1)) + spell.powerMin
  }
  return spell.power ?? 0
}

export function formatSpellPower(spell: SpellInfo): string {
  if (spell.powerMin != null && spell.powerMax != null) return `${spell.powerMin}-${spell.powerMax}`
  if ((spell.power ?? 0) > 0) return String(spell.power)
  return "—"
}

export const SPELL_DATABASE: SpellInfo[] = [
  { name: "Estupefaca", powerMin: 15, powerMax: 60, accuracy: 50, pp: 7, cost: 1, debuff: { type: "stun", chance: 100, duration: 1 }, effect: "100% STUN (proximo turno)" },
  { name: "Bombarda", powerMin: 50, powerMax: 140, accuracy: 70, pp: 8, cost: 1, debuff: { type: "burn", chance: 50, duration: 2 }, effect: "Area: todos inimigos" },
  { name: "Incendio", powerMin: 25, powerMax: 60, accuracy: 90, pp: 15, cost: 1, debuff: { type: "burn", chance: 50, duration: 2 }, effect: "50% BURN (-15% HP/turno)" },
  { name: "Glacius", powerMin: 30, powerMax: 70, accuracy: 70, pp: 15, cost: 1, debuff: { type: "freeze", chance: 20, duration: 2 }, effect: "20% [❄️ FREEZE] — pula o próximo turno" },
  { name: "Diffindo", power: 50, accuracy: 100, pp: 15, cost: 1, special: "shield_break", effect: "Ignora Protego" },
  { name: "Expelliarmus", powerMin: 10, powerMax: 50, accuracy: 80, pp: 10, cost: 1, priority: 1, debuff: { type: "disarm", chance: 100, duration: 3 }, effect: "DISARM nucleo 3 turnos" },
  { name: "Depulso", power: 40, accuracy: 100, pp: 15, cost: 1 },
  { name: "Confrigo", powerMin: 70, powerMax: 150, accuracy: 70, pp: 10, cost: 1, debuff: { type: "mark", chance: 15, duration: 2 }, effect: "MARCA +20% dano recebido" },
  { name: "Scarlatum", powerMin: 1, powerMax: 300, accuracy: 100, pp: 15, cost: 1, priority: 1, effect: "RNG puro de dano" },
  { name: "Subito", powerMin: 30, powerMax: 90, accuracy: 100, pp: 10, cost: 1, special: "subito_bonus", effect: "x1.5 se alvo a 500% HP" },
  { name: "Reducto", power: 100, accuracy: 50, pp: 5, cost: 1, debuff: { type: "silence_defense", chance: 100, duration: 2 }, effect: "Desativa defesas 2 turnos" },
  { name: "Desumo Tempestas", powerMin: 50, powerMax: 200, accuracy: 100, pp: 5, cost: 2, effect: "Todos em campo incl. atacante" },
  { name: "Protego", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 4, special: "protego_fail_chain", effect: "Self, falha se consecutivo" },
  { name: "Ferula", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 1, special: "ferula_rng_heal", effect: "Self, cura RNG de 10 a 150% HP" },
  { name: "Circum Inflamare", power: 0, accuracy: 100, pp: 10, cost: 1, priority: 1, special: "circum_thorns", effect: "Self, atacantes ganham BURN 1t" },
  { name: "Impedimenta", power: 0, accuracy: 100, pp: 10, cost: 1, debuff: { type: "no_potion", chance: 100, duration: 99 }, effect: "Alvo nao usa pocao" },
  { name: "Arestum Momentum", power: 40, accuracy: 100, pp: 5, cost: 1, special: "arestum_penalty", effect: "-5% dano e acerto do alvo (partida)" },
  { name: "Obliviate", power: 0, accuracy: 55, pp: 3, cost: 1, special: "obliviate_mana", effect: "-5 mana ultimo feitico alvo" },
  { name: "Confundos", powerMin: 30, powerMax: 80, accuracy: 100, pp: 10, cost: 1, debuff: { type: "confusion", chance: 40, duration: 2 }, effect: "40% confusao, 25% recoil proprio" },
  { name: "Crucius", powerMin: 150, powerMax: 200, accuracy: 70, pp: 3, cost: 3, isUnforgivable: true, special: "crucius_weakness", effect: "Outros feiticos -50% poder apos uso" },
  { name: "Imperio", power: 0, accuracy: 80, pp: 3, cost: 3, isUnforgivable: true, priority: 3, debuff: { type: "taunt", chance: 100, duration: 3 }, effect: "TAUNT: so ultimo feitico 3 turnos" },
  { name: "Avada Kedavra", power: 300, accuracy: 40, pp: 5, cost: 3, isUnforgivable: true, special: "avada_miss_hp", effect: "Erro: perde 100% HP (1 coracao)" },
  { name: "Flagrate", powerMin: 10, powerMax: 70, accuracy: 50, pp: 10, cost: 1, special: "flagrate_strip", effect: "30% remove passiva nucleo + DISARM 3t" },
  { name: "Aqua Eructo", powerMin: 5, powerMax: 25, accuracy: 100, pp: 10, cost: 1, priority: 0, special: "aqua_cleanse", effect: "Self, limpa BURN (prioridade +5 na arena)" },
  { name: "Eletricus", powerMin: 40, powerMax: 80, accuracy: 80, pp: 15, cost: 1, debuff: { type: "paralysis", chance: 20, duration: 2 }, effect: "PARALISIA: sem prioridade >0" },
  { name: "Trevus", power: 80, accuracy: 50, pp: 10, cost: 1, special: "trevus_random", effect: "2 debuffs aleatorios 1 turno" },
  { name: "Pericullum", powerMin: 0, powerMax: 40, accuracy: 100, pp: 15, cost: 1, debuff: { type: "provoke", chance: 100, duration: 1 }, effect: "PROVOQUE proximo turno" },
  {
    name: "Rictumsempra",
    powerMin: 10,
    powerMax: 40,
    accuracy: 90,
    pp: 15,
    cost: 1,
    debuff: { type: "provoke", chance: 100, duration: 1 },
    special: "rictum_crit_mana",
    effect: "+30% crit base; 25% -1 mana feitico aleatorio alvo",
  },
  {
    name: "Expulso",
    power: 0,
    accuracy: 65,
    pp: 5,
    cost: 1,
    special: "expulso_swap",
    effect: "Substitui 1 feitico do oponente por um aleatorio do grimorio global",
  },
  { name: "Cara de Lesma", powerMin: 20, powerMax: 50, accuracy: 100, pp: 15, cost: 1, debuff: { type: "poison", chance: 40, duration: 3 }, effect: "40% POISON -10%/turno" },
  {
    name: "Flagellum",
    powerMin: 10,
    powerMax: 75,
    accuracy: 65,
    pp: 15,
    cost: 1,
    special: "flagellum_multi",
    effect: "Multi-hit: 1 a 3 golpes no mesmo turno (RNG)",
  },
  {
    name: "Lumus",
    power: 0,
    accuracy: 100,
    pp: 15,
    cost: 1,
    special: "lumus_acc_down",
    effect: "Reduz ACC do alvo em 20% por 2 turnos. Falha se consecutivo.",
  },
  {
    name: "Petrificus Totales",
    power: 0,
    accuracy: 70,
    pp: 3,
    cost: 1,
    special: "petrificus_disable",
    effect: "Desabilita magia aleatória do alvo por 2 turnos.",
  },
  {
    name: "Salvio Hexia",
    power: 0,
    accuracy: 100,
    pp: 5,
    cost: 1,
    special: "salvio_reflect",
    effect: "Self: reflete 100% do dano recebido por 1 turno.",
  },
  {
    name: "Sectumsempra",
    power: 50,
    accuracy: 50,
    pp: 5,
    cost: 1,
    special: "sectum_multi",
    effect: "Se acerta, desfere de 1 a 5 golpes no mesmo turno.",
  },
  {
    name: "Vermillious",
    power: 25,
    accuracy: 90,
    pp: 15,
    cost: 1,
    special: "vermillious_dynamic_hits",
    effect: "1 hit + 1 por coração perdido.",
  },
  {
    name: "Vulnera Sanetur",
    power: 0,
    accuracy: 100,
    pp: 5,
    cost: 1,
    special: "vulnera_anti_debuff",
    effect: "Self: imunidade a novos debuffs por 3 turnos.",
  },
  {
    name: "Finite Incantatem",
    power: 0,
    accuracy: 100,
    pp: 5,
    cost: 1,
    special: "finite_cleanse",
    effect: "Self: remove todo e qualquer debuff em si mesmo.",
  },
  {
    name: "Fumus",
    power: 0,
    accuracy: 100,
    pp: 10,
    cost: 1,
    special: "fumus_cleanse_all",
    effect: "Limpa buffs e debuffs de todos em campo.",
  },
  {
    name: "Episkey",
    power: 0,
    accuracy: 100,
    pp: 5,
    cost: 1,
    special: "episkey_heal_crit",
    effect: "Self: cura fixa de 50 e ganha buff de crítico por 2 turnos.",
  },
  {
    name: "Protego Diabólico",
    power: 0,
    accuracy: 100,
    pp: 3,
    cost: 1,
    special: "protego_diabolico_unforgivable_acc_down",
    effect: "Área (exceto em si): reduz em 15% a precisão de Crucius, Avada Kedavra e Imperio por 2 turnos.",
  },
  { name: "Maximos", power: 0, accuracy: 100, pp: 5, cost: 1, priority: 0, special: "maximos_charge", effect: "Self: proximo feitico +10% a +100% poder" },
]

const AVATARS = [
  { value: "bruxo01", label: "Bruxo 01", image: "https://i.postimg.cc/x8NHhC8x/bruxo01.png" },
  { value: "bruxo02", label: "Bruxo 02", image: "https://i.postimg.cc/nr97gzrY/bruxo02.png" },
  { value: "bruxo03", label: "Bruxo 03", image: "https://i.postimg.cc/QCK5wtCg/bruxo03.png" },
  { value: "bruxa01", label: "Bruxa 01", image: "https://i.postimg.cc/brSbWJr6/bruxa01.png" },
  { value: "bruxa02", label: "Bruxa 02", image: "https://i.postimg.cc/L5gfwX5D/bruxa02.png" },
  { value: "bruxa03", label: "Bruxa 03", image: "https://i.postimg.cc/1XV62tXH/bruxa03.png" },
]

const GAME_MODES = [
  { value: "teste", label: "TESTE (BOT)" },
  { value: "1v1", label: "1 VS 1" },
  { value: "2v2", label: "2 VS 2" },
  { value: "ffa3", label: "ALL IN ONE (3 FFA)" },
  { value: "ffa", label: "ALL IN ONE (4 FFA)" },
]

const MAX_SPELL_POINTS = 6
const MAX_UNFORGIVABLE = 1

export default function CommonRoom({ onStartDuel, onSpectateMatch, onResumeMatch, resumableMatch, currentUser, onAuthChange }: CommonRoomProps) {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authUsername, setAuthUsername] = useState("")
  const [authError, setAuthError] = useState("")
  const [ranking, setRanking] = useState<DbUser[]>([])
  const [friendSearch, setFriendSearch] = useState("")
  const [friendSearchResults, setFriendSearchResults] = useState<FriendProfile[]>([])
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [friendFeedback, setFriendFeedback] = useState("")
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null)
  const [friendMessages, setFriendMessages] = useState<FriendMessage[]>([])
  const [friendMessageInput, setFriendMessageInput] = useState("")
  const [onlineWizards, setOnlineWizards] = useState(0)
  const [duelsInProgress, setDuelsInProgress] = useState<Array<{ matchId: string; mode: PlayerBuild["gameMode"]; p1: string; p2: string }>>([])
  const [showSpectatePanel, setShowSpectatePanel] = useState(false)
  const [shareFeedback, setShareFeedback] = useState("")

  const [name, setName] = useState("")
  const [house, setHouse] = useState("")
  const [wand, setWand] = useState("")
  const [potion, setPotion] = useState("")
  const [avatar, setAvatar] = useState("")
  const [selectedSpells, setSelectedSpells] = useState<string[]>([])
  const [spellSearch, setSpellSearch] = useState("")
  const [gameMode, setGameMode] = useState<"teste" | "1v1" | "2v2" | "ffa" | "ffa3" | "">("")

  const { totalCost, unforgivableCount } = useMemo(() => {
    let total = 0
    let unforgivable = 0
    selectedSpells.forEach((spellName) => {
      const spell = SPELL_DATABASE.find((s) => s.name === spellName)
      if (spell) {
        total += spell.cost
        if (spell.isUnforgivable) unforgivable++
      }
    })
    return { totalCost: total, unforgivableCount: unforgivable }
  }, [selectedSpells])

  const remainingPoints = MAX_SPELL_POINTS - totalCost

  const toggleSpell = (spellName: string) => {
    const spell = SPELL_DATABASE.find((s) => s.name === spellName)
    if (!spell) return

    if (selectedSpells.includes(spellName)) {
      setSelectedSpells(selectedSpells.filter((s) => s !== spellName))
    } else {
      if (spell.cost > remainingPoints) return
      if (spell.isUnforgivable && unforgivableCount >= MAX_UNFORGIVABLE) return
      setSelectedSpells([...selectedSpells, spellName])
    }
  }

  const filteredSpells = SPELL_DATABASE.filter((spell) =>
    spell.name.toLowerCase().includes(spellSearch.toLowerCase())
  )

  const canSelectSpell = (spell: SpellInfo): boolean => {
    if (selectedSpells.includes(spell.name)) return true
    if (spell.cost > remainingPoints) return false
    if (spell.isUnforgivable && unforgivableCount >= MAX_UNFORGIVABLE) return false
    return true
  }

  const isReady =
    !!currentUser &&
    house !== "" &&
    wand !== "" &&
    potion !== "" &&
    avatar !== "" &&
    gameMode !== "" &&
    totalCost === MAX_SPELL_POINTS

  const refreshRanking = async () => {
    const list = await getRankingTop(50)
    setRanking(list)
  }

  const refreshFriends = async () => {
    if (!currentUser?.id) {
      setFriends([])
      return
    }
    const list = await getFriendsWithStats(currentUser.id)
    setFriends(list)
  }

  useEffect(() => {
    void refreshRanking()
  }, [currentUser])

  useEffect(() => {
    void refreshFriends()
  }, [currentUser?.id])

  useEffect(() => {
    const supabase = getSupabaseClient()
    const lobby = supabase.channel("room_lobby", { config: { presence: { key: currentUser?.id || `anon-${Math.random().toString(36).slice(2, 7)}` } } })
    const syncOnline = () => {
      const state = lobby.presenceState()
      setOnlineWizards(Object.keys(state).length)
    }
    lobby
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await lobby.track({ online_at: new Date().toISOString(), username: currentUser?.username || "Visitante" })
        }
      })

    const fetchDuels = async () => {
      const { data } = await supabase
        .from("matches")
        .select("match_id,mode,p1_name,p2_name")
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false })
        .limit(20)
      const rows = (data || []).map((m: any) => ({
        matchId: m.match_id as string,
        mode: (m.mode as PlayerBuild["gameMode"]) || "1v1",
        p1: m.p1_name || "Bruxo 1",
        p2: m.p2_name || "Bruxo 2",
      }))
      setDuelsInProgress(rows)
    }
    void fetchDuels()
    const duelsCh = supabase
      .channel("duels-in-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => void fetchDuels())
      .subscribe()

    return () => {
      void supabase.removeChannel(lobby)
      void supabase.removeChannel(duelsCh)
    }
  }, [currentUser?.id, currentUser?.username])

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setAuthError("")
    if (authMode === "register") {
      const r = await registerUser(authEmail, authPassword, authUsername)
      if (!r.ok) {
        setAuthError(r.error)
        return
      }
      onAuthChange(r.user)
      await refreshRanking()
      setAuthOpen(false)
      return
    }
    const r = await loginUser(authEmail, authPassword)
    if (!r.ok) {
      setAuthError(r.error)
      return
    }
    onAuthChange(r.user)
    await refreshRanking()
    setAuthOpen(false)
  }

  const handleStartDuel = () => {
    if (!currentUser) return
    if (isReady && gameMode) {
      onStartDuel({
        name: currentUser.username,
        house,
        wand,
        potion,
        spells: selectedSpells,
        avatar,
        gameMode: gameMode as "teste" | "1v1" | "2v2" | "ffa" | "ffa3",
        userId: currentUser.id,
        username: currentUser.username,
        elo: currentUser.elo,
      })
    }
  }

  const handleAddFriend = async () => {
    if (!currentUser?.id) return
    setFriendFeedback("")
    const result = await addFriendByUsername(currentUser.id, friendSearch)
    if (!result.ok) {
      setFriendFeedback(result.error)
      return
    }
    setFriendSearch("")
    setFriendFeedback("Amigo adicionado com sucesso.")
    await refreshFriends()
  }

  const handleSearchUsers = async () => {
    const rows = await searchUsersByUsername(friendSearch, 8)
    setFriendSearchResults(rows.filter((r) => r.id !== currentUser?.id))
  }

  const handleRemoveFriend = async (friendId: string) => {
    if (!currentUser?.id) return
    const result = await removeFriend(currentUser.id, friendId)
    if (!result.ok) {
      setFriendFeedback(result.error)
      return
    }
    if (activeFriendId === friendId) {
      setActiveFriendId(null)
      setFriendMessages([])
    }
    await refreshFriends()
    setFriendFeedback("Amigo removido.")
  }

  const handleOpenFriendChat = async (friendId: string) => {
    if (!currentUser?.id) return
    setActiveFriendId(friendId)
    const rows = await getFriendMessages(currentUser.id, friendId)
    setFriendMessages(rows)
  }

  const handleSendFriendMessage = async () => {
    if (!currentUser?.id || !activeFriendId) return
    const result = await sendFriendMessage(currentUser.id, activeFriendId, friendMessageInput)
    if (!result.ok) {
      setFriendFeedback(result.error)
      return
    }
    setFriendMessageInput("")
    const rows = await getFriendMessages(currentUser.id, activeFriendId)
    setFriendMessages(rows)
  }

  const selectedAvatar = AVATARS.find((a) => a.value === avatar)
  const selectedWandCore = WAND_CORES.find((w) => w.value === wand)
  const effectiveName = currentUser?.username || name

  return (
    <div className="min-h-screen wood-bg p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header with Medieval Style */}
        <header className="mb-8 text-center">
          <div className="medieval-frame mx-auto mb-4 inline-block rounded-lg bg-gradient-to-b from-amber-900/80 to-amber-950/90 px-8 py-4">
            <h1 className="text-4xl font-bold tracking-tight text-amber-200" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
              Sala Comunal
            </h1>
            <p className="mt-1 text-amber-100/70">Monte sua build para o duelo</p>
          </div>
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2">
            <Badge className="border-green-700 bg-green-950/40 px-3 py-1 text-green-300">
              🟢 {onlineWizards} Bruxos Online
            </Badge>
            {currentUser ? (
              <>
                <Badge className="border-amber-600 bg-stone-900 px-3 py-1 text-amber-200">
                  {currentUser.username} · ELO {currentUser.elo}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-amber-700 text-amber-200"
                  onClick={() => {
                    void signOutUser()
                    onAuthChange(null)
                  }}
                >
                  Sair
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                className="border border-amber-600 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50"
                onClick={() => {
                  setAuthError("")
                  setAuthOpen(true)
                }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Entrar / Registrar
              </Button>
            )}
          </div>
        </header>

        <Card className="medieval-frame mb-4 border-0 bg-gradient-to-b from-stone-800 to-stone-900">
          <CardHeader className="border-b border-amber-900/50 py-2">
            <CardTitle className="flex items-center justify-between text-sm text-amber-200">
              <span>Duelos em Andamento</span>
              <Button size="sm" variant="outline" className="h-7 border-amber-700 text-amber-300" onClick={() => setShowSpectatePanel((v) => !v)}>
                {showSpectatePanel ? "Ocultar" : "Mostrar"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showSpectatePanel && (
            <CardContent className="max-h-48 overflow-y-auto pt-2">
              {duelsInProgress.length === 0 && <p className="text-xs text-amber-300/80">Nenhum duelo em andamento no momento.</p>}
              <div className="space-y-2">
                {duelsInProgress.map((d) => (
                  <div key={d.matchId} className="flex items-center justify-between gap-2 rounded border border-amber-900/60 bg-stone-900/60 px-2 py-1.5 text-xs">
                    <span className="text-amber-100">{d.p1} vs {d.p2}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        className="h-7 border border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50"
                        onClick={() => onSpectateMatch(d.matchId, d.mode)}
                      >
                        Assistir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-amber-700 text-amber-200"
                        onClick={async () => {
                          const origin = typeof window !== "undefined" ? window.location.origin : ""
                          const shareUrl = `${origin}/?spectate=${encodeURIComponent(d.matchId)}&mode=${encodeURIComponent(d.mode)}`
                          await navigator.clipboard.writeText(shareUrl)
                          setShareFeedback("Link de espectador copiado.")
                          window.setTimeout(() => setShareFeedback(""), 1800)
                        }}
                      >
                        Compartilhar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {shareFeedback && <p className="mt-2 text-xs text-amber-300">{shareFeedback}</p>}
            </CardContent>
          )}
        </Card>

        <Dialog open={authOpen} onOpenChange={setAuthOpen}>
          <DialogContent className="border-amber-800 bg-stone-900 text-amber-100 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-amber-200">{authMode === "login" ? "Login" : "Registro"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <div>
                <Label className="text-amber-300">E-mail</Label>
                <Input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="mt-1 border-amber-800 bg-stone-800 text-amber-100"
                  required
                />
              </div>
              <div>
                <Label className="text-amber-300">Senha</Label>
                <Input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="mt-1 border-amber-800 bg-stone-800 text-amber-100"
                  required
                />
              </div>
              {authMode === "register" && (
                <div>
                  <Label className="text-amber-300">Nome de usuário</Label>
                  <Input
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="mt-1 border-amber-800 bg-stone-800 text-amber-100"
                    required={authMode === "register"}
                  />
                </div>
              )}
              {authError && <p className="text-sm text-red-400">{authError}</p>}
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button type="submit" className="w-full border-amber-700 bg-amber-800 text-amber-50">
                  {authMode === "login" ? "Entrar" : "Criar conta"}
                </Button>
                <button
                  type="button"
                  className="text-center text-xs text-amber-400 underline"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "register" : "login")
                    setAuthError("")
                  }}
                >
                  {authMode === "login" ? "Não tem conta? Registre-se" : "Já tem conta? Login"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Card className="medieval-frame mb-6 border-0 bg-gradient-to-b from-stone-800 to-stone-900">
          <CardHeader className="border-b border-amber-900/50 py-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-200">
              <Trophy className="h-4 w-4 text-amber-400" />
              Ranking global (Top 50)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-56 overflow-y-auto pt-2">
            <ol className="space-y-1 text-xs">
              {ranking.map((u, i) => (
                <li
                  key={u.id}
                  className={`flex justify-between rounded px-2 py-1 ${currentUser?.id === u.id ? "bg-amber-900/40" : "bg-stone-800/50"}`}
                >
                  <span className="text-amber-200">
                    {i + 1}. {u.username}
                  </span>
                  <span className="font-mono text-amber-400">{u.elo}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        {currentUser && resumableMatch && onResumeMatch && (
          <Card className="medieval-frame mb-4 border-0 bg-gradient-to-b from-stone-800 to-stone-900">
            <CardContent className="flex items-center justify-between gap-3 pt-4">
              <p className="text-xs text-amber-200">
                Você possui uma sala ativa: <span className="font-mono text-amber-300">{resumableMatch.matchId}</span> ({resumableMatch.mode} · {resumableMatch.status})
              </p>
              <Button
                type="button"
                onClick={onResumeMatch}
                className="border border-amber-700 bg-amber-900/50 text-amber-100 hover:bg-amber-800/60"
              >
                Voltar para sala
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="medieval-frame mb-6 border-0 bg-gradient-to-b from-stone-800 to-stone-900">
          <CardHeader className="border-b border-amber-900/50 py-2">
            <CardTitle className="text-sm text-amber-200">Modo Amigos</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {!currentUser ? (
              <p className="text-xs text-amber-300/80">Entre na sua conta para adicionar amigos.</p>
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <Input
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    placeholder="Buscar usuário (mín. 2 letras)"
                    className="h-9 border-amber-800 bg-stone-800 text-amber-100 placeholder:text-stone-500"
                  />
                  <Button type="button" onClick={handleAddFriend} className="border border-amber-700 bg-amber-900/50 text-amber-100 hover:bg-amber-800/60">
                    Adicionar
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSearchUsers} className="border-amber-700 text-amber-200">
                    Buscar
                  </Button>
                </div>
                {friendSearchResults.length > 0 && (
                  <div className="mb-3 space-y-1 rounded border border-amber-900/50 bg-stone-900/70 p-2 text-xs">
                    {friendSearchResults.map((u) => (
                      <div key={u.id} className="flex items-center justify-between">
                        <span className="text-amber-200">{u.username}</span>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 border border-amber-700 bg-amber-900/40 text-[11px] text-amber-100 hover:bg-amber-800/50"
                          onClick={async () => {
                            if (!currentUser?.id) return
                            const result = await addFriendByUsername(currentUser.id, u.username)
                            setFriendFeedback(result.ok ? "Amigo adicionado com sucesso." : result.error)
                            if (result.ok) await refreshFriends()
                          }}
                        >
                          Adicionar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {friendFeedback && <p className="mb-2 text-xs text-amber-300">{friendFeedback}</p>}
                {friends.length === 0 ? (
                  <p className="text-xs text-amber-300/80">Você ainda não adicionou amigos.</p>
                ) : (
                  <div className="space-y-2">
                    {friends.map((friend) => (
                      <div key={friend.id} className="rounded border border-amber-900/60 bg-stone-900/60 px-3 py-2 text-xs text-amber-100">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-amber-200">{friend.username}</p>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 border border-amber-700 bg-amber-900/40 px-2 text-[11px] text-amber-100 hover:bg-amber-800/50"
                              onClick={() => void handleOpenFriendChat(friend.id)}
                            >
                              Mensagem
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 border border-red-700 bg-red-900/50 px-2 text-[11px] text-red-100 hover:bg-red-800/60"
                              onClick={() => void handleRemoveFriend(friend.id)}
                            >
                              Remover
                            </Button>
                          </div>
                        </div>
                        <p className="text-amber-300/90">Vitórias: {friend.wins} · Derrotas: {friend.losses}</p>
                        <p className="text-amber-300/80">Feitiço mais usado: {friend.favoriteSpell || "Sem dados"}</p>
                      </div>
                    ))}
                  </div>
                )}
                {activeFriendId && (
                  <div className="mt-3 rounded border border-amber-900/60 bg-stone-900/70 p-2">
                    <p className="mb-2 text-xs text-amber-300">Mensagens</p>
                    <div className="mb-2 max-h-28 overflow-y-auto rounded border border-amber-900/50 bg-stone-950/60 p-2 text-xs">
                      {friendMessages.length === 0 ? (
                        <p className="text-amber-300/70">Sem mensagens ainda.</p>
                      ) : (
                        friendMessages.map((m) => (
                          <p key={m.id} className="mb-1 text-amber-100/90">
                            <span className="text-amber-400">{m.senderId === currentUser.id ? "Você" : "Amigo"}:</span> {m.content}
                          </p>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={friendMessageInput}
                        onChange={(e) => setFriendMessageInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void handleSendFriendMessage()}
                        placeholder="Escreva para seu amigo..."
                        className="h-8 border-amber-800 bg-stone-800 text-amber-100 placeholder:text-stone-500"
                      />
                      <Button type="button" onClick={handleSendFriendMessage} className="h-8 border border-amber-700 bg-amber-900/50 text-amber-100 hover:bg-amber-800/60">
                        Enviar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Avatar & Name */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <User className="h-5 w-5 text-amber-400" />
                Identidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex-1">
                <Label htmlFor="wizard-name" className="text-amber-200">
                  Nome do Bruxo
                </Label>
                <Input
                  id="wizard-name"
                  placeholder={currentUser ? "Nome vinculado à conta" : "Digite seu nome..."}
                  value={effectiveName}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!!currentUser}
                  className="mt-1 border-amber-800 bg-stone-800 text-amber-100 placeholder:text-stone-500 focus:border-amber-600"
                />
              </div>
              <div>
                <p className="mb-2 text-sm text-amber-300">Escolha seu avatar</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {AVATARS.map((av) => (
                    <button
                      key={av.value}
                      type="button"
                      onClick={() => setAvatar(av.value)}
                      className={`overflow-hidden rounded-lg border-2 transition-all ${
                        avatar === av.value
                          ? "border-amber-500 ring-2 ring-amber-300/40"
                          : "border-stone-700 hover:border-amber-700"
                      }`}
                    >
                      <img src={av.image} alt={av.label} className="h-24 w-full object-cover" />
                      <div className="bg-stone-900 px-2 py-1 text-xs text-amber-200">{av.label}</div>
                    </button>
                  ))}
                </div>
                {selectedAvatar && (
                  <p className="mt-2 text-xs text-amber-400/80">Selecionado: {selectedAvatar.label}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* House Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Casa de Hogwarts
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Select value={house} onValueChange={setHouse}>
                <SelectTrigger className="border-amber-800 bg-stone-800 text-amber-100">
                  <SelectValue placeholder="Selecione sua casa..." />
                </SelectTrigger>
                <SelectContent className="medieval-frame border-0 bg-stone-800">
                  {HOUSES.map((h) => (
                    <SelectItem
                      key={h.value}
                      value={h.value}
                      className="text-amber-100 focus:bg-amber-900/50 focus:text-amber-200"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded ${h.color} text-sm`}>
                          {h.icon}
                        </span>
                        <span>{h.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {house && (
                <div className="mt-3 rounded border border-amber-800/50 bg-amber-950/30 p-2">
                  <p className="text-xs text-amber-300">
                    <strong>Modificadores:</strong> {HOUSES.find(h => h.value === house)?.modifiers}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Wand Core Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <Wand2 className="h-5 w-5 text-amber-400" />
                Nucleo da Varinha
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Select value={wand} onValueChange={setWand}>
                <SelectTrigger className="border-amber-800 bg-stone-800 text-amber-100">
                  <SelectValue placeholder="Selecione o nucleo..." />
                </SelectTrigger>
                <SelectContent className="medieval-frame border-0 bg-stone-800">
                  {WAND_CORES.map((w) => {
                    const Icon = w.icon
                    return (
                      <SelectItem
                        key={w.value}
                        value={w.value}
                        className="text-amber-100 focus:bg-amber-900/50 focus:text-amber-200"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-amber-400" />
                          {w.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {selectedWandCore && (
                <div className="mt-3 rounded border border-amber-800/50 bg-amber-950/30 p-2">
                  <p className="text-xs text-amber-300">
                    <strong>Passiva:</strong> {selectedWandCore.desc}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Potion Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <FlaskConical className="h-5 w-5 text-amber-400" />
                Pocao
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Select value={potion} onValueChange={setPotion}>
                <SelectTrigger className="border-amber-800 bg-stone-800 text-amber-100">
                  <SelectValue placeholder="Selecione sua pocao..." />
                </SelectTrigger>
                <SelectContent className="medieval-frame border-0 bg-stone-800">
                  {POTIONS.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      className="text-amber-100 focus:bg-amber-900/50 focus:text-amber-200"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-xs text-amber-400/70">{p.effect}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Grimoire - Spell Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 md:col-span-2">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center justify-between text-amber-200">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-400" />
                  Grimorio
                </span>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      totalCost === MAX_SPELL_POINTS
                        ? "border-green-600 bg-green-900/50 text-green-300"
                        : "border-amber-700 bg-amber-900/30 text-amber-300"
                    }
                  >
                    {totalCost}/{MAX_SPELL_POINTS} pontos
                  </Badge>
                  {unforgivableCount > 0 && (
                    <Badge className="border-red-600 bg-red-900/30 text-red-300">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {unforgivableCount}/{MAX_UNFORGIVABLE} maldicao
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="mb-3 rounded border border-red-800/50 bg-red-950/30 p-3">
                <p className="text-sm text-red-300">
                  <strong>Sistema de Pontos:</strong> Feiticos comuns = 1 ponto | Maldicoes Imperdoaveis = 3 pontos
                </p>
                <p className="mt-1 text-xs text-amber-400/70">
                  Maximo de 1 Maldicao Imperdoavel por build. Use exatamente 6 pontos. Regra: 100 Power = 1 Barra HP.
                </p>
              </div>
              
              {/* Search Input */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                <Input
                  placeholder="Pesquisar feitico..."
                  value={spellSearch}
                  onChange={(e) => setSpellSearch(e.target.value)}
                  className="border-amber-800 bg-stone-800 pl-10 text-amber-100 placeholder:text-stone-500"
                />
              </div>

              {/* Scrollable Spell List */}
              <div className="parchment-bg max-h-64 overflow-y-auto rounded-lg border-4 border-amber-900 p-3">
                <div className="grid gap-2">
                  {filteredSpells.map((spell) => {
                    const isSelected = selectedSpells.includes(spell.name)
                    const canSelect = canSelectSpell(spell)
                    const isDisabled = !isSelected && !canSelect
                    
                    return (
                      <button
                        key={spell.name}
                        onClick={() => toggleSpell(spell.name)}
                        disabled={isDisabled}
                        className={`flex items-center justify-between rounded border-2 p-3 text-left transition-all ${
                          isSelected
                            ? spell.isUnforgivable
                              ? "border-red-700 bg-red-900/40"
                              : "border-amber-600 bg-amber-900/40"
                            : isDisabled
                              ? "cursor-not-allowed border-stone-500 bg-stone-700/30 opacity-50"
                              : spell.isUnforgivable
                                ? "border-red-900/50 bg-stone-700/50 hover:border-red-700/70"
                                : "border-stone-500 bg-stone-700/50 hover:border-amber-700"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isSelected ? (spell.isUnforgivable ? "text-red-300" : "text-amber-300") : "text-stone-900"}`}>
                              {spell.name}
                            </span>
                            <Badge
                              className={`text-xs ${spell.isUnforgivable ? "border-red-600 bg-red-900/50 text-red-300" : "border-stone-500 bg-stone-600 text-stone-200"}`}
                            >
                              {spell.cost} pt{spell.cost > 1 ? "s" : ""}
                            </Badge>
                            {spell.isUnforgivable && (
                              <Badge className="border-red-600 bg-red-900/50 text-xs text-red-300">
                                Imperdoavel
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
                            {(spell.power ?? 0) > 0 || (spell.powerMin != null && spell.powerMax != null) ? (
                              <span>Poder: {formatSpellPower(spell)}</span>
                            ) : null}
                            <span>Acerto: {spell.accuracy}%</span>
                            <span>MANA: {spell.pp}</span>
                            {spell.priority != null && spell.priority !== 0 && (
                              <span className="text-purple-700">Prio: {spell.priority > 0 ? "+" : ""}{spell.priority}</span>
                            )}
                          </div>
                          {spell.effect && (
                            <p className="mt-1 text-xs text-amber-700">{spell.effect}</p>
                          )}
                        </div>
                        <div className={`ml-3 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          isSelected 
                            ? spell.isUnforgivable 
                              ? "border-red-500 bg-red-600 text-white" 
                              : "border-amber-500 bg-amber-600 text-white"
                            : "border-stone-400"
                        }`}>
                          {isSelected && <span className="text-sm">✓</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {filteredSpells.length === 0 && (
                  <p className="py-4 text-center text-sm text-stone-500">
                    Nenhum feitico encontrado
                  </p>
                )}
              </div>

              {/* Selected Spells Preview */}
              {selectedSpells.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-amber-400/70">Feiticos selecionados ({selectedSpells.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSpells.map((spellName) => {
                      const spell = SPELL_DATABASE.find((s) => s.name === spellName)
                      return (
                        <Badge
                          key={spellName}
                          className={`cursor-pointer ${spell?.isUnforgivable ? "bg-red-700 hover:bg-red-600" : "bg-amber-700 hover:bg-amber-600"} text-white`}
                          onClick={() => toggleSpell(spellName)}
                        >
                          {spellName} ({spell?.cost}pt) x
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Game Mode & Start Duel Button */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {/* Game Mode Selector */}
          <div className="medieval-frame flex items-center gap-3 rounded-lg bg-stone-800/90 px-6 py-3">
            <Swords className="h-5 w-5 text-amber-400" />
            <span className="text-sm text-amber-200">Modo de Jogo:</span>
            <div className="flex gap-2">
              {GAME_MODES.map((mode) => (
                <Button
                  key={mode.value}
                  variant="outline"
                  size="sm"
                  onClick={() => setGameMode(mode.value as "teste" | "1v1" | "2v2" | "ffa" | "ffa3")}
                  className={`transition-all ${
                    gameMode === mode.value
                      ? "border-amber-500 bg-amber-700/50 text-amber-200"
                      : "border-amber-800 bg-stone-800 text-amber-300 hover:border-amber-600 hover:bg-amber-900/30"
                  }`}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
          </div>

          <Button
            size="lg"
            disabled={!isReady}
            onClick={handleStartDuel}
            className={`medieval-frame border-0 px-12 py-6 text-lg font-bold transition-all ${
              isReady
                ? "bg-gradient-to-b from-red-800 to-red-900 text-amber-100 shadow-lg shadow-red-900/50 hover:from-red-700 hover:to-red-800"
                : "cursor-not-allowed bg-stone-700 text-stone-500"
            }`}
          >
            <Wand2 className="mr-2 h-5 w-5" />
            Procurar Duelo
          </Button>
        </div>

        {!isReady && (
          <p className="mt-4 text-center text-sm text-amber-400/70">
            {!currentUser
              ? "Entre ou registre-se para poder ir à Arena."
              : totalCost !== MAX_SPELL_POINTS
                ? `Use exatamente ${MAX_SPELL_POINTS} pontos de feitico (atual: ${totalCost})`
                : "Complete todas as selecoes para iniciar o duelo"}
          </p>
        )}
      </div>
    </div>
  )
}
