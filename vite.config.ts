import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(
      `v${process.env.npm_package_version ?? '0.0.0'} · ${new Date().toISOString().slice(0, 10)}`,
    ),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // The 3D match view is a lazy chunk (three.js); only it exceeds the default limit.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Fonts are bundled, so cache them too for offline play.
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'] },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Cricket Manager',
        short_name: 'Cricket Mgr',
        description: 'Mobile-first cricket career management sim (prototype)',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        theme_color: '#1b1d23',
        background_color: '#1b1d23',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
})
