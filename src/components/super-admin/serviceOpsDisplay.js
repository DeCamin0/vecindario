/**
 * V6 — helpers presentacionales Servicios / Solicitudes (sin componentes).
 */

export function serviceStatusTone(status) {
  if (status === 'pending_review') return 'pending'
  if (status === 'price_sent') return 'info'
  if (status === 'accepted') return 'ok'
  if (status === 'rejected') return 'bad'
  if (status === 'in_progress') return 'active'
  if (status === 'completed') return 'done'
  return 'muted'
}

const QUOTE_STATUS_LABELS = {
  new: 'Nueva',
  reviewed: 'Revisada',
  contacted: 'Contactada',
  closed: 'Cerrada',
}

export function quoteStatusLabel(status) {
  return QUOTE_STATUS_LABELS[status] || status
}

export function quoteTabsLabel(row) {
  const parts = []
  if (row.wantServices) parts.push('Servicios')
  if (row.wantIncidents) parts.push('Incidencias')
  if (row.wantBookings) parts.push('Reservas')
  if (row.wantPoolAccess) parts.push('Piscina')
  return parts.length ? parts.join(' · ') : '—'
}
