import type { Community, VecindarioUser } from '@prisma/client'
import { prisma } from './prisma.js'
import { residentMatchesPresidentUnit } from './president-by-unit.js'
import { userLinkedToCommunity } from './community-user-access.js'

export function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

/** Misma idea que assertUserMayAccessCommunity en community-bookings (gestión por email / vivienda presidente). */
export function assertUserMayAccessCommunityStaff(
  user: VecindarioUser,
  comm: Community | null,
): boolean {
  if (!comm || comm.status === 'inactive') return false
  const e = normEmail(user.email)
  if (user.role === 'super_admin') return true
  if (user.role === 'community_admin' && normEmail(comm.communityAdminEmail) === e) return true
  if (user.role === 'president' && normEmail(comm.presidentEmail) === e) return true
  if (
    user.role === 'resident' &&
    residentMatchesPresidentUnit(comm, user)
  )
    return true
  if (user.role === 'concierge' && normEmail(comm.conciergeEmail) === e) return true
  return false
}

/**
 * Puede crear/ver sus incidencias en la comunidad: vecino vinculado, staff, o historial de reservas/gimnasio.
 * Alineado con userMayUseCommunityMemberBookingsFeatures.
 */
export async function userMayUseCommunityIncidents(
  user: VecindarioUser,
  comm: Community | null,
): Promise<boolean> {
  if (!comm || comm.status === 'inactive') return false
  if (assertUserMayAccessCommunityStaff(user, comm)) return true
  if (user.communityId != null && user.communityId === comm.id) return true
  return userLinkedToCommunity(
    { id: user.id, email: user.email, role: user.role, communityId: user.communityId },
    comm,
  )
}

/** Ver todas las incidencias de la comunidad y cambiar estado (pendiente / resuelta). */
export function userMayManageIncidents(user: VecindarioUser, comm: Community): boolean {
  if (comm.status === 'inactive') return false
  if (user.role === 'super_admin') return true
  if (user.role === 'resident' && residentMatchesPresidentUnit(comm, user)) return true
  const e = normEmail(user.email)
  if (user.role === 'community_admin' && normEmail(comm.communityAdminEmail) === e) return true
  if (user.role === 'president' && normEmail(comm.presidentEmail) === e) return true
  if (user.role === 'concierge' && normEmail(comm.conciergeEmail) === e) return true
  return false
}

/** Cerrar / abrir comentarios en una incidencia: solo conserje de la ficha (y super admin). */
export function userMayLockIncidentComments(user: VecindarioUser, comm: Community): boolean {
  if (comm.status === 'inactive') return false
  if (user.role === 'super_admin') return true
  const e = normEmail(user.email)
  if (user.role === 'concierge' && normEmail(comm.conciergeEmail) === e) return true
  return false
}

export async function loadVecindarioUser(userId: number): Promise<VecindarioUser | null> {
  return prisma.vecindarioUser.findUnique({ where: { id: userId } })
}
