// Retired. Browsers that installed the old worker fetch this, clear its cache and drop it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.map(n => caches.delete(n))))
      .then(() => self.registration.unregister())
  );
});
