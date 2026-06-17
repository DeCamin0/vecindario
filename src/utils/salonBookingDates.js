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

/**
 * @param {{ maxDaysInAdvance?: number | null } | null | undefined} loc
 * @returns {number} días hacia adelante (365 = sin límite explícito en admin)
 */
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
export function buildBookableDayOptions(yearMonth, maxDaysInAdvance, now = new Date()) {
  const max = Math.max(0, Number(maxDaysInAdvance) || SALON_DEFAULT_MAX_DAYS)
  const today = startOfLocalDay(now)
  const end = addLocalDays(today, max)
  const parts = String(yearMonth ?? '').split('-').map(Number)
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return []
  const [y, m] = parts
  const daysInMonth = new Date(y, m, 0).getDate()
  const out = []
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(y, m - 1, d)
    if (date < today || date > end) continue
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

/** ¿La fecha cae en [hoy, hoy + maxDays]? */
export function isDateInBookableWindow(dateKey, maxDaysInAdvance, now = new Date()) {
  const max = Math.max(0, Number(maxDaysInAdvance) || SALON_DEFAULT_MAX_DAYS)
  const today = startOfLocalDay(now)
  const end = addLocalDays(today, max)
  const parts = String(dateKey ?? '').split('-').map(Number)
  if (parts.length < 3) return false
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  return date >= today && date <= end
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

/** Celdas del mes: vacías al inicio + un objeto por día. */
export function buildSalonCalendarCells(yearMonth, maxDaysInAdvance, now = new Date()) {
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
    const inWindow = isDateInBookableWindow(key, maxDaysInAdvance, now)
    const isPast = key < todayKey
    cells.push({
      type: 'day',
      key,
      dayNum: d,
      inWindow,
      isPast,
      isToday: key === todayKey,
      selectable: inWindow && !isPast,
    })
  }
  return cells
}

/** Primer día selectable en el mes (para auto-selección). */
export function firstSelectableDayInMonth(yearMonth, maxDaysInAdvance, isSelectable, now = new Date()) {
  const p = parseYearMonth(yearMonth)
  if (!p) return null
  const total = getDaysInMonthCount(p.y, p.m)
  for (let d = 1; d <= total; d += 1) {
    const key = localDateKeyFromParts(p.y, p.m, d)
    if (!isDateInBookableWindow(key, maxDaysInAdvance, now)) continue
    if (typeof isSelectable === 'function' && !isSelectable(key)) continue
    return key
  }
  return null
}
