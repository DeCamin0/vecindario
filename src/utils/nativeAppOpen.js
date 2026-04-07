/**
 * Enlaces para abrir la app nativa desde la PWA (sin “detección mágica” del navegador).
 * - Android: URL intent (Chrome) fuerza el paquete y hace fallback a HTTPS si no hay app.
 * - iOS: esquema custom vecindario:// (Universal Links requieren toque en contexto externo).
 */
import { getPublicAppOrigin } from './communityLoginUrl'
import { getStorePlatform } from './devicePlatform'

export const VECINDARIO_ANDROID_PACKAGE = 'com.decamino.vecindario'

/**
 * @param {string} originHttps - ej. https://vecindario.decaminoservicios.com
 * @param {string} pathname - ej. /c/mi-slug/login
 * @param {string} [search]
 */
export function buildAndroidIntentOpenUrl(originHttps, pathname, search = '') {
  const base = String(originHttps || '').trim().replace(/\/$/, '')
  if (!base.startsWith('http')) return '#'
  let host
  try {
    host = new URL(base).host
  } catch {
    return '#'
  }
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const pathQuery = `${path}${search || ''}`
  const fullHttps = `${base}${pathQuery}`
  const intentAuthority = `${host}${pathQuery}`
  const fallback = encodeURIComponent(fullHttps)
  return `intent://${intentAuthority}#Intent;scheme=https;package=${VECINDARIO_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
}

/**
 * Esquema vecindario:// alineado con parseCommunityLoginSlugFromUrl (mobile).
 */
export function buildVecindarioSchemeHref(pathname, search = '') {
  const pq = `${pathname || ''}${search || ''}`
  const m = pq.match(/^\/c\/([^/?#]+)\/login/i)
  if (m) {
    const seg = decodeURIComponent(m[1]).trim().toLowerCase()
    if (seg) return `vecindario://c/${encodeURIComponent(seg)}/login`
  }
  if (pq.startsWith('/open-app')) {
    const q = pq.includes('?') ? new URLSearchParams(pq.split('?')[1] || '') : new URLSearchParams()
    const slug = q.get('slug')?.trim().toLowerCase()
    return slug ? `vecindario://open?slug=${encodeURIComponent(slug)}` : 'vecindario://open'
  }
  if (pq.startsWith('/login')) return 'vecindario://login'
  return 'vecindario://open'
}

/**
 * href recomendado para “Abrir en la app” en móvil (desde la URL actual).
 */
export function buildOpenInNativeAppHrefFromWindow(w = typeof window !== 'undefined' ? window : null) {
  if (!w?.location) return '#'
  const origin = getPublicAppOrigin() || w.location.origin
  const pathname = w.location.pathname
  const search = w.location.search || ''
  const platform = getStorePlatform()
  if (platform === 'android') {
    return buildAndroidIntentOpenUrl(origin, pathname, search)
  }
  if (platform === 'ios') {
    return buildVecindarioSchemeHref(pathname, search)
  }
  return `${origin}${pathname}${search}`
}
