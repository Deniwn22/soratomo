import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// basicSsl removed — only needed for local dev camera access.
// For local dev with camera: run  npx vite --host --https  (uses built-in self-signed cert)
// In production (Netlify): real HTTPS is provided automatically.

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/adsb/, /^\/adsbdb/],
        runtimeCaching: [
          { urlPattern: /\/adsb\//, handler: 'NetworkOnly' },
          {
            urlPattern: /\/adsbdb\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'adsbdb-types',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      manifest: {
        name: 'SoraTomo',
        short_name: 'SoraTomo',
        description: '空友 — AR aircraft spotting companion',
        theme_color: '#010a18',
        background_color: '#010a18',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],

  preview: {
    host: true,
    port: 4173,
  },

  server: {
    host: true,

    // Dev-only proxies — in production, Netlify Functions handle these routes.
    proxy: {
      '/adsb': {
        target: 'https://api.adsb.lol',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/adsb/, ''),
      },
      '/adsbdb': {
        target: 'https://api.adsbdb.com',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/adsbdb/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if ([404, 502, 503].includes(proxyRes.statusCode)) {
              proxyRes.statusCode = 200
            }
          })
          proxy.on('error', (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end('{}')
            }
          })
        },
      },
    },
  },
})
