/* ResearchMesh service worker — shows Web Push notifications when no tab is open. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'ResearchMesh';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => w.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
