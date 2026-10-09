import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handle, memoryStore, upstash } from './api/sync.js'

/**
 * Serves /api/sync during `npm run dev`, so accounts work locally without the Vercel CLI.
 * Uses Upstash if its env vars are present (e.g. after `vercel env pull`), otherwise an in-memory store.
 */
function devApi(env: Record<string, string>): Plugin {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  const store = url && token ? upstash(url, token) : memoryStore()
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/sync', (req, res) => {
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', async () => {
          const out = await handle(store, req.method ?? 'GET', raw ? JSON.parse(raw) : {})
          res.statusCode = out.status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(out.body))
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ''))],
}))
