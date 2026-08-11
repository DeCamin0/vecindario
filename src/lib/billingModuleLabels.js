/**
 * Etiquetas legibles de módulos de billing (solo presentación UI).
 * No redefine reglas comerciales ni mapping flag↔módulo.
 */
export const BILLING_MODULE_LABELS = {
  incidents: 'Incidencias',
  bookings: 'Reservas',
  services: 'Servicios',
  pool: 'Acceso piscina',
  parcels: 'Paquetería',
  key_loans: 'Registro de llaves',
  diario: 'Cuaderno diario',
  control_entrada: 'Control de entrada',
}

export function billingModuleLabel(code) {
  return BILLING_MODULE_LABELS[code] || code || '—'
}

export function summarizeFlagDiff(flagDiff) {
  const modules = Array.isArray(flagDiff?.modules) ? flagDiff.modules : []
  return {
    ok: modules.filter((m) => m.status === 'ok').length,
    activeNotContracted: modules.filter((m) => m.status === 'active_not_contracted').length,
    contractedNotActive: modules.filter((m) => m.status === 'contracted_not_active').length,
    specialDeliveryInfo: flagDiff?.specialDelivery?.status === 'info_without_parcels_contract',
  }
}
