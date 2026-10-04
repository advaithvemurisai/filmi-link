/*
 * Service worker for daily reminders only. It deliberately has no fetch handler and caches nothing,
 * so a deploy is never hidden behind a stale copy of the app.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let msg = {}
  try {
    msg = e.data ? e.data.json() : {}
  } catch {
    /* a malformed payload still shows the default reminder */
  }
  e.waitUntil(
    self.registration.showNotification(msg.title || 'CinematicLink', {
      body: msg.body || 'Today’s puzzle is waiting.',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // One reminder at a time: a newer one replaces any still sitting in the tray.
      tag: 'daily',
      data: { url: msg.url || '/play' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/play', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const open = tabs.find((t) => new URL(t.url).origin === self.location.origin)
      // navigate() refuses a tab this worker doesn't control yet; focusing it is enough then.
      if (open) return open.focus().then((t) => t.navigate(url).catch(() => t))
      return self.clients.openWindow(url)
    }),
  )
})
