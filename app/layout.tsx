import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Cinzel, Playfair_Display, Oswald } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { LanguageProvider } from '../contexts/language-context'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const _cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel" });
const _playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald", weight: ["400", "600", "700"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Wizard Duel - Hogwarts Showdown',
  description: 'Competitive turn-based PvP game with wizard duel theme',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <body className={`font-sans antialiased ${_cinzel.variable} ${_playfair.variable} ${oswald.variable}`}>
        <LanguageProvider>
          {children}
        </LanguageProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
