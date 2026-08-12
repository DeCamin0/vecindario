/** Catálogo Soporte — labels (alineado con server support-catalog). */

export const SUPPORT_AREA_LABELS = {
  account_access: 'Acceso / Cuenta',
  services: 'Servicios',
  incidents: 'Incidencias',
  bookings: 'Reservas',
  pool: 'Piscina',
  parcels_keys: 'Paquetería / Llaves',
  diario: 'Cuaderno diario',
  control_entry: 'Control de entrada',
  community_management: 'Comunidad / Gestión',
  app_notifications: 'App / Notificaciones',
  billing_plan: 'Facturación / Plan',
  other: 'Otro',
}

export const SUPPORT_STATUS_LABELS = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_user: 'Esperando usuario',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

export const SUPPORT_PRIORITY_LABELS = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

export function supportAreaLabel(code) {
  return SUPPORT_AREA_LABELS[code] || code || '—'
}

export function supportStatusLabel(code) {
  return SUPPORT_STATUS_LABELS[code] || code || '—'
}

export function supportPriorityLabel(code) {
  return SUPPORT_PRIORITY_LABELS[code] || code || '—'
}

export function formatSupportWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}
