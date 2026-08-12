/** Ruta de deep-link para notificaciones de soporte (web). */
export function supportNotificationPath(type, ticketId) {
  const id = Number(ticketId)
  if (!Number.isInteger(id) || id < 1) return null
  if (type === 'support_ticket_new' || type === 'support_message_in') {
    return `/admin/support?ticket=${id}`
  }
  if (typeof type === 'string' && type.startsWith('support_')) {
    return `/profile/soporte/${id}`
  }
  return null
}

/** Resuelve id de ticket: campo dedicado o `#123` en body/title (notifs antiguas). */
export function resolveSupportTicketId(n) {
  const direct = Number(n?.supportTicketId)
  if (Number.isInteger(direct) && direct >= 1) return direct
  if (typeof n?.type !== 'string' || !n.type.startsWith('support_')) return null
  const m = String(n.body || n.title || '').match(/#(\d+)/)
  if (!m) return null
  const id = Number(m[1])
  return Number.isInteger(id) && id >= 1 ? id : null
}
