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
  var d = event.notification.data || {}
  var parcelId = d.parcelId
  var serviceRequestId = d.serviceRequestId
  var path = '/'
  if (parcelId != null && parcelId !== '') {
    path = '/paqueteria/' + encodeURIComponent(String(parcelId))
  } else if (serviceRequestId != null && serviceRequestId !== '') {
    path = '/services/' + encodeURIComponent(String(serviceRequestId))
  }
  var targetUrl
  try {
    targetUrl = new URL(path, scope).href
  } catch {
    targetUrl = scope
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i]
        if (c.url.indexOf(scope) === 0 && 'focus' in c) {
          if (typeof c.navigate === 'function' && path !== '/') {
            try {
              void c.navigate(targetUrl)
            } catch {
              /* ignore */
            }
          }
          return c.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
