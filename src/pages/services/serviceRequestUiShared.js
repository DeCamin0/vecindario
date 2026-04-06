import { SERVICE_CATEGORIES } from '../../constants/serviceRequests.js'

export function categoryMeta(id) {
  return SERVICE_CATEGORIES.find((c) => c.id === id) ?? { name: id, icon: '📌' }
}

export function serviceRequestStatusBadgeClass(status) {
  if (status === 'completed') return 'sr-badge--done'
  if (status === 'rejected') return 'sr-badge--bad'
  if (status === 'price_sent') return 'sr-badge--price'
  if (status === 'in_progress') return 'sr-badge--progress'
  if (status === 'accepted') return 'sr-badge--ok'
  return 'sr-badge--muted'
}

/** Misma lógica que la vista vecino — pasos del flujo de servicio. */
export function buildServiceProgressSteps(status) {
  const base = [
    { key: 's0', label: 'Recibida', sub: 'Administración revisa tu solicitud' },
    { key: 's1', label: 'Presupuesto', sub: 'Te enviamos un precio orientativo' },
    { key: 's2', label: 'Confirmación', sub: 'Aceptas o rechazas la propuesta' },
    { key: 's3', label: 'Servicio', sub: 'Proveedor asignado y trabajo en curso' },
    { key: 's4', label: 'Finalizada', sub: 'Servicio completado' },
  ]

  if (status === 'rejected') {
    return base.map((s, i) => {
      if (i <= 1) return { ...s, state: 'done' }
      if (i === 2)
        return {
          ...s,
          label: 'Propuesta rechazada',
          sub: 'Puedes crear una nueva solicitud cuando quieras',
          state: 'failed',
        }
      return { ...s, state: 'upcoming' }
    })
  }

  if (status === 'completed') {
    return base.map((s) => ({ ...s, state: 'done' }))
  }

  const idx =
    status === 'pending_review'
      ? 0
      : status === 'price_sent'
        ? 1
        : status === 'accepted'
          ? 2
          : status === 'in_progress'
            ? 3
            : 0

  return base.map((s, i) => {
    if (i < idx) return { ...s, state: 'done' }
    if (i === idx) return { ...s, state: 'current' }
    return { ...s, state: 'upcoming' }
  })
}
