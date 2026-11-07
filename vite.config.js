import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/* Grace's vocabulary: every word in her source files (the keywords her
   patterns look for, plus the English in her replies and comments).
   Built at compile time so only the word list ships, not the source.
   Typo correction (src/lib/typos.js) treats these as correctly spelled. */
const VOCAB_FILES = ['src/lib/assistant.js', 'src/lib/insights.js', 'src/lib/stats.js', 'src/lib/live.js', 'src/data/seed.js']
function graceVocab() {
  const id = 'virtual:grace-vocab'
  return {
    name: 'grace-vocab',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load(resolved) {
      if (resolved !== '\0' + id) return null
      const words = new Set()
      for (const file of VOCAB_FILES) {
        this.addWatchFile(file)
        readFileSync(file, 'utf8')
          .replace(/\\[a-zA-Z]/g, ' ') // regex escapes like \b and \s
          .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
          .toLowerCase()
          .split(/[^a-z]+/)
          .forEach((w) => w.length >= 3 && words.add(w))
      }
      return `export default ${JSON.stringify([...words].sort())}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react(), graceVocab()],
  // GitHub Pages serves the site from /Watchdog-Wallet/ (and `vite preview` mirrors it); `vite dev` stays at /
  base: command === 'build' || isPreview ? '/Watchdog-Wallet/' : '/',
}))
