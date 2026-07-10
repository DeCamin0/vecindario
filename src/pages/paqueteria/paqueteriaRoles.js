/** Lista completa de paquetes de la comunidad. */
export const PAQUETERIA_STAFF_LIST_ROLES = new Set([
  'concierge',
  'community_admin',
  'super_admin',
])

/** UI eliminar registro oculto de momento; API DELETE /parcels/:id sigue en servidor. */
export const PAQUETERIA_DELETE_UI_ENABLED = false

/** Registrar en conserjería y confirmar recogida con firma. */
export const PAQUETERIA_OPERATE_ROLES = new Set(['concierge', 'super_admin'])

export function canRegisterPaquete(userRole) {
  return PAQUETERIA_OPERATE_ROLES.has(userRole)
}

export function canConfirmPaquetePickup(userRole) {
  return PAQUETERIA_OPERATE_ROLES.has(userRole)
}
