export const SERVICE_CATEGORIES = [
  { id: 'plumber', name: 'Fontanero', icon: '🔧' },
  { id: 'electrician', name: 'Electricista', icon: '⚡' },
  { id: 'locksmith', name: 'Cerrajero', icon: '🔑' },
  { id: 'cleaning', name: 'Limpieza', icon: '🧹' },
  { id: 'renovation', name: 'Renovación', icon: '🛠️' },
  { id: 'other', name: 'Otro', icon: '📋' },
]

/** modes desde GET /api/public/community-config; null/undefined = todas activas. */
export function isServiceCategoryActiveForCommunity(modes, categoryId) {
  if (!modes || typeof modes !== 'object') return true
  return modes[categoryId] !== 'soon'
}

export function defaultServiceCategoryModesRecord() {
  return Object.fromEntries(SERVICE_CATEGORIES.map((c) => [c.id, 'active']))
}

/** Subtipos obligatorios si el vecino elige Limpieza (ids = BD / API). */
export const CLEANING_SUBTYPES = [
  { id: 'cleaning_general', name: 'Limpieza general' },
  { id: 'cleaning_deep', name: 'Limpieza profunda' },
  { id: 'cleaning_post_work', name: 'Limpieza fin de obra' },
  { id: 'cleaning_one_off', name: 'Limpieza puntual' },
]

export const PLUMBER_SUBTYPES = [
  { id: 'plumber_leak_repair', name: 'Reparación de fugas' },
  { id: 'plumber_unblock', name: 'Desatascos' },
  { id: 'plumber_tap_install', name: 'Instalación de grifos' },
  { id: 'plumber_toilet_install', name: 'Instalación de sanitarios' },
  { id: 'plumber_pressure', name: 'Problemas de presión' },
  { id: 'plumber_cistern', name: 'Reparación de cisterna' },
  { id: 'plumber_urgent', name: 'Averías urgentes' },
]

export const RENOVATION_SUBTYPES = [
  { id: 'renovation_full_home', name: 'Reforma completa vivienda' },
  { id: 'renovation_kitchen', name: 'Reforma cocina' },
  { id: 'renovation_bathroom', name: 'Reforma baño' },
  { id: 'renovation_paint', name: 'Pintura general' },
  { id: 'renovation_floors', name: 'Cambio de suelos' },
  { id: 'renovation_partial', name: 'Reforma parcial' },
  { id: 'renovation_misc', name: 'Arreglos varios' },
]

/** Categorías con subtipo obligatorio en el formulario. */
export const SERVICE_CATEGORIES_WITH_SUBTYPE = ['cleaning', 'plumber', 'renovation']

export function serviceSubtypeChipLabelEs(categoryId) {
  if (categoryId === 'cleaning') return 'Tipo de limpieza'
  if (categoryId === 'plumber') return 'Tipo de trabajo'
  if (categoryId === 'renovation') return 'Tipo de reforma'
  return 'Detalle'
}

export function serviceSubtypePickErrorEs(categoryId) {
  if (categoryId === 'cleaning') return 'Elige un tipo de limpieza.'
  if (categoryId === 'plumber') return 'Elige un tipo de trabajo de fontanería.'
  if (categoryId === 'renovation') return 'Elige un tipo de reforma.'
  return 'Elige un subtipo.'
}

export const CLEANING_DISCLAIMER_ES =
  'Limpieza profesional puntual para tu vivienda (no es empleada de hogar)'

export const PHOTO_REQUIRED_ERROR_ES = 'Debes añadir al menos una foto para continuar'

export const MAX_SERVICE_REQUEST_PHOTOS = 5
export const MIN_SERVICE_REQUEST_PHOTOS = 1

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
