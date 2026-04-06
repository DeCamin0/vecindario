import type { Community, VecindarioUser } from '@prisma/client'
import { userMayUseCommunityIncidents } from './community-incidents-access.js'

const SERVICE_STATUSES = new Set([
  'pending_review',
  'price_sent',
  'accepted',
  'rejected',
  'in_progress',
  'completed',
])

export function isValidServiceStatus(s: string): boolean {
  return SERVICE_STATUSES.has(s)
}

/** Crear solicitud: mismo acceso que incidencias; super_admin no crea desde app (gestión global). */
export async function userMayCreateServiceRequest(
  user: VecindarioUser,
  comm: Community | null,
): Promise<boolean> {
  if (!comm || comm.status === 'inactive') return false
  if (comm.appNavServicesEnabled === false) return false
  if (user.role === 'super_admin') return false
  return userMayUseCommunityIncidents(user, comm)
}

export function userMayViewServiceRequestAsOwner(user: VecindarioUser, requesterUserId: number): boolean {
  return user.id === requesterUserId
}

const SERVICE_MESSAGE_OPEN = new Set(['pending_review', 'price_sent', 'accepted', 'in_progress'])

/** Mensajes con administración: abiertos desde la solicitud hasta completar (no en completed/rejected). */
export function userMayPostServiceQuoteMessage(user: VecindarioUser, request: { status: string; requesterUserId: number }): boolean {
  if (!SERVICE_MESSAGE_OPEN.has(request.status)) return false
  if (user.role === 'super_admin') return true
  return user.id === request.requesterUserId
}
