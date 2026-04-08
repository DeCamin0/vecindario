/**
 * Enlaces para abrir la app nativa desde la PWA (sin “detección mágica” del navegador).
 * - Android: URL intent (Chrome) fuerza el paquete y hace fallback a HTTPS si no hay app.
 * - iOS: sin app en App Store, vecindario:// rompe Safari (“dirección no válida”). Usamos HTTPS
 *   de la página actual; cuando exista app iOS con Universal Links, el mismo enlace puede abrirla.
 */

export const VECINDARIO_ANDROID_PACKAGE = 'com.decamino.vecindario'

/** Quitar BASE_URL de Vite (ej. /vecindario) para comparar rutas lógicas. */
export function stripAppBasePath(pathname) {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : '/'
  const root = base === '/' ? '' : base.replace(/\/$/, '')
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (!root) return p
  if (p === root) return '/'
  if (p.startsWith(`${root}/`)) {
    const rest = p.slice(root.length)
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  return p
}

/**
 * El manifest Android solo declara App Links para /c/… y /pool-self-checkin.
 * Para /login, /open-app, /, etc., un intent https no coincide con ninguna activity
 * y Chrome usa browser_fallback_url → parece “recarga”. Ahí usamos scheme vecindario://.
 */
function androidPathUsesHttpsAppLink(strippedPathname, search = '') {
  const pq = `${strippedPathname || ''}${search || ''}`
  if (strippedPathname.startsWith('/c/')) return true
  if (pq.includes('pool-self-checkin')) return true
  return false
}

/**
 * intent://…#Intent;scheme=vecindario;… → abre la app Expo (scheme fijo en app.config).
 */
function buildAndroidIntentFromVecindarioScheme(vecindarioHref, httpsFallbackFull) {
  const fallback = encodeURIComponent(httpsFallbackFull)
  try {
    const u = new URL(vecindarioHref)
    if (u.protocol !== 'vecindario:') return '#'
    const auth = `${u.hostname}${u.pathname || ''}${u.search || ''}`
    return `intent://${auth}#Intent;scheme=vecindario;package=${VECINDARIO_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
  } catch {
    return '#'
  }
}

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
  const fallback = encodeURIComponent(fullHttps)
  const stripped = stripAppBasePath(path)

  if (androidPathUsesHttpsAppLink(stripped, search)) {
    const intentAuthority = `${host}${pathQuery}`
    return `intent://${intentAuthority}#Intent;scheme=https;package=${VECINDARIO_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
  }

  const schemeHref = buildVecindarioSchemeHref(stripped, search)
  return buildAndroidIntentFromVecindarioScheme(schemeHref, fullHttps)
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
