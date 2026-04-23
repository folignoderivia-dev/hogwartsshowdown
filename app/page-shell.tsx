"use client"

import nextDynamic from "next/dynamic"

const PageClient = nextDynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen wood-bg p-6 text-amber-100">
      <p>Inicializando cliente...</p>
    </main>
  ),
})

export default function PageShell() {
  return <PageClient />
}
