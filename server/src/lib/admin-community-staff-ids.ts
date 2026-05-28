import type { Community } from '@prisma/client'
import { prisma } from './prisma.js'
import { normEmail } from './community-user-access.js'
import { listConciergeEmails } from './concierge-emails.js'

type StaffSlot = 'president' | 'community_admin' | 'concierge' | 'pool_staff' | 'contact'

/**
 * IDs de cuentas que cuentan como «ficha / staff» para una comunidad (misma lógica que GET /admin/communities/:id/users).
 * Sirve para excluir esas cuentas al listar o borrar solo vecinos.
 */
export async function resolveStaffUserIdsForCommunity(community: Community): Promise<Set<number>> {
  const slotDefs: { slot: StaffSlot }[] = [
    { slot: 'president' },
    { slot: 'community_admin' },
    { slot: 'concierge' },
    { slot: 'pool_staff' },
    { slot: 'contact' },
  ]

  const emailFields: Record<StaffSlot, string | null> = {
    president: community.presidentEmail,
    community_admin: community.communityAdminEmail,
    concierge: community.conciergeEmail,
    pool_staff: community.poolStaffEmail,
    contact: community.contactEmail,
  }

  const merged = new Map<string, { email: string }>()
  for (const def of slotDefs) {
    const raw = emailFields[def.slot]
    const n = normEmail(raw)
    if (!n) continue
    merged.set(n, { email: n })
  }
  for (const ce of listConciergeEmails(community)) {
    if (!merged.has(ce)) merged.set(ce, { email: ce })
  }

  const ids = new Set<number>()
  for (const row of merged.values()) {
    const user = await prisma.vecindarioUser.findUnique({
      where: { email: row.email },
      select: { id: true },
    })
    if (user) ids.add(user.id)
  }
  return ids
}
