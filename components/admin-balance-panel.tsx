"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient } from "@/lib/supabase"
import { X, BarChart3, TrendingUp, Shield, Wand2, Beaker, Sparkles } from "lucide-react"
import { SPELL_DATABASE, POTION_DATABASE, WAND_PASSIVES } from "@/lib/game-data"

interface AdminBalancePanelProps {
  isOpen: boolean
  onClose: () => void
  currentUser: { id: string; username: string; isAdmin?: boolean }
}

interface MetaStats {
  name: string
  count: number
  percentage: number
}

export default function AdminBalancePanel({ isOpen, onClose, currentUser }: AdminBalancePanelProps) {
  const [loading, setLoading] = useState(false)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [topSpells, setTopSpells] = useState<MetaStats[]>([])
  const [topPotions, setTopPotions] = useState<MetaStats[]>([])
  const [topCores, setTopCores] = useState<MetaStats[]>([])
  const [topWands, setTopWands] = useState<MetaStats[]>([])

  useEffect(() => {
    if (isOpen && currentUser.isAdmin) {
      loadMetaStats()
    }
  }, [isOpen, currentUser])

  const loadMetaStats = async () => {
    setLoading(true)
    try {
      const supabase = getSupabaseClient()

      // READ-ONLY: Fetch match history with player builds for PvP meta analysis
      const { data: matches, error } = await supabase
        .from("match_history")
        .select("player_builds, game_mode")
        .not("game_mode", "in", '("torneio-offline","historia","floresta","death-march","worldboss","quidditch")')
        .order("finished_at", { ascending: false })
        .limit(1000)

      if (error) {
        console.error("Failed to fetch match history:", error)
        return
      }

      if (!matches || matches.length === 0) {
        setTotalPlayers(0)
        return
      }

      setTotalPlayers(matches.length)

      // Aggregate spells from match history player builds
      const spellCounts: Record<string, number> = {}
      matches.forEach((match) => {
        if (Array.isArray(match.player_builds)) {
          match.player_builds.forEach((build: { spells?: string[] }) => {
            if (Array.isArray(build.spells)) {
              build.spells.forEach((spell: string) => {
                spellCounts[spell] = (spellCounts[spell] || 0) + 1
              })
            }
          })
        }
      })

      // Aggregate potions from match history player builds
      const potionCounts: Record<string, number> = {}
      matches.forEach((match) => {
        if (Array.isArray(match.player_builds)) {
          match.player_builds.forEach((build: { potion?: string }) => {
            if (build.potion) {
              potionCounts[build.potion] = (potionCounts[build.potion] || 0) + 1
            }
          })
        }
      })

      // Aggregate cores from match history player builds
      const coreCounts: Record<string, number> = {}
      matches.forEach((match) => {
        if (Array.isArray(match.player_builds)) {
          match.player_builds.forEach((build: { core?: string }) => {
            if (build.core) {
              coreCounts[build.core] = (coreCounts[build.core] || 0) + 1
            }
          })
        }
      })

      // Aggregate wands from match history player builds
      const wandCounts: Record<string, number> = {}
      matches.forEach((match) => {
        if (Array.isArray(match.player_builds)) {
          match.player_builds.forEach((build: { wand?: string }) => {
            if (build.wand) {
              wandCounts[build.wand] = (wandCounts[build.wand] || 0) + 1
            }
          })
        }
      })

      // Convert to arrays and calculate percentages
      const total = matches.length
      setTopSpells(sortByCount(spellCounts, total))
      setTopPotions(sortByCount(potionCounts, total))
      setTopCores(sortByCount(coreCounts, total))
      setTopWands(sortByCount(wandCounts, total))
    } catch (error) {
      console.error("Failed to load meta stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const sortByCount = (counts: Record<string, number>, total: number): MetaStats[] => {
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count)
  }

  const getSpellName = (name: string): string => {
    const spell = SPELL_DATABASE.find((s) => s.name === name)
    return spell?.namePt || name
  }

  const getPotionName = (id: string): string => {
    const potion = POTION_DATABASE.find((p: { id: string }) => p.id === id)
    return potion?.namePt || id
  }

  const getCoreName = (id: string): string => {
    const core = WAND_PASSIVES[id]
    return core?.namePt || id
  }

  const getWandName = (id: string): string => {
    // Wand names are the IDs themselves (holly, vine, dragon, etc.)
    return id
  }

  if (!currentUser.isAdmin) {
    return null
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] overflow-hidden bg-stone-900 border-amber-700">
        <CardHeader className="border-b border-amber-700/50 bg-stone-800">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-200">
              <BarChart3 className="h-5 w-5 text-green-400" />
              Admin Panel - Meta Analytics
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-amber-400 hover:text-amber-200 hover:bg-stone-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-[70vh] items-center justify-center">
              <p className="text-amber-400">Loading meta analytics...</p>
            </div>
          ) : (
            <div className="h-[70vh] overflow-y-auto p-6 space-y-6">
              {/* Total Matches */}
              <div className="flex items-center gap-4 mb-6">
                <Badge className="bg-amber-700 text-amber-100 border-amber-600 px-4 py-2 text-sm">
                  Total PvP Matches: {totalPlayers}
                </Badge>
              </div>

              {/* Top Spells */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-300 mb-4">
                  <Sparkles className="h-5 w-5" />
                  Top Spells (Grimoire Meta)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topSpells.slice(0, 10).map((item) => (
                    <div key={item.name} className="border border-amber-700/50 bg-stone-800 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-amber-200">{getSpellName(item.name)}</span>
                        <Badge className="bg-purple-900/50 text-purple-200 border-purple-700 text-xs">
                          {item.count} ({item.percentage.toFixed(1)}%)
                        </Badge>
                      </div>
                      <div className="w-full bg-stone-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Potions */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-300 mb-4">
                  <Beaker className="h-5 w-5" />
                  Top Potions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topPotions.slice(0, 10).map((item) => (
                    <div key={item.name} className="border border-amber-700/50 bg-stone-800 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-amber-200">{getPotionName(item.name)}</span>
                        <Badge className="bg-green-900/50 text-green-200 border-green-700 text-xs">
                          {item.count} ({item.percentage.toFixed(1)}%)
                        </Badge>
                      </div>
                      <div className="w-full bg-stone-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Cores */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-300 mb-4">
                  <Shield className="h-5 w-5" />
                  Top Cores
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topCores.map((item) => (
                    <div key={item.name} className="border border-amber-700/50 bg-stone-800 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-amber-200">{getCoreName(item.name)}</span>
                        <Badge className="bg-blue-900/50 text-blue-200 border-blue-700 text-xs">
                          {item.count} ({item.percentage.toFixed(1)}%)
                        </Badge>
                      </div>
                      <div className="w-full bg-stone-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Wands */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-300 mb-4">
                  <Wand2 className="h-5 w-5" />
                  Top Wands
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topWands.map((item) => (
                    <div key={item.name} className="border border-amber-700/50 bg-stone-800 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-amber-200">{getWandName(item.name)}</span>
                        <Badge className="bg-amber-900/50 text-amber-200 border-amber-700 text-xs">
                          {item.count} ({item.percentage.toFixed(1)}%)
                        </Badge>
                      </div>
                      <div className="w-full bg-stone-700 rounded-full h-2">
                        <div
                          className="bg-amber-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-amber-700/30 p-4 bg-stone-800">
            <Button onClick={loadMetaStats} className="w-full bg-amber-700 hover:bg-amber-600 text-white">
              Refresh Analytics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
