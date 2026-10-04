import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The game lives under /play/ next to the Cozy Acres website (https://cozyacres.joshmakesgames.app/play/).
// deploy.yml sets BASE_PATH (e.g. /Cozy-Farm/play/ on the github.io project URL); see DOMAIN.md.
const base = process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/play/' : '/');

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 0,
  },
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Cozy Acres',
        short_name: 'Cozy Acres',
        description: 'A cozy 3D farming and village builder.',
        theme_color: '#7cc85a',
        background_color: '#8fd3f4',
        display: 'fullscreen',
        orientation: 'any',
        // fixed id (resolved against the origin): the installed app stays the same app across base path changes
        id: '/play/',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,glb,json,mp3,woff2}'],
        // Music is large: cache it on first play instead of precaching.
        globIgnores: ['**/assets/audio/music/**'],
        runtimeCaching: [
          // Online play (Supabase): always live, never cached by the service worker.
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in') || url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/realtime/v1/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/audio/music/'),
            handler: 'CacheFirst',
            options: { cacheName: 'music', rangeRequests: true, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        // Only Vite's own hashed bundles (assets/index-AbC12_xY.js) never change. The plugin's default treats
        // everything under assets/ as hashed, which also caught public/assets (manifest.json, icons, models)
        // and kept phones on a stale manifest.json after an update.
        dontCacheBustURLsMatching: /^assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css)$/,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // phone notifications (push and notification taps) live in public/push-sw.js, loaded into the generated worker
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
