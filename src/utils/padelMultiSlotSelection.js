/** Selección múltiple de tramos pádel consecutivos (p. ej. 3×0,5 h = 1,5 h/día en un envío). */

/**
 * @param {number} hBook horas por tramo/reserva
 * @param {number} hDaily tope diario por vivienda
 * @param {number} usedHours ya reservadas ese día
 */
export function padelMaxSlotsSelectable(hBook, hDaily, usedHours = 0) {
  if (!Number.isFinite(hBook) || hBook <= 0) return 1
  if (!Number.isFinite(hDaily) || hDaily <= 0) return 1
  const remaining = Math.max(0, hDaily - (Number.isFinite(usedHours) ? usedHours : 0))
  const byRemaining = Math.floor(remaining / hBook + 1e-9)
  const byDailyCap = Math.floor(hDaily / hBook + 1e-9)
  return Math.max(1, Math.min(byRemaining, byDailyCap))
}

export function padelMultiSlotSelectionEnabled(hBook, hDaily) {
  return padelMaxSlotsSelectable(hBook, hDaily, 0) > 1
}

/**
 * @param {string[]} currentIds
 * @param {string} slotId
 * @param {{ id: string, startMin: number }[]} slotsOrdered por hora
 * @param {number} maxCount
 */
export function padelToggleSlotSelection(currentIds, slotId, slotsOrdered, maxCount) {
  const max = Math.max(1, maxCount)
  const idx = slotsOrdered.findIndex((s) => s.id === slotId)
  if (idx < 0) return currentIds

  const cur = [...(currentIds || [])]
  if (cur.length === 0) return [slotId]

  const posInCur = cur.indexOf(slotId)
  if (posInCur >= 0) {
    if (cur.length === 1) return []
    const ordered = cur
      .map((id) => slotsOrdered.find((s) => s.id === id))
      .filter(Boolean)
      .sort((a, b) => a.startMin - b.startMin)
    const clickPos = ordered.findIndex((s) => s.id === slotId)
    if (clickPos === 0) return ordered.slice(1).map((s) => s.id)
    if (clickPos === ordered.length - 1) return ordered.slice(0, -1).map((s) => s.id)
    return ordered.filter((s) => s.id !== slotId).map((s) => s.id)
  }

  const selected = cur
    .map((id) => slotsOrdered.find((s) => s.id === id))
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin)
  const firstIdx = slotsOrdered.findIndex((s) => s.id === selected[0].id)
  const lastIdx = slotsOrdered.findIndex((s) => s.id === selected[selected.length - 1].id)

  if (idx === firstIdx - 1) {
    const next = [slotId, ...cur]
    return next.length <= max ? next : cur
  }
  if (idx === lastIdx + 1) {
    const next = [...cur, slotId]
    return next.length <= max ? next : cur
  }

  return [slotId]
}

export function padelSlotsSortedByTime(slots, selectedIds) {
  const ids = new Set(selectedIds || [])
  return slots
    .filter((s) => ids.has(s.id))
    .sort((a, b) => a.startMin - b.startMin)
}
