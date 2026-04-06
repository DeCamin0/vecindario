/** Etiquetas para listas (reservas + gimnasio entrada/salida). */
export const TIME_SLOT_LABELS = {
  morning: 'Mañana (08:00 – 12:00)',
  afternoon: 'Tarde (12:00 – 18:00)',
  evening: 'Noche (18:00 – 22:00)',
  entrada: 'Entrada gimnasio',
  salida: 'Salida gimnasio',
  'full-day': 'Día completo',
  fullDay: 'Día completo',
}

function formatShortDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Hora local desde ISO (registro en el dispositivo del usuario). */
export function formatRecordedTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Línea secundaria para tarjetas de reserva: fecha reserva · franja · hora registro · vecino/piso.
 */
export function formatBookingMeta(item) {
  const slot =
    (item.timeSlotLabel && String(item.timeSlotLabel).trim()) ||
    TIME_SLOT_LABELS[item.timeSlot] ||
    item.timeSlot ||
    '—'
  const datePart = formatShortDate(item.date)
  const parts = [datePart, slot]
  const regTime = formatRecordedTime(item.recordedAt)
  if (regTime) parts.push(`registro ${regTime}`)
  const who = []
  if (item.userName || item.userEmail) {
    who.push(item.userName || item.userEmail)
  }
  if (item.portal?.trim()) {
    who.push(`Portal ${item.portal.trim()}`)
  }
  if (item.piso?.trim()) {
    who.push(`Piso ${item.piso.trim()}`)
  }
  if (who.length) parts.push(who.join(' · '))
  return parts.join(' · ')
}

/**
 * Fila del GET /api/bookings/activity → shape esperado por formatBookingMeta en Actividad.
 * @param {object} row
 * @returns {object}
 */
export function mapActivityApiItem(row) {
  if (row.kind === 'gym_access') {
    const tipo = String(row.tipo || '').toLowerCase()
    return {
      id: `gym-${row.id}`,
      facility: 'Gimnasio',
      date: String(row.recordedAt || '').slice(0, 10),
      timeSlot: tipo === 'salida' ? 'salida' : 'entrada',
      timeSlotLabel: tipo === 'salida' ? 'Salida gimnasio' : 'Entrada gimnasio',
      recordedAt: row.recordedAt,
      ...(row.actorEmail ? { userEmail: row.actorEmail, userName: String(row.actorEmail).split('@')[0] } : {}),
      ...(row.actorPiso ? { piso: row.actorPiso } : {}),
      ...(row.actorPortal ? { portal: row.actorPortal } : {}),
    }
  }
  const slotLabel =
    (row.slotLabel && String(row.slotLabel).trim()) ||
    row.facilityName ||
    row.facilityId ||
    '—'
  return {
    id: `bk-${row.id}`,
    facility: row.facilityName || row.facilityId || 'Reserva',
    facilityId: row.facilityId,
    date: row.bookingDate,
    timeSlot: row.slotKey || 'booking',
    timeSlotLabel: slotLabel,
    recordedAt: row.recordedAt,
    ...(row.actorEmail ? { userEmail: row.actorEmail, userName: String(row.actorEmail).split('@')[0] } : {}),
    ...(row.actorPiso ? { piso: row.actorPiso } : {}),
    ...(row.actorPortal ? { portal: row.actorPortal } : {}),
  }
}
