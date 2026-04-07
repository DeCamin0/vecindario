import type { Community, VecindarioUser } from '@prisma/client'
import { prisma } from './prisma.js'

export function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

const STAFF_ROLES = new Set(['president', 'community_admin', 'concierge'])

type UserLinkFields = Pick<VecindarioUser, 'id' | 'email' | 'role' | 'communityId'>

/**
 * ¿Puede un super admin impersonar / resetear contraseña de este usuario en esta comunidad?
 */
export async function userLinkedToCommunity(
  user: UserLinkFields,
  community: Community,
): Promise<boolean> {
  if (user.role === 'super_admin') return false

  if (user.role === 'pool_staff') {
    const u = normEmail(user.email)
    if (u && normEmail(community.poolStaffEmail) === u) return true
    return user.communityId != null && user.communityId === community.id
  }

  if (user.role === 'resident') {
    if (user.communityId != null && user.communityId === community.id) return true
    const n = await prisma.communityBooking.count({
      where: { communityId: community.id, vecindarioUserId: user.id },
    })
    if (n > 0) return true
    const g = await prisma.communityGymAccessLog.count({
      where: { communityId: community.id, vecindarioUserId: user.id },
    })
    return g > 0
  }

  const e = normEmail(user.email)
  if (!e) return false

  if (user.role === 'president' && normEmail(community.presidentEmail) === e) return true
  if (user.role === 'community_admin' && normEmail(community.communityAdminEmail) === e)
    return true
  if (user.role === 'concierge' && normEmail(community.conciergeEmail) === e) return true

  return false
}

export function staffRoleMatchesSlot(
  user: Pick<VecindarioUser, 'role'>,
  slot: 'president' | 'community_admin' | 'concierge' | 'pool_staff',
): boolean {
  return user.role === slot
}

export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.has(role)
}
