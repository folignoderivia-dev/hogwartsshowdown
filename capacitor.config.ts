import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.varinhascruzadas.apk",
  appName: "Varinhas Cruzadas",
  webDir: "public",
  // Modo "live reload remoto": o APK abre diretamente o site Vercel.
  // Assim qualquer atualização no site reflete no app sem novo APK.
  server: {
    url: "https://hogwartsshowdown-lyart.vercel.app",
    cleartext: false,   // HTTPS não precisa de cleartext
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#1a1a2e",
    webContentsDebuggingEnabled: false,
  },
}

export default config
