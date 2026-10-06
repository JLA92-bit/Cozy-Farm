import { defineConfig } from 'vite';

// The private admin dashboard (ADMIN.md), served at /admin/ next to the website and the game.
// scripts/pages/build.sh builds it into dist/admin. Uses the same VITE_SUPABASE_* settings as the game.
export default defineConfig({
  root: __dirname,
  base: process.env.ADMIN_BASE ?? './',
  envDir: '..',
  build: { target: 'es2022', outDir: '../dist/admin', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
