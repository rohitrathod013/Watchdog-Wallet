import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from /Watchdog-Wallet/ (and `vite preview` mirrors it); `vite dev` stays at /
  base: command === 'build' || isPreview ? '/Watchdog-Wallet/' : '/',
}))
