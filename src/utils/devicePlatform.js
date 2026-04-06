/**
 * Detección ligera de navegador móvil y plataforma de tienda (sin fingerprinting).
 */

export function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod|webos|mobile/i.test(navigator.userAgent)
}

/** @returns {'ios' | 'android' | null} */
export function getStorePlatform() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return null
}

/** PWA instalada o iOS standalone: no molestar con banner de “descargar app”. */
export function isProbablyStandalonePWA() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.navigator.standalone === true) return true
  } catch {
    /* ignore */
  }
  return false
}
