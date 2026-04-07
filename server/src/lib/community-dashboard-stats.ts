import { prisma } from './prisma.js'

/** Zona horaria para «reservas hoy» (día civil). */
const STATS_TZ = process.env.COMMUNITY_STATS_TZ || 'Europe/Madrid'

const SERVICE_TERMINAL = new Set(['completed', 'rejected'])

export type CommunityDashboardStats = {
  totalIncidents: number
  pendingIncidents: number
  resolvedIncidents: number
  bookingsToday: number
  /** Incidencias pendientes + solicitudes de servicio abiertas (no completed/rejected). */
  pendingActions: number
  /**
   * Cuentas con community_id = esta comunidad y rol vecino o presidente (no consumen cupo el staff).
   */
  neighborAccountsCount: number
  /**
   * Rellenado al serializar la lista: viviendas teóricas desde portales si están completos; null si no aplica.
   */
  estimatedDwellingCapacity: number | null
}

function emptyStats(): CommunityDashboardStats {
  return {
    totalIncidents: 0,
    pendingIncidents: 0,
    resolvedIncidents: 0,
    bookingsToday: 0,
    pendingActions: 0,
    neighborAccountsCount: 0,
    estimatedDwellingCapacity: null,
  }
}

/** Fecha calendario en TZ → Date a medianoche UTC (compatible Prisma @db.Date). */
export function todayDateInTz(): Date {
  const s = new Date().toLocaleDateString('en-CA', {
    timeZone: STATS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = s.split('-').map((x) => Number.parseInt(x, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const n = new Date()
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
  }
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Agregados por comunidad: incidencias, reservas confirmadas hoy (TZ), acciones pendientes.
 */
export async function getCommunityDashboardStatsMap(
  communityIds: number[],
): Promise<Map<number, CommunityDashboardStats>> {
  const map = new Map<number, CommunityDashboardStats>()
  const ids = [...new Set(communityIds.filter((id) => Number.isInteger(id) && id >= 1))]
  for (const id of ids) {
    map.set(id, emptyStats())
  }
  if (ids.length === 0) return map

  const [incidentGroups, bookingGroups, serviceGroups, neighborGroups] = await Promise.all([
    prisma.communityIncident.groupBy({
      by: ['communityId', 'status'],
      where: { communityId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.communityBooking.groupBy({
      by: ['communityId'],
      where: {
        communityId: { in: ids },
        bookingDate: todayDateInTz(),
        status: 'confirmed',
      },
      _count: { _all: true },
    }),
    prisma.communityServiceRequest.groupBy({
      by: ['communityId', 'status'],
      where: { communityId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.vecindarioUser.groupBy({
      by: ['communityId'],
      where: {
        communityId: { in: ids },
        role: { in: ['resident', 'president'] },
      },
      _count: { _all: true },
    }),
  ])

  for (const row of incidentGroups) {
    const s = map.get(row.communityId)
    if (!s) continue
    const c = row._count._all
    s.totalIncidents += c
    if (row.status === 'pendiente') s.pendingIncidents += c
    if (row.status === 'resuelta') s.resolvedIncidents += c
  }

  for (const row of bookingGroups) {
    const s = map.get(row.communityId)
    if (!s) continue
    s.bookingsToday = row._count._all
  }

  for (const row of neighborGroups) {
    const cid = row.communityId
    if (cid == null) continue
    const s = map.get(cid)
    if (!s) continue
    s.neighborAccountsCount = row._count._all
  }

  for (const id of ids) {
    const s = map.get(id)!
    s.pendingActions = s.pendingIncidents
  }

  for (const row of serviceGroups) {
    if (SERVICE_TERMINAL.has(row.status)) continue
    const s = map.get(row.communityId)
    if (!s) continue
    s.pendingActions += row._count._all
  }

  return map
}

export function statsMapToRecord(
  map: Map<number, CommunityDashboardStats>,
): Record<number, CommunityDashboardStats> {
  const out: Record<number, CommunityDashboardStats> = {}
  for (const [k, v] of map) {
    out[k] = v
  }
  return out
}
