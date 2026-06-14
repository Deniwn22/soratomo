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
        skipWaiting: true,   // new SW activates immediately, no waiting for tabs to close
        clientsClaim: true,  // new SW takes control of all open tabs right away
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/adsb/, /^\/airplanes/, /^\/adsbdb/],
        runtimeCaching: [
          { urlPattern: /\/adsb\//, handler: 'NetworkOnly' },
          { urlPattern: /\/airplanes\//, handler: 'NetworkOnly' },
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
        description: 'AR aircraft spotting companion. Point your phone at the sky to identify aircraft, collect rare finds, and compete on the daily leaderboard.',
        lang: 'en-US',
        id: 'app.soratomo',
        theme_color: '#010a18',
        background_color: '#010a18',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['utilities', 'navigation', 'entertainment'],
        prefer_related_applications: false,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png',
            label: 'SoraTomo AR aircraft spotting', form_factor: 'narrow' },
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
      '/airplanes': {
        target: 'https://api.airplanes.live',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/airplanes/, ''),
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
