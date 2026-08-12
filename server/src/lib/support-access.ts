/**
 * Quién puede usar Soporte self-service (crear / ver / responder sus tickets).
 * Canal profesional: no vecinos ni presidentes “normales”.
 *
 * company_admin cubre administración y prestación de servicios (mismo rol JWT;
 * el kind vive en Company).
 */
export const SUPPORT_SELF_SERVICE_ROLES = [
  'concierge',
  'community_admin',
  'company_admin',
  'super_admin',
] as const

export type SupportSelfServiceRole = (typeof SUPPORT_SELF_SERVICE_ROLES)[number]

export function canUseSupportSelfService(role: string | null | undefined): boolean {
  return (
    role === 'concierge' ||
    role === 'community_admin' ||
    role === 'company_admin' ||
    role === 'super_admin'
  )
}
