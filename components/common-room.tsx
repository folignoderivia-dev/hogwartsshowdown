"use client"

import { useState, useMemo, useEffect, useRef, type FormEvent } from "react"
import { io as ioClient, type Socket } from "socket.io-client"
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
import { Wand2, FlaskConical, BookOpen, Sparkles, User, Search, Swords, AlertTriangle, Shield, Zap, Heart, Wind, LogIn, Trophy, Bug, Crown, Copy, Upload, X, Save, FolderOpen, Trash2, Lock } from "lucide-react"
import { formatSpellPower, INITIAL_PLAYER_BUILD, SPELL_DATABASE, type SpellInfo } from "@/lib/data-store"
import type { PlayerBuild, CustomRoomSettings, GameMode } from "@/lib/types"
import type { DbUser, FriendMessage, FriendProfile } from "@/lib/database"
import { getRecentMatchHistory } from "@/lib/database"
import {
  addFriendByUsername,
  getFriendMessages,
  getFriendsWithStats,
  getRankingTop,
  loginUser,
  registerUser,
  removeFriend,
  submitVipRequest,
  uploadVipAvatar,
  searchUsersByUsername,
  sendFriendMessage,
  signOutUser,
} from "@/lib/database"
import { clearSupabaseSessionAndResetClient, getSupabaseClient } from "@/lib/supabase"
import HomeLobbyChat from "@/components/home-lobby-chat"
import { useLanguage } from "@/contexts/language-context"
import type { AppLocale } from "@/contexts/language-context"

interface CommonRoomProps {
  onStartDuel: (build: PlayerBuild) => void
  onCreateRoom?: (build: PlayerBuild) => void
  onJoinRoom?: (build: PlayerBuild, matchId: string) => void
  onRefreshRooms?: () => void
  openRooms?: Array<{ matchId: string; mode: PlayerBuild["gameMode"]; host: string; playersJoined: number; playersExpected: number; isVipRoom?: boolean }>
  onQuidditchRoomsUpdate?: (rooms: Array<{ matchId: string; mode: PlayerBuild["gameMode"]; host: string; playersJoined: number; playersExpected: number }>) => void
  onSpectateMatch: (matchId: string, mode: PlayerBuild["gameMode"]) => void
  onResumeMatch?: () => void
  resumableMatch?: { matchId: string; mode: PlayerBuild["gameMode"]; status: "waiting" | "in_progress" } | null
  /** Conta logada (obrigatória para entrar na arena). */
  currentUser: DbUser | null
  onAuthChange: (user: DbUser | null) => void
}

const HOUSES = [
  { value: "gryffindor", label: "Grifinória",  color: "bg-red-800",    modifiers: "Age primeiro na maioria das situações, mas começa com menos mana em cada magia", icon: "🦁" },
  { value: "slytherin",  label: "Sonserina",   color: "bg-green-800",  modifiers: "Alta chance de acertos críticos, porém começa com apenas 4 barras de HP",        icon: "🐍" },
  { value: "ravenclaw",  label: "Corvinal",    color: "bg-blue-800",   modifiers: "Mana extra em todas as magias comuns, permitindo mais lançamentos por batalha",   icon: "🦅" },
  { value: "hufflepuff", label: "Lufa-Lufa",   color: "bg-yellow-700", modifiers: "Devolve parte do dano recebido ao atacante, mas age por último na maioria dos turnos", icon: "🦡" },
]


const WAND_CORES = [
  // Núcleos clássicos (atualizados)
  { value: "unicorn",     label: "Pelo de Unicórnio",     desc: "+10% acerto (não-Imperdoáveis)",                  icon: Shield },
  { value: "dragon",      label: "Coração de Dragão",      desc: "+20% crit / -15% acerto",                        icon: Zap },
  { value: "phoenix",     label: "Pena de Fênix",          desc: "Cura 25-75 HP fixo fim do turno",                icon: Heart },
  { value: "thestral",    label: "Pelo de Testrálio",       desc: "Dano único máximo 300",                          icon: Wind },
  { value: "basilisk",    label: "Presa de Basilisco",      desc: "+20% chance de aplicar debuffs",                 icon: AlertTriangle },
  { value: "thunderbird", label: "Pena de Pássaro Trovão", desc: "+1 prioridade global",                           icon: Zap },
  { value: "occamy",      label: "Pena de Occamy",          desc: "Espelho: mesmo feitiço do alvo — dano e acc penalizados por repetição", icon: Shield },
  { value: "kelpie",      label: "Crina de Kelpie",         desc: "Imune a Incêndio, Confringo e Bombarda",         icon: Wind },
  { value: "acromantula", label: "Pelo de Acromântula",     desc: "+25 dano por turno completo (empilhável)",       icon: Bug },
  { value: "rapinomonio", label: "Pele de Rapinomônio",     desc: "Início: 1 spell de cada duelista começa com 0 mana", icon: AlertTriangle },
  // Núcleos novos
  { value: "veela",       label: "Cabelo de Veela",         desc: "Acc do atacante reduzida 0-25% aleatório; imune a críticos", icon: Shield },
  { value: "crupe",       label: "Pelo de Crupe",           desc: "Feitiços sem debuff: 25% chance dano ×3",         icon: Zap },
  { value: "cinzal",      label: "Presa de Cinzal",         desc: "Cada 100+ dmg recebido: atacante acumula −15% dano", icon: AlertTriangle },
  { value: "centauro",    label: "Pelo de Centauro",         desc: "No campo: Ferula/Episkey/Vulnera com mana 0 para todos", icon: Wind },
  { value: "hippogriff",  label: "Pena de Hipogrifo",       desc: "Imunidade total a MARCA e BOMBA",               icon: Shield },
  { value: "troll",       label: "Pele de Trasgo",          desc: "Estabiliza o dano recebido no valor médio (não permite dano máximo)", icon: AlertTriangle },
  { value: "oraq_orala",  label: "Pena de Oraqui Orala",    desc: "Ao receber Crítico: 30% chance de invulnerabilidade no próximo turno", icon: Shield },
  { value: "seminviso",   label: "Pelo de Seminviso",       desc: "Permite trancar 1 magia: imune a Expulso, Obliviate e Petrificus", icon: Lock },
]

const POTIONS = [
  { value: "wiggenweld",  label: "Wiggenweld",       effect: "Cura HP = último dano recebido" },
  { value: "mortovivo",  label: "Morto Vivo",        effect: "Imortalidade: HP não cai abaixo de 1 no turno de ativação" },
  { value: "edurus",     label: "Edurus",             effect: "Limpa debuffs + Imunidade por 1 turno" },
  { value: "maxima",     label: "Maxima",             effect: "+50% dano final no próximo turno" },
  { value: "foco",       label: "Foco",               effect: "+10% Accuracy permanente" },
  { value: "merlin",      label: "Poção de Merlin",   effect: "Copia a última poção do oponente com +25% de efetividade" },
  { value: "felix",       label: "Felix Felicis",     effect: "Recupera 100% mana da spell com menor mana atual" },
  { value: "aconito",     label: "Acônito",            effect: "Aplica POISON no oponente por 4 turnos" },
  { value: "amortentia",  label: "Amortentia",         effect: "Substitui aleatoriamente uma poção não usada do oponente" },
  { value: "dragon_tonic", label: "Tônico de Dragão", effect: "Aumenta sua prioridade em +4 no próximo turno" },
  { value: "despair_potion", label: "Poção do Desespero", effect: "Reduz 3 de mana do oponente baseado na última magia que ele usou" },
]


const AVATARS = [
  { value: "avatar1",  label: "Avatar 1",  image: "https://i.postimg.cc/LXbFGK31/pngwing-com-(10).png" },
  { value: "avatar2",  label: "Avatar 2",  image: "https://i.postimg.cc/zBcY4ZFb/pngwing-com-(11).png" },
  { value: "avatar3",  label: "Avatar 3",  image: "https://i.postimg.cc/XJz6tSkp/pngwing-com-(12).png" },
  { value: "avatar4",  label: "Avatar 4",  image: "https://i.postimg.cc/bJBf4c9Z/pngwing-com-(13).png" },
  { value: "avatar5",  label: "Avatar 5",  image: "https://i.postimg.cc/k4pPL3vD/pngwing-com-(14).png" },
  { value: "avatar6",  label: "Avatar 6",  image: "https://i.postimg.cc/C1Qp9TsK/pngwing-com-(15).png" },
  { value: "avatar7",  label: "Avatar 7",  image: "https://i.postimg.cc/SsvbHFfS/pngwing-com-(16).png" },
  { value: "avatar8",  label: "Avatar 8",  image: "https://i.postimg.cc/LXbFGK3m/pngwing-com-(17).png" },
  { value: "avatar9",  label: "Avatar 9",  image: "https://i.postimg.cc/RFFzPVKN/pngwing-com-(18).png" },
  { value: "avatar10", label: "Avatar 10", image: "https://i.postimg.cc/B66GhQHZ/pngwing-com-(19).png" },
  { value: "avatar11", label: "Avatar 11", image: "https://i.postimg.cc/j55r8dPK/pngwing-com-(20).png" },
  { value: "avatar12", label: "Avatar 12", image: "https://i.postimg.cc/yddzfYcH/pngwing-com-(21).png" },
  { value: "avatar13", label: "Avatar 13", image: "https://i.postimg.cc/9MMjxFZ2/pngwing-com-(22).png" },
  { value: "avatar14", label: "Avatar 14", image: "https://i.postimg.cc/d11KWtdg/pngwing-com-(23).png" },
  { value: "avatar15", label: "Avatar 15", image: "https://i.postimg.cc/xCCSsTHh/pngwing-com-(24).png" },
  { value: "avatar16", label: "Avatar 16", image: "https://i.postimg.cc/C11VvLD6/pngwing-com-(25).png" },
  { value: "avatar17", label: "Avatar 17", image: "https://i.postimg.cc/gJJPMkRf/pngwing-com-(26).png" },
  { value: "avatar18", label: "Avatar 18", image: "https://i.postimg.cc/SRYbhTgc/pngwing-com-(5).png" },
  { value: "avatar19", label: "Avatar 19", image: "https://i.postimg.cc/rsR2knfx/pngwing-com-(6).png" },
  { value: "avatar20", label: "Avatar 20", image: "https://i.postimg.cc/vBNwCFt3/pngwing-com-(7).png" },
  { value: "avatar21", label: "Avatar 21", image: "https://i.postimg.cc/Y9sBTKzf/pngwing-com-(8).png" },
  { value: "avatar22", label: "Avatar 22", image: "https://i.postimg.cc/gJTb1FHD/pngwing-com-(9).png" },
]
const AVATARS_PER_PAGE = 6

const GAME_MODES = [
  { value: "teste" },
  { value: "torneio-offline" },
  { value: "1v1" },
  { value: "2v2" },
  { value: "ffa3" },
  { value: "ffa" },
  { value: "quidditch" },
] as const

const MODE_LABELS: Record<AppLocale, Record<(typeof GAME_MODES)[number]["value"], string>> = {
  pt: {
    teste: "TESTE (BOT)",
    "torneio-offline": "TORNEIO-OFFLINE",
    "1v1": "1 VS 1",
    "2v2": "2 VS 2",
    ffa3: "ALL IN ONE (3 FFA)",
    ffa: "ALL IN ONE (4 FFA)",
    quidditch: "🏆 QUADRIBOL 1v1",
  },
  en: {
    teste: "TEST (BOT)",
    "torneio-offline": "TOURNAMENT-OFFLINE",
    "1v1": "1 VS 1",
    "2v2": "2 VS 2",
    ffa3: "ALL IN ONE (3 FFA)",
    ffa: "ALL IN ONE (4 FFA)",
    quidditch: "🏆 QUIDDITCH 1v1",
  },
  es: {
    teste: "PRUEBA (BOT)",
    "torneio-offline": "TORNEO-OFFLINE",
    "1v1": "1 VS 1",
    "2v2": "2 VS 2",
    ffa3: "ALL IN ONE (3 FFA)",
    ffa: "ALL IN ONE (4 FFA)",
    quidditch: "🏆 QUIDDITCH 1v1",
  },
}

const UI_LABELS: Record<AppLocale, Record<string, string>> = {
  pt: {
    translate: "🌍 Translate (EN/ES)",
    downloadApk: "📲 Baixar APK",
    openRooms: "Salas em Aberto",
    duel1v1: "Duelo 1v1",
    battle2v2: "Batalha 2v2",
    ffa4: "Todos contra Todos (4)",
    ffa3: "Todos contra Todos (3)",
    updateRooms: "↻ Atualizar",
    hide: "Ocultar",
    show: "Mostrar",
    join: "Entrar",
    startOffline: "Iniciar Offline",
    createRoom: "Criar Sala",
    joinRoom: "Entrar em Sala",
    gameMode: "Modo de Jogo:",
  },
  en: {
    translate: "🌍 Translate (EN/ES)",
    downloadApk: "📲 Download APK",
    openRooms: "Open Rooms",
    duel1v1: "1v1 Duel",
    battle2v2: "2v2 Battle",
    ffa4: "Free For All (4)",
    ffa3: "Free For All (3)",
    updateRooms: "↻ Refresh",
    hide: "Hide",
    show: "Show",
    join: "Join",
    startOffline: "Start Offline",
    createRoom: "Create Room",
    joinRoom: "Join Room",
    gameMode: "Game Mode:",
  },
  es: {
    translate: "🌍 Traducir (EN/ES)",
    downloadApk: "📲 Descargar APK",
    openRooms: "Salas Abiertas",
    duel1v1: "Duelo 1v1",
    battle2v2: "Batalla 2v2",
    ffa4: "Todos contra Todos (4)",
    ffa3: "Todos contra Todos (3)",
    updateRooms: "↻ Actualizar",
    hide: "Ocultar",
    show: "Mostrar",
    join: "Entrar",
    startOffline: "Iniciar Offline",
    createRoom: "Crear Sala",
    joinRoom: "Entrar a Sala",
    gameMode: "Modo de Juego:",
  },
}

const MAX_SPELL_POINTS = 6
const MAX_UNFORGIVABLE = 1

export default function CommonRoom({ onStartDuel: _onStartDuel, onCreateRoom, onJoinRoom, onRefreshRooms, openRooms = [], onQuidditchRoomsUpdate, onSpectateMatch, onResumeMatch, resumableMatch, currentUser, onAuthChange }: CommonRoomProps) {
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
  const [recentResults, setRecentResults] = useState<Array<{ matchId: string; gameMode: string; winnerNames: string[]; loserNames: string[]; finishedAt: string }>>([])
  const [showRecentPanel, setShowRecentPanel] = useState(false)
  const [showSpectatePanel, setShowSpectatePanel] = useState(false)
  const lobbySocketRef = useRef<Socket | null>(null)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [showOpenRoomsPanel, setShowOpenRoomsPanel] = useState(true)
  const [showFriendsPanel, setShowFriendsPanel] = useState(true)
  const [showRankingPanel, setShowRankingPanel] = useState(true)
  const [shareFeedback, setShareFeedback] = useState("")

  const [name, setName] = useState("")
  const [house, setHouse] = useState("")
  const [wand, setWand] = useState("")
  const [potion, setPotion] = useState("")
  const [avatar, setAvatar] = useState("")
  const [avatarPage, setAvatarPage] = useState(0)
  const [selectedSpells, setSelectedSpells] = useState<string[]>([])
  const [spellSearch, setSpellSearch] = useState("")
  const [spellSort, setSpellSort] = useState<"name" | "power" | "cost">("name")
  const [gameMode, setGameMode] = useState<"teste" | "torneio-offline" | "1v1" | "2v2" | "ffa" | "ffa3" | "quidditch" | "">("")

  // ── Builds Salvas ────────────────────────────────────────────────────────
  interface SavedBuild {
    id: string
    name: string
    createdAt: string
    spells: string[]
    wand: string
    house: string
    potion: string
    avatar: string
  }
  const savedBuildsKey = currentUser?.id ? `duel:savedBuilds:${currentUser.id}` : null
  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>(() => {
    if (typeof window === "undefined") return []
    const key = currentUser?.id ? `duel:savedBuilds:${currentUser.id}` : null
    if (!key) return []
    try { return JSON.parse(window.localStorage.getItem(key) ?? "[]") } catch { return [] }
  })
  const [saveBuildName, setSaveBuildName] = useState("")
  const [showSavePanel, setShowSavePanel] = useState(false)

  const persistBuilds = (builds: SavedBuild[]) => {
    if (!savedBuildsKey) return
    window.localStorage.setItem(savedBuildsKey, JSON.stringify(builds))
    setSavedBuilds(builds)
  }

  const handleSaveBuild = () => {
    const bname = saveBuildName.trim() || `Build ${savedBuilds.length + 1}`
    const newBuild: SavedBuild = {
      id: Date.now().toString(),
      name: bname,
      createdAt: new Date().toISOString(),
      spells: selectedSpells,
      wand,
      house,
      potion,
      avatar,
    }
    persistBuilds([...savedBuilds, newBuild])
    setSaveBuildName("")
    setShowSavePanel(false)
  }

  const handleLoadBuild = (b: SavedBuild) => {
    if (b.house) setHouse(b.house)
    if (b.wand) setWand(b.wand)
    if (b.potion) setPotion(b.potion)
    if (b.avatar) setAvatar(b.avatar)
    if (b.spells?.length) setSelectedSpells(b.spells.filter((s) => SPELL_DATABASE.some((sp) => sp.name === s)))
  }

  const handleDeleteBuild = (id: string) => {
    persistBuilds(savedBuilds.filter((b) => b.id !== id))
  }

  useEffect(() => {
    if (!currentUser?.id) return
    const key = `duel:build:${currentUser.id}`
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as Partial<PlayerBuild>
      if (saved.house) setHouse(saved.house)
      else if (INITIAL_PLAYER_BUILD.house) setHouse(INITIAL_PLAYER_BUILD.house)
      if (saved.wand) setWand(saved.wand)
      else if (INITIAL_PLAYER_BUILD.wand) setWand(INITIAL_PLAYER_BUILD.wand)
      if (saved.potion) setPotion(saved.potion)
      else if (INITIAL_PLAYER_BUILD.potion) setPotion(INITIAL_PLAYER_BUILD.potion)
      if (saved.avatar) setAvatar(saved.avatar)
      else if (INITIAL_PLAYER_BUILD.avatar) setAvatar(INITIAL_PLAYER_BUILD.avatar)
      if (Array.isArray(saved.spells)) setSelectedSpells(saved.spells.filter((s) => SPELL_DATABASE.some((sp) => sp.name === s)))
      if (saved.gameMode && ["teste", "torneio-offline", "1v1", "2v2", "ffa", "ffa3"].includes(saved.gameMode)) {
        setGameMode(saved.gameMode as "teste" | "torneio-offline" | "1v1" | "2v2" | "ffa" | "ffa3")
      }
    } catch {
      // ignora build inválida no storage
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return
    const key = `duel:build:${currentUser.id}`
    const payload: Partial<PlayerBuild> = {
      name: currentUser.username,
      house,
      wand,
      potion,
      spells: selectedSpells,
      avatar,
      gameMode: gameMode as GameMode | undefined,
      userId: currentUser.id,
      username: currentUser.username,
      elo: currentUser.elo,
    }
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(payload))
  }, [currentUser?.id, currentUser?.username, currentUser?.elo, house, wand, potion, selectedSpells, avatar, gameMode])

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

  const filteredSpells = SPELL_DATABASE.filter((spell) => {
    if (!spell.name.toLowerCase().includes(spellSearch.toLowerCase())) return false
    // Spells VIP-only só aparecem para VIPs
    if (spell.isVipOnly && !(currentUser?.isVip ?? false)) return false
    return true
  }).sort((a, b) => {
    if (spellSort === "name") return a.name.localeCompare(b.name, "pt")
    if (spellSort === "power") {
      const pa = a.powerMax ?? a.powerMin ?? a.power ?? 0
      const pb = b.powerMax ?? b.powerMin ?? b.power ?? 0
      return pb - pa
    }
    return (a.cost ?? 0) - (b.cost ?? 0)
  })

  const canSelectSpell = (spell: SpellInfo): boolean => {
    if (selectedSpells.includes(spell.name)) return true
    if (spell.cost > remainingPoints) return false
    if (spell.isUnforgivable && unforgivableCount >= MAX_UNFORGIVABLE) return false
    return true
  }

  // ── VIP & Custom Room ───────────────────────────────────────────────────────
  const [pixModal, setPixModal] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)
  const [vipProof, setVipProof] = useState("")
  const [vipProofSent, setVipProofSent] = useState(false)
  const [showCustomRoom, setShowCustomRoom] = useState(false)
  const [customSettings, setCustomSettings] = useState<CustomRoomSettings>({
    bannedSpells: [], bannedWands: [], bannedPotions: [], turnTimeout: 60, potionLimit: 1,
  })
  const isVip = currentUser?.isVip ?? false

  const PIX_KEY = "guilhermefoligno@gmail.com"
  const [arrecadado, setArrecadado] = useState(0)
  const [metaObjetivo, setMetaObjetivo] = useState(60)
  const [metaCurrent, setMetaCurrent] = useState(0)

  useEffect(() => {
    const supabase = getSupabaseClient()
    
    // Initial fetch
    const fetchServerMeta = async () => {
      try {
        const { data } = await supabase
          .from("server_meta")
          .select("arrecadado, meta_objetivo")
          .eq("id", 1)
          .maybeSingle()
        if (data) {
          setArrecadado(data.arrecadado ?? 0)
          setMetaObjetivo(data.meta_objetivo ?? 60)
        }
      } catch {
        // Keep defaults on error
      }
    }
    fetchServerMeta()

    // Realtime subscription
    const channel = supabase
      .channel("server_meta_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "server_meta",
          filter: "id=eq.1"
        },
        (payload) => {
          const newRecord = payload.new as { arrecadado?: number; meta_objetivo?: number }
          if (newRecord.arrecadado !== undefined) setArrecadado(newRecord.arrecadado)
          if (newRecord.meta_objetivo !== undefined) setMetaObjetivo(newRecord.meta_objetivo)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handlePixCopy = () => {
    navigator.clipboard.writeText(PIX_KEY).then(() => { setPixCopied(true); setTimeout(() => setPixCopied(false), 2000) })
  }
  const handleVipProofSubmit = async () => {
    if (!currentUser || !vipProof.trim()) return
    const ok = await submitVipRequest(currentUser.id, currentUser.email, vipProof)
    if (ok) setVipProofSent(true)
  }
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentUser?.id || !isVip) return
    const url = await uploadVipAvatar(currentUser.id, file)
    if (url) onAuthChange({ ...currentUser, avatarUrl: url })
  }

  const isQuidditchMode = gameMode === "quidditch"
  const isReady =
    !!currentUser &&
    gameMode !== "" &&
    (isQuidditchMode || (
      house !== "" &&
      wand !== "" &&
      potion !== "" &&
      avatar !== "" &&
      totalCost === MAX_SPELL_POINTS
    ))

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

  // Refaz a lista quando o perfil muda (ex.: após duelo applyMatchElo atualiza wins/elo/favorite_spell).
  useEffect(() => {
    void refreshFriends()
  }, [currentUser?.id, currentUser?.wins, currentUser?.losses, currentUser?.favoriteSpell, currentUser?.elo])

  // Conecta ao servidor Socket.io para receber duelos ao vivo e resultados recentes
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim()
    if (!socketUrl) return
    const sock = ioClient(socketUrl, { transports: ["polling", "websocket"], autoConnect: true })
    lobbySocketRef.current = sock
    sock.on("connect", () => { sock.emit("LIST_ACTIVE_MATCHES") })
    sock.on("active_matches_update", (data: { rooms: any[]; recentMatches: any[]; waitingQuidditch?: any[] }) => {
      setDuelsInProgress(
        (data.rooms || [])
          .filter((r) => r.gameStarted)
          .map((r) => ({
            matchId: r.matchId,
            mode: r.gameMode as PlayerBuild["gameMode"],
            p1: r.playerNames?.[0] || "Bruxo",
            p2: r.playerNames?.[1] || "Bruxo",
          }))
      )
      // Resultados do socket completam o que foi carregado do Supabase
      setRecentResults((prev) => {
        const socketResults: Array<{ matchId: string; gameMode: string; winnerNames: string[]; loserNames: string[]; finishedAt: string }> = data.recentMatches || []
        const merged = [...socketResults]
        for (const p of prev) {
          if (!merged.find((r) => r.matchId === p.matchId)) merged.push(p)
        }
        return merged.sort((a, b) => (b.finishedAt > a.finishedAt ? 1 : -1)).slice(0, 10)
      })
      // Propaga salas de Quadribol aguardando oponente para o pai (page-client)
      if (onQuidditchRoomsUpdate) {
        const qWaiting = (data.waitingQuidditch || []).map((q: any) => ({
          matchId: q.matchId as string,
          mode: "quidditch" as PlayerBuild["gameMode"],
          host: q.playerNames?.[0] || "Bruxo",
          playersJoined: 1,
          playersExpected: 2,
        }))
        onQuidditchRoomsUpdate(qWaiting)
      }
    })
    return () => { sock.disconnect(); lobbySocketRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega histórico persistente do Supabase ao montar
  useEffect(() => {
    getRecentMatchHistory(10).then((rows) => {
      if (rows.length === 0) return
      setRecentResults((prev) => {
        const merged = [...rows]
        for (const p of prev) {
          if (!merged.find((r) => r.matchId === p.matchId)) merged.push(p)
        }
        return merged.sort((a, b) => (b.finishedAt > a.finishedAt ? 1 : -1)).slice(0, 10)
      })
    }).catch(() => null)
  }, [])

  useEffect(() => {
    const supabase = getSupabaseClient()
    const lobby = supabase.channel("room_lobby", { config: { presence: { key: currentUser?.id || `anon-${Math.random().toString(36).slice(2, 7)}` } } })
    const syncOnline = () => {
      const state = lobby.presenceState()
      setOnlineWizards(Object.keys(state).length)
      // Extrai IDs dos usuários presentes para o indicador de online nos amigos
      const ids = new Set<string>(
        Object.entries(state).flatMap(([key, presences]) =>
          (presences as any[]).map((p: any) => p.userId || key).filter((id: string) => id && !id.startsWith("anon-"))
        )
      )
      setOnlineUserIds(ids)
    }
    lobby
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await lobby.track({ online_at: new Date().toISOString(), username: currentUser?.username || "Visitante", userId: currentUser?.id || "" })
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
      _onStartDuel({
        name: currentUser.username,
        house,
        wand,
        potion,
        spells: selectedSpells,
        avatar,
        gameMode: gameMode as "teste" | "torneio-offline" | "1v1" | "2v2" | "ffa" | "ffa3" | "quidditch",
        userId: currentUser.id,
        username: currentUser.username,
        elo: currentUser.elo,
      })
    }
  }

  const buildPayload = (): PlayerBuild | null => {
    if (!currentUser || !isReady || !gameMode) return null
    return {
      name: currentUser.username,
      house,
      wand,
      potion,
      spells: selectedSpells,
      avatar,
      gameMode: gameMode as "teste" | "torneio-offline" | "1v1" | "2v2" | "ffa" | "ffa3" | "quidditch",
      userId: currentUser.id,
      username: currentUser.username,
      elo: currentUser.elo,
      isVip,
      customRoomSettings: showCustomRoom ? customSettings : undefined,
    }
  }

  const handleCreateRoomClick = () => {
    const payload = buildPayload()
    if (!payload || !onCreateRoom) return
    onCreateRoom(payload)
  }

  const handleJoinRoomClick = (matchId: string) => {
    if (!currentUser || !onJoinRoom) return
    const room = openRooms.find((r) => r.matchId === matchId)
    if (!room) return
    
    // VIP room validation: check if user has prohibited items
    if (room.isVipRoom && customSettings.bannedSpells.length > 0) {
      const prohibitedItems = customSettings.bannedSpells.filter((item) => 
        selectedSpells.includes(item) || wand === item || potion === item
      )
      if (prohibitedItems.length > 0) {
        setAuthError(`Sua build contém itens proibidos nesta sala VIP (${prohibitedItems.join(", ")}). Troque sua build para entrar.`)
        return
      }
    }
    
    // Check if selected mode matches room mode
    if (gameMode && gameMode !== "" && room.mode !== gameMode) {
      setAuthError(`Modo selecionado (${gameMode}) não corresponde ao modo da sala (${room.mode}). Selecione o modo correto ou resete sua seleção.`)
      // Reset mode selection to match the room
      setGameMode(room.mode)
      return
    }
    
    // Salas de Quadribol não exigem build completo — usa payload mínimo
    if (room?.mode === "quidditch") {
      const qPayload: PlayerBuild = {
        name: currentUser.username,
        house: house || "ravenclaw",
        wand: wand || "unicorn",
        potion: potion || "foco",
        spells: selectedSpells,
        avatar,
        gameMode: "quidditch",
        userId: currentUser.id,
        username: currentUser.username,
        elo: currentUser.elo,
        isVip,
      }
      onJoinRoom(qPayload, matchId)
      return
    }
    const payload = buildPayload()
    if (!payload) return
    onJoinRoom(payload, matchId)
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
  const { locale, cycleLocale } = useLanguage()
  const ui = UI_LABELS[locale]

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed p-2 sm:p-3 lg:p-4" style={{ backgroundImage: "url('https://i.postimg.cc/D0y9DbnS/clube.png')" }}>
      {/* ── Banner BETA ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-900/95 px-4 py-1.5 text-xs font-medium text-amber-100 shadow-md backdrop-blur-sm">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        <span>⚠️ FASE BETA: Bugs podem ocorrer. O equilíbrio de jogo está em constante ajuste.</span>
      </div>

      <HomeLobbyChat
        authorName={currentUser?.username?.trim() || ""}
        layout="topBanner"
        className="relative z-30 -mx-2 mb-1 sm:mx-0"
      />

      <div className="mx-auto max-w-[1400px]">
        {/* Header with Medieval Style */}
        <header className="mb-5 text-center">
          <div className="medieval-frame mx-auto mb-3 inline-block rounded-lg bg-gradient-to-b from-amber-900/80 to-amber-950/90 px-6 py-3">
            <h1 className="text-3xl font-bold tracking-tight text-amber-200" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
              ✦ Hogwarts Showdown ✦
            </h1>
            <p className="mt-1 text-amber-100/90">Monte sua Build e duele! Pvp Multiplayer</p>
          </div>
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cycleLocale}
              className="border-sky-800/80 bg-sky-950/40 text-sky-200 hover:bg-sky-900/50"
              title="Estrutura de idioma (pt / en / es) — conteúdo ainda em PT"
            >
              {ui.translate} <span className="ml-1 text-[10px] opacity-80">→ {locale.toUpperCase()}</span>
            </Button>
            {/* Link de download do APK — gerado pelo GitHub Actions */}
            <a
              href="https://github.com/folignoderivia-dev/hogwartsshowdown/releases/latest/download/app-debug.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700 bg-emerald-950/50 px-3 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/60 hover:text-emerald-200"
            >
              {ui.downloadApk}
            </a>
            <Badge className="border-green-700 bg-green-950/40 px-3 py-1 text-green-300">
              🟢 {onlineWizards} Bruxos Online
            </Badge>
            {currentUser ? (
              <>
                <Badge className={`border-amber-600 bg-stone-900 px-3 py-1 ${isVip ? "text-yellow-300" : "text-amber-200"}`}>
                  {isVip && <Crown className="mr-1 inline h-3.5 w-3.5 text-yellow-400" />}
                  {currentUser.username} {currentUser.offlineWins && currentUser.offlineWins > 0 && <span className="ml-1">🥇 ({currentUser.offlineWins})</span>} · ELO {currentUser.elo}
                  {isVip && <span className="ml-1 text-[10px] text-yellow-400">VIP</span>}
                </Badge>
                {currentUser?.isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-purple-700 bg-purple-950/30 text-purple-200 hover:bg-purple-950/50"
                    onClick={() => window.location.href = "/admin"}
                  >
                    <Shield className="mr-1 h-3.5 w-3.5" />
                    Painel Admin
                  </Button>
                )}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-800/80 bg-red-950/30 text-red-200 hover:bg-red-950/50"
                  title="Limpa tokens PKCE/localStorage e força novo login (se Realtime ficar Conectado: Não no celular)"
                  onClick={async () => {
                    setAuthError("")
                    try {
                      await clearSupabaseSessionAndResetClient()
                      await signOutUser()
                      onAuthChange(null)
                    } catch {
                      setAuthError("Não foi possível limpar a sessão.")
                    }
                  }}
                >
                  Limpar Sessão e Sair
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-stone-600 text-stone-300 hover:bg-stone-700"
                  title="Recarregar a página"
                  onClick={() => window.location.reload()}
                >
                  ↻
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

        {/* ── Card Apoie o Projeto + VIP Pitch ────────────────────────────── */}
        <div className="mx-auto mb-4 w-full max-w-2xl rounded-xl border border-amber-700/40 bg-stone-900/80 px-4 py-3 shadow-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {/* Barra de meta */}
            <div className="mt-3 rounded border border-amber-700/50 bg-stone-800/80 p-2">
              <p className="text-xs font-semibold text-amber-300">☕ Meta do Servidor: R$ {arrecadado} / R$ {metaObjetivo}</p>
              <div className="mt-1 h-2 rounded-full bg-stone-700">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, (arrecadado / metaObjetivo) * 100)}%` }}
                ></div>
              </div>
            </div>
            {/* Pitch VIP + botão */}
            <div className="flex items-center gap-2 sm:shrink-0">
              <p className="hidden text-right text-[11px] leading-tight text-yellow-400/80 sm:block">
                <Crown className="mr-0.5 inline h-3 w-3 text-yellow-400" />
                <strong>SEJA VIP</strong> — salas personalizadas,<br />foto própria e feitiços exclusivos
              </p>
              <Button
                size="sm"
                onClick={() => setPixModal(true)}
                className="shrink-0 border border-yellow-600/60 bg-yellow-900/40 text-yellow-200 hover:bg-yellow-800/60"
              >
                👑 Apoiar
              </Button>
            </div>
          </div>
          {/* Pitch mobile */}
          <p className="mt-1.5 text-center text-[10px] text-yellow-500/70 sm:hidden">
            <Crown className="mr-0.5 inline h-2.5 w-2.5" />
            <strong>SEJA VIP</strong>: salas personalizadas · foto própria · feitiços exclusivos
          </p>
        </div>

        {/* ── Modal PIX ────────────────────────────────────────────────────── */}
        <Dialog open={pixModal} onOpenChange={setPixModal}>
          <DialogContent className="max-h-[92vh] overflow-y-auto border-amber-700/50 bg-stone-900 text-amber-100">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-amber-300">💛 Apoie o Projeto</DialogTitle>
                <button
                  type="button"
                  onClick={() => setPixModal(false)}
                  className="rounded-full p-1 text-amber-500 hover:bg-stone-700 hover:text-amber-200 transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-amber-200/80">
                Este jogo é um projeto de fã, feito com amor e sem fins lucrativos.<br/>
                Qualquer contribuição ajuda a manter o servidor no ar!
              </p>
              {/* QR Code Nubank */}
              <div className="flex flex-col items-center gap-2 rounded-lg border border-purple-700/50 bg-stone-800 p-4">
                <p className="text-xs font-semibold text-purple-300">Pagar via Nubank (QR Code)</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent("https://nubank.com.br/cobrar/nxdtl/69ebd870-ceda-4047-bb7d-98aff93278a5")}&size=180x180&margin=8&color=6d28d9&bgcolor=ffffff`}
                  alt="QR Code Nubank"
                  width={180}
                  height={180}
                  className="rounded-lg border-4 border-purple-700"
                />
                <a
                  href="https://nubank.com.br/cobrar/nxdtl/69ebd870-ceda-4047-bb7d-98aff93278a5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 underline"
                >
                  Abrir link de cobrança Nubank
                </a>
                <p className="text-center text-[11px] text-amber-400">
                  Após o pagamento, anexe o código/comprovante abaixo para ativação manual pelo Admin.
                </p>
              </div>
              <div className="rounded-lg border border-amber-700/50 bg-stone-800 p-4 text-center">
                <p className="mb-1 text-xs text-amber-400">Ou pague com a Chave PIX (e-mail)</p>
                <p className="text-lg font-bold text-amber-200">{PIX_KEY}</p>
                <Button size="sm" variant="outline" onClick={handlePixCopy} className="mt-2 border-amber-700 text-amber-300">
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {pixCopied ? "Copiado! ✓" : "Copiar Chave"}
                </Button>
              </div>
              <p className="text-center text-xs text-amber-500">
                Valor sugerido: <strong>R$ 10,00</strong> = 30 dias de VIP 👑
              </p>
              <div className="border-t border-amber-800/40 pt-3">
                <p className="mb-2 text-xs text-amber-400">Já pagou? Envie o comprovante para ativação:</p>
                <textarea
                  className="w-full rounded border border-amber-700/50 bg-stone-800 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-600"
                  rows={3}
                  placeholder="Cole aqui seu ID de transação ou comprovante..."
                  value={vipProof}
                  onChange={(e) => setVipProof(e.target.value)}
                />
                {vipProofSent
                  ? <p className="mt-2 text-center text-xs text-green-400">✓ Enviado! Ativação em até 24h.</p>
                  : <Button className="mt-2 w-full bg-amber-700 text-white hover:bg-amber-600" onClick={handleVipProofSubmit} disabled={!vipProof.trim() || !currentUser}>
                      Já Paguei — Enviar Comprovante
                    </Button>
                }
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                className="w-full border-stone-700 text-stone-400 hover:bg-stone-800 hover:text-stone-200"
                onClick={() => setPixModal(false)}
              >
                <X className="mr-2 h-4 w-4" />
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2.4fr)] lg:items-start lg:gap-5">

        <Card className={`order-7 min-w-0 border-0 lg:order-none lg:col-start-1 lg:row-start-2 ${showSpectatePanel ? "w-full medieval-frame bg-gradient-to-b from-stone-800 to-stone-900" : "mx-auto w-9 bg-transparent shadow-none"}`}>
          <CardHeader className={showSpectatePanel ? "border-b border-amber-900/50 py-2" : "p-0"}>
            <CardTitle className={`flex items-center text-sm text-amber-200 ${showSpectatePanel ? "justify-between" : "justify-center"}`}>
              {showSpectatePanel ? <span>Duelos em Andamento</span> : <span className="sr-only">Duelos em Andamento</span>}
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 border-amber-700 p-0 text-base font-bold leading-none text-amber-300"
                onClick={() => setShowSpectatePanel((v) => !v)}
                aria-label={showSpectatePanel ? "Recolher duelos em andamento" : "Expandir duelos em andamento"}
              >
                {showSpectatePanel ? "-" : "+"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showSpectatePanel && (
          <CardContent className="max-h-[36vh] min-h-[220px] overflow-y-auto pt-2 lg:max-h-[34vh]">
              {duelsInProgress.length === 0 && <p className="text-xs text-amber-200/95">Nenhum duelo em andamento no momento.</p>}
              <div className="space-y-2">
                {duelsInProgress.map((d) => (
                  <div key={d.matchId} className="flex flex-col items-start justify-between gap-2 rounded border border-amber-900/60 bg-stone-900/60 px-2 py-1.5 text-xs sm:flex-row sm:items-center">
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

        {/* Resultados Recentes */}
        <Card className={`order-8 min-w-0 border-0 lg:order-none lg:col-start-1 ${showRecentPanel ? "w-full medieval-frame bg-gradient-to-b from-stone-800 to-stone-900" : "mx-auto w-9 bg-transparent shadow-none"}`}>
          <CardHeader className={showRecentPanel ? "border-b border-amber-900/50 py-2" : "p-0"}>
            <CardTitle className={`flex items-center text-sm text-amber-200 ${showRecentPanel ? "justify-between" : "justify-center"}`}>
              {showRecentPanel ? <span>🏆 Resultados Recentes</span> : <span className="sr-only">Resultados Recentes</span>}
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 border-amber-700 p-0 text-base font-bold leading-none text-amber-300"
                onClick={() => setShowRecentPanel((v) => !v)}
                aria-label={showRecentPanel ? "Recolher resultados recentes" : "Expandir resultados recentes"}
              >
                {showRecentPanel ? "-" : "🏆"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showRecentPanel && (
            <CardContent className="pt-2">
              {recentResults.length === 0 && <p className="text-xs text-amber-200/95">Nenhum duelo finalizado ainda.</p>}
              <ol className="space-y-2">
                {recentResults.slice(0, 5).map((r, i) => (
                  <li key={r.matchId + r.finishedAt} className="rounded border border-amber-900/60 bg-stone-900/60 px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-300">#{i + 1} · {r.gameMode === "1v1" ? "Duelo 1v1" : r.gameMode === "2v2" ? "Batalha 2v2" : r.gameMode === "ffa" ? "Todos contra Todos (4)" : r.gameMode === "ffa3" ? "Todos contra Todos (3)" : r.gameMode.toUpperCase()}</span>
                      <span className="text-amber-200/60">{new Date(r.finishedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="mt-0.5 text-green-400">🏆 {r.winnerNames.join(" & ") || "?"} venceu</p>
                    {r.loserNames.length > 0 && <p className="text-red-400/80">💀 {r.loserNames.join(" & ")} perdeu</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          )}
        </Card>
        <Card className="order-5 w-full min-w-0 medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 lg:order-none lg:col-start-2 lg:row-start-5">
          <CardHeader className="border-b border-amber-900/50 py-2">
            <CardTitle className="flex items-center justify-between text-sm text-amber-200">
              <span>{ui.openRooms}</span>
              <div className="flex gap-1">
                {onRefreshRooms && (
                  <Button size="sm" variant="outline" className="h-7 border-amber-700 text-amber-300" onClick={onRefreshRooms} title="Atualizar lista de salas">
                    {ui.updateRooms}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 border-amber-700 text-amber-300" onClick={() => setShowOpenRoomsPanel((v) => !v)}>
                  {showOpenRoomsPanel ? ui.hide : ui.show}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          {showOpenRoomsPanel && (
          <CardContent className="max-h-60 overflow-y-auto pt-2">
              {openRooms.length === 0 ? (
                <p className="text-xs text-amber-200/95">Nenhuma sala esperando jogadores.</p>
              ) : (
                <div className="space-y-2">
                  {openRooms.map((r) => {
                    const modeLabel = r.mode === "1v1" ? ui.duel1v1 : r.mode === "2v2" ? ui.battle2v2 : r.mode === "ffa" ? ui.ffa4 : r.mode === "ffa3" ? ui.ffa3 : r.mode === "quidditch" ? MODE_LABELS[locale].quidditch : r.mode.toUpperCase()
                    return (
                    <div key={r.matchId} className="flex flex-col gap-2 rounded border border-amber-900/60 bg-stone-900/60 px-2 py-1.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-amber-100">
                        {modeLabel} · Host: {r.host} · {r.playersJoined}/{r.playersExpected}
                        {r.isVipRoom && <span className="ml-2 text-yellow-400 font-bold">[SALA VIP]</span>}
                      </span>
                      <Button
                        size="sm"
                        className="h-7 border border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50"
                        onClick={() => handleJoinRoomClick(r.matchId)}
                        disabled={!currentUser}
                      >
                        {ui.join}
                      </Button>
                    </div>
                    )
                  })}
                </div>
              )}
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
                <Label className="text-amber-300">E-mail ou Usuário</Label>
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
                {authMode === "login" && (
                  <button
                    type="button"
                    className="text-center text-xs text-amber-400 underline"
                    onClick={async () => {
                      try {
                        const email = authEmail.trim().toLowerCase()
                        if (!email) {
                          setAuthError("Informe seu e-mail para recuperar a senha.")
                          return
                        }
                        const supabase = getSupabaseClient()
                        const redirect = "https://hogwartsshowdown-lyart.vercel.app/"
                        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
                        if (error) {
                          setAuthError(error.message)
                          return
                        }
                        setAuthError("Enviamos um link de recuperação para seu e-mail.")
                      } catch {
                        setAuthError("Não foi possível enviar recuperação de senha agora.")
                      }
                    }}
                  >
                    Esqueci minha senha
                  </button>
                )}
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

        <Card className={`order-1 min-w-0 border-0 lg:order-none lg:col-start-2 lg:row-start-1 ${showRankingPanel ? "w-full medieval-frame bg-gradient-to-b from-stone-800 to-stone-900" : "mx-auto w-9 bg-transparent shadow-none"}`}>
          <CardHeader className={showRankingPanel ? "border-b border-amber-900/50 py-2" : "p-0"}>
            <CardTitle className={`flex items-center text-sm text-amber-200 ${showRankingPanel ? "justify-between" : "justify-center"}`}>
              {showRankingPanel ? (
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Ranking global (Top 50)
                </span>
              ) : (
                <span className="sr-only">Ranking global</span>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 border-amber-700 p-0 text-base font-bold leading-none text-amber-300"
                onClick={() => setShowRankingPanel((v) => !v)}
                aria-label={showRankingPanel ? "Recolher ranking global" : "Expandir ranking global"}
              >
                {showRankingPanel ? "-" : "+"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showRankingPanel && <CardContent className="max-h-72 overflow-y-auto pt-2">
            <ol className="space-y-1 text-xs">
              {ranking.map((u, i) => (
                <li
                  key={u.id}
                  className={`flex min-w-[170px] items-center justify-between rounded px-2 py-1 ${currentUser?.id === u.id ? "bg-amber-900/40" : "bg-stone-800/50"}`}
                >
                  <span className="text-amber-200">
                    {i + 1}. {u.username}
                  </span>
                  <span className="font-mono text-amber-400">{u.elo}</span>
                </li>
              ))}
            </ol>
          </CardContent>}
        </Card>
        {currentUser && resumableMatch && onResumeMatch && (
          <Card className="order-3 w-full min-w-0 medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 lg:order-none lg:col-start-2 lg:row-start-3">
            <CardContent className="flex items-center justify-between gap-3 pt-4">
              <p className="text-xs text-amber-100">
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

        <Card className={`order-6 min-w-0 border-0 lg:order-none lg:col-start-1 lg:row-start-1 ${showFriendsPanel ? "w-full medieval-frame bg-gradient-to-b from-stone-800 to-stone-900" : "mx-auto w-9 bg-transparent shadow-none"}`}>
          <CardHeader className={showFriendsPanel ? "border-b border-amber-900/50 py-2" : "p-0"}>
            <CardTitle className={`flex items-center text-sm text-amber-200 ${showFriendsPanel ? "justify-between" : "justify-center"}`}>
              {showFriendsPanel ? <span>Modo Amigos</span> : <span className="sr-only">Modo Amigos</span>}
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 border-amber-700 p-0 text-base font-bold leading-none text-amber-300"
                onClick={() => setShowFriendsPanel((v) => !v)}
                aria-label={showFriendsPanel ? "Recolher modo amigos" : "Expandir modo amigos"}
              >
                {showFriendsPanel ? "-" : "+"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showFriendsPanel && <CardContent className="max-h-[42vh] min-h-[260px] overflow-y-auto pt-3 lg:max-h-[36vh]">
            {!currentUser ? (
              <p className="text-xs text-amber-200/95">Entre na sua conta para adicionar amigos.</p>
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
                  <p className="text-xs text-amber-200/95">Você ainda não adicionou amigos.</p>
                ) : (
                  <div className="space-y-2">
                    {friends.map((friend) => (
                      <div key={friend.id} className="rounded border border-amber-900/60 bg-stone-900/60 px-3 py-2 text-xs text-amber-100">
                        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${onlineUserIds.has(friend.id) ? "bg-green-400 shadow-[0_0_4px_#4ade80]" : "bg-stone-500"}`}
                              title={onlineUserIds.has(friend.id) ? "Online" : "Offline"}
                            />
                            <p className="font-semibold text-amber-200">{friend.username}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
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
                        <p className="text-amber-200/90">Sem mensagens ainda.</p>
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
          </CardContent>}
        </Card>

        <div className="order-2 grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2 lg:order-none lg:col-start-2 lg:row-start-2 lg:grid-cols-3">
          {/* Avatar & Name */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 lg:col-span-1">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <User className="h-5 w-5 text-amber-400" />
                Identidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
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
                {/* Galeria paginada — 6 por página */}
                <div className="grid grid-cols-3 gap-2">
                  {AVATARS.slice(avatarPage * AVATARS_PER_PAGE, avatarPage * AVATARS_PER_PAGE + AVATARS_PER_PAGE).map((av) => (
                    <button
                      key={av.value}
                      type="button"
                      onClick={() => setAvatar(av.value)}
                      className={`overflow-hidden rounded-lg border-2 transition-all ${
                        avatar === av.value
                          ? "border-amber-500 ring-2 ring-amber-300/40 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                          : "border-stone-700 hover:border-amber-700"
                      }`}
                    >
                      <img
                        src={av.image}
                        alt={av.label}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget
                          target.onerror = null
                          target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(av.label)}&background=2d1a0f&color=fbbf24&size=256`
                        }}
                        className="h-24 w-full object-contain bg-stone-950/60"
                      />
                      <div className="bg-stone-900/90 px-1 py-0.5 text-center text-[10px] text-amber-200">{av.label}</div>
                    </button>
                  ))}
                </div>
                {/* Controles de paginação */}
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={avatarPage === 0}
                    onClick={() => setAvatarPage((p) => Math.max(0, p - 1))}
                    className="rounded border border-amber-800 bg-stone-800 px-3 py-1 text-sm text-amber-300 hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-amber-400">
                    {avatarPage * AVATARS_PER_PAGE + 1}–{Math.min((avatarPage + 1) * AVATARS_PER_PAGE, AVATARS.length)} de {AVATARS.length}
                  </span>
                  <button
                    type="button"
                    disabled={(avatarPage + 1) * AVATARS_PER_PAGE >= AVATARS.length}
                    onClick={() => setAvatarPage((p) => p + 1)}
                    className="rounded border border-amber-800 bg-stone-800 px-3 py-1 text-sm text-amber-300 hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Próximo →
                  </button>
                </div>
                {selectedAvatar && (
                  <p className="mt-2 text-xs text-amber-300">Selecionado: {selectedAvatar.label}</p>
                )}
                {/* Upload VIP dentro do container Identidade */}
                {isVip ? (
                  <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-yellow-700/50 bg-yellow-900/20 py-2 text-xs text-yellow-300 hover:bg-yellow-900/40 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    👑 Trocar Avatar (foto personalizada)
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPixModal(true)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800/50 py-1.5 text-[10px] text-stone-500 hover:border-yellow-800/60 hover:text-yellow-600/70 transition-colors"
                  >
                    <Crown className="h-3 w-3" />
                    VIP: foto personalizada
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* House Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 lg:col-span-1">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Casa de Hogwarts
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
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
              <div className="mt-3 min-h-[2.75rem] rounded border border-amber-800/50 bg-amber-950/30 p-2">
                <p className="text-xs text-amber-300">
                  {house
                    ? <><strong>Passiva:</strong> {HOUSES.find(h => h.value === house)?.modifiers}</>
                    : <span className="text-amber-600 italic">Selecione uma casa para ver a passiva</span>
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Wand Core Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 lg:col-span-1">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <Wand2 className="h-5 w-5 text-amber-400" />
                Nucleo da Varinha
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
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
              {/* Painel com altura mínima fixa para evitar layout shift ao trocar varinha */}
              <div className="mt-3 min-h-[2.75rem] rounded border border-amber-800/50 bg-amber-950/30 p-2">
                <p className="text-xs text-amber-300">
                  {selectedWandCore
                    ? <><strong>Passiva:</strong> {selectedWandCore.desc}</>
                    : <span className="text-amber-600 italic">Selecione um núcleo para ver a passiva</span>
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Potion Selection */}
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 md:col-span-2 lg:col-span-1">
            <CardHeader className="border-b border-amber-900/50">
              <CardTitle className="flex items-center gap-2 text-amber-200">
                <FlaskConical className="h-5 w-5 text-amber-400" />
                Pocao
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <Select value={potion} onValueChange={setPotion}>
                <SelectTrigger className="w-full border-amber-800 bg-stone-800 text-amber-100">
                  <SelectValue placeholder="Selecione sua pocao..." />
                </SelectTrigger>
                <SelectContent className="medieval-frame w-[var(--radix-select-trigger-width)] max-w-[92vw] border-0 bg-stone-800">
                  {POTIONS.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      className="text-amber-100 focus:bg-amber-900/50 focus:text-amber-200"
                    >
                      <div className="flex flex-col whitespace-normal break-words">
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
          <Card className="medieval-frame border-0 bg-gradient-to-b from-stone-800 to-stone-900 md:col-span-2 lg:col-span-3">
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
            <CardContent className="pt-3">
              <div className="mb-2 rounded border border-red-800/50 bg-red-950/30 p-2.5">
                <p className="text-sm text-red-300">
                  <strong>Sistema de Pontos:</strong> Feiticos comuns = 1 ponto | Maldicoes Imperdoaveis = 3 pontos
                </p>
                <p className="mt-1 text-xs text-amber-400/70">
                  Maximo de 1 Maldicao Imperdoavel por build. Use exatamente 6 pontos. Regra: 100 Power = 1 Barra HP.
                </p>
              </div>
              
              {/* ── Builds Salvas ────────────────────────────────────────────── */}
              {currentUser && savedBuilds.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 flex items-center gap-1 text-xs text-amber-400">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Builds Salvas — clique para carregar
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {savedBuilds.map((b) => (
                      <div key={b.id} className="flex items-center gap-0.5 rounded-full border border-amber-700/50 bg-stone-800 pl-2.5 pr-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => handleLoadBuild(b)}
                          className="text-xs text-amber-300 hover:text-amber-100 transition-colors"
                          title={`Feitiços: ${b.spells.join(", ")}`}
                        >
                          {b.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBuild(b.id)}
                          className="ml-1 rounded-full p-0.5 text-stone-500 hover:bg-red-900/40 hover:text-red-400 transition-colors"
                          title="Excluir build"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search + Sort */}
              <div className="mb-3 flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                  <Input
                    placeholder="Pesquisar feitico..."
                    value={spellSearch}
                    onChange={(e) => setSpellSearch(e.target.value)}
                    className="border-amber-800 bg-stone-800 pl-10 text-amber-100 placeholder:text-stone-500"
                  />
                </div>
                <div className="flex gap-1">
                  <span className="self-center text-xs text-amber-400/70 mr-1">Ordenar:</span>
                  {(["name", "power", "cost"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpellSort(s)}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        spellSort === s
                          ? "bg-amber-700 text-amber-100"
                          : "bg-stone-700 text-stone-300 hover:bg-stone-600"
                      }`}
                    >
                      {s === "name" ? "A–Z" : s === "power" ? "⚔️ Poder" : "💰 Custo"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Spell List */}
              <div className="parchment-bg h-[42vh] min-h-[260px] max-h-[360px] overflow-y-auto rounded-lg border-4 border-amber-900 p-3 lg:h-[44vh] lg:max-h-[390px]">
                <div className="grid gap-2">
                  {filteredSpells.map((spell) => {
                    const isSelected = selectedSpells.includes(spell.name)
                    const canSelect = canSelectSpell(spell)
                    const isBanned = showCustomRoom && customSettings.bannedSpells.includes(spell.name)
                    const isDisabled = isBanned || (!isSelected && !canSelect)
                    
                    return (
                      <button
                        key={spell.name}
                        onClick={() => !isBanned && toggleSpell(spell.name)}
                        disabled={isDisabled}
                        className={`flex items-center justify-between rounded border-2 p-3 text-left transition-all ${
                          isBanned
                            ? "cursor-not-allowed border-stone-600 bg-stone-800/60 opacity-40 grayscale"
                            : isSelected
                              ? spell.isUnforgivable
                                ? "border-red-700 bg-red-900/40"
                                : "border-amber-600 bg-amber-900/40"
                              : isDisabled
                                ? "cursor-not-allowed border-stone-500 bg-stone-700/30 opacity-50"
                                : spell.isVipOnly
                                  ? "border-yellow-700/60 bg-yellow-900/20 hover:border-yellow-600"
                                  : spell.isUnforgivable
                                    ? "border-red-900/50 bg-stone-700/50 hover:border-red-700/70"
                                    : "border-stone-500 bg-stone-700/50 hover:border-amber-700"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isSelected ? (spell.isUnforgivable ? "text-red-300" : "text-amber-300") : isBanned ? "text-stone-500 line-through" : "text-stone-900"}`}>
                              {spell.name}
                            </span>
                            <Badge
                              className={`text-xs ${spell.isUnforgivable ? "border-red-600 bg-red-900/50 text-red-300" : "border-stone-500 bg-stone-600 text-stone-200"}`}
                            >
                              {spell.cost} pt{spell.cost > 1 ? "s" : ""}
                            </Badge>
                            {spell.isVipOnly && (
                              <Badge className="border-yellow-600 bg-yellow-900/50 text-xs text-yellow-300">
                                👑 VIP
                              </Badge>
                            )}
                            {spell.isUnforgivable && (
                              <Badge className="border-red-600 bg-red-900/50 text-xs text-red-300">
                                Imperdoavel
                              </Badge>
                            )}
                            {isBanned && (
                              <Badge className="border-stone-600 bg-stone-700 text-xs text-stone-400">
                                🚫 Banida
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-100/90">
                            {(spell.power ?? 0) > 0 || (spell.powerMin != null && spell.powerMax != null) ? (
                              <span>Poder: {formatSpellPower(spell)}</span>
                            ) : null}
                            <span>Acerto: {spell.accuracy}%</span>
                            <span>MANA: {spell.pp}</span>
                            {spell.priority != null && spell.priority !== 0 && (
                              <span className="text-purple-300">Prio: {spell.priority > 0 ? "+" : ""}{spell.priority}</span>
                            )}
                          </div>
                          {spell.effect && (
                            <p className="mt-1 text-xs text-amber-300">{spell.effect}</p>
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
                  <p className="py-4 text-center text-sm text-amber-200/90">
                    Nenhum feitico encontrado
                  </p>
                )}
              </div>

              {/* Selected Spells Preview */}
              {selectedSpells.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-amber-300/95">Feiticos selecionados ({selectedSpells.length}):</p>
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

              {/* Indicador de pontos no fim do grimório */}
              <div className={`mt-3 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${
                totalCost === MAX_SPELL_POINTS
                  ? "border-green-700/60 bg-green-900/20 text-green-300"
                  : totalCost > MAX_SPELL_POINTS
                    ? "border-red-700/60 bg-red-900/20 text-red-300"
                    : "border-amber-700/40 bg-stone-800/60 text-amber-400"
              }`}>
                {totalCost === MAX_SPELL_POINTS
                  ? `✓ Grimório completo! (${totalCost}/${MAX_SPELL_POINTS} pontos)`
                  : totalCost > MAX_SPELL_POINTS
                    ? `⚠ Excedeu! ${totalCost}/${MAX_SPELL_POINTS} pontos (remova ${totalCost - MAX_SPELL_POINTS}pt)`
                    : `Use exatamente ${MAX_SPELL_POINTS} pontos de feitiço (atual: ${totalCost}/${MAX_SPELL_POINTS})`
                }
              </div>

              {/* ── Salvar Build ─────────────────────────────────────────────── */}
              {currentUser && totalCost === MAX_SPELL_POINTS && wand && house && potion && (
                <div className="mt-3">
                  {!showSavePanel ? (
                    <button
                      type="button"
                      onClick={() => setShowSavePanel(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-amber-700/50 bg-stone-800/40 py-2 text-xs text-amber-400 hover:border-amber-500 hover:bg-amber-900/20 hover:text-amber-200 transition-colors"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar esta Build
                    </button>
                  ) : (
                    <div className="rounded-lg border border-amber-700/40 bg-stone-800/60 p-3">
                      <p className="mb-2 text-xs font-semibold text-amber-300">
                        <Save className="mr-1 inline h-3.5 w-3.5" />
                        Nome da Build
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={saveBuildName}
                          onChange={(e) => setSaveBuildName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveBuild() }}
                          placeholder={`Build ${savedBuilds.length + 1}`}
                          maxLength={24}
                          className="flex-1 rounded border border-amber-800/50 bg-stone-900 px-2 py-1 text-xs text-amber-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-600"
                        />
                        <button
                          type="button"
                          onClick={handleSaveBuild}
                          className="rounded border border-green-700/60 bg-green-900/30 px-3 py-1 text-xs text-green-300 hover:bg-green-900/60 transition-colors"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSavePanel(false)}
                          className="rounded border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-400 hover:text-stone-200 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Game Mode & Start Duel Button */}
        <div className="order-4 mt-2 flex flex-col items-center gap-3 lg:order-none lg:col-start-2 lg:row-start-4">
          {/* Game Mode Selector */}
          <div className="medieval-frame flex w-full max-w-full flex-col items-stretch gap-2 rounded-lg bg-stone-800/90 px-3 py-2.5 sm:px-4 lg:px-5">
            <Swords className="h-5 w-5 text-amber-400" />
            <span className="text-center text-sm text-amber-200">{ui.gameMode}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GAME_MODES.map((mode) => (
                <Button
                  key={mode.value}
                  variant="outline"
                  size="sm"
                  onClick={() => setGameMode(mode.value as GameMode)}
                  className={`h-9 w-full justify-center px-2 text-xs sm:text-sm transition-all ${
                    gameMode === mode.value
                      ? "border-amber-500 bg-amber-700/50 text-amber-200"
                      : "border-amber-800 bg-stone-800 text-amber-300 hover:border-amber-600 hover:bg-amber-900/30"
                  }`}
                >
                  {MODE_LABELS[locale][mode.value]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              disabled={!isReady}
              onClick={gameMode === "teste" || gameMode === "torneio-offline" ? handleStartDuel : handleCreateRoomClick}
              className={`medieval-frame w-full border-0 px-4 py-3 text-sm sm:px-6 sm:py-4 sm:text-base font-bold transition-all ${
                isReady
                  ? "bg-gradient-to-b from-red-800 to-red-900 text-amber-100 shadow-lg shadow-red-900/50 hover:from-red-700 hover:to-red-800"
                  : "cursor-not-allowed bg-stone-700 text-stone-500"
              }`}
            >
              <Wand2 className="mr-2 h-5 w-5" />
              {gameMode === "teste" || gameMode === "torneio-offline" ? ui.startOffline : ui.createRoom}
            </Button>
            {gameMode !== "teste" && gameMode !== "torneio-offline" && (
              <Button
                size="lg"
                disabled={!isReady || !openRooms.some((r) => !gameMode || r.mode === gameMode)}
                onClick={() => {
                  const first = openRooms.find((r) => !gameMode || r.mode === gameMode) || openRooms[0]
                  if (first) handleJoinRoomClick(first.matchId)
                }}
                className="medieval-frame w-full border border-amber-700 bg-amber-900/50 px-4 py-3 text-sm sm:px-6 sm:py-4 sm:text-base font-bold text-amber-100 hover:bg-amber-800/60"
              >
                {ui.joinRoom}
              </Button>
            )}
          </div>
        </div>

        {/* ── Botão Sala VIP/Torneio (VIP) ─────────────────────────────────── */}
        {isVip && gameMode !== "teste" && gameMode !== "torneio-offline" && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              size="sm"
              className="border-yellow-700/50 bg-stone-800/60 text-yellow-400 hover:bg-yellow-900/20 text-xs"
              onClick={() => {
                const payload = buildPayload()
                if (!payload || !onCreateRoom) return
                // Mark as VIP room with custom settings
                onCreateRoom({ 
                  ...payload, 
                  isVipRoom: true,
                  customRoomSettings: customSettings 
                })
              }}
              disabled={!isReady}
            >
              <Crown className="mr-1.5 h-3.5 w-3.5" />
              Criar Sala VIP
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border text-xs ${showCustomRoom ? "border-yellow-500 bg-yellow-900/30 text-yellow-300" : "border-yellow-700/50 bg-stone-800/60 text-yellow-400 hover:bg-yellow-900/20"}`}
              onClick={() => setShowCustomRoom((v) => !v)}
            >
              <Crown className="mr-1.5 h-3.5 w-3.5" />
              {showCustomRoom ? "Ocultar Regras" : "Sala Personalizada"}
            </Button>
          </div>
        )}

        {/* ── Regras da Sala Personalizada (VIP) ─────────────────────────────── */}
        {isVip && showCustomRoom && gameMode !== "teste" && gameMode !== "torneio-offline" && (
              <div className="mt-2 rounded-lg border border-yellow-700/40 bg-stone-900/90 p-4 text-sm">
                <p className="mb-3 font-semibold text-yellow-300">👑 Regras da Sala Personalizada</p>

                {/* Timeout de turno */}
                <div className="mb-3">
                  <p className="mb-1 text-xs text-amber-400">⏱ Timeout de Turno</p>
                  <div className="flex gap-2">
                    {([30, 60, 120, 0] as const).map((t) => (
                      <Button key={t} size="sm" variant="outline"
                        onClick={() => setCustomSettings((s) => ({ ...s, turnTimeout: t }))}
                        className={`text-xs ${customSettings.turnTimeout === t ? "border-yellow-500 bg-yellow-900/40 text-yellow-200" : "border-amber-800 text-amber-400"}`}
                      >
                        {t === 0 ? "∞" : `${t}s`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Limite de poções */}
                <div className="mb-3">
                  <p className="mb-1 text-xs text-amber-400">🧪 Limite de Poções por Duelo</p>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 5].map((n) => (
                      <Button key={n} size="sm" variant="outline"
                        onClick={() => setCustomSettings((s) => ({ ...s, potionLimit: n }))}
                        className={`text-xs ${customSettings.potionLimit === n ? "border-yellow-500 bg-yellow-900/40 text-yellow-200" : "border-amber-800 text-amber-400"}`}
                      >
                        {n === 0 ? "Nenhuma" : n}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Feitiços banidos */}
                <div className="mb-3">
                  <p className="mb-1 text-xs text-amber-400">🚫 Banir Feitiços <span className="text-stone-500">(clique para alternar)</span></p>
                  <div className="mb-1 text-[10px] text-stone-500">
                    Maldições: <span className="text-red-400">vermelho</span> · Controle: <span className="text-purple-400">roxo</span> · Dano alto: <span className="text-orange-400">laranja</span>
                  </div>
                  <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
                    {([
                      // Maldições Imperdoáveis
                      { name: "Avada Kedavra", cat: "red" },
                      { name: "Crucius",        cat: "red" },
                      { name: "Imperio",         cat: "red" },
                      // Controle / utilidade abusiva
                      { name: "Estupefaca",      cat: "purple" },
                      { name: "Eletricus",       cat: "purple" },
                      { name: "Petrificus Totales", cat: "purple" },
                      { name: "Obliviate",       cat: "purple" },
                      { name: "Expulso",         cat: "purple" },
                      { name: "Fumus",           cat: "purple" },
                      // Dano / mecânicas especiais
                      { name: "Flagrate",        cat: "orange" },
                      { name: "Locomotor Mortis",cat: "orange" },
                      { name: "Scarlatum",       cat: "orange" },
                      { name: "Desumo Tempestas",cat: "orange" },
                      { name: "Sectumsempra",    cat: "orange" },
                      { name: "Salvio Hexia",    cat: "orange" },
                      { name: "Flagellum",       cat: "orange" },
                      // VIP
                      { name: "Legilimens",      cat: "yellow" },
                      { name: "Fogo Maldito",    cat: "yellow" },
                      { name: "Bombarda Maxima", cat: "yellow" },
                      { name: "Expecto Patronum",cat: "yellow" },
                    ] as { name: string; cat: string }[]).map(({ name: sp, cat }) => {
                      const banned = customSettings.bannedSpells.includes(sp)
                      const colorIdle =
                        cat === "red"    ? "bg-red-950/60 text-red-400 hover:bg-red-900/60" :
                        cat === "purple" ? "bg-purple-950/60 text-purple-400 hover:bg-purple-900/60" :
                        cat === "orange" ? "bg-orange-950/60 text-orange-400 hover:bg-orange-900/60" :
                                           "bg-yellow-950/60 text-yellow-400 hover:bg-yellow-900/60"
                      return (
                        <button key={sp} type="button"
                          onClick={() => setCustomSettings((s) => ({
                            ...s,
                            bannedSpells: banned
                              ? s.bannedSpells.filter((x) => x !== sp)
                              : [...s.bannedSpells, sp],
                          }))}
                          className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                            banned
                              ? "border-red-600 bg-red-800 text-red-100"
                              : `border-transparent ${colorIdle}`
                          }`}
                        >
                          {banned ? "✖ " : ""}{sp}
                        </button>
                      )
                    })}
                  </div>
                  {customSettings.bannedSpells.length > 0 && (
                    <p className="mt-1 text-[10px] text-red-400">
                      Banidos ({customSettings.bannedSpells.length}): {customSettings.bannedSpells.join(", ")}
                    </p>
                  )}
                </div>

                <p className="text-[10px] text-amber-600">As regras serão compartilhadas com o oponente ao entrar na sala.</p>
              </div>
            )}
        {!isVip && isReady && gameMode && gameMode !== "teste" && gameMode !== "torneio-offline" && (
          <p className="mt-1 text-center text-[10px] text-amber-600/70">
            👑 <button type="button" className="underline hover:text-amber-400" onClick={() => setPixModal(true)}>Torne-se VIP</button> para criar salas personalizadas
          </p>
        )}

        {isQuidditchMode && isReady && (
          <p className="mt-2 text-center text-xs text-amber-400/80">
            Quadribol não precisa de build. Clique em Criar Sala e compartilhe o código com seu adversário.
          </p>
        )}
        {!isReady && !currentUser && (
          <p className="mt-4 text-center text-sm text-amber-200/95">
            Entre ou registre-se para poder ir à Arena.
          </p>
        )}
        </div>
      </div>

      {/* ── Rodapé ──────────────────────────────────────────────────────────── */}
      <footer className="mt-8 border-t border-amber-900/30 pb-4 pt-3 text-center text-[10px] text-amber-700/60">
        Projeto feito por fã, sem fins lucrativos. Inspirado no universo de Harry Potter de J.K. Rowling.
        Hogwarts Showdown não tem vínculo com Warner Bros. ou Wizarding World.
      </footer>
    </div>
  )
}
