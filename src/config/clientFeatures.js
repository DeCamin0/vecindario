/**
 * Preferencias por cliente / despliegue (Vite inyecta import.meta.env en build).
 *
 * Gimnasio — control de acceso (Entrada / Salida) en lugar de reserva por franjas:
 * - Producción sin variable: desactivado (formulario clásico).
 * - Activar para un cliente: VITE_VECINDARIO_GYM_ACCESS_CONTROL=true
 * - Desactivar en dev: VITE_VECINDARIO_GYM_ACCESS_CONTROL=false
 * - En `npm run dev`: activo por defecto para probar (salvo que pongas false arriba).
 */
export function isGymAccessControlEnabled() {
  const v = import.meta.env.VITE_VECINDARIO_GYM_ACCESS_CONTROL
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'false' || s === '0' || s === 'no') return false
    if (s === 'true' || s === '1' || s === 'yes') return true
  }
  return Boolean(import.meta.env.DEV)
}
