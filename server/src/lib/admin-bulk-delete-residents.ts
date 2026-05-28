import type { Community } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { resolveStaffUserIdsForCommunity } from './admin-community-staff-ids.js'

/**
 * Vecinos (rol resident) a borrar en masa: `community_id` de esta comunidad y/o reservas aquí,
 * excluyendo cuentas de la ficha (correos staff) por ID — misma idea que la tabla «Vecinos» en super admin.
 */
export async function collectBulkDeletableResidentUserIds(community: Community): Promise<number[]> {
  const id = community.id
  const staffIds = await resolveStaffUserIdsForCommunity(community)
  const out = new Set<number>()

  const bookingGroups = await prisma.communityBooking.groupBy({
    by: ['vecindarioUserId'],
    where: { communityId: id, vecindarioUserId: { not: null } },
    _count: { id: true },
  })

  for (const g of bookingGroups) {
    const uid = g.vecindarioUserId
    if (uid == null || staffIds.has(uid)) continue
    const u = await prisma.vecindarioUser.findUnique({
      where: { id: uid },
      select: { id: true, role: true },
    })
    if (!u || u.role !== 'resident') continue
    out.add(u.id)
  }

  const linkedResidents = await prisma.vecindarioUser.findMany({
    where: { communityId: id, role: 'resident' },
    select: { id: true },
  })
  for (const r of linkedResidents) {
    if (!staffIds.has(r.id)) out.add(r.id)
  }

  return [...out]
}

export async function bulkDeleteResidentAccountsForCommunity(
  community: Community,
  opts?: { tx?: Prisma.TransactionClient; userIds?: number[] },
): Promise<{ deleted: number }> {
  const ids = opts?.userIds ?? (await collectBulkDeletableResidentUserIds(community))
  if (ids.length === 0) return { deleted: 0 }

  const db = opts?.tx ?? prisma

  await db.communityIncident.deleteMany({
    where: { communityId: community.id, reporterUserId: { in: ids } },
  })
  await db.communityServiceRequest.deleteMany({
    where: { communityId: community.id, requesterUserId: { in: ids } },
  })

  const del = await db.vecindarioUser.deleteMany({
    where: { id: { in: ids }, role: 'resident' },
  })

  return { deleted: del.count }
}
