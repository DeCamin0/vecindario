/**
 * Configuración de espacios / salones (customLocations) — espejo cliente web/móvil.
 */

import { resolveCustomLocationMaxDays, resolveCustomLocationMinDays } from './salonBookingDates.js'

export const DEFAULT_SALON_TIME_SLOTS = [
  { id: 'morning', label: 'Mañana', start: '08:00', end: '12:00' },
  { id: 'afternoon', label: 'Tarde', start: '12:00', end: '18:00' },
  { id: 'evening', label: 'Noche', start: '18:00', end: '22:00' },
]

export function parseTimeHHMM(raw) {
  if (typeof raw !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

export function timeHHMMToMinutes(t) {
  const p = parseTimeHHMM(t)
  if (!p) return null
  const [h, m] = p.split(':').map(Number)
  return h * 60 + m
}

function formatMinuteRange(startMin, endMin) {
  const f = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${f(startMin)} – ${f(endMin)}`
}

export function findCustomLocationByFacilityId(facilityId, customLocations) {
  if (typeof facilityId !== 'string' || !facilityId.startsWith('custom:')) return null
  const sid = facilityId.slice('custom:'.length).trim()
  if (!sid || !Array.isArray(customLocations)) return null
  return (
    customLocations.find((l) => l && typeof l === 'object' && String(l.id ?? '').trim() === sid) ?? null
  )
}

/** Si falta Tasa uso (€) en Admin, intenta leerla del texto de normas (ej. La Joya: «utilización de 15 €»). */
export function inferUsageFeeEurFromRules(rulesText) {
  if (typeof rulesText !== 'string' || !rulesText.trim()) return null
  const patterns = [
    /abono\s+por\s+su\s+utilizaci[oó]n\s+de\s+(\d+(?:[.,]\d+)?)\s*€/i,
    /utilizaci[oó]n[^.\n]{0,60}?(\d+(?:[.,]\d+)?)\s*€/i,
    /tasa\s+de\s+uso[^.\n]{0,40}?(\d+(?:[.,]\d+)?)\s*€/i,
  ]
  for (const re of patterns) {
    const m = re.exec(rulesText)
    if (m) {
      const n = Number.parseFloat(String(m[1]).replace(',', '.'))
      if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
    }
  }
  return null
}

export function resolveFacilityFeesFromLocation(loc) {
  let usageFeeEur =
    loc?.usageFeeEur != null && Number(loc.usageFeeEur) > 0 ? Number(loc.usageFeeEur) : null
  const depositEur =
    loc?.depositEur != null && Number(loc.depositEur) > 0 ? Number(loc.depositEur) : null
  const rulesText = typeof loc?.rulesText === 'string' ? loc.rulesText.trim() : ''
  if (usageFeeEur == null && rulesText) {
    usageFeeEur = inferUsageFeeEurFromRules(rulesText)
  }
  return { usageFeeEur, depositEur, rulesText }
}

export { resolveCustomLocationMinDays } from './salonBookingDates.js'

export function resolveSalonAdvanceWindow(loc) {
  const maxDays = resolveCustomLocationMaxDays(loc)
  let minDays = resolveCustomLocationMinDays(loc)
  if (minDays > maxDays) minDays = maxDays
  return { minDays, maxDays }
}

export function resolveSalonTimeSlotsForLocation(loc) {
  const raw =
    loc?.timeSlots && Array.isArray(loc.timeSlots) && loc.timeSlots.length > 0
      ? loc.timeSlots
      : DEFAULT_SALON_TIME_SLOTS
  const out = []
  for (const slot of raw) {
    const start = parseTimeHHMM(slot.start)
    const end = parseTimeHHMM(slot.end)
    if (!start || !end) continue
    const startMinute = timeHHMMToMinutes(start)
    const endMinute = timeHHMMToMinutes(end)
    if (startMinute == null || endMinute == null || endMinute <= startMinute) continue
    out.push({
      id: slot.id,
      label: slot.label || `${start}–${end}`,
      start,
      end,
      startMinute,
      endMinute,
      range: formatMinuteRange(startMinute, endMinute),
    })
  }
  return out
}

export function slotMinuteRangeFromConfig(spaceConfig, slotId) {
  if (!spaceConfig || !slotId) return null
  const slots = spaceConfig.timeSlots
  if (Array.isArray(slots)) {
    const hit = slots.find((s) => s.id === slotId)
    if (hit) return { startMin: hit.startMinute, endMin: hit.endMinute }
  }
  if (slotId === 'morning') return { startMin: 8 * 60, endMin: 12 * 60 }
  if (slotId === 'afternoon') return { startMin: 12 * 60, endMin: 18 * 60 }
  if (slotId === 'evening') return { startMin: 18 * 60, endMin: 22 * 60 }
  return null
}

export function buildSpaceConfigForCustomFacility(facilityId, customLocations) {
  const loc = findCustomLocationByFacilityId(facilityId, customLocations)
  const maxDaysInAdvance = resolveCustomLocationMaxDays(loc)
  const minDaysInAdvance = resolveCustomLocationMinDays(loc)
  const timeSlots = resolveSalonTimeSlotsForLocation(loc)
  const { usageFeeEur, depositEur, rulesText } = resolveFacilityFeesFromLocation(loc)
  return {
    maxDaysInAdvance,
    minDaysInAdvance,
    timeSlots,
    timeSlotIds: timeSlots.map((s) => s.id),
    rulesText,
    usageFeeEur,
    depositEur,
  }
}

export function salonFacilityHasRegulations(spaceConfig) {
  if (!spaceConfig) return false
  return Boolean(
    (spaceConfig.rulesText && spaceConfig.rulesText.trim()) ||
      spaceConfig.usageFeeEur > 0 ||
      spaceConfig.depositEur > 0 ||
      spaceConfig.minDaysInAdvance > 0 ||
      (Array.isArray(spaceConfig.timeSlots) &&
        spaceConfig.timeSlots.length > 0 &&
        JSON.stringify(spaceConfig.timeSlots) !== JSON.stringify(resolveSalonTimeSlotsForLocation(null))),
  )
}
