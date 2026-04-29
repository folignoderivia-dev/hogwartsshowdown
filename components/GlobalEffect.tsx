"use client"

import { useEffect, useRef } from "react"

interface GlobalEffectProps {
  type: "explosion" | "weather" | "fire" | "erratic"
  color: string
  onComplete: () => void
}

export default function GlobalEffect({ type, color, onComplete }: GlobalEffectProps) {
  const effectRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const effect = effectRef.current
    const container = containerRef.current
    if (!effect || !container) return

    const duration = type === "explosion" ? 600 : type === "weather" ? 800 : type === "fire" ? 1000 : 700

    // Apply animation based on type
    if (type === "explosion") {
      container.style.animation = `screenShake 300ms ease-out`
      effect.style.animation = `radialExpand ${duration}ms ease-out forwards`
    } else if (type === "weather") {
      effect.style.animation = `weatherFlash ${duration}ms ease-out forwards`
    } else if (type === "fire") {
      effect.style.animation = `fireRise ${duration}ms ease-out forwards`
    } else if (type === "erratic") {
      effect.style.animation = `erraticSplashes ${duration}ms ease-out forwards`
    }

    const timeout = setTimeout(() => {
      onComplete()
    }, duration)

    return () => clearTimeout(timeout)
  }, [type, color, onComplete])

  return (
    <>
      <div
        ref={containerRef}
        className="fixed inset-0 pointer-events-none z-30"
      />
      <div
        ref={effectRef}
        className="fixed inset-0 pointer-events-none z-30"
        style={{
          background: getEffectStyle(type, color),
        }}
      />
    </>
  )
}

function getEffectStyle(type: string, color: string): string {
  if (type === "explosion") {
    return `radial-gradient(circle at center, ${color} 0%, transparent 70%)`
  }
  if (type === "weather") {
    return `${color}66` // Semi-transparent
  }
  if (type === "fire") {
    return `linear-gradient(to top, ${color}88 0%, transparent 50%)`
  }
  if (type === "erratic") {
    return "transparent"
  }
  return color
}

// Canonical colors for global spells
export const GLOBAL_EFFECT_COLORS: Record<string, { type: "explosion" | "weather" | "fire" | "erratic"; color: string }> = {
  // Explosions
  "Bombarda": { type: "explosion", color: "#FFA500" },
  "Bombarda Maxima": { type: "explosion", color: "#FFFFFF" },
  
  // Weather
  "Desumo Tempestas": { type: "weather", color: "#708090" },
  "Arestum Momentum": { type: "weather", color: "#483D8B" },
  "Fumus": { type: "weather", color: "#D3D3D3" },
  
  // Fire
  "Circum Inflamare": { type: "fire", color: "#B22222" },
  "Fogo Maldito": { type: "fire", color: "#8B0000" },
  
  // Erratic
  "Branquium Remendo": { type: "erratic", color: "#FFD700" },
}

export function getGlobalEffectConfig(spellName: string) {
  return GLOBAL_EFFECT_COLORS[spellName] || null
}
