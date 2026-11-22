import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** Em `vite dev`, espelha as functions `/api/nfce` e `/api/ocr` (mesmo código da Vercel). */
function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/nfce') && !req.url?.startsWith('/api/ocr')) return next()
        try {
          const chunks: Buffer[] = []
          await new Promise<void>((resolve, reject) => {
            req.on('data', (c) => chunks.push(c))
            req.on('end', () => resolve())
            req.on('error', reject)
          })
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: unknown = undefined
          if (raw) { try { body = JSON.parse(raw) } catch { body = raw } }
          const url = new URL(req.url, 'http://localhost')
          const query: Record<string, string> = Object.fromEntries(url.searchParams)
          const fakeRes = {
            statusCode: 200,
            status(n: number) { this.statusCode = n; return this },
            setHeader(k: string, v: string) { res.setHeader(k, v) },
            json(b: unknown) {
              res.statusCode = this.statusCode
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(b))
            },
          }
          if (req.url.startsWith('/api/nfce')) {
            const mod = await server.ssrLoadModule('/api/nfce.ts')
            await mod.default({ method: req.method, query, body }, fakeRes)
          } else {
            const mod = await server.ssrLoadModule('/api/ocr.ts')
            await mod.default({ method: req.method, query, body, headers: req.headers }, fakeRes)
          }
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ erro: e instanceof Error ? e.message : 'erro' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [apiDevPlugin(), react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg'],
    manifest: { name: 'Minhas Finanças', short_name: 'Finanças', lang: 'pt-BR', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#059669',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png}'],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        { urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com|unpkg\.com)\//, handler: 'CacheFirst', options: { cacheName: 'ocr-assets', expiration: { maxEntries: 30, maxAgeSeconds: 60*60*24*90 } } },
        { urlPattern: /^https:\/\/brasilapi\.com\.br\/api\/cnpj\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'cnpj', expiration: { maxEntries: 500 } } },
        { urlPattern: /\/api\/(nfce|ocr)/, handler: 'NetworkOnly' },
      ],
    }
  })]
})
