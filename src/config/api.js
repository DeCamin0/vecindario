/** Base URL API Vecindario (ex. http://localhost:4001). Gol = același origin + proxy Vite /api */
export function getApiBase() {
  const v = import.meta.env.VITE_VECINDARIO_API_URL
  return typeof v === 'string' ? v.replace(/\/$/, '') : ''
}

/** path ex. /api/auth/me */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const b = getApiBase()
  return b ? `${b}${p}` : p
}

/** WebSocket tiempo real (notificaciones); mismo host que la API o proxy Vite. */
export function realtimeWsUrl() {
  const b = getApiBase()
  if (b) {
    try {
      const u = new URL(b)
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${u.origin}/api/realtime`
    } catch {
      /* fall through */
    }
  }
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5175'
  return `${proto}//${host}/api/realtime`
}

export function jsonAuthHeaders(accessToken) {
  const h = { 'Content-Type': 'application/json' }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  return h
}
