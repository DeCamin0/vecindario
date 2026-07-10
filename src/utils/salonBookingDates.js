/** Antelación por defecto (espacios legacy sin campo en customLocations). */
export const SALON_DEFAULT_MAX_DAYS = 14

/** Tope práctico cuando el espacio no tiene límite de antelación activado. */
export const SALON_UNLIMITED_MAX_DAYS = 365

export function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addLocalDays(start, n) {
  const x = new Date(start)
  x.setDate(x.getDate() + n)
  return x
}

export function localDateKeyFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function resolveCustomLocationMaxDays(loc) {
  if (!loc || typeof loc !== 'object') return SALON_DEFAULT_MAX_DAYS
  if ('maxDaysInAdvance' in loc) {
    if (loc.maxDaysInAdvance === null) return SALON_UNLIMITED_MAX_DAYS
    const n = Number(loc.maxDaysInAdvance)
    if (Number.isFinite(n) && n >= 1) return Math.min(SALON_UNLIMITED_MAX_DAYS, Math.trunc(n))
  }
  return SALON_DEFAULT_MAX_DAYS
}

/**
 * @param {{ minDaysInAdvance?: number | null } | null | undefined} loc
 */
export function resolveCustomLocationMinDays(loc) {
  if (!loc || typeof loc !== 'object') return 0
  if (loc.minDaysInAdvance === null || loc.minDaysInAdvance === undefined) return 0
  const n = Number(loc.minDaysInAdvance)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(365, Math.trunc(n))
}

/**
 * @param {string | null | undefined} dateKey YYYY-MM-DD
 * @param {number} minDaysInAdvance
 * @param {number} maxDaysInAdvance
 */
export function isDateInSalonBookableWindow(dateKey, minDaysInAdvance, maxDaysInAdvance, now = new Date()) {
  const min = Math.max(0, Number(minDaysInAdvance) || 0)
  const max = Math.max(0, Number(maxDaysInAdvance) || SALON_DEFAULT_MAX_DAYS)
  const today = startOfLocalDay(now)
  const earliest = addLocalDays(today, min)
  const latest = addLocalDays(today, max)
  const parts = String(dateKey ?? '').split('-').map(Number)
  if (parts.length < 3) return false
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  return date >= earliest && date <= latest
}

/** ¿La fecha cae en [hoy + min, hoy + max]? */
export function isDateInBookableWindow(dateKey, maxDaysInAdvance, now = new Date(), minDaysInAdvance = 0) {
  return isDateInSalonBookableWindow(dateKey, minDaysInAdvance, maxDaysInAdvance, now)
}

/**
 * @param {string | null | undefined} facilityId
 * @param {unknown[] | null | undefined} customLocations
 */
export function resolveMaxDaysForSalonFacility(facilityId, customLocations) {
  if (typeof facilityId === 'string' && facilityId.startsWith('custom:')) {
    const sid = facilityId.slice('custom:'.length)
    const loc = Array.isArray(customLocations)
      ? customLocations.find((l) => l && typeof l === 'object' && String(l.id ?? '').trim() === sid)
      : null
    return resolveCustomLocationMaxDays(loc)
  }
  if (facilityId === 'meeting') return 14
  if (facilityId === 'social') return 5
  return SALON_DEFAULT_MAX_DAYS
}

/** Meses (YYYY-MM) con al menos un día reservable en la ventana. */
export function buildBookableMonthOptions(maxDaysInAdvance, now = new Date()) {
  const max = Math.max(0, Number(maxDaysInAdvance) || SALON_DEFAULT_MAX_DAYS)
  const today = startOfLocalDay(now)
  const end = addLocalDays(today, max)
  const months = []
  let cur = new Date(today.getFullYear(), today.getMonth(), 1)
  const endMonthStart = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= endMonthStart) {
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const labelRaw = cur.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1)
    months.push({ value: ym, label })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return months
}

/** Días reservables dentro de un mes y la ventana de antelación. */
export function buildBookableDayOptions(yearMonth, maxDaysInAdvance, now = new Date(), minDaysInAdvance = 0) {
  const max = Math.max(0, Number(maxDaysInAdvance) || SALON_DEFAULT_MAX_DAYS)
  const min = Math.max(0, Number(minDaysInAdvance) || 0)
  const today = startOfLocalDay(now)
  const earliest = addLocalDays(today, min)
  const end = addLocalDays(today, max)
  const parts = String(yearMonth ?? '').split('-').map(Number)
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return []
  const [y, m] = parts
  const daysInMonth = new Date(y, m, 0).getDate()
  const out = []
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(y, m - 1, d)
    if (date < earliest || date > end) continue
    const key = localDateKeyFromParts(y, m, d)
    const labelRaw = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
    const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1)
    out.push({ key, label, dayNum: d })
  }
  return out
}

export const SALON_WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function parseYearMonth(yearMonth) {
  const parts = String(yearMonth ?? '').split('-').map(Number)
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return { y: parts[0], m: parts[1] }
}

export function formatYearMonthLabel(yearMonth) {
  const p = parseYearMonth(yearMonth)
  if (!p) return ''
  const d = new Date(p.y, p.m - 1, 1)
  const raw = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function currentYearMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function shiftYearMonth(yearMonth, delta) {
  const p = parseYearMonth(yearMonth)
  if (!p) return currentYearMonth()
  const d = new Date(p.y, p.m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getFirstWeekdayOfMonth(y, m) {
  return new Date(y, m - 1, 1).getDay()
}

export function getDaysInMonthCount(y, m) {
  return new Date(y, m, 0).getDate()
}

/** Celdas del mes: vacías al inicio + un objeto por día. */
export function buildSalonCalendarCells(yearMonth, maxDaysInAdvance, now = new Date(), minDaysInAdvance = 0) {
  const p = parseYearMonth(yearMonth)
  if (!p) return []
  const { y, m } = p
  const leading = getFirstWeekdayOfMonth(y, m)
  const total = getDaysInMonthCount(y, m)
  const cells = []
  for (let i = 0; i < leading; i += 1) cells.push({ type: 'empty', key: `e-${i}` })
  const todayKey = localDateKeyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
  for (let d = 1; d <= total; d += 1) {
    const key = localDateKeyFromParts(y, m, d)
    const inWindow = isDateInSalonBookableWindow(key, minDaysInAdvance, maxDaysInAdvance, now)
    const isPast = key < todayKey
    const isTooSoon = !isPast && !inWindow
    cells.push({
      type: 'day',
      key,
      dayNum: d,
      inWindow,
      isPast,
      isTooSoon,
      isToday: key === todayKey,
      selectable: inWindow && !isPast,
    })
  }
  return cells
}

export function canNavigateSalonMonthPrev(yearMonth) {
  return yearMonth > currentYearMonth()
}

export function canNavigateSalonMonthNext(yearMonth, maxDaysInAdvance, now = new Date()) {
  const p = parseYearMonth(yearMonth)
  if (!p) return false
  const max = Math.max(0, Number(maxDaysInAdvance) || SALON_DEFAULT_MAX_DAYS)
  const end = addLocalDays(startOfLocalDay(now), max)
  const nextMonthStart = new Date(p.y, p.m, 1)
  const endMonthStart = new Date(end.getFullYear(), end.getMonth(), 1)
  return nextMonthStart <= endMonthStart
}

/** Primer día selectable en el mes (para auto-selección). */
export function firstSelectableDayInMonth(yearMonth, maxDaysInAdvance, isSelectable, now = new Date(), minDaysInAdvance = 0) {
  const p = parseYearMonth(yearMonth)
  if (!p) return null
  const total = getDaysInMonthCount(p.y, p.m)
  for (let d = 1; d <= total; d += 1) {
    const key = localDateKeyFromParts(p.y, p.m, d)
    if (!isDateInSalonBookableWindow(key, minDaysInAdvance, maxDaysInAdvance, now)) continue
    if (typeof isSelectable === 'function' && !isSelectable(key)) continue
    return key
  }
  return null
}
