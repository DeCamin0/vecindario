/** Pádel: límites en horas con paso 0,5 (1 · 1,5 · 2 · 2,5 …). */

export const PADEL_HOURS_STEP = 0.5
export const PADEL_HOURS_MIN = 1
export const PADEL_HOURS_MAX = 24

export function padelHoursToNumber(raw) {
  if (raw == null || raw === '') return NaN
  if (typeof raw === 'number') return raw
  const s = String(raw).trim().replace(',', '.')
  if (!s) return NaN
  return Number.parseFloat(s)
}

export function clampPadelHours(n) {
  if (!Number.isFinite(n)) return PADEL_HOURS_MIN
  const rounded = Math.round(n / PADEL_HOURS_STEP) * PADEL_HOURS_STEP
  if (rounded < PADEL_HOURS_MIN) return PADEL_HOURS_MIN
  if (rounded > PADEL_HOURS_MAX) return PADEL_HOURS_MAX
  return rounded
}

export function parsePadelHoursFormValue(raw, fallback = 2) {
  const fbRaw = padelHoursToNumber(fallback)
  const fb = Number.isFinite(fbRaw) ? clampPadelHours(fbRaw) : clampPadelHours(fallback)
  const n = padelHoursToNumber(raw)
  if (!Number.isFinite(n)) return fb
  return clampPadelHours(n)
}

/** Valor para `<input>` al cargar desde API (1.5, 2, …). */
export function formatPadelHoursInputValue(raw, fallback = 2) {
  return String(parsePadelHoursFormValue(raw, fallback))
}

export function formatPadelHoursDisplay(raw, fallback = 2) {
  const v = parsePadelHoursFormValue(raw, fallback)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** Permite dígitos y un separador decimal (, o .). */
export function sanitizePadelHoursInput(raw) {
  let s = String(raw ?? '').replace(',', '.')
  s = s.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) {
    const intPart = s.slice(0, dot)
    const decPart = s.slice(dot + 1).replace(/\./g, '').slice(0, 1)
    s = decPart.length ? `${intPart}.${decPart}` : `${intPart}.`
  }
  return s.slice(0, 5)
}
