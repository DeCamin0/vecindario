/**
 * Decide la primera ruta tras /app. Función pura (tests). Solo routing web.
 * Orden sin sesión: slug en query → lastLoginSlug → /login.
 */
import { getLastLoginSlug } from '../utils/lastLoginSlug.js'

/**
 * @param {{ slugFromQuery: string }} launch - resultado de readLaunchContext
 * @param {boolean} hasAccessToken - JWT presente tras hidratar AuthContext
 * @returns {{ to: string, replace: boolean }}
 */
export function resolveInitialRoute(launch, hasAccessToken) {
  if (hasAccessToken) {
    return { to: '/', replace: true }
  }

  const fromLaunch = (launch?.slugFromQuery || '').trim().toLowerCase()
  const slug = fromLaunch || getLastLoginSlug()

  if (slug) {
    return { to: `/c/${encodeURIComponent(slug)}/login`, replace: true }
  }

  return { to: '/login', replace: true }
}
