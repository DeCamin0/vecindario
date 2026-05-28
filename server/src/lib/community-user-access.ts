import type { Community, VecindarioUser } from '@prisma/client'
import { prisma } from './prisma.js'
import { conciergeEmailMatches } from './concierge-emails.js'

export function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

/** Comunidad ligada a empresa de administración: gestión vía company_admin, no ficha. */
export function communityManagedByCompany(
  comm: Pick<Community, 'companyId'>,
): boolean {
  return comm.companyId != null && comm.companyId >= 1
}

/** Administrador de empresa con acceso a todas las comunidades de su companyId. */
export function companyAdminOwnsCommunity(
  user: Pick<VecindarioUser, 'role' | 'companyAdminCompanyId'>,
  comm: Pick<Community, 'companyId'>,
): boolean {
  return (
    user.role === 'company_admin' &&
    user.companyAdminCompanyId != null &&
    communityManagedByCompany(comm) &&
    user.companyAdminCompanyId === comm.companyId
  )
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
  if (user.role === 'concierge' && conciergeEmailMatches(community, e)) return true

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
