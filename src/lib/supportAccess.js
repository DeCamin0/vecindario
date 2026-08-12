/** Roles que pueden usar Soporte (web/PWA). Mirror de server support-access. */
export const SUPPORT_SELF_SERVICE_ROLES = [
  'concierge',
  'community_admin',
  'company_admin',
  'super_admin',
]

export function canUseSupportSelfService(role) {
  return SUPPORT_SELF_SERVICE_ROLES.includes(role)
}
