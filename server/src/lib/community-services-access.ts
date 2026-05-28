import type { Community, VecindarioUser } from '@prisma/client'
import {
  userMayManageIncidents,
  userMayUseCommunityIncidents,
} from './community-incidents-access.js'
import { isCommunityOperationalStatus } from './community-status.js'

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
  if (!comm || !isCommunityOperationalStatus(comm.status)) return false
  if (comm.appNavServicesEnabled === false) return false
  if (user.role === 'super_admin') return false
  /** Presupuestos vecino ↔ De Camino; el administrador de comunidad solo consulta en Gestión. */
  if (user.role === 'community_admin') return false
  return userMayUseCommunityIncidents(user, comm)
}

/** Lista de solicitudes de la comunidad (solo lectura): gestión local, sin operar presupuestos. */
export function userMayViewCommunityServiceOverview(
  user: VecindarioUser,
  comm: Community | null,
): boolean {
  if (!comm || !isCommunityOperationalStatus(comm.status)) return false
  if (comm.appNavServicesEnabled === false) return false
  return userMayManageIncidents(user, comm)
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
