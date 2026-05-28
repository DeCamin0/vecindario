import { apiUrl, jsonAuthHeaders } from '../config/api.js'

/** Quita la suscripción Web Push del navegador y del servidor. */
export async function tryUnregisterWebPush(accessToken) {
  if (!accessToken || typeof window === 'undefined') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await fetch(apiUrl('/api/push/web'), {
        method: 'DELETE',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ endpoint }),
      })
    }
  } catch {
    /* ignore */
  }
}
