/** Catálogo cerrado Soporte / Tickets. */

export const SUPPORT_AREA_CODES = [
  'account_access',
  'services',
  'incidents',
  'bookings',
  'pool',
  'parcels_keys',
  'diario',
  'control_entry',
  'community_management',
  'app_notifications',
  'billing_plan',
  'other',
] as const

export type SupportAreaCode = (typeof SUPPORT_AREA_CODES)[number]

export const SUPPORT_AREA_LABELS: Record<SupportAreaCode, string> = {
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

export const SUPPORT_STATUSES = [
  'open',
  'in_progress',
  'waiting_user',
  'resolved',
  'closed',
] as const

export type SupportStatus = (typeof SUPPORT_STATUSES)[number]

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_user: 'Esperando usuario',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

export const SUPPORT_SUBJECT_MAX = 200
export const SUPPORT_BODY_MAX = 8000

export function isSupportAreaCode(v: unknown): v is SupportAreaCode {
  return typeof v === 'string' && (SUPPORT_AREA_CODES as readonly string[]).includes(v)
}

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === 'string' && (SUPPORT_STATUSES as readonly string[]).includes(v)
}

export function isSupportPriority(v: unknown): v is SupportPriority {
  return typeof v === 'string' && (SUPPORT_PRIORITIES as readonly string[]).includes(v)
}

export function supportAreasCatalog() {
  return SUPPORT_AREA_CODES.map((code) => ({ code, label: SUPPORT_AREA_LABELS[code] }))
}

export function supportStatusesCatalog() {
  return SUPPORT_STATUSES.map((code) => ({ code, label: SUPPORT_STATUS_LABELS[code] }))
}

export function supportPrioritiesCatalog() {
  return SUPPORT_PRIORITIES.map((code) => ({ code, label: SUPPORT_PRIORITY_LABELS[code] }))
}
