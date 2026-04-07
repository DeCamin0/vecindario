/* Script cargado por el service worker (Workbox importScripts): notificaciones Web Push en segundo plano. */
self.addEventListener('push', function (event) {
  var payload = { title: 'Vecindario', body: '' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    try {
      payload.body = event.data ? String(event.data.text()) : ''
    } catch {
      /* ignore */
    }
  }
  var title = payload.title || 'Vecindario'
  var body = payload.body || ''
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: payload,
    }),
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var scope = self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i]
        if (c.url.indexOf(scope) === 0 && 'focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(scope)
    }),
  )
})
