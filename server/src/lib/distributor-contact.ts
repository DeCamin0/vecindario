/** Email del distribuidor / soporte producto (env o valor por defecto). */
export function distributorContactEmail(): string {
  const raw = process.env.VECINDARIO_DISTRIBUTOR_EMAIL?.trim()
  return raw || 'vecindario@decaminoservicios.com'
}
