import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/. Override with BASE_PATH if the repo is renamed
// or deployed elsewhere (e.g. BASE_PATH=/ for a custom domain).
const base = process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/Cozy-Farm/' : '/');

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
      registerType: 'autoUpdate',
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
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/audio/music/'),
            handler: 'CacheFirst',
            options: { cacheName: 'music', rangeRequests: true, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
