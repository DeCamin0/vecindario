/** Solapamiento de tramos pádel (reserva guardada vs franja ofrecida). */

export function minuteRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

/** Minutos de una reserva (servidor o cliente). */
export function padelBookingMinuteRange(booking) {
  if (!booking || typeof booking !== 'object') return null
  const sm = Number(booking.startMinute)
  const em = Number(booking.endMinute)
  if (Number.isFinite(sm) && Number.isFinite(em) && em > sm) {
    return { start: sm, end: em }
  }
  const key =
    (typeof booking.timeSlot === 'string' && booking.timeSlot) ||
    (typeof booking.slotKey === 'string' && booking.slotKey) ||
    ''
  const minM = /^min-(\d+)-(\d+)$/.exec(key)
  if (minM) {
    const start = Number(minM[1])
    const end = Number(minM[2])
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return { start, end }
    }
  }
  const padelM = /^padel-(\d+)-(\d+)$/.exec(key)
  if (padelM) {
    const start = Number(padelM[1])
    const end = Number(padelM[2])
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return { start, end }
    }
  }
  return null
}

function normalizeTimeRangeLabel(s) {
  return String(s || '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * ¿La reserva ocupa (total o parcialmente) la franja pádel?
 * @param {object} booking
 * @param {{ id: string, startMin: number, endMin: number, range?: string }} slot
 */
export function padelBookingOverlapsSlot(booking, slot) {
  if (!slot) return false
  if (booking?.timeSlot && booking.timeSlot === slot.id) return true
  if (booking?.slotKey && booking.slotKey === slot.id) return true
  const br = padelBookingMinuteRange(booking)
  if (
    br &&
    Number.isFinite(slot.startMin) &&
    Number.isFinite(slot.endMin) &&
    minuteRangesOverlap(br.start, br.end, slot.startMin, slot.endMin)
  ) {
    return true
  }
  const tl = normalizeTimeRangeLabel(booking?.timeSlotLabel || booking?.slotLabel)
  const rl = normalizeTimeRangeLabel(slot.range)
  return Boolean(tl && rl && tl === rl)
}
