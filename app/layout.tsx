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
  title: 'Varinhas Cruzadas - Simulador de Duelos Bruxos & PvP Online',
  description: 'O sucessor espiritual dos jogos de navegador de HP. Duelos táticos, sistema de ranking estilo Pokémon Showdown e combate competitivo em tempo real. Jogue agora o melhor Harry Potter MMO de navegador.',
  keywords: 'Hogwarts MMO, Harry Potter MMO, Hogwarts Online, Harry Potter Online, Varinhas Cruzadas, Hogwarts PvP, Simulador de Duelo, Duelos Bruxos, Pokémon Showdown, Hogwarts Showdown, Web Browser Game Harry Potter, Jogo de navegador Harry Potter, RPG Hogwarts Online',
  metadataBase: new URL('https://varinhascruzadas.com.br'),
  alternates: {
    canonical: 'https://varinhascruzadas.com.br',
  },
  openGraph: {
    title: 'Varinhas Cruzadas - Simulador de Duelos Bruxos & PvP Online',
    description: 'O sucessor espiritual dos jogos de navegador de HP. Duelos táticos, sistema de ranking estilo Pokémon Showdown e combate competitivo em tempo real.',
    url: 'https://varinhascruzadas.com.br',
    siteName: 'Varinhas Cruzadas',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Varinhas Cruzadas - Duelos Bruxos PvP',
      },
    ],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Varinhas Cruzadas - Simulador de Duelos Bruxos & PvP Online',
    description: 'O sucessor espiritual dos jogos de navegador de HP. Duelos táticos, sistema de ranking estilo Pokémon Showdown e combate competitivo em tempo real.',
    images: ['/og-image.png'],
  },
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
