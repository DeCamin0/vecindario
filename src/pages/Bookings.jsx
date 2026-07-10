import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import {
  canManageCommunity,
  canActAsResident,
  canBookOnBehalfOfNeighbor,
} from '../context/AuthContext'
import { isGymAccessControlEnabled } from '../config/clientFeatures'
import { apiUrl } from '../config/api.js'
import { formatBookingMeta, mapActivityApiItem } from '../utils/bookingDisplay'
import { formatPadelHoursDisplay, parsePadelHoursFormValue, PADEL_HOURS_MIN } from '../utils/padelHours.js'
import { padelBookingOverlapsSlot } from '../utils/padelSlotOccupancy.js'
import {
  padelMaxSlotsSelectable,
  padelToggleSlotSelection,
  padelSlotsSortedByTime,
} from '../utils/padelMultiSlotSelection.js'
import {
  SALON_UNLIMITED_MAX_DAYS,
  isDateInBookableWindow,
  firstSelectableDayInMonth,
} from '../utils/salonBookingDates.js'
import {
  buildSpaceConfigForCustomFacility,
  salonFacilityHasRegulations,
  slotMinuteRangeFromConfig,
  findCustomLocationByFacilityId,
} from '../utils/salonFacilityConfig.js'
import {
  bookingHasConfiguredFees,
  facilityFeeConfigForBooking,
  formatDepositReturnedLabel,
} from '../utils/bookingFacilityPayments.js'
import SalonBookingCalendar from '../components/SalonBookingCalendar.jsx'
import './Bookings.css'

const DEFAULT_FACILITIES = [
  { id: 'padel', name: 'Pista de pádel', icon: '🎾' },
  { id: 'gym', name: 'Gimnasio', icon: '💪' },
]

const ALL_TIME_SLOTS = [
  { id: 'morning', label: 'Mañana', range: '08:00 – 12:00' },
  { id: 'afternoon', label: 'Tarde', range: '12:00 – 18:00' },
  { id: 'evening', label: 'Noche', range: '18:00 – 22:00' },
]

function formatMinuteRange(startMin, endMin) {
  const f = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${f(startMin)} – ${f(endMin)}`
}

function mapServerBookingRow(row) {
  const label =
    (row.slotLabel && String(row.slotLabel).trim()) ||
    formatMinuteRange(row.startMinute, row.endMinute)
  return {
    id: `bk-srv-${row.id}`,
    serverId: row.id,
    facility: row.facilityName || row.facilityId,
    facilityId: row.facilityId,
    date: row.bookingDate,
    timeSlot: row.slotKey || `min-${row.startMinute}-${row.endMinute}`,
    timeSlotLabel: label,
    userEmail: row.residentEmail || row.actorEmail,
    userName:
      row.residentName?.trim() ||
      (row.residentEmail || row.actorEmail
        ? String(row.residentEmail || row.actorEmail).split('@')[0]
        : undefined),
    ...(row.residentName ? { residentName: row.residentName.trim() } : {}),
    ...(row.actorPiso ? { piso: row.actorPiso } : {}),
    ...(row.actorPortal ? { portal: row.actorPortal } : {}),
    ...(row.bookedByName?.trim() ? { bookedByName: row.bookedByName.trim() } : {}),
    ...(row.vecindarioUserId != null ? { vecindarioUserId: row.vecindarioUserId } : {}),
    usageFeePaid: row.usageFeePaid === true,
    depositPaid: row.depositPaid === true,
    depositReturnedAt: row.depositReturnedAt ?? null,
    depositReturnedByName: row.depositReturnedByName?.trim() || null,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    recordedAt: row.createdAt,
    fromServer: true,
  }
}

function bookingCancelConfirmMessage(item) {
  const when = item.date
    ? `${item.date}${item.timeSlotLabel ? `, ${item.timeSlotLabel}` : ''}`
    : item.timeSlotLabel || 'esta reserva'
  return `¿Cancelar la reserva de ${item.facility || 'espacio'} (${when})? El tramo quedará libre para otros vecinos.`
}

function BookingPaymentStatus({
  item,
  customLocations,
  isStaff,
  onMarkPayment,
  onDepositReturn,
  paymentActionBusyId,
}) {
  if (!bookingHasConfiguredFees(item, customLocations)) return null
  const fees = facilityFeeConfigForBooking(item, customLocations)
  const pendingDepositReturn = item.depositPaid && !item.depositReturnedAt
  const returnedLabel = formatDepositReturnedLabel(item.depositReturnedAt)
  const busy = paymentActionBusyId === item.serverId

  return (
    <div className="booking-payment-status" aria-label="Estado de tasas y fianza">
      {fees.usageFeeEur > 0 ? (
        <span
          className={`booking-payment-pill${item.usageFeePaid ? ' booking-payment-pill--ok' : ' booking-payment-pill--owe'}`}
        >
          Tasa {fees.usageFeeEur} € · {item.usageFeePaid ? 'Cobrada' : 'Debe'}
        </span>
      ) : null}
      {fees.depositEur > 0 ? (
        <span
          className={`booking-payment-pill${
            item.depositPaid
              ? item.depositReturnedAt
                ? ' booking-payment-pill--ok'
                : ' booking-payment-pill--pending'
              : ' booking-payment-pill--owe'
          }`}
        >
          Fianza {fees.depositEur} € ·{' '}
          {!item.depositPaid
            ? 'Debe'
            : item.depositReturnedAt
              ? `Devuelta${returnedLabel ? ` · ${returnedLabel}` : ''}`
              : 'Pend. devolución'}
        </span>
      ) : null}
      {isStaff && onMarkPayment ? (
        <div className="booking-payment-actions">
          {!item.usageFeePaid && fees.usageFeeEur > 0 ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm booking-payment-action-btn"
              disabled={busy}
              onClick={() => onMarkPayment(item, 'usageFeePaid')}
            >
              {busy ? 'Guardando…' : 'Marcar tasa cobrada'}
            </button>
          ) : null}
          {!item.depositPaid && fees.depositEur > 0 ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm booking-payment-action-btn"
              disabled={busy}
              onClick={() => onMarkPayment(item, 'depositPaid')}
            >
              {busy ? 'Guardando…' : 'Marcar fianza entregada'}
            </button>
          ) : null}
          {pendingDepositReturn && onDepositReturn ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm booking-payment-action-btn"
              disabled={busy}
              onClick={() => onDepositReturn(item)}
            >
              {busy ? 'Guardando…' : 'Marcar devolución'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Con sesión + comunidad, la reserva se guarda en BD (mismo origen que Actividad). */
function rolePersistsBookingsToServer(role) {
  return (
    role === 'resident' ||
    role === 'president' ||
    role === 'concierge' ||
    role === 'super_admin'
  )
}

function padTimeStr(s) {
  const t = String(s ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

function parseTimeToMinutes(t) {
  const p = padTimeStr(t)
  if (!p) return null
  const [h, mi] = p.split(':').map(Number)
  return h * 60 + mi
}

function formatMinAsTime(totalMin) {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Horas máx. por reserva (1–24, paso 0,5) desde la config API. */
function padelMaxBookingHoursFromConfig(cfg) {
  return parsePadelHoursFormValue(cfg?.padelMaxHoursPerBooking, 2)
}

/**
 * Tramos de pádel: desde hora apertura hasta cierre, en bloques de `maxHoursPerBooking` horas.
 * Si apertura/cierre no son válidos, se usa 08:00–22:00 como respaldo.
 */
function buildPadelSlotsFromOpenCloseAndDuration(openTime, closeTime, maxHoursPerBooking) {
  let openM = parseTimeToMinutes(openTime)
  let closeM = parseTimeToMinutes(closeTime)
  if (openM == null || closeM == null || openM >= closeM) {
    openM = 8 * 60
    closeM = 22 * 60
  }

  const h = Number(maxHoursPerBooking)
  const durationMin =
    Math.min(24, Math.max(PADEL_HOURS_MIN, Number.isFinite(h) ? h : 2)) * 60

  const slots = []
  let cur = openM
  while (cur + durationMin <= closeM) {
    const endSlot = cur + durationMin
    const range = `${formatMinAsTime(cur)} – ${formatMinAsTime(endSlot)}`
    slots.push({
      id: `padel-${cur}-${endSlot}`,
      label: range,
      range,
      startMin: cur,
      endMin: endSlot,
    })
    cur += durationMin
  }
  return slots
}

function slotStartLocalDate(dateKey, startMin) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const h = Math.floor(startMin / 60)
  const mi = startMin % 60
  return new Date(y, mo - 1, d, h, mi, 0, 0)
}

/** Ventana en días naturales desde hoy hacia adelante (p. ej. 48 → 2). No es «horas hasta el inicio del tramo». */
function padelHorizonDaysFromConfigHours(hours) {
  const h = Number(hours)
  if (!Number.isFinite(h) || h <= 0) return 7
  return Math.min(14, Math.max(1, Math.ceil(h / 24)))
}

/** Ayer: sin tramos. Hoy: solo tramos que aún no han empezado. Futuro: todos según horario. */
function filterPadelSlotsForBookableDate(slots, dateKey, now = new Date()) {
  const todayKey = localDateKey(now)
  if (dateKey < todayKey) return []
  if (dateKey > todayKey) return slots
  const t = now.getTime()
  return slots.filter((s) => slotStartLocalDate(dateKey, s.startMin).getTime() > t)
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Ayer + hoy: siempre los dos primeros en la tira de pádel; no dependen de la antelación. */
function padelFixedPrefixKeys(todayStart, addDays) {
  return [
    localDateKey(addDays(todayStart, -1)),
    localDateKey(todayStart),
  ]
}

function padelFutureKeysFromTomorrow(todayStart, addDays, nFuture) {
  const keys = []
  const n = Math.max(0, Math.min(14, nFuture))
  for (let i = 1; i <= n; i += 1) {
    keys.push(localDateKey(addDays(todayStart, i)))
  }
  return keys
}

/**
 * Tira pádel: ayer + hoy + días futuros según ventana (horas en BD → días: 48 = 2 días adelante).
 */
function padelCalendarDayKeys(configHours, maxDaysInAdvanceRoll, now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const addDays = (start, n) => {
    const x = new Date(start)
    x.setDate(x.getDate() + n)
    return x
  }

  const prefix = padelFixedPrefixKeys(todayStart, addDays)
  const rollN = Math.max(1, Math.min(14, (maxDaysInAdvanceRoll ?? 7) + 1))
  const h = Number(configHours)
  const nFuture =
    !Number.isFinite(h) || h <= 0
      ? rollN
      : Math.min(14, Math.max(1, padelHorizonDaysFromConfigHours(h)))

  return [...prefix, ...padelFutureKeysFromTomorrow(todayStart, addDays, nFuture)]
}

/** Conserje / gestión: mismos días que el vecino más hasta ~120 días atrás para consultar ocupación. */
function padelConciergeDayKeys(configHours, maxDaysInAdvanceRoll, now = new Date()) {
  const base = new Set(padelCalendarDayKeys(configHours, maxDaysInAdvanceRoll, now))
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const addDays = (start, n) => {
    const x = new Date(start)
    x.setDate(x.getDate() + n)
    return x
  }
  for (let back = 1; back <= 120; back += 1) {
    base.add(localDateKey(addDays(todayStart, -back)))
  }
  return [...base].sort()
}

function dateStripEntriesFromKeys(keys) {
  return keys.map((key) => {
    const [y, mo, d] = key.split('-').map(Number)
    const date = new Date(y, mo - 1, d)
    return {
      key,
      day: DAY_LABELS[date.getDay()],
      num: date.getDate(),
      date,
    }
  })
}

/** Franjas y límites por tipo de espacio (demo); espacios personalizados usan el mismo patrón que sala. */
const SLOT_PRESETS = {
  padel: {
    timeSlotIds: ['morning', 'afternoon', 'evening'],
    maxDurationHours: 2,
    maxDaysInAdvance: 7,
  },
  gym: {
    timeSlotIds: ['morning', 'afternoon'],
    maxDurationHours: 1,
    maxDaysInAdvance: 3,
  },
  meeting: {
    timeSlotIds: ['morning', 'afternoon', 'evening'],
    maxDurationHours: 3,
    maxDaysInAdvance: 14,
  },
  social: {
    timeSlotIds: ['afternoon', 'evening'],
    maxDurationHours: 4,
    maxDaysInAdvance: 5,
  },
  customSpace: {
    timeSlotIds: ['morning', 'afternoon', 'evening'],
    maxDurationHours: 3,
    maxDaysInAdvance: 14,
  },
}

function getSlotConfigForFacility(facilityId, customLocations) {
  if (
    facilityId === 'padel' ||
    (typeof facilityId === 'string' && /^padel:\d+$/.test(facilityId))
  ) {
    return SLOT_PRESETS.padel
  }
  if (facilityId === 'gym') return SLOT_PRESETS.gym
  if (facilityId === 'meeting') return SLOT_PRESETS.meeting
  if (facilityId === 'social') return SLOT_PRESETS.social
  if (typeof facilityId === 'string' && facilityId.startsWith('custom:')) {
    return {
      ...SLOT_PRESETS.customSpace,
      ...buildSpaceConfigForCustomFacility(facilityId, customLocations),
      maxDurationHours: 3,
    }
  }
  return SLOT_PRESETS.customSpace
}

/** Deriva la lista de la comunidad (Super Admin: pádel, gimnasio, espacios propios). */
function buildFacilitiesFromApi(cfg) {
  const out = []
  const padelN = Math.min(50, Math.max(0, Number(cfg.padelCourtCount) || 0))
  for (let i = 1; i <= padelN; i += 1) {
    out.push({
      id: `padel:${i}`,
      name: padelN > 1 ? `Pista de pádel ${i}` : 'Pista de pádel',
      icon: '🎾',
    })
  }
  // Gimnasio solo si está activo el control en Admin («Gimnasio: Sí / Control activo»). Si es «No», no aparece ni tramos ni entrada/salida.
  if (cfg.gymAccessEnabled) {
    out.push({ id: 'gym', name: 'Gimnasio', icon: '💪' })
  }
  const customs = Array.isArray(cfg.customLocations) ? cfg.customLocations : []
  customs.forEach((loc) => {
    const sid = String(loc.id || '').trim()
    const sname = String(loc.name || '').trim()
    if (!sid || !sname) return
    out.push({
      id: `custom:${sid}`,
      name: sname,
      icon: '📌',
    })
  })
  return out
}

function facilityLabel(facilities, id) {
  return facilities.find((f) => f.id === id)?.name ?? id
}

function isPadelFacilityId(id) {
  return id === 'padel' || (typeof id === 'string' && /^padel:\d+$/.test(id))
}

/** Sala reuniones, salón social o espacio custom (no pádel ni gimnasio). */
function isSalonLikeFacility(id) {
  if (!id || typeof id !== 'string') return false
  if (id === 'gym' || isPadelFacilityId(id)) return false
  return id === 'meeting' || id === 'social' || id.startsWith('custom:')
}

function salonDayModeFromConfig(cfg) {
  return cfg && String(cfg.salonBookingMode || '').toLowerCase() === 'day'
}

const SALON_FULL_DAY_SLOT = 'full-day'

function bookingRecordFacilityId(b) {
  if (b.facilityId && String(b.facilityId).trim()) return String(b.facilityId).trim()
  return ''
}

/** Reserva de salón en modo día (servidor o local). */
function isSalonFullDayRecord(b) {
  if (b.timeSlot === SALON_FULL_DAY_SLOT || b.timeSlot === 'fullDay') return true
  if (typeof b.timeSlot === 'string' && /^min-0-1440$/i.test(b.timeSlot)) return true
  return false
}

function salonFullDayBookedForDate(allBookings, facilityId, ymd) {
  if (!facilityId || !ymd) return false
  return allBookings.some((b) => {
    if (b.date !== ymd) return false
    const fid = bookingRecordFacilityId(b)
    if (fid !== facilityId) return false
    return isSalonFullDayRecord(b)
  })
}

function findSalonFullDayBookingForDate(allBookings, facilityId, ymd) {
  if (!facilityId || !ymd) return undefined
  return allBookings.find((b) => {
    if (b.date !== ymd) return false
    if (bookingRecordFacilityId(b) !== facilityId) return false
    return isSalonFullDayRecord(b)
  })
}

/** Estado visual del día en calendario salón: free | partial | occupied | disabled */
function salonCalendarDayStatus(dateKey, facilityId, salonDayMode, allBookings, slotIds) {
  if (!dateKey || !facilityId) return 'disabled'
  if (salonDayMode) {
    return salonFullDayBookedForDate(allBookings, facilityId, dateKey) ? 'occupied' : 'free'
  }
  const ids = Array.isArray(slotIds) ? slotIds : []
  if (salonFullDayBookedForDate(allBookings, facilityId, dateKey)) return 'occupied'
  if (ids.length === 0) return 'free'
  let booked = 0
  for (const slotId of ids) {
    const taken = allBookings.some(
      (b) =>
        b.date === dateKey &&
        bookingRecordFacilityId(b) === facilityId &&
        (isSalonFullDayRecord(b) || b.timeSlot === slotId),
    )
    if (taken) booked += 1
  }
  if (booked === 0) return 'free'
  if (booked >= ids.length) return 'occupied'
  return 'partial'
}

function isPadelBookingRecord(b) {
  if (b.facilityId && isPadelFacilityId(b.facilityId)) return true
  if (typeof b.facility === 'string' && b.facility.startsWith('Pista de pádel')) return true
  return false
}

/** Misma pista (p. ej. padel:1) aunque el registro viejo solo tenga nombre. */
function padelBookingMatchesFacility(b, selectedFacilityId, facilities) {
  if (!selectedFacilityId || !isPadelFacilityId(selectedFacilityId)) return false
  if (b.facilityId && isPadelFacilityId(b.facilityId)) return b.facilityId === selectedFacilityId
  if (!isPadelBookingRecord(b)) return false
  const expectedName = facilities ? facilityLabel(facilities, selectedFacilityId) : null
  if (expectedName && b.facility === expectedName) return true
  const m = /^padel:(\d+)$/.exec(selectedFacilityId)
  if (m) {
    const n = m[1]
    if (n === '1' && (b.facility === 'Pista de pádel' || b.facility === 'Pista de pádel 1')) return true
    if (b.facility === `Pista de pádel ${n}`) return true
  }
  return false
}

function bookingCoversPadelSlot(b, slot) {
  return padelBookingOverlapsSlot(b, slot)
}

function isPadelSlotOccupiedByRecord(b, selectedFacilityId, dateKey, slot, facilities) {
  return (
    b.date === dateKey &&
    padelBookingMatchesFacility(b, selectedFacilityId, facilities) &&
    bookingCoversPadelSlot(b, slot)
  )
}

function findPadelOccupyingBooking(allBookings, selectedFacilityId, dateKey, slot, facilities) {
  return allBookings.find((b) =>
    isPadelSlotOccupiedByRecord(b, selectedFacilityId, dateKey, slot, facilities),
  )
}

function formatOccupantShort(b) {
  const bits = []
  if (b.userEmail) bits.push(String(b.userEmail))
  else if (b.userName) bits.push(String(b.userName))
  if (b.portal) bits.push(`Pt.${b.portal}`)
  if (b.piso) bits.push(String(b.piso))
  return bits.length ? bits.join(' · ') : 'Reservado'
}

/** Misma vivienda: piso + portal si el usuario tiene portal; reservas antiguas sin portal → fallback por email. */
function sameApartmentForPadelCap(b, user) {
  const up = user?.piso?.trim()
  const uport = user?.portal?.trim()
  const bp = b.piso?.trim()
  const bport = b.portal?.trim()
  if (up && bp === up) {
    if (uport) {
      if (bport && bport === uport) return true
      if (!bport && user?.email && emailsMatchForAccount(b.userEmail, user.email)) return true
      return false
    }
    return true
  }
  if (user?.email && emailsMatchForAccount(b.userEmail, user.email)) return true
  return false
}

function getNextDays(maxDaysInAdvance) {
  const days = []
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = maxDaysInAdvance + 1
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    days.push({
      key: localDateKey(d),
      day: DAY_LABELS[d.getDay()],
      num: d.getDate(),
      date: d,
    })
  }
  return days
}

/** Claves YYYY-MM-DD desde hoy hasta fin de ventana de reserva (salón día completo). */
function salonForwardDayKeys(maxDaysInAdvance) {
  return getNextDays(maxDaysInAdvance ?? 14).map((e) => e.key)
}

const SALON_DATE_STRIP_MAX_FORWARD = 6

/** Tira corta salón (como pádel): hoy + pocos días; el salto amplio va al input de gestión. */
function salonStripDayEntries(maxDaysInAdvance) {
  const maxA = Number(maxDaysInAdvance)
  const cap = Number.isFinite(maxA) && maxA >= 0 ? maxA : 14
  const stripAdvance = Math.min(cap, SALON_DATE_STRIP_MAX_FORWARD)
  return getNextDays(stripAdvance)
}

/** Conserje: salón — ventana futura completa + ~120 días atrás para consulta. */
function buildSalonStaffJumpDateKeys(maxDaysInAdvance, now = new Date()) {
  const base = new Set(salonForwardDayKeys(maxDaysInAdvance))
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let back = 1; back <= 120; back += 1) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - back)
    base.add(localDateKey(d))
  }
  return [...base].sort()
}

const initialBooking = {
  date: null,
  timeSlot: null,
  padelSlotIds: [],
}

function emailsMatchForAccount(bookingEmail, accountEmail) {
  if (!bookingEmail || !accountEmail) return false
  return (
    String(bookingEmail).trim().toLowerCase() === String(accountEmail).trim().toLowerCase()
  )
}

/** Referencia: mes y año del calendario actual (es-ES), para la etiqueta junto a Fecha. */
function currentCalendarMonthYearEs() {
  const s = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function bookingDateMonthYearEs(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return currentCalendarMonthYearEs()
  const [y, mo, d] = dateKey.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const s = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export default function Bookings() {
  const { userRole, user, communityId, accessToken, communityAccessCode } = useAuth()
  const { confirm } = useDialog()
  const [serverBookings, setServerBookings] = useState([])
  const showManagement = canManageCommunity(userRole)
  const showCreateForm = canActAsResident(userRole)
  const isStaffBookingMode =
    userRole === 'concierge' || userRole === 'super_admin' || canManageCommunity(userRole)
  const canOnBehalfBooking = canBookOnBehalfOfNeighbor(userRole)
  /** Gestión sin vivienda en ficha: no reservan «para sí»; solo en nombre de vecino. */
  const staffMayReserveAsSelf = Boolean(user?.piso?.trim() && user?.portal?.trim())
  /** Conserje: solo supervisión en gimnasio, sin registrar propia entrada/salida. */
  const isConciergeGymSupervisionOnly = userRole === 'concierge'
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [booking, setBooking] = useState(initialBooking)
  const [errors, setErrors] = useState({})
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [gymAccessPending, setGymAccessPending] = useState(null)
  const [gymAccessMessage, setGymAccessMessage] = useState(null)
  const [gymAccessPreviewItems, setGymAccessPreviewItems] = useState([])
  const [gymAccessPreviewStatus, setGymAccessPreviewStatus] = useState('idle')
  const [gymAccessPreviewScope, setGymAccessPreviewScope] = useState('personal')
  const [communityBookingConfig, setCommunityBookingConfig] = useState(null)
  const [configStatus, setConfigStatus] = useState('idle')
  const [padelCapError, setPadelCapError] = useState('')
  const [staffNeighbors, setStaffNeighbors] = useState([])
  const [staffNeighborsStatus, setStaffNeighborsStatus] = useState('idle')
  const [staffOnBehalfUserId, setStaffOnBehalfUserId] = useState('')
  /** Gestión: consulta de ocupación en fechas lejanas (no crear reserva desde este modo). */
  const [staffHistoryMode, setStaffHistoryMode] = useState(false)
  const [salonPickerMonth, setSalonPickerMonth] = useState(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
  })
  const [cancellingBookingId, setCancellingBookingId] = useState(null)
  const [usageFeePaid, setUsageFeePaid] = useState(false)
  const [depositPaid, setDepositPaid] = useState(false)
  const [paymentActionBusyId, setPaymentActionBusyId] = useState(null)
  const [depositReturnError, setDepositReturnError] = useState('')
  const [cancelError, setCancelError] = useState('')

  const canConciergeCancelAny = userRole === 'concierge'
  const canCancelBookingItem = useCallback(
    (item) => {
      if (!item?.fromServer || item.serverId == null || !accessToken) return false
      if (canConciergeCancelAny) return true
      if (user?.id != null && item.vecindarioUserId === Number(user.id)) return true
      return emailsMatchForAccount(item.userEmail, user?.email)
    },
    [accessToken, canConciergeCancelAny, user?.email, user?.id],
  )

  const delay = useCallback((ms) => new Promise((r) => setTimeout(r, ms)), [])

  useEffect(() => {
    if (communityId == null) {
      setCommunityBookingConfig(null)
      setConfigStatus('idle')
      return
    }
    let cancelled = false
    setConfigStatus('loading')
    setCommunityBookingConfig(null)
    fetch(apiUrl(`/api/public/community-config?communityId=${communityId}`))
      .then((r) => {
        if (!r.ok) throw new Error('config')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setCommunityBookingConfig(data)
        setConfigStatus('ok')
      })
      .catch(() => {
        if (cancelled) return
        setCommunityBookingConfig(null)
        setConfigStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [communityId])

  const refreshServerBookings = useCallback(() => {
    if (communityId == null) {
      setServerBookings([])
      return Promise.resolve()
    }
    const applyRows = (data) => {
      if (Array.isArray(data)) setServerBookings(data.map(mapServerBookingRow))
      else setServerBookings([])
    }
    if (accessToken) {
      return fetch(apiUrl(`/api/bookings?communityId=${communityId}`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(async (r) => {
          if (r.ok) return r.json()
          const code = communityAccessCode?.trim()
          if (r.status === 403 && code) {
            const q = new URLSearchParams({
              communityId: String(communityId),
              accessCode: code,
            })
            const r2 = await fetch(apiUrl(`/api/public/community-bookings?${q}`))
            if (!r2.ok) throw new Error('bookings')
            return r2.json()
          }
          throw new Error('bookings')
        })
        .then(applyRows)
        .catch(() => setServerBookings([]))
    }
    const code = communityAccessCode?.trim()
    if (code) {
      const q = new URLSearchParams({
        communityId: String(communityId),
        accessCode: code,
      })
      return fetch(apiUrl(`/api/public/community-bookings?${q}`))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bookings'))))
        .then(applyRows)
        .catch(() => setServerBookings([]))
    }
    setServerBookings([])
    return Promise.resolve()
  }, [accessToken, communityId, communityAccessCode])

  useEffect(() => {
    refreshServerBookings()
  }, [refreshServerBookings])

  const handleCancelBooking = useCallback(
    async (item) => {
      if (!canCancelBookingItem(item) || cancellingBookingId != null) return
      const ok = await confirm({
        title: 'Cancelar reserva',
        message: bookingCancelConfirmMessage(item),
        confirmLabel: 'Sí, cancelar',
        cancelLabel: 'No, mantener',
        variant: 'danger',
      })
      if (!ok) return
      setCancelError('')
      setCancellingBookingId(item.serverId)
      try {
        const res = await fetch(apiUrl(`/api/bookings/${item.serverId}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setCancelError(typeof data.error === 'string' ? data.error : 'No se pudo cancelar la reserva.')
          return
        }
        await refreshServerBookings()
      } catch {
        setCancelError('Error de red al cancelar la reserva.')
      } finally {
        setCancellingBookingId(null)
      }
    },
    [accessToken, canCancelBookingItem, cancellingBookingId, confirm, refreshServerBookings],
  )

  const handleMarkPayment = useCallback(
    async (item, field) => {
      if (!isStaffBookingMode || paymentActionBusyId != null || !item?.serverId) return
      const fees = facilityFeeConfigForBooking(item, communityBookingConfig?.customLocations)
      const isUsage = field === 'usageFeePaid'
      const ok = await confirm({
        title: isUsage ? 'Tasa de uso' : 'Fianza',
        message: isUsage
          ? `¿Marcar la tasa de ${fees.usageFeeEur ?? ''} € como cobrada para ${item.facility || 'esta reserva'} (${item.date})?`
          : `¿Marcar la fianza de ${fees.depositEur ?? ''} € como entregada para ${item.facility || 'esta reserva'} (${item.date})?`,
        confirmLabel: 'Sí, marcar',
        cancelLabel: 'Cancelar',
      })
      if (!ok) return
      setDepositReturnError('')
      setPaymentActionBusyId(item.serverId)
      try {
        const res = await fetch(apiUrl(`/api/bookings/${item.serverId}/payments`), {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ communityId, [field]: true }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDepositReturnError(
            typeof data.error === 'string' ? data.error : 'No se pudo registrar el cobro.',
          )
          return
        }
        await refreshServerBookings()
      } catch {
        setDepositReturnError('Error de red al registrar el cobro.')
      } finally {
        setPaymentActionBusyId(null)
      }
    },
    [
      accessToken,
      communityBookingConfig?.customLocations,
      communityId,
      confirm,
      isStaffBookingMode,
      paymentActionBusyId,
      refreshServerBookings,
    ],
  )

  const handleMarkDepositReturn = useCallback(
    async (item) => {
      if (!isStaffBookingMode || paymentActionBusyId != null || !item?.serverId) return
      const fees = facilityFeeConfigForBooking(item, communityBookingConfig?.customLocations)
      const ok = await confirm({
        title: 'Devolución de fianza',
        message: `¿Marcar la fianza de ${fees.depositEur ?? ''} € como devuelta para ${item.facility || 'esta reserva'} (${item.date})?`,
        confirmLabel: 'Sí, marcar devuelta',
        cancelLabel: 'Cancelar',
      })
      if (!ok) return
      setDepositReturnError('')
      setPaymentActionBusyId(item.serverId)
      try {
        const res = await fetch(apiUrl(`/api/bookings/${item.serverId}/deposit-return`), {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ communityId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDepositReturnError(
            typeof data.error === 'string' ? data.error : 'No se pudo registrar la devolución.',
          )
          return
        }
        await refreshServerBookings()
      } catch {
        setDepositReturnError('Error de red al registrar la devolución.')
      } finally {
        setPaymentActionBusyId(null)
      }
    },
    [
      accessToken,
      communityBookingConfig?.customLocations,
      communityId,
      confirm,
      paymentActionBusyId,
      isStaffBookingMode,
      refreshServerBookings,
    ],
  )

  useEffect(() => {
    setUsageFeePaid(false)
    setDepositPaid(false)
  }, [selectedFacility])

  useEffect(() => {
    if (!canOnBehalfBooking || !accessToken || communityId == null) {
      setStaffNeighbors([])
      setStaffNeighborsStatus('idle')
      return
    }
    let cancelled = false
    setStaffNeighborsStatus('loading')
    fetch(apiUrl(`/api/bookings/neighbors?communityId=${communityId}`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('neighbors')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setStaffNeighbors(Array.isArray(data.neighbors) ? data.neighbors : [])
        setStaffNeighborsStatus('ok')
      })
      .catch(() => {
        if (cancelled) return
        setStaffNeighbors([])
        setStaffNeighborsStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [canOnBehalfBooking, accessToken, communityId])

  /** Solo filas del servidor: ocupación de tramos y «Tus registros recientes» coinciden con la BD. */
  const allBookings = useMemo(() => [...serverBookings], [serverBookings])

  /** Gestión: misma fuente que `allBookings`. */
  const communityBookingsForManagement = useMemo(() => {
    return [...serverBookings].sort((a, b) => {
      const ta = a.recordedAt ? new Date(a.recordedAt).getTime() : 0
      const tb = b.recordedAt ? new Date(b.recordedAt).getTime() : 0
      if (tb !== ta) return tb - ta
      return String(b.id).localeCompare(String(a.id))
    })
  }, [serverBookings])

  const facilities = useMemo(() => {
    if (communityId == null) return DEFAULT_FACILITIES
    if (configStatus === 'loading' || configStatus === 'idle') return null
    if (configStatus === 'ok' && communityBookingConfig) {
      return buildFacilitiesFromApi(communityBookingConfig)
    }
    // Con comunidad pero fallo de API: no asumir gimnasio (evita tramos si en BD está desactivado).
    if (configStatus === 'error' && communityId != null) {
      return DEFAULT_FACILITIES.filter((f) => f.id !== 'gym')
    }
    return DEFAULT_FACILITIES
  }, [communityId, configStatus, communityBookingConfig])

  useEffect(() => {
    if (!facilities || !selectedFacility) return
    const ids = new Set(facilities.map((f) => f.id))
    if (!ids.has(selectedFacility)) {
      setSelectedFacility(null)
      setBooking(initialBooking)
    }
  }, [facilities, selectedFacility])

  const gymControlOn = useMemo(() => {
    if (communityId != null && configStatus === 'ok' && communityBookingConfig != null) {
      return Boolean(communityBookingConfig.gymAccessEnabled)
    }
    return isGymAccessControlEnabled()
  }, [communityId, configStatus, communityBookingConfig])

  const showGymAccessPanel = selectedFacility === 'gym' && gymControlOn

  const refreshGymAccessPreview = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setGymAccessPreviewItems([])
      setGymAccessPreviewStatus('idle')
      setGymAccessPreviewScope('personal')
      return
    }
    setGymAccessPreviewStatus('loading')
    try {
      const res = await fetch(apiUrl(`/api/bookings/activity?communityId=${communityId}`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setGymAccessPreviewItems([])
        setGymAccessPreviewStatus('error')
        setGymAccessPreviewScope('personal')
        return
      }
      const items = Array.isArray(data.items) ? data.items : []
      const gymRaw = items.filter((x) => x.kind === 'gym_access')
      const mapped = gymRaw.map(mapActivityApiItem).slice(0, 20)
      setGymAccessPreviewItems(mapped)
      setGymAccessPreviewScope(data.scope === 'community' ? 'community' : 'personal')
      setGymAccessPreviewStatus('ok')
    } catch {
      setGymAccessPreviewItems([])
      setGymAccessPreviewStatus('error')
      setGymAccessPreviewScope('personal')
    }
  }, [accessToken, communityId])

  useEffect(() => {
    if (!showGymAccessPanel) {
      setGymAccessPreviewItems([])
      setGymAccessPreviewStatus('idle')
      setGymAccessPreviewScope('personal')
      return
    }
    void refreshGymAccessPreview()
  }, [showGymAccessPanel, refreshGymAccessPreview])

  const salonDayBookingFlow = useMemo(() => {
    if (!communityBookingConfig || !selectedFacility || !isSalonLikeFacility(selectedFacility)) {
      return false
    }
    if (!salonDayModeFromConfig(communityBookingConfig)) return false
    if (selectedFacility.startsWith('custom:')) {
      const loc = findCustomLocationByFacilityId(
        selectedFacility,
        communityBookingConfig.customLocations,
      )
      if (loc?.timeSlots && Array.isArray(loc.timeSlots) && loc.timeSlots.length > 0) {
        return false
      }
    }
    return true
  }, [communityBookingConfig, selectedFacility])

  const spaceConfig = useMemo(() => {
    if (!selectedFacility) return null
    if (isPadelFacilityId(selectedFacility)) {
      const maxH = parsePadelHoursFormValue(communityBookingConfig?.padelMaxHoursPerBooking, SLOT_PRESETS.padel.maxDurationHours)
      return { ...SLOT_PRESETS.padel, maxDurationHours: maxH }
    }
    return getSlotConfigForFacility(selectedFacility, communityBookingConfig?.customLocations)
  }, [selectedFacility, communityBookingConfig])

  const showSalonDatePickers = Boolean(
    !staffHistoryMode &&
      selectedFacility &&
      isSalonLikeFacility(selectedFacility) &&
      !isPadelFacilityId(selectedFacility),
  )

  const salonAdvanceUnlimited =
    showSalonDatePickers && (spaceConfig?.maxDaysInAdvance ?? 0) >= SALON_UNLIMITED_MAX_DAYS

  const getSalonCalendarDayStatus = useCallback(
    (dateKey) => {
      if (!selectedFacility || !spaceConfig) return 'disabled'
      if (!isDateInBookableWindow(dateKey, spaceConfig.maxDaysInAdvance ?? 14, new Date(), spaceConfig.minDaysInAdvance ?? 0))
        return 'disabled'
      return salonCalendarDayStatus(
        dateKey,
        selectedFacility,
        salonDayBookingFlow,
        allBookings,
        spaceConfig.timeSlotIds,
      )
    },
    [selectedFacility, spaceConfig, salonDayBookingFlow, allBookings],
  )

  useEffect(() => {
    if (!selectedFacility || !isSalonLikeFacility(selectedFacility)) return
    const key = booking.date || localDateKey(new Date())
    setSalonPickerMonth(key.slice(0, 7))
  }, [selectedFacility, booking.date])

  useEffect(() => {
    if (!showSalonDatePickers || !spaceConfig) return
    const max = spaceConfig.maxDaysInAdvance ?? 14
    const min = spaceConfig.minDaysInAdvance ?? 0
    const inMonth = booking.date && booking.date.startsWith(salonPickerMonth)
    const valid =
      booking.date && isDateInBookableWindow(booking.date, max, new Date(), min) && inMonth
    if (valid) return
    const isFree = (key) => getSalonCalendarDayStatus(key) === 'free'
    const pick =
      firstSelectableDayInMonth(salonPickerMonth, max, isFree, new Date(), min) ||
      firstSelectableDayInMonth(salonPickerMonth, max, undefined, new Date(), min)
    if (pick && pick !== booking.date) {
      setBooking((prev) => ({
        ...prev,
        date: pick,
        timeSlot: null,
        padelSlotIds: [],
      }))
    }
  }, [
    showSalonDatePickers,
    salonPickerMonth,
    spaceConfig,
    booking.date,
    getSalonCalendarDayStatus,
  ])

  const padelHorizonDaysForCopy = useMemo(() => {
    if (!communityBookingConfig) return 1
    return padelHorizonDaysFromConfigHours(communityBookingConfig.padelMinAdvanceHours)
  }, [communityBookingConfig])

  const padelCapUser = useMemo(() => {
    if (!canOnBehalfBooking) return user
    if (staffOnBehalfUserId) {
      const n = staffNeighbors.find((x) => String(x.id) === String(staffOnBehalfUserId))
      if (n) {
        return {
          email: n.email,
          piso: n.piso,
          portal: n.portal,
          name: n.name,
        }
      }
    }
    if (staffMayReserveAsSelf) return user
    return null
  }, [canOnBehalfBooking, staffOnBehalfUserId, staffNeighbors, user, staffMayReserveAsSelf])

  /** Tira horizontal: misma ventana corta que los vecinos (ayer + hoy + días futuros). */
  const padelStripDayKeys = useMemo(() => {
    if (!isPadelFacilityId(selectedFacility) || !communityBookingConfig || !spaceConfig) return null
    const minAdv = communityBookingConfig.padelMinAdvanceHours
    return padelCalendarDayKeys(minAdv, spaceConfig.maxDaysInAdvance ?? 7)
  }, [selectedFacility, communityBookingConfig, spaceConfig])

  /** Gestión: calendario ampliado solo para el input «Ir a fecha» (saltar / histórico). */
  const padelConciergeJumpKeys = useMemo(() => {
    if (!isStaffBookingMode || !isPadelFacilityId(selectedFacility) || !communityBookingConfig || !spaceConfig) {
      return null
    }
    const minAdv = communityBookingConfig.padelMinAdvanceHours
    return padelConciergeDayKeys(minAdv, spaceConfig.maxDaysInAdvance ?? 7)
  }, [isStaffBookingMode, selectedFacility, communityBookingConfig, spaceConfig])

  const salonStaffJumpKeys = useMemo(() => {
    if (!isStaffBookingMode || !salonDayBookingFlow || !spaceConfig) return null
    return buildSalonStaffJumpDateKeys(spaceConfig.maxDaysInAdvance ?? 14)
  }, [isStaffBookingMode, salonDayBookingFlow, spaceConfig])

  /** Histórico gestión: ~120 días atrás + ventana futura (solo consulta). */
  const staffHistoryDateKeySet = useMemo(() => {
    if (!isStaffBookingMode) return null
    const keys = padelConciergeJumpKeys ?? salonStaffJumpKeys
    return keys?.length ? new Set(keys) : null
  }, [isStaffBookingMode, padelConciergeJumpKeys, salonStaffJumpKeys])

  const staffHistoryDateInputMinMax = useMemo(() => {
    const keys = padelConciergeJumpKeys ?? salonStaffJumpKeys
    if (!keys?.length) return { min: '', max: '' }
    const sorted = [...keys].sort()
    return { min: sorted[0], max: sorted[sorted.length - 1] }
  }, [padelConciergeJumpKeys, salonStaffJumpKeys])

  const staffShowsHistoryControl = Boolean(
    isStaffBookingMode &&
      ((isPadelFacilityId(selectedFacility) && communityBookingConfig) || salonDayBookingFlow),
  )

  const dateOptions = useMemo(() => {
    if (!spaceConfig) return []
    if (padelStripDayKeys != null) return dateStripEntriesFromKeys(padelStripDayKeys)
    if (salonDayBookingFlow) return salonStripDayEntries(spaceConfig.maxDaysInAdvance ?? 14)
    return getNextDays(spaceConfig.maxDaysInAdvance ?? 14)
  }, [spaceConfig, padelStripDayKeys, salonDayBookingFlow])

  const padelHistoryReadOnlyDay = useMemo(() => {
    if (!isStaffBookingMode || !booking.date || !isPadelFacilityId(selectedFacility)) return false
    return booking.date < localDateKey(new Date())
  }, [isStaffBookingMode, booking.date, selectedFacility])

  const salonHistoryReadOnlyDay = useMemo(() => {
    if (!isStaffBookingMode || !salonDayBookingFlow || !booking.date) return false
    return booking.date < localDateKey(new Date())
  }, [isStaffBookingMode, salonDayBookingFlow, booking.date])

  const salonDayOccupantHint = useMemo(() => {
    if (!isStaffBookingMode || !salonDayBookingFlow || !booking.date || !selectedFacility) return null
    if (!salonFullDayBookedForDate(allBookings, selectedFacility, booking.date)) return null
    const rec = findSalonFullDayBookingForDate(allBookings, selectedFacility, booking.date)
    return rec ? formatOccupantShort(rec) : null
  }, [isStaffBookingMode, salonDayBookingFlow, booking.date, selectedFacility, allBookings])

  /** Conserje/gestión: hoy por defecto en pádel y en salón día completo. */
  useEffect(() => {
    if (!isStaffBookingMode || !spaceConfig) return
    const padelOk = isPadelFacilityId(selectedFacility) && communityBookingConfig
    const salonOk = salonDayBookingFlow
    if (!padelOk && !salonOk) return
    if (booking.date != null) return
    setBooking((prev) => (prev.date != null ? prev : { ...prev, date: localDateKey(new Date()) }))
  }, [
    isStaffBookingMode,
    selectedFacility,
    communityBookingConfig,
    spaceConfig,
    booking.date,
    salonDayBookingFlow,
  ])

  const availableTimeSlots = useMemo(() => {
    if (!spaceConfig) return []
    if (isPadelFacilityId(selectedFacility) && communityBookingConfig) {
      if (!booking.date) return []
      if (padelHistoryReadOnlyDay) return []
      const base = buildPadelSlotsFromOpenCloseAndDuration(
        communityBookingConfig.padelOpenTime,
        communityBookingConfig.padelCloseTime,
        spaceConfig.maxDurationHours,
      )
      const timeOk = filterPadelSlotsForBookableDate(base, booking.date)
      return timeOk.filter(
        (slot) =>
          !allBookings.some((b) =>
            isPadelSlotOccupiedByRecord(b, selectedFacility, booking.date, slot, facilities),
          ),
      )
    }
    return (spaceConfig.timeSlots || ALL_TIME_SLOTS.filter((slot) => spaceConfig.timeSlotIds.includes(slot.id))).map(
      (slot) => ({
        id: slot.id,
        label: slot.label,
        range: slot.range,
      }),
    )
  }, [
    spaceConfig,
    selectedFacility,
    communityBookingConfig,
    booking.date,
    allBookings,
    facilities,
    padelHistoryReadOnlyDay,
  ])

  /** Pádel: todos los tramos del día (hora) con marca Ocupado si ya hay reserva en esta pista. */
  const padelSlotRowsForDisplay = useMemo(() => {
    if (!spaceConfig || !isPadelFacilityId(selectedFacility) || !communityBookingConfig || !booking.date) {
      return null
    }
    const base = buildPadelSlotsFromOpenCloseAndDuration(
      communityBookingConfig.padelOpenTime,
      communityBookingConfig.padelCloseTime,
      spaceConfig.maxDurationHours,
    )
    const todayK = localDateKey(new Date())
    const useFullDaySlots = isStaffBookingMode && booking.date < todayK
    const slotsForRows = useFullDaySlots ? base : filterPadelSlotsForBookableDate(base, booking.date)
    return slotsForRows.map((slot) => {
      const occ = findPadelOccupyingBooking(allBookings, selectedFacility, booking.date, slot, facilities)
      const taken = Boolean(occ)
      const occupantShort = taken && isStaffBookingMode && occ ? formatOccupantShort(occ) : null
      return { slot, taken, occupantShort }
    })
  }, [
    spaceConfig,
    selectedFacility,
    communityBookingConfig,
    booking.date,
    allBookings,
    facilities,
    isStaffBookingMode,
  ])

  const padelDailyCapInfo = useMemo(() => {
    if (!isPadelFacilityId(selectedFacility) || !communityBookingConfig) return null
    const hBook = parsePadelHoursFormValue(communityBookingConfig.padelMaxHoursPerBooking, 2)
    const hDaily = parsePadelHoursFormValue(communityBookingConfig.padelMaxHoursPerApartmentPerDay, 24)
    let usedHours = 0
    if (
      booking.date &&
      padelCapUser &&
      (padelCapUser.piso?.trim() || padelCapUser.email)
    ) {
      usedHours =
        allBookings.filter(
          (b) =>
            isPadelBookingRecord(b) &&
            b.date === booking.date &&
            sameApartmentForPadelCap(b, padelCapUser),
        ).length * hBook
    }
    const maxSlots = padelMaxSlotsSelectable(hBook, hDaily, usedHours)
    return { hBook, hDaily, usedHours, maxSlots, multi: maxSlots > 1 }
  }, [selectedFacility, communityBookingConfig, booking.date, padelCapUser, allBookings])

  useEffect(() => {
    if (!isPadelFacilityId(selectedFacility) || !communityBookingConfig) return
    if (!booking.date) return
    const ids = booking.padelSlotIds || []
    if (ids.length === 0) return
    const okIds = ids.filter((id) => availableTimeSlots.some((s) => s.id === id))
    if (okIds.length !== ids.length) {
      setBooking((prev) => ({ ...prev, padelSlotIds: okIds, timeSlot: null }))
    }
  }, [selectedFacility, booking.date, booking.padelSlotIds, communityBookingConfig, availableTimeSlots])

  useEffect(() => {
    if (!isPadelFacilityId(selectedFacility) || !booking.timeSlot || !communityBookingConfig) return
    if (!booking.date) return
    const ok = availableTimeSlots.some((s) => s.id === booking.timeSlot)
    if (!ok) setBooking((prev) => ({ ...prev, timeSlot: null }))
  }, [selectedFacility, booking.date, booking.timeSlot, communityBookingConfig, availableTimeSlots])

  /** Solo servidor: mismas filas que en BD; filtro por correo o por portal+piso del usuario. */
  const myVisibleBookings = useMemo(() => {
    const sorted = [...allBookings].sort((a, b) => {
      const ta = a.recordedAt ? new Date(a.recordedAt).getTime() : 0
      const tb = b.recordedAt ? new Date(b.recordedAt).getTime() : 0
      if (tb !== ta) return tb - ta
      return String(b.id).localeCompare(String(a.id))
    })
    if (user?.email) {
      return sorted.filter((b) => emailsMatchForAccount(b.userEmail, user.email))
    }
    const portal = user?.portal?.trim()
    const piso = user?.piso?.trim()
    if (portal && piso) {
      return sorted.filter(
        (b) =>
          String(b.portal || '').trim() === portal && String(b.piso || '').trim() === piso,
      )
    }
    return []
  }, [allBookings, user?.email, user?.portal, user?.piso])

  const myBookingsPreview = useMemo(() => myVisibleBookings.slice(0, 12), [myVisibleBookings])

  /** Conserje / gestión: la vista previa muestra actividad de toda la comunidad (no solo la cuenta del usuario). */
  const recentRecordsPreview = useMemo(
    () =>
      isStaffBookingMode
        ? communityBookingsForManagement.slice(0, 12)
        : myBookingsPreview,
    [isStaffBookingMode, communityBookingsForManagement, myBookingsPreview],
  )

  const exitStaffHistoryMode = useCallback(() => {
    setStaffHistoryMode(false)
    setPadelCapError('')
    setBooking((prev) => ({
      ...prev,
      date: localDateKey(new Date()),
      timeSlot: null,
      padelSlotIds: [],
    }))
  }, [])

  const handleFacilitySelect = (id) => {
    setSelectedFacility(selectedFacility === id ? null : id)
    setErrors({})
    setPadelCapError('')
    setGymAccessMessage(null)
    setStaffOnBehalfUserId('')
    setStaffHistoryMode(false)
    if (selectedFacility !== id) {
      if (isStaffBookingMode) {
        if (isPadelFacilityId(id)) {
          setBooking({ date: localDateKey(new Date()), timeSlot: null, padelSlotIds: [] })
        } else if (
          communityBookingConfig &&
          salonDayModeFromConfig(communityBookingConfig) &&
          isSalonLikeFacility(id)
        ) {
          setBooking({ date: localDateKey(new Date()), timeSlot: null, padelSlotIds: [] })
          const mk = localDateKey(new Date()).slice(0, 7)
          setSalonPickerMonth(mk)
        } else if (isSalonLikeFacility(id)) {
          setBooking({ date: localDateKey(new Date()), timeSlot: null, padelSlotIds: [] })
          setSalonPickerMonth(localDateKey(new Date()).slice(0, 7))
        } else {
          setBooking(initialBooking)
        }
      } else {
        setBooking(initialBooking)
      }
    }
  }

  const handleDateSelect = (key) => {
    setBooking((prev) => ({
      ...prev,
      date: prev.date === key ? null : key,
      timeSlot: null,
      padelSlotIds: [],
    }))
    setPadelCapError('')
    if (errors.date) setErrors((prev) => ({ ...prev, date: null }))
  }

  const handleSalonDaySelect = (key) => {
    if (!key) return
    setBooking((prev) => ({
      ...prev,
      date: key,
      timeSlot: null,
      padelSlotIds: [],
    }))
    setPadelCapError('')
    if (errors.date) setErrors((prev) => ({ ...prev, date: null }))
  }

  const handleSalonMonthChange = (yearMonth) => {
    setSalonPickerMonth(yearMonth)
    if (!spaceConfig) return
    const max = spaceConfig.maxDaysInAdvance ?? 14
    const isFree = (key) => salonCalendarDayStatus(
      key,
      selectedFacility,
      salonDayBookingFlow,
      allBookings,
      spaceConfig.timeSlotIds,
    ) === 'free'
    const pick =
      firstSelectableDayInMonth(yearMonth, max, isFree) ||
      firstSelectableDayInMonth(yearMonth, max)
    if (pick) handleSalonDaySelect(pick)
  }

  const handleStaffHistoryDateChange = (value) => {
    if (!value) return
    if (!staffHistoryDateKeySet || !staffHistoryDateKeySet.has(value)) {
      setPadelCapError('Fecha fuera del rango del histórico (~120 días atrás hasta el fin de la ventana de reservas).')
      return
    }
    setPadelCapError('')
    setBooking((prev) => ({ ...prev, date: value, timeSlot: null, padelSlotIds: [] }))
    if (errors.date) setErrors((prev) => ({ ...prev, date: null }))
  }

  const handleTimeSlotSelect = (id) => {
    setPadelCapError('')
    if (errors.timeSlot) setErrors((prev) => ({ ...prev, timeSlot: null }))

    if (
      isPadelFacilityId(selectedFacility) &&
      communityBookingConfig &&
      padelDailyCapInfo?.multi &&
      !padelHistoryReadOnlyDay &&
      !staffHistoryMode &&
      padelSlotRowsForDisplay
    ) {
      const freeSlots = padelSlotRowsForDisplay
        .filter((r) => !r.taken)
        .map((r) => r.slot)
        .sort((a, b) => a.startMin - b.startMin)
      setBooking((prev) => ({
        ...prev,
        timeSlot: null,
        padelSlotIds: padelToggleSlotSelection(
          prev.padelSlotIds || [],
          id,
          freeSlots,
          padelDailyCapInfo.maxSlots,
        ),
      }))
      return
    }

    setBooking((prev) => ({
      ...prev,
      timeSlot: prev.timeSlot === id ? null : id,
      padelSlotIds: prev.timeSlot === id ? [] : [id],
    }))
  }

  const validate = () => {
    const next = {}
    if (!selectedFacility) next.facility = 'Elige un espacio para reservar.'
    if (!booking.date) next.date = 'Elige una fecha.'
    if (!salonDayBookingFlow) {
      const padelIds = booking.padelSlotIds || []
      const hasPadelSlots =
        isPadelFacilityId(selectedFacility) && padelIds.length > 0
      const hasSingleSlot = Boolean(booking.timeSlot)
      if (!hasPadelSlots && !hasSingleSlot) {
        next.timeSlot = 'Elige un tramo horario.'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setPadelCapError('')
    if (staffHistoryMode) return
    if (!validate() || isSubmitting) return

    if (canOnBehalfBooking && !staffMayReserveAsSelf) {
      const parsedBehalf = Number.parseInt(String(staffOnBehalfUserId), 10)
      if (!Number.isInteger(parsedBehalf) || parsedBehalf < 1) {
        setPadelCapError(
          'Elige un vecino en «Reserva para». El conserje sin piso y portal en la comunidad no puede reservar para la cuenta de gestión.',
        )
        return
      }
    }

    const padelSlotIdsToBook =
      isPadelFacilityId(selectedFacility) && (booking.padelSlotIds?.length || booking.timeSlot)
        ? booking.padelSlotIds?.length
          ? [...booking.padelSlotIds]
          : [booking.timeSlot]
        : []

    if (
      selectedFacility &&
      isPadelFacilityId(selectedFacility) &&
      communityBookingConfig &&
      booking.date &&
      padelSlotIdsToBook.length > 0
    ) {
      const baseSlots = buildPadelSlotsFromOpenCloseAndDuration(
        communityBookingConfig.padelOpenTime,
        communityBookingConfig.padelCloseTime,
        padelMaxBookingHoursFromConfig(communityBookingConfig),
      )
      const allowedKeys = padelCalendarDayKeys(
        communityBookingConfig.padelMinAdvanceHours,
        spaceConfig.maxDaysInAdvance ?? 7,
      )
      const todayK = localDateKey(new Date())
      if (booking.date < todayK) {
        setPadelCapError('No se pueden crear reservas en fechas pasadas. Elige hoy o un día futuro.')
        return
      }
      if (!allowedKeys.includes(booking.date)) {
        setPadelCapError('Esa fecha no está dentro del plazo de reservas.')
        return
      }
      const okSlots = filterPadelSlotsForBookableDate(baseSlots, booking.date)
      const metas = padelSlotsSortedByTime(okSlots, padelSlotIdsToBook)
      if (metas.length !== padelSlotIdsToBook.length) {
        setPadelCapError('Algún tramo ya no está disponible. Revisa la selección.')
        return
      }
      for (const slotRow of metas) {
        if (
          allBookings.some((b) =>
            isPadelSlotOccupiedByRecord(b, selectedFacility, booking.date, slotRow, facilities),
          )
        ) {
          setPadelCapError(`El tramo ${slotRow.range} ya está reservado. Elige otros.`)
          return
        }
      }
    }

    if (salonDayBookingFlow && booking.date) {
      const todayK = localDateKey(new Date())
      if (booking.date < todayK) {
        setPadelCapError(
          'No se pueden crear reservas de salón en fechas pasadas. Elige hoy o un día futuro.',
        )
        return
      }
      const allowedSalon = salonForwardDayKeys(spaceConfig.maxDaysInAdvance ?? 14)
      if (!allowedSalon.includes(booking.date)) {
        setPadelCapError('Esa fecha no está dentro del plazo de reservas.')
        return
      }
      if (salonFullDayBookedForDate(allBookings, selectedFacility, booking.date)) {
        setPadelCapError('Este salón ya tiene una reserva de día completo para esa fecha.')
        return
      }
    }

    if (
      selectedFacility &&
      isPadelFacilityId(selectedFacility) &&
      communityBookingConfig &&
      padelCapUser &&
      (padelCapUser.piso?.trim() || padelCapUser.email)
    ) {
      const perBookRaw = Number(communityBookingConfig.padelMaxHoursPerBooking)
      const hBook = parsePadelHoursFormValue(perBookRaw, 2)
      const hDaily = parsePadelHoursFormValue(communityBookingConfig.padelMaxHoursPerApartmentPerDay, 24)
      const usedHours = allBookings
        .filter(
          (b) =>
            isPadelBookingRecord(b) &&
            b.date === booking.date &&
            sameApartmentForPadelCap(b, padelCapUser),
        )
        .length * hBook
      const newHours = (padelSlotIdsToBook.length || 1) * hBook
      if (usedHours + newHours > hDaily) {
        setPadelCapError(
          `Tope de pádel: máximo ${formatPadelHoursDisplay(hDaily)} h por vivienda y día. Esta reserva suma ${formatPadelHoursDisplay(newHours)} h; ya llevas ${formatPadelHoursDisplay(usedHours)} h ese día.`,
        )
        return
      }
    }

    setIsSubmitting(true)
    try {
      await delay(400)
      const facilityName = facilities ? facilityLabel(facilities, selectedFacility) : selectedFacility

      const persistServer =
        accessToken &&
        communityId != null &&
        rolePersistsBookingsToServer(userRole)

      if (persistServer) {
        const behalfParsed = Number.parseInt(String(staffOnBehalfUserId), 10)
        const selfId = user?.id != null ? Number(user.id) : NaN
        const useBehalf =
          canOnBehalfBooking &&
          Number.isInteger(behalfParsed) &&
          behalfParsed >= 1 &&
          Number.isInteger(selfId) &&
          behalfParsed !== selfId

        const bookingsToCreate = []

        if (salonDayBookingFlow) {
          bookingsToCreate.push({
            startMinute: 0,
            endMinute: 1440,
            slotKey: SALON_FULL_DAY_SLOT,
            slotLabel: 'Día completo',
          })
        } else if (isPadelFacilityId(selectedFacility) && communityBookingConfig && padelSlotIdsToBook.length) {
          const baseSlots = buildPadelSlotsFromOpenCloseAndDuration(
            communityBookingConfig.padelOpenTime,
            communityBookingConfig.padelCloseTime,
            padelMaxBookingHoursFromConfig(communityBookingConfig),
          )
          const okSlots = filterPadelSlotsForBookableDate(baseSlots, booking.date)
          for (const meta of padelSlotsSortedByTime(okSlots, padelSlotIdsToBook)) {
            bookingsToCreate.push({
              startMinute: meta.startMin,
              endMinute: meta.endMin,
              slotKey: meta.id,
              slotLabel: meta.range,
            })
          }
        } else if (booking.timeSlot) {
          const pr = slotMinuteRangeFromConfig(spaceConfig, booking.timeSlot)
          const slotMeta = spaceConfig?.timeSlots?.find((s) => s.id === booking.timeSlot)
          const preset = ALL_TIME_SLOTS.find((s) => s.id === booking.timeSlot)
          if (!pr) {
            setPadelCapError('Tramo no válido para guardar en servidor.')
            return
          }
          bookingsToCreate.push({
            startMinute: pr.startMin,
            endMinute: pr.endMin,
            slotKey: booking.timeSlot,
            slotLabel: slotMeta
              ? `${slotMeta.label} (${slotMeta.range})`
              : preset
                ? `${preset.label} (${preset.range})`
                : formatMinuteRange(pr.startMin, pr.endMin),
          })
        }

        for (const slot of bookingsToCreate) {
          const payload = {
            communityId,
            facilityId: selectedFacility,
            facilityName,
            bookingDate: booking.date,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            slotKey: slot.slotKey,
            slotLabel: slot.slotLabel,
          }
          if (useBehalf) {
            payload.onBehalfOfUserId = behalfParsed
          } else {
            if (user?.piso?.trim()) payload.actorPiso = user.piso.trim()
            if (user?.portal?.trim()) payload.actorPortal = user.portal.trim()
          }
          if (isStaffBookingMode) {
            if (spaceConfig?.usageFeeEur > 0 && usageFeePaid) payload.usageFeePaid = true
            if (spaceConfig?.depositEur > 0 && depositPaid) payload.depositPaid = true
          }

          const res = await fetch(apiUrl('/api/bookings'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            setPadelCapError(
              typeof data.error === 'string'
                ? data.error
                : `No se pudo guardar la reserva (${slot.slotLabel}).`,
            )
            return
          }
        }
        await refreshServerBookings()
      } else {
        setPadelCapError(
          'Inicia sesión con tu comunidad para guardar la reserva en el servidor. No se guardan reservas solo en este dispositivo.',
        )
        return
      }

      setSuccess(true)
      setBooking(initialBooking)
      setSelectedFacility(null)
      setStaffOnBehalfUserId('')
      setUsageFeePaid(false)
      setDepositPaid(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAnotherReservation = () => {
    setSuccess(false)
    setErrors({})
    setStaffOnBehalfUserId('')
    setUsageFeePaid(false)
    setDepositPaid(false)
  }

  const handleGymAccess = async (tipo) => {
    if (gymAccessPending) return
    setGymAccessPending(tipo)
    setGymAccessMessage(null)
    await delay(600)
    try {
      if (!accessToken || communityId == null) {
        setGymAccessMessage('Inicia sesión para guardar el acceso en la comunidad.')
        return
      }
      const res = await fetch(apiUrl('/api/bookings/gym-access'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ communityId, tipo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setGymAccessMessage(typeof data.error === 'string' ? data.error : 'No se pudo registrar el acceso.')
        return
      }
      await refreshGymAccessPreview()
      setGymAccessMessage(
        tipo === 'entrada' ? 'Entrada al gimnasio registrada.' : 'Salida del gimnasio registrada.'
      )
    } catch {
      setGymAccessMessage('Error de red al registrar acceso.')
    } finally {
      setGymAccessPending(null)
      window.setTimeout(() => setGymAccessMessage(null), 4500)
    }
  }

  if (success) {
    return (
      <div className="page-container bookings-page">
        <div className="booking-success card success-entrance">
          <span className="booking-success-icon" aria-hidden="true">✓</span>
          <h2 className="booking-success-title">Reserva confirmada</h2>
          <p className="booking-success-text">
            Tu reserva se ha registrado correctamente. Si la guardaste con sesión en el servidor y hay correo
            (SMTP) configurado, recibirás un email de confirmación; el conserje de la comunidad también, si está
            dado de alta. La verás en Actividad y en «Tus registros recientes» (datos del servidor).
          </p>
          <div className="booking-success-actions">
            <Link to="/" className="btn btn--primary btn--block">
              Volver al inicio
            </Link>
            <button type="button" className="btn btn--ghost btn--block" onClick={handleAnotherReservation}>
              Hacer otra reserva
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container bookings-page">
      <header className="page-header">
        <h1 className="page-title">Reservas</h1>
        <p className="page-subtitle">
          {showManagement && showCreateForm
            ? 'Reserva como vecino (igual que cualquier residente). Más abajo, la gestión lista solo reservas confirmadas en el servidor.'
            : showManagement
              ? 'Consulta las reservas de la comunidad o crea una nueva.'
              : 'Elige el espacio, la fecha y el tramo horario. La reserva queda confirmada al enviar.'}
        </p>
      </header>

      {showCreateForm && (
      <>
      <section className="booking-facilities-section">
        <h2 className="section-label">¿Qué espacio quieres reservar?</h2>
        {communityId != null && configStatus === 'ok' && communityBookingConfig?.name ? (
          <p className="booking-facilities-hint">
            Espacios según la configuración de «{communityBookingConfig.name}».
          </p>
        ) : null}
        {configStatus === 'error' && communityId != null && (
          <p className="booking-config-warning" role="status">
            No se pudo cargar la configuración de la comunidad; se muestran espacios por defecto.
          </p>
        )}
        {errors.facility && (
          <p className="form-error form-error--block" role="alert">{errors.facility}</p>
        )}
        {facilities == null ? (
          <p className="booking-config-loading" role="status">
            Cargando espacios configurados para tu comunidad…
          </p>
        ) : facilities.length === 0 ? (
          <p className="booking-config-warning" role="status">
            Esta comunidad no tiene espacios configurados para reservar. La administración puede añadirlos en Super
            Admin (pádel, gimnasio o salones en «Espacios / salones»).
          </p>
        ) : (
          <div className="booking-facility-grid">
            {facilities.map(({ id, name, icon }) => (
              <button
                key={id}
                type="button"
                className={`booking-facility-card card ${selectedFacility === id ? 'booking-facility-card--selected' : ''}`}
                onClick={() => handleFacilitySelect(id)}
                aria-pressed={selectedFacility === id}
              >
                <span className="booking-facility-icon" aria-hidden="true">{icon}</span>
                <span className="booking-facility-name">{name}</span>
              </button>
            ))}
          </div>
        )}
        {facilities != null && facilities.length > 0 && !selectedFacility && (
          <p className="booking-select-hint">Selecciona un espacio para continuar.</p>
        )}
      </section>

      {selectedFacility && spaceConfig && showGymAccessPanel && (
        <div className="booking-form card booking-gym-access-card">
          <div className="booking-form-header">
            <span className="booking-form-facility">
              {facilities ? facilityLabel(facilities, selectedFacility) : selectedFacility}
            </span>
            <button
              type="button"
              className="booking-form-change"
              onClick={() => setSelectedFacility(null)}
              aria-label="Cambiar espacio"
            >
              Cambiar
            </button>
          </div>
          <p className="booking-form-info booking-gym-access-intro">
            {isConciergeGymSupervisionOnly ? (
              <>
                Esta comunidad usa <strong>control de acceso</strong> al gimnasio. Aquí puedes consultar los registros
                de entrada y salida de la comunidad; el conserje no registra su propio acceso desde esta pantalla.
              </>
            ) : (
              <>
                Esta comunidad usa <strong>control de acceso</strong> al gimnasio. Registra tu entrada al entrar y tu
                salida al irte (no hace falta elegir fecha ni franja).
              </>
            )}
          </p>
          {!isConciergeGymSupervisionOnly && (
            <>
              <div className="booking-gym-access-actions">
                <button
                  type="button"
                  className={`btn btn--primary booking-gym-access-btn ${gymAccessPending === 'entrada' ? 'btn--loading' : ''}`}
                  disabled={!!gymAccessPending}
                  aria-busy={gymAccessPending === 'entrada'}
                  onClick={() => handleGymAccess('entrada')}
                >
                  {gymAccessPending === 'entrada' ? (
                    <>
                      <span className="btn__spinner" aria-hidden="true" />
                      <span>Registrando…</span>
                    </>
                  ) : (
                    'Entrada'
                  )}
                </button>
                <button
                  type="button"
                  className={`btn btn--secondary booking-gym-access-btn ${gymAccessPending === 'salida' ? 'btn--loading' : ''}`}
                  disabled={!!gymAccessPending}
                  aria-busy={gymAccessPending === 'salida'}
                  onClick={() => handleGymAccess('salida')}
                >
                  {gymAccessPending === 'salida' ? (
                    <>
                      <span className="btn__spinner" aria-hidden="true" />
                      <span>Registrando…</span>
                    </>
                  ) : (
                    'Salida'
                  )}
                </button>
              </div>
              {gymAccessMessage && (
                <p className="booking-gym-access-feedback" role="status">
                  {gymAccessMessage}
                </p>
              )}
            </>
          )}
          <div
            className={`booking-gym-access-recent ${isConciergeGymSupervisionOnly ? 'booking-gym-access-recent--solo-lista' : ''}`}
            aria-labelledby="booking-gym-recent-title"
          >
            <h3 id="booking-gym-recent-title" className="booking-gym-access-recent-title">
              {gymAccessPreviewScope === 'community'
                ? 'Últimos accesos al gimnasio (comunidad)'
                : 'Tus últimos accesos al gimnasio'}
            </h3>
            {!accessToken && (
              <p className="booking-field-hint" role="status">
                Inicia sesión para ver el historial de entradas y salidas.
              </p>
            )}
            {accessToken && gymAccessPreviewStatus === 'loading' && (
              <p className="booking-field-hint" role="status">
                Cargando registros…
              </p>
            )}
            {accessToken && gymAccessPreviewStatus === 'error' && (
              <p className="form-error form-error--inline" role="status">
                No se pudo cargar el historial del gimnasio.
              </p>
            )}
            {accessToken && gymAccessPreviewStatus === 'ok' && gymAccessPreviewItems.length === 0 && (
              <p className="booking-field-hint" role="status">
                Aún no hay entradas ni salidas registradas
                {gymAccessPreviewScope === 'community' ? ' en esta comunidad' : ''}.
              </p>
            )}
            {gymAccessPreviewItems.length > 0 && (
              <ul className="booking-gym-access-recent-list">
                {gymAccessPreviewItems.map((item) => (
                  <li key={item.id} className="booking-gym-access-recent-item card">
                    <span className="booking-gym-access-recent-label">{item.timeSlotLabel}</span>
                    <p className="booking-gym-access-recent-meta">{formatBookingMeta(item)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selectedFacility && spaceConfig && !showGymAccessPanel && (
        <form onSubmit={handleSubmit} className="booking-form card">
          <div className="booking-form-header">
            <span className="booking-form-facility">
              {facilities ? facilityLabel(facilities, selectedFacility) : selectedFacility}
            </span>
            <button
              type="button"
              className="booking-form-change"
              onClick={() => setSelectedFacility(null)}
              aria-label="Cambiar espacio"
            >
              Cambiar
            </button>
          </div>

          <p className="booking-form-info">
            {salonDayBookingFlow ? (
              <>
                Reserva <strong>día completo</strong> (un solo cupo por salón y fecha). Elige la fecha y confirma; no
                hay tramos horarios.
                {isStaffBookingMode ? (
                  <>
                    {' '}
                    Como gestión puedes saltar a cualquier día con «Ir a fecha concreta» y revisar hasta ~120 días
                    atrás (solo consulta; reservas nuevas solo dentro del plazo permitido).
                  </>
                ) : null}
              </>
            ) : (
              <>
                Duración máxima: {formatPadelHoursDisplay(spaceConfig.maxDurationHours)}{' '}
                {spaceConfig.maxDurationHours === 1 ? 'hora' : 'horas'}
                {isPadelFacilityId(selectedFacility) && communityBookingConfig ? (
                  <>
                    {' '}
                    · Plazo para elegir fecha: {padelHorizonDaysForCopy}{' '}
                    {padelHorizonDaysForCopy === 1 ? 'día natural' : 'días naturales'} desde hoy hacia adelante (en
                    el día actual no se muestran tramos ya pasados). Horario pádel:{' '}
                    {padTimeStr(communityBookingConfig.padelOpenTime) || '08:00'} –{' '}
                    {padTimeStr(communityBookingConfig.padelCloseTime) || '22:00'}.
                    {isStaffBookingMode ? (
                      <>
                        {' '}
                        Las reservas nuevas se hacen con la tira de días. Para ver ocupación de cualquier otra fecha,
                        usa «Consultar histórico» (solo lectura).
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </p>

          <div className="booking-field">
            <div className="form-label form-label--with-month" role="group" aria-label="Fecha de la reserva">
              <span>
                Fecha <span className="form-required">*</span>
              </span>
              <span className="booking-fecha-month">
                {booking.date ? bookingDateMonthYearEs(booking.date) : currentCalendarMonthYearEs()}
              </span>
            </div>
            {errors.date && <p className="form-error form-error--inline" role="alert">{errors.date}</p>}
            {staffShowsHistoryControl && (
              <div className="booking-staff-history-toggle">
                {staffHistoryMode ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={exitStaffHistoryMode}
                  >
                    Volver a reservar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      setStaffHistoryMode(true)
                      setPadelCapError('')
                      setBooking((prev) => ({
                        ...prev,
                        date: prev.date ?? localDateKey(new Date()),
                        timeSlot: null,
                      }))
                    }}
                  >
                    Consultar histórico
                  </button>
                )}
              </div>
            )}
            {staffHistoryMode && staffHistoryDateInputMinMax.min && (
              <div className="booking-staff-history-panel card">
                <label className="form-label" htmlFor="booking-staff-history-date-input">
                  Histórico — elegir día
                </label>
                <input
                  id="booking-staff-history-date-input"
                  type="date"
                  className="booking-concierge-date-input"
                  min={staffHistoryDateInputMinMax.min}
                  max={staffHistoryDateInputMinMax.max}
                  value={
                    booking.date && staffHistoryDateKeySet?.has(booking.date) ? booking.date : ''
                  }
                  onChange={(e) => handleStaffHistoryDateChange(e.target.value)}
                />
                <p className="booking-field-hint">
                  Solo consulta: ocupación y quién reservó. Para una reserva nueva, pulsa «Volver a reservar» y usa la
                  tira de días.
                </p>
              </div>
            )}
            {canOnBehalfBooking && !staffHistoryMode && accessToken && communityId != null && (
              <div className="booking-field booking-concierge-behalf">
                <label className="form-label" htmlFor="booking-on-behalf">
                  Reserva para
                </label>
                <select
                  id="booking-on-behalf"
                  className="booking-concierge-select"
                  value={staffOnBehalfUserId}
                  onChange={(e) => {
                    setStaffOnBehalfUserId(e.target.value)
                    setPadelCapError('')
                  }}
                  disabled={staffNeighborsStatus === 'loading'}
                >
                  {staffMayReserveAsSelf ? (
                    <option value="">Yo / cuenta actual</option>
                  ) : (
                    <option value="" disabled>
                      Elige un vecino…
                    </option>
                  )}
                  {staffNeighbors.map((n) => (
                    <option key={n.id} value={String(n.id)}>
                      {n.label}
                    </option>
                  ))}
                </select>
                {!staffMayReserveAsSelf && (
                  <p className="booking-field-hint" role="note">
                    Sin piso y portal propios en tu ficha, las reservas van siempre a nombre de un vecino (el
                    conserje suele no vivir en la comunidad).
                  </p>
                )}
                {staffNeighborsStatus === 'error' && (
                  <p className="form-error form-error--inline" role="status">
                    No se pudo cargar la lista de vecinos.
                  </p>
                )}
              </div>
            )}
            {!staffHistoryMode && dateOptions.length === 0 ? (
              <div className="booking-no-dates card">
                <p className="booking-no-dates-message">No hay fechas disponibles para este espacio.</p>
                <p className="booking-no-dates-explanation">Prueba otro espacio o vuelve a intentarlo más tarde.</p>
              </div>
            ) : !staffHistoryMode ? (
              <>
                {showSalonDatePickers ? (
                  <SalonBookingCalendar
                    monthYear={salonPickerMonth}
                    onMonthChange={handleSalonMonthChange}
                    selectedDate={booking.date}
                    onDateSelect={handleSalonDaySelect}
                    maxDaysInAdvance={spaceConfig.maxDaysInAdvance ?? 14}
                    minDaysInAdvance={spaceConfig.minDaysInAdvance ?? 0}
                    getDayStatus={getSalonCalendarDayStatus}
                    showPartialLegend={!salonDayBookingFlow}
                  />
                ) : (
                  <div className="booking-date-strip" role="group" aria-label="Días disponibles">
                    {dateOptions.map(({ key, day, num }) => (
                      <button
                        key={key}
                        type="button"
                        className={`booking-date-cell ${booking.date === key ? 'booking-date-cell--selected' : ''}`}
                        onClick={() => handleDateSelect(key)}
                        aria-pressed={booking.date === key}
                      >
                        <span className="booking-date-day">{day}</span>
                        <span className="booking-date-num">{num}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!isPadelFacilityId(selectedFacility) && (
                  <p className="booking-field-hint">
                    {salonAdvanceUnlimited ? (
                      <>Reserva con antelación amplia (hasta 1 año).</>
                    ) : (
                      <>
                        {(spaceConfig.minDaysInAdvance ?? 0) > 0 ? (
                          <>
                            Entre <strong>{spaceConfig.minDaysInAdvance}</strong> y{' '}
                            <strong>{spaceConfig.maxDaysInAdvance}</strong> días de antelación.
                          </>
                        ) : (
                          <>
                            Puedes reservar hasta {spaceConfig.maxDaysInAdvance}{' '}
                            {spaceConfig.maxDaysInAdvance === 1 ? 'día' : 'días'} por adelantado.
                          </>
                        )}
                      </>
                    )}
                  </p>
                )}
              </>
            ) : staffHistoryMode && !booking.date ? (
              <p className="booking-field-hint" role="status">
                Elige un día en el calendario del histórico para ver la ocupación.
              </p>
            ) : null}
          </div>

          {!salonDayBookingFlow ? (
            <div className="booking-field">
              <label className="form-label">Tramo horario <span className="form-required">*</span></label>
              {errors.timeSlot && (
                <p className="form-error form-error--inline" role="alert">{errors.timeSlot}</p>
              )}
              {isPadelFacilityId(selectedFacility) && !booking.date && dateOptions.length > 0 && (
                <p className="booking-field-hint" role="status">
                  Elige primero una fecha para ver los tramos disponibles.
                </p>
              )}
              {isPadelFacilityId(selectedFacility) && padelDailyCapInfo?.multi && !padelHistoryReadOnlyDay && !staffHistoryMode ? (
                <p className="booking-field-hint" role="status">
                  Puedes elegir varios tramos seguidos (hasta {padelDailyCapInfo.maxSlots} en este envío, máx.{' '}
                  {formatPadelHoursDisplay(padelDailyCapInfo.hDaily)} h/día por vivienda).
                  {(booking.padelSlotIds?.length ?? 0) > 0
                    ? ` Seleccionados: ${booking.padelSlotIds.length} tramo(s).`
                    : null}
                </p>
              ) : null}
              <div className="booking-slots">
                {padelSlotRowsForDisplay != null
                  ? padelSlotRowsForDisplay.map(({ slot, taken, occupantShort }) => {
                      const { id: slotId, label, range } = slot
                      if (taken) {
                        const occHint = occupantShort ? `, ${occupantShort}` : ''
                        return (
                          <div
                            key={slotId}
                            className="booking-slot-btn booking-slot-btn--occupied"
                            aria-disabled="true"
                            role="status"
                            aria-label={`${range}, ocupado${occHint}`}
                          >
                            <span className="booking-slot-occupied-main">
                              {label === range ? (
                                <span className="booking-slot-label">{label}</span>
                              ) : (
                                <>
                                  <span className="booking-slot-label">{label}</span>
                                  <span className="booking-slot-range">{range}</span>
                                </>
                              )}
                              {occupantShort ? (
                                <span className="booking-slot-occupant">{occupantShort}</span>
                              ) : null}
                            </span>
                            <span className="booking-slot-occupied-badge">Ocupado</span>
                          </div>
                        )
                      }
                      if (padelHistoryReadOnlyDay || staffHistoryMode) {
                        return (
                          <div
                            key={slotId}
                            className="booking-slot-btn booking-slot-btn--history-free"
                            aria-disabled="true"
                            role="status"
                            aria-label={`${range}, libre (solo consulta)`}
                          >
                            {label === range ? (
                              <span className="booking-slot-label">{label}</span>
                            ) : (
                              <>
                                <span className="booking-slot-label">{label}</span>
                                <span className="booking-slot-range">{range}</span>
                              </>
                            )}
                          </div>
                        )
                      }
                      const isSelected = (booking.padelSlotIds || []).includes(slotId)
                      return (
                        <button
                          key={slotId}
                          type="button"
                          className={`booking-slot-btn ${isSelected ? 'booking-slot-btn--selected' : ''}`}
                          onClick={() => handleTimeSlotSelect(slotId)}
                          aria-pressed={isSelected}
                        >
                          {label === range ? (
                            <span className="booking-slot-label">{label}</span>
                          ) : (
                            <>
                              <span className="booking-slot-label">{label}</span>
                              <span className="booking-slot-range">{range}</span>
                            </>
                          )}
                        </button>
                      )
                    })
                  : availableTimeSlots.map(({ id: slotId, label, range }) => (
                      <button
                        key={slotId}
                        type="button"
                        className={`booking-slot-btn ${booking.timeSlot === slotId ? 'booking-slot-btn--selected' : ''}`}
                        onClick={() => handleTimeSlotSelect(slotId)}
                        aria-pressed={booking.timeSlot === slotId}
                      >
                        {label === range ? (
                          <span className="booking-slot-label">{label}</span>
                        ) : (
                          <>
                            <span className="booking-slot-label">{label}</span>
                            <span className="booking-slot-range">{range}</span>
                          </>
                        )}
                      </button>
                    ))}
              </div>
            </div>
          ) : (
            <div className="booking-field">
              <p className="booking-field-hint" role="status">
                {booking.date && salonFullDayBookedForDate(allBookings, selectedFacility, booking.date) ? (
                  <span className="form-error form-error--inline">
                    Esa fecha ya está reservada (día completo) para este salón.
                    {salonDayOccupantHint ? (
                      <>
                        {' '}
                        <span className="booking-salon-occupant">({salonDayOccupantHint})</span>
                      </>
                    ) : null}
                  </span>
                ) : booking.date ? (
                  'Esta fecha está libre para una reserva de día completo.'
                ) : (
                  'Elige una fecha arriba.'
                )}
              </p>
            </div>
          )}

          {staffHistoryMode && (
            <p className="booking-field-hint" role="status">
              Modo histórico: solo consulta. Pulsa «Volver a reservar» para elegir vecino, día en la tira y confirmar.
            </p>
          )}
          {!staffHistoryMode && (padelHistoryReadOnlyDay || salonHistoryReadOnlyDay) && (
            <p className="booking-field-hint" role="status">
              Ayer y días pasados en la tira son solo consulta. Elige hoy o un día futuro en la tira para confirmar la
              reserva.
            </p>
          )}
          {padelCapError && (
            <p className="form-error form-error--block" role="alert">
              {padelCapError}
            </p>
          )}
          {!staffHistoryMode && salonFacilityHasRegulations(spaceConfig) ? (
            <div className="booking-salon-regulations card" role="region" aria-label="Normas del espacio">
              <h3 className="booking-salon-regulations-title">Normas de uso</h3>
              {(spaceConfig.usageFeeEur > 0 || spaceConfig.depositEur > 0) && (
                <ul className="booking-salon-regulations-fees">
                  {spaceConfig.usageFeeEur > 0 ? (
                    <li>
                      Tasa de uso: <strong>{spaceConfig.usageFeeEur} €</strong>
                    </li>
                  ) : null}
                  {spaceConfig.depositEur > 0 ? (
                    <li>
                      Fianza (devolución si no hay desperfectos): <strong>{spaceConfig.depositEur} €</strong>
                    </li>
                  ) : null}
                </ul>
              )}
              {spaceConfig.rulesText ? (
                <div className="booking-salon-regulations-text">{spaceConfig.rulesText}</div>
              ) : null}
              {isStaffBookingMode && (spaceConfig.usageFeeEur > 0 || spaceConfig.depositEur > 0) ? (
                <div className="booking-salon-payments">
                  <p className="booking-salon-payments-title">Cobro en conserjería</p>
                  <p className="booking-field-hint booking-salon-payments-hint">
                    Marca lo que el vecino entrega al reservar (como en el cuaderno de reservas).
                  </p>
                  {spaceConfig.usageFeeEur > 0 ? (
                    <label className="booking-salon-payment-check">
                      <input
                        type="checkbox"
                        checked={usageFeePaid}
                        onChange={(e) => setUsageFeePaid(e.target.checked)}
                      />
                      <span>
                        Tasa de uso cobrada <strong>({spaceConfig.usageFeeEur} €)</strong>
                      </span>
                    </label>
                  ) : null}
                  {spaceConfig.depositEur > 0 ? (
                    <label className="booking-salon-payment-check">
                      <input
                        type="checkbox"
                        checked={depositPaid}
                        onChange={(e) => setDepositPaid(e.target.checked)}
                      />
                      <span>
                        Fianza entregada <strong>({spaceConfig.depositEur} €)</strong>
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="booking-field-hint">
                  Al confirmar la reserva aceptas estas normas. El pago de tasas y fianza se gestiona con la
                  administración.
                </p>
              )}
            </div>
          ) : null}
          <button
            type="submit"
            className={`btn btn--primary btn--block booking-submit ${isSubmitting ? 'btn--loading' : ''}`}
            disabled={
              isSubmitting ||
              staffHistoryMode ||
              padelHistoryReadOnlyDay ||
              salonHistoryReadOnlyDay ||
              (salonDayBookingFlow &&
                booking.date &&
                salonFullDayBookedForDate(allBookings, selectedFacility, booking.date))
            }
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="btn__spinner" aria-hidden="true" />
                <span>Enviando…</span>
              </>
            ) : (
              'Confirmar reserva'
            )}
          </button>
        </form>
      )}

      <section className="booking-my-records-section" aria-labelledby="booking-my-records-title">
        <div className="booking-my-records-head">
          <h2 id="booking-my-records-title" className="section-label">
            {isStaffBookingMode ? 'Registros recientes de la comunidad' : 'Tus registros recientes'}
          </h2>
          <Link to="/activity" className="booking-my-records-link">
            Ver todo
          </Link>
        </div>
        {cancelError ? (
          <p className="form-error form-error--block booking-cancel-error" role="alert">
            {cancelError}
          </p>
        ) : null}
        {depositReturnError ? (
          <p className="form-error form-error--block booking-cancel-error" role="alert">
            {depositReturnError}
          </p>
        ) : null}
        {recentRecordsPreview.length === 0 ? (
          <div className="booking-my-records-empty card">
            <p className="booking-my-records-empty-text">
              {isStaffBookingMode
                ? 'No hay reservas recientes en el servidor para esta comunidad.'
                : user?.email
                  ? 'Aún no hay registros vinculados a tu cuenta aquí.'
                  : 'Aún no hay registros. Usa Entrada/Salida o confirma una reserva.'}
            </p>
          </div>
        ) : (
          <ul className="booking-my-records-list">
            {recentRecordsPreview.map((item) => (
              <li key={item.id} className="booking-my-records-item card">
                <div className="booking-my-records-item-main">
                  <span className="booking-my-records-facility">{item.facility}</span>
                  <p className="booking-my-records-meta">{formatBookingMeta(item)}</p>
                  <BookingPaymentStatus
                    item={item}
                    customLocations={communityBookingConfig?.customLocations}
                    isStaff={isStaffBookingMode}
                    onMarkPayment={handleMarkPayment}
                    onDepositReturn={handleMarkDepositReturn}
                    paymentActionBusyId={paymentActionBusyId}
                  />
                </div>
                {canCancelBookingItem(item) ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm booking-cancel-btn"
                    disabled={cancellingBookingId === item.serverId}
                    onClick={() => handleCancelBooking(item)}
                  >
                    {cancellingBookingId === item.serverId ? 'Cancelando…' : 'Cancelar reserva'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}

      {showManagement && (
        <section className="booking-management-section">
          <h2 className="section-label">Reservas de la comunidad (gestión)</h2>
          <div className="booking-management-list">
            {communityBookingsForManagement.length === 0 ? (
              <div className="booking-management-empty card">
                <p className="booking-management-empty-text">
                  No hay reservas en el servidor para esta comunidad.
                </p>
              </div>
            ) : (
              communityBookingsForManagement.map((item) => (
                <div key={item.id} className="booking-management-card card">
                  <div className="booking-management-card-main">
                    <span className="booking-management-facility">{item.facility}</span>
                    <p className="booking-management-meta">{formatBookingMeta(item)}</p>
                    <BookingPaymentStatus
                      item={item}
                      customLocations={communityBookingConfig?.customLocations}
                      isStaff={isStaffBookingMode}
                      onMarkPayment={handleMarkPayment}
                      onDepositReturn={handleMarkDepositReturn}
                      paymentActionBusyId={paymentActionBusyId}
                    />
                  </div>
                  {canCancelBookingItem(item) ? (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm booking-cancel-btn"
                      disabled={cancellingBookingId === item.serverId}
                      onClick={() => handleCancelBooking(item)}
                    >
                      {cancellingBookingId === item.serverId ? 'Cancelando…' : 'Cancelar reserva'}
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
