/** Pádel: límites en horas con paso 0,5 (1 · 1,5 · 2 · 2,5 …). */

export const PADEL_HOURS_STEP = 0.5
export const PADEL_HOURS_MIN = 1
export const PADEL_HOURS_MAX = 24

export function padelHoursToNumber(raw: unknown): number {
  if (raw == null) return NaN
  if (typeof raw === 'number') return raw
  if (typeof raw === 'object') {
    const o = raw as { toNumber?: () => number }
    if (typeof o.toNumber === 'function') return o.toNumber()
  }
  const s = String(raw).trim().replace(',', '.')
  if (!s) return NaN
  return Number.parseFloat(s)
}

export function clampPadelHours(n: number): number {
  if (!Number.isFinite(n)) return PADEL_HOURS_MIN
  const rounded = Math.round(n / PADEL_HOURS_STEP) * PADEL_HOURS_STEP
  if (rounded < PADEL_HOURS_MIN) return PADEL_HOURS_MIN
  if (rounded > PADEL_HOURS_MAX) return PADEL_HOURS_MAX
  return rounded
}

export function parsePadelHoursField(raw: unknown, fallback: unknown): number {
  const fbRaw = padelHoursToNumber(fallback)
  const fb = Number.isFinite(fbRaw) ? clampPadelHours(fbRaw) : 2
  if (raw === undefined || raw === null || raw === '') return fb
  const n = padelHoursToNumber(raw)
  if (!Number.isFinite(n)) return fb
  return clampPadelHours(n)
}

/** Número JSON (no string Decimal) para API pública y clientes. */
export function padelHoursForJson(raw: unknown, fallback = 2): number {
  const n = padelHoursToNumber(raw)
  return Number.isFinite(n) ? clampPadelHours(n) : fallback
}
