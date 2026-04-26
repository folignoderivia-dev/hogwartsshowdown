"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { io, type Socket } from "socket.io-client"

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

type LayoutMode = "default" | "topBanner"

/** Bate-papo global da Sala Comum (mensagens broadcast via Socket.io). */
export default function HomeLobbyChat({
  authorName,
  layout = "default",
  className,
}: {
  authorName: string
  /** `topBanner`: barra horizontal compacta no topo (mobile: altura reduzida). */
  layout?: LayoutMode
  className?: string
}) {
  const [messages, setMessages] = useState<LobbyChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Don't load from localStorage - start empty to get fresh global messages from server
    setMessages([])
  }, [])

  useEffect(() => {
    // Conecta ao Socket.io para chat global
    const socket = io("https://hogwartsshowdown-production.up.railway.app", {
      transports: ["polling", "websocket"],
    })
    socketRef.current = socket

    // Request recent chat history from server on connect
    socket.emit("get_global_chat_history")

    // Recebe mensagens broadcast do servidor
    socket.on("global_chat_message", (data: { author: string; text: string; ts: number }) => {
      setMessages((prev) => {
        const entry: LobbyChatMessage = {
          id: `${data.ts}-${Math.random().toString(36).slice(2, 9)}`,
          author: data.author,
          text: data.text,
          ts: data.ts,
        }
        const next = [...prev, entry].slice(-MAX_MESSAGES)
        saveMessages(next)
        return next
      })
    })

    // Receive chat history from server
    socket.on("global_chat_history", (history: Array<{ author: string; text: string; ts: number }>) => {
      const messages: LobbyChatMessage[] = history.map((msg) => ({
        id: `${msg.ts}-${Math.random().toString(36).slice(2, 9)}`,
        author: msg.author,
        text: msg.text,
        ts: msg.ts,
      })).slice(-MAX_MESSAGES)
      setMessages(messages)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (layout === "topBanner") {
      trackRef.current?.scrollTo({ left: trackRef.current.scrollWidth, behavior: "smooth" })
    } else {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [messages, layout])

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
    // Emite para o servidor broadcast
    socketRef.current?.emit("global_chat_message", { author, text, ts: Date.now() })
    setMessages((prev) => {
      const next = [...prev, entry].slice(-MAX_MESSAGES)
      saveMessages(next)
      return next
    })
    setDraft("")
  }, [authorName, draft])

  if (layout === "topBanner") {
    return (
      <section
        className={cn(
          "w-full border-b border-amber-900/50 bg-stone-950/90 shadow-md backdrop-blur-sm",
          "md:sticky md:top-0 md:z-40",
          className
        )}
      >
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-2 py-1.5 sm:flex-row sm:items-stretch sm:gap-2 sm:px-3 sm:py-2">
          <div className="min-h-0 flex-1 sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500/90 sm:shrink-0">
              Bate-papo da Sala <span className="font-normal text-amber-700">(global)</span>
            </p>
            <div
              ref={trackRef}
              className="flex max-h-10 min-h-[2.25rem] w-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden scroll-smooth rounded border border-amber-900/35 bg-stone-900/70 px-2 py-1 text-xs md:max-h-12"
            >
              {messages.length === 0 ? (
                <span className="shrink-0 text-[11px] text-amber-600/80">Diga olá ao lobby…</span>
              ) : (
                messages.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex min-w-0 max-w-[min(100%,280px)] items-baseline gap-1 overflow-hidden rounded-sm bg-stone-800/60 px-1.5 py-0.5"
                  >
                    <span className="font-semibold text-amber-300">{m.author}</span>
                    <span className="whitespace-normal break-words text-amber-100/95">· {m.text}</span>
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="flex w-full shrink-0 gap-1.5 sm:max-w-md sm:items-end">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Mensagem…"
              maxLength={280}
              className="h-9 touch-manipulation border-amber-800 bg-stone-900 text-sm text-amber-100 placeholder:text-amber-700"
            />
            <Button type="button" onClick={send} className="h-9 touch-manipulation shrink-0 bg-amber-800 px-3 text-sm hover:bg-amber-700">
              Enviar
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <Card className={cn("mt-8 border-amber-900/50 bg-stone-950/80 text-amber-100", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-amber-200">Bate-papo da Sala</CardTitle>
        <p className="text-[11px] font-normal text-amber-600/90">
          Mensagens são compartilhadas com todos os jogadores conectados. Use para combinar duelos ou deixar um recado rápido.
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
