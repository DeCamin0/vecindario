export const SERVICE_CATEGORIES = [
  { id: 'plumber', name: 'Fontanero', icon: '🔧' },
  { id: 'electrician', name: 'Electricista', icon: '⚡' },
  { id: 'locksmith', name: 'Cerrajero', icon: '🔑' },
  { id: 'cleaning', name: 'Limpieza', icon: '🧹' },
  { id: 'renovation', name: 'Renovación', icon: '🛠️' },
  { id: 'other', name: 'Otro', icon: '📋' },
]

/** Subtipos obligatorios si el vecino elige Limpieza (ids = BD / API). */
export const CLEANING_SUBTYPES = [
  { id: 'cleaning_general', name: 'Limpieza general' },
  { id: 'cleaning_deep', name: 'Limpieza profunda' },
  { id: 'cleaning_post_work', name: 'Limpieza fin de obra' },
  { id: 'cleaning_one_off', name: 'Limpieza puntual' },
]

export const CLEANING_DISCLAIMER_ES =
  'Servicios puntuales de limpieza profesional: no es empleada de hogar ni contrato doméstico fijo.'

/** Texto para mostrar presupuesto: una cifra o "min – max €". */
export function formatServicePriceDisplay(priceAmount, priceAmountMax) {
  const min =
    priceAmount != null && priceAmount !== ''
      ? Number(typeof priceAmount === 'string' ? priceAmount.replace(',', '.') : priceAmount)
      : NaN
  const maxRaw =
    priceAmountMax != null && priceAmountMax !== ''
      ? Number(
          typeof priceAmountMax === 'string' ? priceAmountMax.replace(',', '.') : priceAmountMax,
        )
      : NaN
  if (!Number.isFinite(min)) return null
  const fmt = (n) =>
    n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!Number.isFinite(maxRaw) || maxRaw <= min) return `${fmt(min)} €`
  return `${fmt(min)} – ${fmt(maxRaw)} €`
}

export const SERVICE_STATUS_LABELS = {
  pending_review: 'En revisión',
  price_sent: 'Presupuesto enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  in_progress: 'En curso',
  completed: 'Completado',
}

/** Mostrar hilo de mensajes (vecino): desde la solicitud hasta el cierre. */
export const SERVICE_MESSAGE_THREAD_STATUSES = [
  'pending_review',
  'price_sent',
  'accepted',
  'rejected',
  'in_progress',
  'completed',
]

/** Permitir escribir hasta completar o rechazar (rechazo = solo lectura del hilo). */
export const SERVICE_MESSAGE_COMPOSE_STATUSES = [
  'pending_review',
  'price_sent',
  'accepted',
  'in_progress',
]

export function serviceMessageResidentSubtitle(status) {
  const t = {
    pending_review: 'Añade detalles o aclaraciones mientras revisamos tu solicitud.',
    price_sent: 'Pregunta lo que necesites antes de aceptar o rechazar.',
    accepted: 'Seguimos en contacto mientras asignamos proveedor.',
    in_progress: 'Coordina con administración mientras el servicio está en curso.',
    completed: 'Historial de la conversación (solo lectura).',
    rejected: 'Historial de la conversación sobre esta solicitud.',
  }
  return t[status] ?? ''
}
