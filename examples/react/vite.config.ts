import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import type { IncomingMessage, ServerResponse } from 'node:http'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({ include: ['buffer', 'stream', 'util'] }),
    tailwindcss(),
    react(),
    {
      name: 'terminal-logger',
      configureServer(server) {
        server.middlewares.use('/api/log', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { level, step, message, data } = JSON.parse(body)
              const ts = new Date().toISOString().split('T')[1].slice(0, 12)
              const icon = { info: '🔵', success: '✅', error: '❌', warn: '⚠️' }[level as string] ?? '📋'
              const reset = '\x1b[0m'
              const colors: Record<string, string> = {
                info: '\x1b[36m', success: '\x1b[32m', error: '\x1b[31m', warn: '\x1b[33m',
              }
              const c = colors[level as string] ?? ''
              console.log(`${c}${icon} [${ts}] [${String(step).padEnd(10)}] ${message}${reset}`)
              if (data !== undefined) console.log(`   ${JSON.stringify(data, null, 2).replace(/\n/g, '\n   ')}`)
            } catch { /* ignore malformed */ }
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          })
        })
      },
    },
  ],
})
