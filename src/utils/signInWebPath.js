/**
 * Ruta web de inicio de sesión (PWA / navegador). No abre la app nativa.
 * @param {{ forceGeneric?: boolean }} [options] - true → siempre /login (super admin, empresa, “acceso general”).
 */
import { getLastLoginSlug } from './lastLoginSlug.js'

export function getSignInPath(options = {}) {
  const { forceGeneric = false } = options
  if (forceGeneric) return '/login'
  const s = getLastLoginSlug()
  if (s) return `/c/${encodeURIComponent(s)}/login`
  return '/login'
}
