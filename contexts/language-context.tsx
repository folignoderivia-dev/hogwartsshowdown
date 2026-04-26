"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

/** Códigos de UI: EN (padrão), PT. */
export type AppLocale = "en" | "pt"

const STORAGE_KEY = "hs:locale:v1"

type LanguageContextValue = {
  locale: AppLocale
  setLocale: (l: AppLocale) => void
  /** en ↔ pt toggle */
  cycleLocale: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en")

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY) as AppLocale | null
      if (v === "pt" || v === "en") setLocaleState(v)
    } catch {
      // ignore
    }
  }, [])

  const setLocale = useCallback((l: AppLocale) => {
    setLocaleState(l)
    try {
      window.localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // ignore
    }
  }, [])

  const cycleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next: AppLocale = prev === "en" ? "pt" : "en"
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, cycleLocale }),
    [locale, setLocale, cycleLocale]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    return {
      locale: "en",
      setLocale: () => {},
      cycleLocale: () => {},
    }
  }
  return ctx
}
