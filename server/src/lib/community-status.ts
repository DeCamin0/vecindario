/**
 * Estados operativos: vecinos, VEC, staff por ficha pueden usar la comunidad.
 * pending_approval e inactive quedan fuera.
 */
export const COMMUNITY_OPERATIONAL_STATUSES = ['active', 'demo'] as const

export type CommunityOperationalStatus = (typeof COMMUNITY_OPERATIONAL_STATUSES)[number]

export function isCommunityOperationalStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return (COMMUNITY_OPERATIONAL_STATUSES as readonly string[]).includes(status)
}

/** Filtro Prisma: comunidad usable en rutas públicas y login. */
export function communityOperationalWhere() {
  return { status: { in: [...COMMUNITY_OPERATIONAL_STATUSES] } }
}
