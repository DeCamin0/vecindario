/**
 * URL absoluta del login por slug (QR, copiar enlace).
 * Opcional: VITE_PUBLIC_APP_ORIGIN=https://tudominio.com (sin barra final).
 */
export function getPublicAppOrigin() {
  const fromEnv = typeof import.meta.env.VITE_PUBLIC_APP_ORIGIN === 'string'
    ? import.meta.env.VITE_PUBLIC_APP_ORIGIN.trim().replace(/\/$/, '')
    : ''
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

/**
 * @param {string} loginSlug slug normalizado en servidor
 * @returns {string} URL completa o cadena relativa si no hay origen (SSR)
 */
export function buildCommunityLoginUrl(loginSlug) {
  const slug = String(loginSlug || '').trim()
  if (!slug) return ''
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base.slice(0, -1) : base
  const path = `${root}/c/${encodeURIComponent(slug)}/login`
  const origin = getPublicAppOrigin()
  return origin ? `${origin}${path}` : path
}

/**
 * URL de la página intermedia (QR): explica app vs web y enlaces a tiendas.
 * @param {string} [loginSlug]
 */
export function buildOpenAppLandingUrl(loginSlug) {
  const slug = String(loginSlug || '').trim()
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base.slice(0, -1) : base
  const path = slug ? `${root}/open-app?slug=${encodeURIComponent(slug)}` : `${root}/open-app`
  const origin = getPublicAppOrigin()
  return origin ? `${origin}${path}` : path
}
