// Served at <site>/sw.js (the website root). Before the game moved to /play/, it lived at
// jla92-bit.github.io/Cozy-Farm/ with its service worker here, and that worker would keep showing the
// old cached game forever. When the browser checks it for an update it gets this file instead, which
// removes the old worker and its cached files, then reloads the pages it was showing (the website
// loads; installed apps go on to the game at play/). Saves live in the browser's storage, not in
// these caches: they are kept.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    for (const name of await caches.keys()) {
      // only the old game's precache (named after this scope); the new game's caches stay
      if (name.startsWith('workbox-precache') && name.endsWith(scope)) await caches.delete(name);
    }
    // take over the old worker's pages (pages of the new game at play/ have their own worker and are left alone)
    await self.clients.claim();
    const pages = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    for (const client of pages) {
      if (client.url.startsWith(scope)) await client.navigate(client.url).catch(() => {});
    }
  })());
});
