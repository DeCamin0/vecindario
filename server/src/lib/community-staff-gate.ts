import { prisma } from './prisma.js'
import { normEmail } from './community-user-access.js'
import { residentMatchesPresidentUnit } from './president-by-unit.js'
import { communityOperationalWhere } from './community-status.js'

/**
 * Comprueba que el usuario autenticado es staff de la comunidad (presidente, admin, conserje o vivienda de presidente).
 * Misma regla que alta de vecinos en community-residents.
 */
export async function assertStaffOwnsCommunity(
  staffUserId: number,
  communityId: number,
  accessCode: string | undefined,
): Promise<{ ok: true; community: { id: number; name: string } } | { ok: false; status: number; message: string }> {
  const code = accessCode?.trim().toUpperCase() ?? ''
  const comm = await prisma.community.findFirst({
    where: code
      ? { id: communityId, accessCode: code, ...communityOperationalWhere() }
      : { id: communityId, ...communityOperationalWhere() },
    select: {
      id: true,
      name: true,
      presidentEmail: true,
      presidentPortal: true,
      presidentPiso: true,
      communityAdminEmail: true,
      conciergeEmail: true,
      poolStaffEmail: true,
      residentSlots: true,
    },
  })
  if (!comm) {
    return {
      ok: false,
      status: 403,
      message: code
        ? 'Código VEC no válido para esta comunidad.'
        : 'Comunidad no encontrada o inactiva.',
    }
  }

  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: staffUserId },
    select: { email: true, role: true, communityId: true, portal: true, piso: true },
  })
  if (!staff) {
    return { ok: false, status: 401, message: 'Sesión no válida.' }
  }
  const e = normEmail(staff.email)
  if (staff.role === 'president') {
    if (normEmail(comm.presidentEmail) !== e) {
      return { ok: false, status: 403, message: 'No eres presidente de esta comunidad.' }
    }
  } else if (staff.role === 'resident') {
    if (!residentMatchesPresidentUnit(comm, staff)) {
      return {
        ok: false,
        status: 403,
        message:
          'Solo el presidente (vivienda designada en la ficha), el administrador o el conserje pueden realizar esta acción.',
      }
    }
  } else if (staff.role === 'community_admin') {
    if (normEmail(comm.communityAdminEmail) !== e) {
      return { ok: false, status: 403, message: 'No eres administrador de esta comunidad.' }
    }
  } else if (staff.role === 'concierge') {
    if (normEmail(comm.conciergeEmail) !== e) {
      return { ok: false, status: 403, message: 'No eres conserje de esta comunidad.' }
    }
  } else if (staff.role === 'pool_staff') {
    if (normEmail(comm.poolStaffEmail) !== e) {
      return {
        ok: false,
        status: 403,
        message: 'No figuras como socorrista de esta comunidad en la ficha.',
      }
    }
    if (staff.communityId != null && staff.communityId !== comm.id) {
      return {
        ok: false,
        status: 403,
        message: 'Tu cuenta está asignada a otra comunidad.',
      }
    }
  } else {
    return {
      ok: false,
      status: 403,
      message:
        'Solo presidente, vivienda de presidente, administrador, conserje o socorrista pueden realizar esta acción.',
    }
  }

  return { ok: true, community: { id: comm.id, name: comm.name } }
}
