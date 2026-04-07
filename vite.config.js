import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.1.0'),
  },
  // DeCamino (u otro front) suele ir en 5173; Vecindario va en 5175 para poder correr ambos.
  // URL local: http://localhost:5175/
  server: {
    port: 5175,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4175,
    strictPort: false,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['Vencindario_logo.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: '/',
        name: 'Vecindario',
        short_name: 'Vecindario',
        description: 'Community services, incidents and bookings',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#e8edf5',
        theme_color: '#2563eb',
        icons: [
          {
            src: '/icon-192.png',
            type: 'image/png',
            sizes: '192x192',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        importScripts: ['/push-listener.js'],
      },
      // En dev: SW + manifest activos. suppressWarnings evita el aviso de Workbox
      // («glob patterns doesn't match») porque dev-dist solo contiene sw.js / workbox.
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
    }),
  ],
  base: '/',
})
