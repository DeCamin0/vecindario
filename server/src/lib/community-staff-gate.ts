import { prisma } from './prisma.js'
import { companyAdminOwnsCommunity, normEmail } from './community-user-access.js'
import { conciergeEmailMatches, conciergeEmailPrismaSelect } from './concierge-emails.js'
import { residentMatchesPresidentUnit } from './president-by-unit.js'
import { communityOperationalWhere } from './community-status.js'

/**
 * Comprueba que el usuario autenticado es staff de la comunidad (presidente, admin, conserje, socorrista o vivienda de presidente).
 * Para paquetería, piscina (staff), etc.
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
      ...conciergeEmailPrismaSelect,
      poolStaffEmail: true,
      residentSlots: true,
      companyId: true,
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
    select: {
      email: true,
      role: true,
      communityId: true,
      portal: true,
      piso: true,
      puerta: true,
      companyAdminCompanyId: true,
    },
  })
  if (!staff) {
    return { ok: false, status: 401, message: 'Sesión no válida.' }
  }
  const e = normEmail(staff.email)
  if (companyAdminOwnsCommunity(staff, comm)) {
    return { ok: true, community: { id: comm.id, name: comm.name } }
  }
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
    if (!conciergeEmailMatches(comm, e)) {
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

/**
 * Alta de vecinos (manual o masivo): solo super administrador.
 * Las cuentas se generan desde la estructura de portales/plantas en Super Admin.
 */
export async function assertResidentAltaStaff(
  staffUserId: number,
): Promise<{ ok: true; community: { id: number; name: string } } | { ok: false; status: number; message: string }> {
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: staffUserId },
    select: { role: true },
  })
  if (!staff) {
    return { ok: false, status: 401, message: 'Sesión no válida.' }
  }
  if (staff.role === 'president') {
    return {
      ok: false,
      status: 403,
      message:
        'El presidente no puede crear cuentas de vecino. Las cuentas se generan según la estructura de la comunidad (Super Admin).',
    }
  }
  if (staff.role === 'concierge') {
    return {
      ok: false,
      status: 403,
      message: 'El conserje no puede dar de alta vecinos.',
    }
  }
  if (staff.role === 'community_admin') {
    return {
      ok: false,
      status: 403,
      message:
        'El administrador de comunidad solo puede consultar la lista de vecinos.',
    }
  }
  if (staff.role === 'pool_staff') {
    return {
      ok: false,
      status: 403,
      message: 'El personal de piscina no puede dar de alta vecinos.',
    }
  }
  return {
    ok: false,
    status: 403,
    message: 'Solo el super administrador puede dar de alta vecinos.',
  }
}

/** Super admin: gestión de cualquier comunidad operativa (alta vecinos, entrega). */
export async function assertSuperAdminCommunity(
  staffUserId: number,
  communityId: number,
): Promise<
  | { ok: true; community: { id: number; name: string; accessCode: string } }
  | { ok: false; status: number; message: string }
> {
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: staffUserId },
    select: { role: true },
  })
  if (!staff) {
    return { ok: false, status: 401, message: 'Sesión no válida.' }
  }
  if (staff.role !== 'super_admin') {
    return { ok: false, status: 403, message: 'Solo super administrador.' }
  }

  const comm = await prisma.community.findFirst({
    where: { id: communityId, ...communityOperationalWhere() },
    select: { id: true, name: true, accessCode: true },
  })
  if (!comm) {
    return { ok: false, status: 404, message: 'Comunidad no encontrada o inactiva.' }
  }

  return {
    ok: true,
    community: {
      id: comm.id,
      name: comm.name,
      accessCode: (comm.accessCode ?? '').trim(),
    },
  }
}

/**
 * Edición limitada de ficha (piscina, junta): conserje o quien puede dar de alta.
 * El socorrista no edita fichas de vecinos.
 */
export async function assertResidentFichaEditStaff(
  staffUserId: number,
  communityId: number,
  accessCode: string | undefined,
): Promise<{ ok: true; community: { id: number; name: string } } | { ok: false; status: number; message: string }> {
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: staffUserId },
    select: { role: true },
  })
  if (!staff) {
    return { ok: false, status: 401, message: 'Sesión no válida.' }
  }
  if (staff.role === 'pool_staff') {
    return {
      ok: false,
      status: 403,
      message: 'El personal de piscina no puede editar la ficha de vecinos.',
    }
  }
  if (
    staff.role === 'concierge' ||
    staff.role === 'community_admin' ||
    staff.role === 'president' ||
    staff.role === 'company_admin'
  ) {
    return assertStaffOwnsCommunity(staffUserId, communityId, accessCode)
  }
  return assertResidentAltaStaff(staffUserId)
}

export type CommunityGateMode = 'staff' | 'alta' | 'ficha'

/** Resuelve acceso a la comunidad: super admin siempre; si no, staff, alta o ficha de vecinos. */
export async function resolveCommunityGate(
  staffUserId: number,
  communityId: number,
  accessCode: string | undefined,
  mode: CommunityGateMode,
): Promise<
  | { ok: true; community: { id: number; name: string; accessCode?: string } }
  | { ok: false; status: number; message: string }
> {
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: staffUserId },
    select: { role: true },
  })
  if (staff?.role === 'super_admin') {
    const g = await assertSuperAdminCommunity(staffUserId, communityId)
    return g
  }
  if (mode === 'alta') {
    return assertResidentAltaStaff(staffUserId)
  }
  if (mode === 'ficha') {
    return assertResidentFichaEditStaff(staffUserId, communityId, accessCode)
  }
  return assertStaffOwnsCommunity(staffUserId, communityId, accessCode)
}
