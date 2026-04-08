/**
 * Punto único para “abrir en la app nativa”. Independiente del bootstrap web (/app).
 * Con slug resuelto, la URL canónica es siempre /{base}/c/{slug}/login (App Links en Android).
 */
import { getPublicAppOrigin } from './communityLoginUrl'
import { getStorePlatform } from './devicePlatform'
import { getLastLoginSlug } from './lastLoginSlug'
import {
  buildAndroidIntentOpenUrl,
  buildVecindarioSchemeHref,
  stripAppBasePath,
} from './nativeAppOpen'

/** @param {string} stripped logical path (sin BASE_URL de Vite) */
function isGenericWebEntryPath(stripped) {
  const p = stripped === '' ? '/' : stripped.startsWith('/') ? stripped : `/${stripped}`
  return p === '/' || p === '/app' || p === '/login'
}

function normalizeSlug(raw) {
  if (raw == null) return ''
  const s = String(raw).trim().toLowerCase()
  return s
}

/**
 * @param {object} p
 * @param {string|null|undefined} [p.explicitSlug]
 * @param {string} p.pathname - pathname completo del navegador (con BASE_URL si aplica)
 * @param {string} [p.search]
 * @returns {string} slug normalizado o ''
 */
function resolveSlugForNativeOpen({ explicitSlug, pathname, search = '' }) {
  const fromOpt = normalizeSlug(explicitSlug)
  if (fromOpt) return fromOpt

  const stripped = stripAppBasePath(pathname)

  const mLogin = stripped.match(/^\/c\/([^/?#]+)\/login\/?$/i)
  if (mLogin?.[1]) {
    const seg = normalizeSlug(decodeURIComponent(mLogin[1]))
    if (seg) return seg
  }

  const openAppPath = stripped === '/open-app' || stripped.startsWith('/open-app/')
  if (openAppPath) {
    try {
      const qs = (search || '').startsWith('?') ? search.slice(1) : search || ''
      const params = new URLSearchParams(qs)
      const fromQuery = normalizeSlug(params.get('slug'))
      if (fromQuery) return fromQuery
    } catch {
      /* ignore */
    }
  }

  if (isGenericWebEntryPath(stripped)) {
    return getLastLoginSlug()
  }

  return ''
}

/** Path absoluto de app (con prefijo Vite) hacia login por comunidad. */
export function canonicalCommunityLoginPathname(slug) {
  const s = normalizeSlug(slug)
  if (!s) return ''
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base.slice(0, -1) : base
  return `${root}/c/${encodeURIComponent(s)}/login`
}

/**
 * @typedef {'recommended' | 'https' | 'scheme'} NativeOpenMode
 *
 * @param {object} [options]
 * @param {string|null|undefined} [options.slug] - prioridad 1
 * @param {NativeOpenMode} [options.mode='recommended']
 * @param {string} [options.origin] - por defecto getPublicAppOrigin() o location.origin
 * @param {string} [options.pathname] - por defecto window.location.pathname
 * @param {string} [options.search] - por defecto window.location.search
 * @param {Window|null} [options.win]
 * @returns {string} href para <a> o navegación
 */
export function resolveNativeOpenHref(options = {}) {
  const {
    slug: explicitSlug,
    mode = 'recommended',
    origin: originOpt,
    pathname: pathnameOpt,
    search: searchOpt,
    win: winOpt,
  } = options

  const win = winOpt ?? (typeof window !== 'undefined' ? window : null)
  const pathname = pathnameOpt ?? win?.location?.pathname ?? '/'
  const search = searchOpt ?? win?.location?.search ?? ''

  const origin =
    (originOpt && String(originOpt).trim()) ||
    getPublicAppOrigin() ||
    win?.location?.origin ||
    ''

  const resolvedSlug = resolveSlugForNativeOpen({
    explicitSlug,
    pathname,
    search,
  })

  if (mode === 'scheme') {
    if (resolvedSlug) {
      return `vecindario://c/${encodeURIComponent(resolvedSlug)}/login`
    }
    const stripped = stripAppBasePath(pathname)
    return buildVecindarioSchemeHref(stripped, search)
  }

  if (resolvedSlug) {
    const canonicalPath = canonicalCommunityLoginPathname(resolvedSlug)
    if (!canonicalPath) return '#'

    if (mode === 'https') {
      const base = String(origin).replace(/\/$/, '')
      if (!base.startsWith('http')) return '#'
      return `${base}${canonicalPath}`
    }

    // recommended
    const platform = getStorePlatform()
    if (platform === 'android') {
      return buildAndroidIntentOpenUrl(origin, canonicalPath, '')
    }
    if (platform === 'ios') {
      const base = String(origin).replace(/\/$/, '')
      if (!base.startsWith('http')) return '#'
      return `${base}${canonicalPath}`
    }
    return `${String(origin).replace(/\/$/, '')}${canonicalPath}`
  }

  // Sin slug: mismo comportamiento que antes según URL actual (no usar solo pathname en genéricos sin lastLoginSlug)
  if (mode === 'https') {
    const base = String(origin).replace(/\/$/, '')
    if (!base.startsWith('http')) return '#'
    const p = pathname.startsWith('/') ? pathname : `/${pathname}`
    return `${base}${p}${search || ''}`
  }

  if (mode === 'scheme') {
    const stripped = stripAppBasePath(pathname)
    return buildVecindarioSchemeHref(stripped, search)
  }

  const platform = getStorePlatform()
  if (platform === 'android') {
    return buildAndroidIntentOpenUrl(origin, pathname, search)
  }
  if (platform === 'ios' && win?.location) {
    try {
      const u = new URL(win.location.href)
      u.hash = ''
      return u.toString()
    } catch {
      const p = pathname.startsWith('/') ? pathname : `/${pathname}`
      return `${String(origin).replace(/\/$/, '')}${p}${search || ''}`
    }
  }
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${String(origin).replace(/\/$/, '')}${p}${search || ''}`
}

/**
 * Navegación programática (usar solo donde no haya <a>).
 * @param {Parameters<typeof resolveNativeOpenHref>[0]} options
 */
export function openNativeApp(options) {
  if (typeof window === 'undefined') return
  const href = resolveNativeOpenHref(options)
  if (href && href !== '#') window.location.href = href
}
