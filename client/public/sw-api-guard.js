// Defense-in-depth: prevent service worker from ever intercepting /api/ requests.
// Loaded via importScripts in the generated sw.js (see vite.config.ts).
// If the workbox NavigationRoute denylist is correctly configured, this is redundant.
// If the denylist is missing (e.g., stale Docker cache), this catches the case.
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    event.stopImmediatePropagation();
  }
});
