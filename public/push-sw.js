/*
 * Cozy Acres phone notifications: the service worker part.
 * vite-plugin-pwa's generated service worker (sw.js, Workbox precache) loads this file with importScripts
 * (see vite.config.ts, workbox.importScripts), so precaching and the update flow stay exactly as they were.
 *
 * Messages come from supabase/functions/send-push as JSON: { title, body, kind, tag }.
 */
/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const scope = self.registration.scope; // e.g. https://cozyacres.joshmakesgames.app/play/
  const kind = typeof data.kind === 'string' ? data.kind : 'farm';
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'Cozy Acres';
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 200) : '',
    icon: new URL('icons/icon-192.png', scope).href,
    badge: new URL('icons/icon-monochrome-432.png', scope).href,
    // one notification per kind: a newer "crops ready" replaces the older one instead of piling up
    tag: typeof data.tag === 'string' && data.tag ? data.tag : `cozy-${kind}`,
    renotify: false,
    data: { url: scope, kind },
  };
  event.waitUntil((async () => {
    // the player is looking at the game right now: no need to buzz (tests always show)
    if (kind !== 'test') {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((c) => c.visibilityState === 'visible' && c.focused && c.url.startsWith(scope))) return;
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const url = (event.notification.data && event.notification.data.url) || scope;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // an open game window: bring it to the front
    for (const c of wins) {
      if (c.url.startsWith(scope) && 'focus' in c) {
        try { return await c.focus(); } catch (e) { /* not allowed, open a new one */ }
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
    return undefined;
  })());
});

// The browser renewed the subscription (rare): subscribe again with the same key. The game saves the new
// one to the server the next time it opens (it compares the subscription with what it saved).
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  const key = old && old.options && old.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => undefined));
});
