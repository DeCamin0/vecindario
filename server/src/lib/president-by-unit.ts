import type { VecindarioRole, VecindarioUser } from '@prisma/client'
import { dwellingMatchesResident } from './community-board-junta.js'

export type PresidentUnitFields = {
  id: number
  presidentPortal: string | null
  presidentPiso: string | null
  presidentPuerta?: string | null
}

export type UserPresidentMatchFields = Pick<
  VecindarioUser,
  'role' | 'communityId' | 'portal' | 'piso' | 'puerta'
>

/** El vecino en DB coincide con la vivienda marcada como presidente en la ficha de la comunidad. */
export function residentMatchesPresidentUnit(
  comm: PresidentUnitFields,
  user: UserPresidentMatchFields,
): boolean {
  if (user.role !== 'resident') return false
  if (user.communityId == null || user.communityId !== comm.id) return false
  const portal = user.portal?.trim() ?? ''
  const piso = user.piso?.trim() ?? ''
  if (!portal || !piso) return false
  return dwellingMatchesResident(
    portal,
    piso,
    user.puerta?.trim() ?? '',
    comm.presidentPortal,
    comm.presidentPiso,
    comm.presidentPuerta,
  )
}

/** Rol efectivo en sesión / API: el presidente actual entra como vecino en DB pero con rol `president`. */
export function effectiveRoleForCommunity(
  user: UserPresidentMatchFields,
  comm: PresidentUnitFields | null,
): VecindarioRole {
  if (!comm || user.role !== 'resident') return user.role
  return residentMatchesPresidentUnit(comm, user) ? 'president' : 'resident'
}
