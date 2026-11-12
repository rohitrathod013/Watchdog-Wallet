// npm run eval: measures Grace's on-device models on synthetic accounts and writes docs/ml-eval.md.
// The app's modules are loaded through Vite (already a dev dependency), the same way the site loads them.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { run } = await server.ssrLoadModule('/scripts/ml-eval-run.js')
  await run()
} finally {
  await server.close()
}
