"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

/** Códigos de UI previstos: PT (base do site), EN, ES. */
export type AppLocale = "pt" | "en" | "es"

const STORAGE_KEY = "hs:locale:v1"

type LanguageContextValue = {
  locale: AppLocale
  setLocale: (l: AppLocale) => void
  /** pt → en → es → pt */
  cycleLocale: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("pt")

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY) as AppLocale | null
      if (v === "pt" || v === "en" || v === "es") setLocaleState(v)
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
      const order: AppLocale[] = ["pt", "en", "es"]
      const i = order.indexOf(prev)
      const next = order[(i + 1) % order.length]!
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
      locale: "pt",
      setLocale: () => {},
      cycleLocale: () => {},
    }
  }
  return ctx
}
