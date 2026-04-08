/**
 * Contexto de arranque desde la URL (entrada /app). Solo web/PWA; sin lógica nativa.
 * @param {Window} win
 * @returns {{ slugFromQuery: string }}
 */
function normalizeSlug(raw) {
  if (raw == null || typeof raw !== 'string') return ''
  const s = raw.trim().toLowerCase()
  return s
}

export function readLaunchContext(win) {
  if (!win?.location) {
    return { slugFromQuery: '' }
  }
  try {
    const params = new URLSearchParams(win.location.search || '')
    const fromSlug = params.get('slug') || params.get('c')
    return { slugFromQuery: normalizeSlug(fromSlug) }
  } catch {
    return { slugFromQuery: '' }
  }
}
