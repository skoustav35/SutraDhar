import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

function apiDevPlugin() {
  return {
    name: 'api-dev',
    configureServer(server: any) {
      // Load .env into process.env for firebase-admin
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) {
        if (!(k in process.env)) process.env[k] = v as string
      }
      const apiMiddleware = async (req: any, res: any, next: any) => {
        console.log('Received request:', req.method, req.url); const url = req.url || ''
        if (!url.startsWith('/api/')) return next()
        // Parse URL and query
        const fullUrl = new URL(url, 'http://localhost')
        const pathname = fullUrl.pathname // e.g. /api/chats
        const apiName = pathname.replace(/^\/api\//, '').split('/')[0].split('?')[0] // chats, run, etc.
        // Map /api/run -> api/run.js, handle hyphens
        const candidates = [
          path.join(process.cwd(), 'api', `${apiName}.js`),
          path.join(process.cwd(), 'api', `${apiName}.ts`),
        ]
        let filePath: string | null = null
        for (const c of candidates) {
          if (fs.existsSync(c)) { filePath = c; break }
        }
        // Handle nested like /api/connector-oauth
        if (!filePath) {
          // Try exact pathname without /api prefix
          const alt = pathname.replace(/^\/api\//, '')
          const altPath = path.join(process.cwd(), 'api', `${alt}.js`)
          if (fs.existsSync(altPath)) filePath = altPath
        }
        if (!filePath) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `API route not found: ${pathname}` }))
          return
        }

        // Parse query
        req.query = Object.fromEntries(fullUrl.searchParams.entries())
        // Parse body for POST/PUT/DELETE
        let rawBody = ''
        if (['POST','PUT','DELETE','PATCH'].includes(req.method)) {
          const chunks: Buffer[] = []
          await new Promise<void>((resolve, reject) => {
            let ended = false
            const onEnd = () => { if (!ended) { ended = true; resolve() } }
            req.on('data', (c: Buffer) => chunks.push(c))
            req.on('end', onEnd)
            req.on('error', (e: any) => { if (!ended) { ended = true; reject(e) } })
            // If already ended or no body, resolve on next tick
            if (req.readableEnded) {
              // Need to check if chunks already collected via 'data' not fired
              setImmediate(onEnd)
            } else if (req.method === 'GET' || req.method === 'HEAD') {
              resolve()
            }
          })
          rawBody = Buffer.concat(chunks).toString(); console.log('Body parsed');
        }
        if (rawBody) {
          try { req.body = JSON.parse(rawBody) } catch { req.body = rawBody }
        } else {
          req.body = {}
        }
        // Ensure headers lowercased already by node, but add .authorization helper
        req.headers = req.headers || {}

        // Augment res with Vercel helpers
        if (!res.status) {
          res.status = (code: number) => { res.statusCode = code; return res }
        }
        if (!res.json) {
          res.json = (data: any) => {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = res.statusCode || 200
            }
            res.end(JSON.stringify(data))
            return res
          }
        }
        if (!res.send) {
          res.send = (data: any) => {
            if (!res.headersSent) res.statusCode = res.statusCode || 200
            res.end(data)
            return res
          }
        }
        // Also ensure setHeader exists (it does)
        const corsHeaders = () => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        }

        try {
          const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`
          const mod = await import(fileUrl)
          const handler = mod.default || mod
          if (typeof handler !== 'function') {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Handler not found' }))
            return
          }
          // Handle OPTIONS preflight quickly
          if (req.method === 'OPTIONS') {
            corsHeaders()
            res.statusCode = 204
            res.end()
            return
          }
          console.log('Keys:', !!process.env.FIREBASE_PROJECT_ID, !!process.env.FIREBASE_CLIENT_EMAIL, !!process.env.FIREBASE_PRIVATE_KEY); console.log('Calling handler'); await handler(req, res); console.log('Handler done');
          // If handler didn't end, ensure ended
          if (!res.writableEnded && !res.headersSent) {
            res.end()
          }
        } catch (e: any) {
          console.error(`[api-dev] ${pathname} error:`, e)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e?.message || 'Internal Server Error', stack: e?.stack?.slice(0,500) }))
          } else if (!res.writableEnded) {
            res.end()
          }
        }
      }
      // Register early (before Vite static) to avoid serving api/*.js as static file
      // @ts-ignore
      const idx = server.middlewares.stack.findIndex((m: any) => m.handle === apiMiddleware)
      if (idx === -1) server.middlewares.stack.unshift({ route: '', handle: apiMiddleware } as any)
    }
  }
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss(), apiDevPlugin()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})
