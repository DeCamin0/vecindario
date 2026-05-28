/** Contacto del distribuidor / gestor para servicios opcionales (p. ej. avisos WhatsApp). */
const raw =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_VECINDARIO_DISTRIBUTOR_EMAIL
    ? String(import.meta.env.VITE_VECINDARIO_DISTRIBUTOR_EMAIL).trim()
    : ''

export const DISTRIBUTOR_CONTACT_EMAIL = raw || 'vecindario@decaminoservicios.com'

export function distributorMailtoUrl(subject) {
  const subj = encodeURIComponent(subject)
  return `mailto:${DISTRIBUTOR_CONTACT_EMAIL}?subject=${subj}`
}
