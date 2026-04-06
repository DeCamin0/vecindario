/**
 * Enlaces a tiendas. Configura en .env cuando publiques la app:
 * VITE_VECINDARIO_IOS_APP_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
 * VITE_VECINDARIO_ANDROID_PLAY_STORE_URL=… (opcional; hay URL por defecto con el package)
 */

const PACKAGE_ANDROID = 'com.decamino.vecindario'

export function getIosStoreUrl() {
  const u = import.meta.env.VITE_VECINDARIO_IOS_APP_STORE_URL
  return typeof u === 'string' && u.trim() ? u.trim() : ''
}

export function getAndroidStoreUrl() {
  const u = import.meta.env.VITE_VECINDARIO_ANDROID_PLAY_STORE_URL
  if (typeof u === 'string' && u.trim()) return u.trim()
  return `https://play.google.com/store/apps/details?id=${PACKAGE_ANDROID}`
}

/**
 * @param {'ios' | 'android' | null} platform
 * @returns {string} cadena vacía si iOS sin URL configurada
 */
export function getPreferredStoreUrl(platform) {
  if (platform === 'ios') return getIosStoreUrl()
  if (platform === 'android') return getAndroidStoreUrl()
  return ''
}
