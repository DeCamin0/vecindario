import type { Community, VecindarioUser } from '@prisma/client'
import type { ConciergeEmailFields } from './concierge-emails.js'
import { juntaRoleForResident, type CommunityJuntaFields } from './community-board-junta.js'
import {
  assertUserMayAccessCommunityStaff,
  normEmail,
} from './community-incidents-access.js'
import { isCommunityOperationalStatus } from './community-status.js'
import { conciergeEmailMatches } from './concierge-emails.js'

export type ControlEntradaAccess = 'none' | 'read' | 'write'

export type ControlEntradaCommunity = CommunityJuntaFields &
  ConciergeEmailFields &
  Pick<
    Community,
    'id' | 'status' | 'presidentEmail' | 'communityAdminEmail' | 'companyId'
  >

/** Junta / administrador: lectura; conserje + super_admin: escritura. */
export function controlEntradaAccessForUser(
  user: VecindarioUser,
  comm: ControlEntradaCommunity,
): ControlEntradaAccess {
  if (!isCommunityOperationalStatus(comm.status)) return 'none'
  if (user.role === 'super_admin') return 'write'
  const e = normEmail(user.email)
  if (user.role === 'concierge' && conciergeEmailMatches(comm, e)) return 'write'
  if (assertUserMayAccessCommunityStaff(user, comm as Community)) return 'read'
  const portal = user.portal?.trim() ?? ''
  const piso = user.piso?.trim() ?? ''
  const puerta = user.puerta?.trim() ?? ''
  if (portal && piso && juntaRoleForResident(portal, piso, puerta, comm) != null) {
    return 'read'
  }
  return 'none'
}
