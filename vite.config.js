import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from /Watchdog-Wallet/; local dev stays at /
  base: command === 'build' ? '/Watchdog-Wallet/' : '/',
}))
