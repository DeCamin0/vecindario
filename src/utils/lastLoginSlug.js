/**
 * Último slug de login por comunidad (PWA / enlaces). Misma regla de aislamiento que AuthContext:
 * impersonación en pestaña → sessionStorage; si no → localStorage.
 */
export const LAST_LOGIN_SLUG_STORAGE_KEY = 'vecindario-last-login-slug'
const TAB_SESSION_ISOLATED = 'vecindario_tab_isolated'

function isAuthTabSessionIsolated() {
  try {
    return sessionStorage.getItem(TAB_SESSION_ISOLATED) === '1'
  } catch {
    return false
  }
}

function storageGet() {
  try {
    return isAuthTabSessionIsolated()
      ? sessionStorage.getItem(LAST_LOGIN_SLUG_STORAGE_KEY)
      : localStorage.getItem(LAST_LOGIN_SLUG_STORAGE_KEY)
  } catch {
    return null
  }
}

function storageSet(value) {
  try {
    if (isAuthTabSessionIsolated()) {
      if (value) sessionStorage.setItem(LAST_LOGIN_SLUG_STORAGE_KEY, value)
      else sessionStorage.removeItem(LAST_LOGIN_SLUG_STORAGE_KEY)
    } else if (value) {
      localStorage.setItem(LAST_LOGIN_SLUG_STORAGE_KEY, value)
    } else {
      localStorage.removeItem(LAST_LOGIN_SLUG_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

/** @returns {string} slug normalizado o '' */
export function getLastLoginSlug() {
  const raw = storageGet()
  if (!raw || typeof raw !== 'string') return ''
  const s = raw.trim().toLowerCase()
  return s
}

/**
 * @param {string|null|undefined} slug
 */
export function setLastLoginSlug(slug) {
  const s = String(slug ?? '').trim().toLowerCase()
  storageSet(s)
}

export function clearLastLoginSlug() {
  storageSet('')
}
