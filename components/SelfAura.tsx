"use client"

import { useEffect, useRef } from "react"

interface SelfAuraProps {
  type: "shield" | "healing" | "buff" | "invisibility"
  color: string
  onComplete: () => void
}

export default function SelfAura({ type, color, onComplete }: SelfAuraProps) {
  const auraRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aura = auraRef.current
    if (!aura) return

    const duration = type === "invisibility" ? 1000 : 500

    // Apply animation based on type
    if (type === "shield") {
      aura.style.animation = `shieldPulse ${duration}ms ease-out forwards`
    } else if (type === "healing") {
      aura.style.animation = `healingPulse ${duration}ms ease-out forwards`
    } else if (type === "buff") {
      aura.style.animation = `buffFlash ${duration}ms ease-out forwards`
    } else if (type === "invisibility") {
      aura.style.animation = `invisibilityEffect ${duration}ms ease-out forwards`
    }

    const timeout = setTimeout(() => {
      onComplete()
    }, duration)

    return () => clearTimeout(timeout)
  }, [type, color, onComplete])

  const baseStyle = {
    position: "fixed" as const,
    pointerEvents: "none" as const,
    zIndex: 40,
  }

  if (type === "shield") {
    return (
      <div
        ref={auraRef}
        style={{
          ...baseStyle,
          borderRadius: "50%",
          border: `3px solid ${color}`,
          boxShadow: `inset 0 0 20px ${color}, 0 0 20px ${color}`,
        }}
      />
    )
  }

  if (type === "healing") {
    return (
      <div
        ref={auraRef}
        style={{
          ...baseStyle,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}88 0%, transparent 70%)`,
          boxShadow: `0 0 30px ${color}`,
        }}
      />
    )
  }

  if (type === "buff") {
    return (
      <div
        ref={auraRef}
        style={{
          ...baseStyle,
          borderRadius: "50%",
          background: color,
          opacity: 0.8,
          boxShadow: `0 0 40px ${color}`,
        }}
      />
    )
  }

  if (type === "invisibility") {
    return (
      <div
        ref={auraRef}
        style={{
          ...baseStyle,
          borderRadius: "50%",
          border: `2px solid #C0C0C0`,
          background: `radial-gradient(circle, #C0C0C044 0%, transparent 70%)`,
          filter: "blur(2px)",
        }}
      />
    )
  }

  return null
}

// Canonical colors for self spells
export const SELF_AURA_COLORS: Record<string, { type: "shield" | "healing" | "buff" | "invisibility"; color: string }> = {
  // Shields
  "Protego": { type: "shield", color: "#ADD8E6" },
  "Protego Maximo": { type: "shield", color: "#00BFFF" },
  "Salvio Hexia": { type: "shield", color: "#00BFFF" },
  "Protego Diabólico": { type: "shield", color: "#4B0082" },
  
  // Healing
  "Ferula": { type: "healing", color: "#FFD700" },
  "Episkey": { type: "healing", color: "#98FB98" },
  "Vulnera Sanetur": { type: "healing", color: "#FFD700" },
  
  // Buffs
  "Aqua Eructo": { type: "buff", color: "#00FFFF" },
  "Maximos": { type: "buff", color: "#FF4500" },
  "Fianto Dure": { type: "buff", color: "#8A2BE2" },
  "Locomotor Mortis": { type: "buff", color: "#808080" },
  
  // Special
  "Desilusão": { type: "invisibility", color: "#C0C0C0" },
}

export function getSelfAuraConfig(spellName: string) {
  return SELF_AURA_COLORS[spellName] || null
}
