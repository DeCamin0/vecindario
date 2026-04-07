import { prisma } from './prisma.js'
import { communityOperationalWhere } from './community-status.js'
import { todayDateInTz } from './community-dashboard-stats.js'
import { estimateDwellingUnitsFromPortalConfig } from './portal-dwelling-config.js'

export type AdminOperationalAggregates = {
  /**
   * Suma en comunidades operativas: por cada una, «Nº vecinos» en ficha si existe;
   * si no, cupo estimado por portales completos (misma regla que alta masiva).
   */
  plannedResidentSlots: number
  /** Incidencias con status pendiente. */
  openIncidents: number
  /** Reservas confirmadas con fecha ≥ hoy (zona COMMUNITY_STATS_TZ). */
  activeBookings: number
}

/**
 * KPIs del panel super admin: solo comunidades operativas (active + demo).
 */
export async function getAdminOperationalAggregates(): Promise<AdminOperationalAggregates> {
  const operational = await prisma.community.findMany({
    where: communityOperationalWhere(),
    select: {
      id: true,
      residentSlots: true,
      portalCount: true,
      portalDwellingConfig: true,
    },
  })
  const ids = operational.map((c) => c.id)
  if (ids.length === 0) {
    return { plannedResidentSlots: 0, openIncidents: 0, activeBookings: 0 }
  }

  const plannedResidentSlots = operational.reduce((s, c) => {
    const official =
      c.residentSlots != null && Number(c.residentSlots) > 0 ? Number(c.residentSlots) : 0
    if (official > 0) return s + official
    const est = estimateDwellingUnitsFromPortalConfig(c.portalDwellingConfig, c.portalCount)
    return s + (est ?? 0)
  }, 0)

  const today = todayDateInTz()

  const [openIncidents, activeBookings] = await Promise.all([
    prisma.communityIncident.count({
      where: { communityId: { in: ids }, status: 'pendiente' },
    }),
    prisma.communityBooking.count({
      where: {
        communityId: { in: ids },
        status: 'confirmed',
        bookingDate: { gte: today },
      },
    }),
  ])

  return { plannedResidentSlots, openIncidents, activeBookings }
}
