const MAX_LABEL_LEN = 64
const MAX_PORTALS = 999

/** Lista de etiquetas por portal (índice 0 = portal 1). Longitud = portalCount. */
export function parsePortalLabels(raw: unknown, portalCount: number): string[] {
  const n = Math.min(MAX_PORTALS, Math.max(1, portalCount))
  const out: string[] = Array.from({ length: n }, () => '')
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < n; i += 1) {
    const cell = raw[i]
    const s = typeof cell === 'string' ? cell.trim().slice(0, MAX_LABEL_LEN) : ''
    out[i] = s
  }
  return out
}

/** Normaliza JSON guardado en BD al conteo actual de portales. */
export function normalizePortalLabelsFromDb(raw: unknown, portalCount: number): string[] {
  return parsePortalLabels(raw, portalCount)
}

/**
 * Valores para un desplegable de portal (app vecino / presidente).
 * null = un solo portal sin nombre en la comunidad → mejor texto libre.
 */
export function communityPortalSelectOptions(
  portalCount: number,
  portalLabelsRaw: unknown,
): string[] | null {
  const n = Math.min(MAX_PORTALS, Math.max(1, portalCount))
  const labels = normalizePortalLabelsFromDb(portalLabelsRaw, n)
  if (labels.length < 1) return null
  const hasNamed = labels.some((s) => s.trim().length > 0)
  if (labels.length === 1 && !hasNamed) return null
  return labels.map((s, i) => (s.trim() ? s.trim() : `Portal ${i + 1}`))
}
