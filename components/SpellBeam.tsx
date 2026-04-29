"use client"

import { useEffect, useRef } from "react"

interface SpellBeamProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
  onComplete: () => void
}

export default function SpellBeam({ fromX, fromY, toX, toY, color, onComplete }: SpellBeamProps) {
  const beamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const beam = beamRef.current
    if (!beam) return

    // Calculate distance and angle
    const dx = toX - fromX
    const dy = toY - fromY
    const distance = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)

    // Set beam properties
    beam.style.width = "0px"
    beam.style.left = `${fromX}px`
    beam.style.top = `${fromY}px`
    beam.style.transform = `rotate(${angle}deg)`

    // Animate beam
    const animationDuration = 300 // 300ms for beam travel

    const startAnimation = () => {
      beam.style.transition = `width ${animationDuration}ms ease-out`
      beam.style.width = `${distance}px`
    }

    // Start animation on next frame
    requestAnimationFrame(startAnimation)

    // Trigger completion after animation
    const timeout = setTimeout(() => {
      onComplete()
    }, animationDuration)

    return () => clearTimeout(timeout)
  }, [fromX, fromY, toX, toY, color, onComplete])

  return (
    <div
      ref={beamRef}
      className="fixed pointer-events-none z-50"
      style={{
        height: "4px",
        backgroundColor: color,
        boxShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}`,
        borderRadius: "2px",
        transformOrigin: "left center",
      }}
    />
  )
}

// Canonical color dictionary for spells
export const SPELL_BEAM_COLORS: Record<string, string> = {
  // Red spells
  "Estupefaca": "#FF0000",
  "Expelliarmus": "#FF0000",
  "Crucius": "#FF0000",
  "Scarlatum": "#FF0000",
  "Pericullum": "#FF0000",
  "Vermillious": "#FF0000",
  "Finite Incantatem": "#FF0000",
  
  // Green spells
  "Avada Kedavra": "#00FF00",
  "Cara de Lesma": "#8B9D77",
  
  // Cyan/Ice spells
  "Glacius": "#00FFFF",
  
  // Blue spells
  "Reducto": "#0000FF",
  "Expulso": "#0000FF",
  "Obliviate": "#0000FF",
  
  // Orange/Fire spells
  "Incendio": "#FF4500",
  "Flagrate": "#FF4500",
  "Flagellum": "#FF4500",
  
  // Yellow/Gold spells
  "Imperio": "#FFD700",
  "Eletricus": "#FFD700",
  "Revele seus Segredos": "#FFD700",
  "Confrigo": "#FFD700",
  
  // Pink/Purple spells
  "Confundos": "#FF69B4",
  "Subito": "#FF69B4",
  "Diffindo": "#FF69B4",
  "Trevus": "#FF69B4",
  
  // White/Silver spells
  "Expecto Patronum": "#FFFFFF",
  "Lumus": "#FFFFFF",
  "Sectumsempra": "#FFFFFF",
  "Legilimens": "#FFFFFF",
  "Silencio": "#FFFFFF",
  "Petrificus Totales": "#FFFFFF",
  "Depulso": "#FFFFFF",
  
  // Turquoise spells
  "Impedimenta": "#40E0D0",
  
  // Grey/Stone spells
  "Piertotum Locomotor": "#A9A9A9",
  "Rictumsempra": "#A9A9A9",
}

// Helper function to get beam color for a spell
export function getSpellBeamColor(spellName: string): string {
  return SPELL_BEAM_COLORS[spellName] || "#FFFFFF" // Default to white if not found
}
