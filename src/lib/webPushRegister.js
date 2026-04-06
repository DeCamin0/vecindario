import { apiUrl, jsonAuthHeaders } from '../config/api.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

/** Registra suscripción Web Push si hay VAPID en el servidor y permiso del usuario. */
export async function tryRegisterWebPush(accessToken) {
  if (!accessToken || typeof window === 'undefined') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const keyRes = await fetch(apiUrl('/api/push/vapid-public-key'))
    const keyJson = await keyRes.json().catch(() => ({}))
    const vapidKey = keyJson.key
    if (!vapidKey || typeof vapidKey !== 'string') return

    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
    }
    if (perm !== 'granted') return

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }
    const j = sub.toJSON()
    await fetch(apiUrl('/api/push/web'), {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        endpoint: j.endpoint,
        keys: j.keys,
      }),
    })
  } catch {
    /* ignore */
  }
}
