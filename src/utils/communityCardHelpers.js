/** Misma lógica que en Admin.jsx para preview de portales en tarjetas. */
export function normalizePortalLabelsFromApi(raw, portalCount) {
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const out = Array.from({ length: n }, () => '')
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < n; i += 1) {
    const s = typeof raw[i] === 'string' ? raw[i].trim().slice(0, 64) : ''
    out[i] = s
  }
  return out
}

export function portalsAliasesPreview(portalCount, portalLabels) {
  const n = Number(portalCount) || 1
  const labels = normalizePortalLabelsFromApi(portalLabels, n)
  const parts = labels.map((label, i) => {
    const t = label && String(label).trim()
    return t || `Portal ${i + 1}`
  })
  if (parts.length <= 5) return parts.join(' · ')
  return `${parts.slice(0, 5).join(' · ')}…`
}

export function formatPresidentOnCard(c) {
  const pp = (c.presidentPortal || '').trim()
  const ps = (c.presidentPiso || '').trim()
  if (pp && ps) return `vivienda: portal ${pp} · piso ${ps}`
  const em = (c.presidentEmail || '').trim()
  if (em) return `${em} (legado correo)`
  return '—'
}

export function formatPlanExpiresForCard(iso) {
  if (iso == null || iso === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  return new Date(Date.UTC(y, mo - 1, da)).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function spacesPreview(customLocations) {
  if (!Array.isArray(customLocations) || customLocations.length === 0) return '—'
  return customLocations
    .map((x) => (typeof x?.name === 'string' ? x.name : ''))
    .filter(Boolean)
    .slice(0, 4)
    .join(', ')
}
