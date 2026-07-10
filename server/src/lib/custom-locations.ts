import { randomBytes } from 'node:crypto'

export type CustomTimeSlot = {
  id: string
  label: string
  start: string
  end: string
}

export type CustomLocationItem = {
  id: string
  name: string
  /** null = sin límite explícito; omitido en legacy = default cliente (14 días). */
  maxDaysInAdvance?: number | null
  /** Días mínimos antes de la fecha (0 = hoy permitido). */
  minDaysInAdvance?: number | null
  /** Normas / regulamento mostrado al vecino antes de reservar. */
  rulesText?: string | null
  /** Tasa de uso informativa (€). */
  usageFeeEur?: number | null
  /** Fianza informativa (€). */
  depositEur?: number | null
  /** Franjas propias; si falta, el cliente usa mañana/tarde/noche por defecto. */
  timeSlots?: CustomTimeSlot[] | null
}

export type ResolvedSalonTimeSlot = CustomTimeSlot & {
  startMinute: number
  endMinute: number
  range: string
}

export const DEFAULT_SALON_TIME_SLOTS: CustomTimeSlot[] = [
  { id: 'morning', label: 'Mañana', start: '08:00', end: '12:00' },
  { id: 'afternoon', label: 'Tarde', start: '12:00', end: '18:00' },
  { id: 'evening', label: 'Noche', start: '18:00', end: '22:00' },
]

const MAX_ITEMS = 30
const MAX_NAME_LEN = 120
const MAX_ADVANCE_DAYS = 365
const MAX_RULES_LEN = 8000
const MAX_TIME_SLOTS = 8
const MAX_FEE_EUR = 9999

export const SALON_DEFAULT_MAX_DAYS = 14
export const SALON_UNLIMITED_MAX_DAYS = 365

function parseMaxDaysInAdvance(raw: unknown): number | null | undefined {
  if (raw === null) return null
  if (raw === undefined || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(MAX_ADVANCE_DAYS, Math.trunc(n))
}

function parseMinDaysInAdvance(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.min(MAX_ADVANCE_DAYS, Math.trunc(n))
}

function parseOptionalFeeEur(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.min(MAX_FEE_EUR, Math.round(n * 100) / 100)
}

function parseRulesText(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().slice(0, MAX_RULES_LEN)
  return t || null
}

function padHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function parseTimeHHMM(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
  return padHHMM(h, mi)
}

export function timeHHMMToMinutes(t: string): number | null {
  const p = parseTimeHHMM(t)
  if (!p) return null
  const [h, m] = p.split(':').map(Number)
  return h * 60 + m
}

function formatMinuteRange(startMin: number, endMin: number): string {
  const f = (m: number) => padHHMM(Math.floor(m / 60), m % 60)
  return `${f(startMin)} – ${f(endMin)}`
}

function slugId(s: string): string {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 48)
  return t || `loc-${randomBytes(3).toString('hex')}`
}

function slugSlotId(label: string, start: string, end: string): string {
  const base = `${label}-${start}-${end}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40)
  return base || `slot-${randomBytes(2).toString('hex')}`
}

function parseCustomTimeSlots(raw: unknown): CustomTimeSlot[] | null | undefined {
  if (raw === null) return null
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: CustomTimeSlot[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as { id?: unknown; label?: unknown; start?: unknown; end?: unknown }
    const start = parseTimeHHMM(o.start)
    const end = parseTimeHHMM(o.end)
    if (!start || !end) continue
    const startMin = timeHHMMToMinutes(start)!
    const endMin = timeHHMMToMinutes(end)!
    if (endMin <= startMin) continue
    const label =
      typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 80) : `${start}–${end}`
    let id = typeof o.id === 'string' ? o.id.trim().slice(0, 64) : ''
    if (!id || !/^[_a-z0-9-]+$/i.test(id)) id = slugSlotId(label, start, end)
    let uniqueId = id
    let n = 0
    while (seen.has(uniqueId)) {
      n += 1
      uniqueId = `${id}-${n}`
    }
    seen.add(uniqueId)
    out.push({ id: uniqueId, label, start, end })
    if (out.length >= MAX_TIME_SLOTS) break
  }
  return out.length > 0 ? out : undefined
}

/** Valida y normaliza lista desde el cliente (crear / editar comunidad). */
export function parseCustomLocations(raw: unknown): CustomLocationItem[] {
  if (!Array.isArray(raw)) return []
  const out: CustomLocationItem[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, MAX_NAME_LEN) : ''
    if (!name) continue

    let id = typeof o.id === 'string' ? o.id.trim().slice(0, 64) : ''
    if (!id || !/^[_a-z0-9-]+$/i.test(id)) {
      id = slugId(name)
    }
    let uniqueId = id
    let n = 0
    while (seen.has(uniqueId)) {
      n += 1
      uniqueId = `${id}-${n}`
    }
    seen.add(uniqueId)

    const entry: CustomLocationItem = { id: uniqueId, name }
    const maxDays = parseMaxDaysInAdvance(o.maxDaysInAdvance)
    if (maxDays === null) entry.maxDaysInAdvance = null
    else if (maxDays !== undefined) entry.maxDaysInAdvance = maxDays

    const minDays = parseMinDaysInAdvance(o.minDaysInAdvance)
    if (minDays != null && minDays > 0) entry.minDaysInAdvance = minDays

    const rules = parseRulesText(o.rulesText)
    if (rules) entry.rulesText = rules

    const usageFee = parseOptionalFeeEur(o.usageFeeEur)
    if (usageFee != null && usageFee > 0) entry.usageFeeEur = usageFee

    const deposit = parseOptionalFeeEur(o.depositEur)
    if (deposit != null && deposit > 0) entry.depositEur = deposit

    const slots = parseCustomTimeSlots(o.timeSlots)
    if (slots && slots.length > 0) entry.timeSlots = slots

    out.push(entry)
    if (out.length >= MAX_ITEMS) break
  }

  return out
}

export function findCustomLocationByFacilityId(
  facilityId: string,
  locations: CustomLocationItem[] | unknown,
): CustomLocationItem | null {
  if (typeof facilityId !== 'string' || !facilityId.startsWith('custom:')) return null
  const sid = facilityId.slice('custom:'.length).trim()
  if (!sid || !Array.isArray(locations)) return null
  const loc = locations.find(
    (l) => l && typeof l === 'object' && String((l as CustomLocationItem).id ?? '').trim() === sid,
  )
  return loc && typeof loc === 'object' ? (loc as CustomLocationItem) : null
}

function inferUsageFeeEurFromRules(rulesText: string | null | undefined): number | null {
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

export function resolveFacilityFeesFromLocation(loc: CustomLocationItem | null | undefined): {
  usageFeeEur: number | null
  depositEur: number | null
} {
  let usageFeeEur =
    loc?.usageFeeEur != null && Number(loc.usageFeeEur) > 0 ? Number(loc.usageFeeEur) : null
  const depositEur =
    loc?.depositEur != null && Number(loc.depositEur) > 0 ? Number(loc.depositEur) : null
  if (usageFeeEur == null && loc?.rulesText) {
    usageFeeEur = inferUsageFeeEurFromRules(loc.rulesText)
  }
  return { usageFeeEur, depositEur }
}

export function resolveCustomLocationMaxDays(loc: CustomLocationItem | null | undefined): number {
  if (!loc || typeof loc !== 'object') return SALON_DEFAULT_MAX_DAYS
  if ('maxDaysInAdvance' in loc) {
    if (loc.maxDaysInAdvance === null) return SALON_UNLIMITED_MAX_DAYS
    const n = Number(loc.maxDaysInAdvance)
    if (Number.isFinite(n) && n >= 1) return Math.min(SALON_UNLIMITED_MAX_DAYS, Math.trunc(n))
  }
  return SALON_DEFAULT_MAX_DAYS
}

export function resolveCustomLocationMinDays(loc: CustomLocationItem | null | undefined): number {
  if (!loc || typeof loc !== 'object') return 0
  if (loc.minDaysInAdvance === null || loc.minDaysInAdvance === undefined) return 0
  const n = Number(loc.minDaysInAdvance)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(MAX_ADVANCE_DAYS, Math.trunc(n))
}

export function resolveSalonAdvanceWindow(loc: CustomLocationItem | null | undefined): {
  minDays: number
  maxDays: number
} {
  const maxDays = resolveCustomLocationMaxDays(loc)
  let minDays = resolveCustomLocationMinDays(loc)
  if (minDays > maxDays) minDays = maxDays
  return { minDays, maxDays }
}

export function resolveSalonTimeSlotsForLocation(
  loc: CustomLocationItem | null | undefined,
): ResolvedSalonTimeSlot[] {
  const raw =
    loc?.timeSlots && Array.isArray(loc.timeSlots) && loc.timeSlots.length > 0
      ? loc.timeSlots
      : DEFAULT_SALON_TIME_SLOTS
  const out: ResolvedSalonTimeSlot[] = []
  for (const slot of raw) {
    const start = parseTimeHHMM(slot.start)
    const end = parseTimeHHMM(slot.end)
    if (!start || !end) continue
    const startMinute = timeHHMMToMinutes(start)!
    const endMinute = timeHHMMToMinutes(end)!
    if (endMinute <= startMinute) continue
    out.push({
      id: slot.id,
      label: slot.label,
      start,
      end,
      startMinute,
      endMinute,
      range: formatMinuteRange(startMinute, endMinute),
    })
  }
  return out
}

function localDaysBetween(today: Date, booking: Date): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const b = new Date(booking.getFullYear(), booking.getMonth(), booking.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Valida ventana de antelación para salón / espacio custom. */
export function validateSalonBookingAdvance(
  bookingDateUtc: Date,
  loc: CustomLocationItem | null | undefined,
  now = new Date(),
): string | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const bookingLocal = new Date(
    bookingDateUtc.getUTCFullYear(),
    bookingDateUtc.getUTCMonth(),
    bookingDateUtc.getUTCDate(),
  )
  const daysAhead = localDaysBetween(today, bookingLocal)
  const { minDays, maxDays } = resolveSalonAdvanceWindow(loc)
  if (daysAhead < minDays) {
    return minDays === 1
      ? 'La reserva debe ser al menos con 1 día de antelación.'
      : `La reserva debe ser al menos ${minDays} días después de hoy.`
  }
  if (daysAhead > maxDays) {
    return `La reserva no puede superar ${maxDays} días de antelación.`
  }
  return null
}

/** Comprueba que el tramo encaja en las franjas configuradas del espacio. */
export function validateSalonSlotAgainstLocation(
  loc: CustomLocationItem | null | undefined,
  startMinute: number,
  endMinute: number,
  slotKey: string | null,
): string | null {
  const slots = resolveSalonTimeSlotsForLocation(loc)
  if (slots.length === 0) return 'Este espacio no tiene franjas horarias configuradas.'
  const match = slots.find(
    (s) =>
      s.startMinute === startMinute &&
      s.endMinute === endMinute &&
      (!slotKey || s.id === slotKey),
  )
  if (!match && slotKey) {
    const byKey = slots.find((s) => s.id === slotKey)
    if (byKey && byKey.startMinute === startMinute && byKey.endMinute === endMinute) return null
  }
  if (match) return null
  if (slotKey) {
    const byKeyOnly = slots.find((s) => s.id === slotKey)
    if (byKeyOnly) return 'El tramo horario no coincide con la franja configurada.'
  }
  return 'Tramo horario no permitido para este espacio.'
}

export function isSalonLikeFacilityId(facilityId: string): boolean {
  if (!facilityId || typeof facilityId !== 'string') return false
  if (facilityId === 'gym' || facilityId === 'padel' || /^padel:\d+$/.test(facilityId)) return false
  return facilityId === 'meeting' || facilityId === 'social' || facilityId.startsWith('custom:')
}
