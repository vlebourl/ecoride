// Defense-in-depth: prevent service worker from ever intercepting /api/ requests.
// Loaded via importScripts in the generated sw.js (see vite.config.ts).
// If the workbox NavigationRoute denylist is correctly configured, this is redundant.
// If the denylist is missing (e.g., stale Docker cache), this catches the case.
self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  // Only intercept our own API requests, not third-party (e.g., Sentry)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    event.stopImmediatePropagation();
  }
});

// ---------------------------------------------------------------------------
// Push notification handlers
// ---------------------------------------------------------------------------

// Receive push events from FCM and display a notification
self.addEventListener("push", function (event) {
  var data = { title: "ecoRide", body: "" };
  try {
    if (event.data) {
      var payload = event.data.json();
      data.title = payload.title || data.title;
      data.body = payload.body || "";
      data.icon = payload.icon;
      data.url = payload.url;
    }
  } catch (e) {
    data.body = event.data ? event.data.text() : "";
  }

  var options = {
    body: data.body,
    icon: data.icon || "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click — open the app or focus existing tab
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // Focus existing tab if open
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Otherwise open new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
