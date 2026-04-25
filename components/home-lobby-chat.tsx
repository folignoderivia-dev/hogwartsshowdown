"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const STORAGE_KEY = "hs:lobbyChat:v1"
const MAX_MESSAGES = 80

export type LobbyChatMessage = { id: string; author: string; text: string; ts: number }

function loadMessages(): LobbyChatMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m): m is LobbyChatMessage => m && typeof m.id === "string" && typeof m.text === "string")
      .slice(-MAX_MESSAGES)
  } catch {
    return []
  }
}

function saveMessages(list: LobbyChatMessage[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_MESSAGES)))
  } catch {
    // storage cheio ou privado
  }
}

/** Bate-papo simples no fim da Sala Comum (mensagens guardadas só neste dispositivo / navegador). */
export default function HomeLobbyChat({ authorName }: { authorName: string }) {
  const [messages, setMessages] = useState<LobbyChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages(loadMessages())
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text || text.length > 280) return
    const author = authorName.trim() || "Visitante"
    const entry: LobbyChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      author,
      text,
      ts: Date.now(),
    }
    setMessages((prev) => {
      const next = [...prev, entry].slice(-MAX_MESSAGES)
      saveMessages(next)
      return next
    })
    setDraft("")
  }, [authorName, draft])

  return (
    <Card className="mt-8 border-amber-900/50 bg-stone-950/80 text-amber-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-amber-200">Bate-papo da Sala</CardTitle>
        <p className="text-[11px] font-normal text-amber-600/90">
          Mensagens ficam só neste aparelho (local). Use para combinar duelos ou deixar um recado rápido.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={listRef}
          className="max-h-48 overflow-y-auto rounded-md border border-amber-900/40 bg-stone-900/60 p-2 text-sm"
        >
          {messages.length === 0 ? (
            <p className="text-xs text-amber-600/80">Nenhuma mensagem ainda. Diga olá!</p>
          ) : (
            <ul className="space-y-1.5">
              {messages.map((m) => (
                <li key={m.id} className="text-xs leading-snug">
                  <span className="font-semibold text-amber-300">{m.author}</span>
                  <span className="text-amber-600/70"> · </span>
                  <span className="text-amber-100/95">{m.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Escreva uma mensagem…"
            maxLength={280}
            className="touch-manipulation border-amber-800 bg-stone-900 text-amber-100 placeholder:text-amber-700"
          />
          <Button type="button" onClick={send} className="touch-manipulation shrink-0 bg-amber-800 hover:bg-amber-700">
            Enviar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
