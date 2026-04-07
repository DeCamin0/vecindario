/** PNG: favicon, PWA head, login, email (public/Vencindario_logo.png). */
function resolveBrandLogoPng() {
  const base = import.meta.env.BASE_URL
  if (typeof base === 'string' && base.length > 0) {
    const b = base.endsWith('/') ? base : `${base}/`
    return `${b}Vencindario_logo.png`
  }
  return '/Vencindario_logo.png'
}

export const BRAND_LOGO_PNG = resolveBrandLogoPng()

function faviconHrefForDocument() {
  let href = BRAND_LOGO_PNG
  // En dev Chrome cachea el favicon como un poseso; fuerza recarga del PNG.
  if (import.meta.env.DEV) {
    const u = href.includes('?') ? '&' : '?'
    href = `${href}${u}t=${Date.now()}`
  }
  return href
}

/** No debe tirar la app aunque falle el DOM. */
export function syncBrandFavicon() {
  try {
    const href = faviconHrefForDocument()
    const entries = [
      { rel: 'icon', type: 'image/png' },
      { rel: 'shortcut icon', type: 'image/png' },
      { rel: 'apple-touch-icon', type: null },
    ]
    for (const { rel, type } of entries) {
      let link = document.querySelector(`link[rel="${rel}"]`)
      if (!link) {
        link = document.createElement('link')
        link.rel = rel
        document.head.prepend(link)
      }
      if (type) link.setAttribute('type', type)
      else link.removeAttribute('type')
      link.href = href
    }
  } catch (e) {
    console.warn('[Vecindario] syncBrandFavicon:', e)
  }
}
