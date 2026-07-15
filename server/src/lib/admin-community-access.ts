import type { Community } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

export type CompanyKindValue = 'administracion' | 'prestacion_servicios'

export type AdminCommunityAccess =
  | { mode: 'full' }
  | { mode: 'service_provider'; companyId: number }

export async function resolveAdminCommunityAccess(
  userId: number,
  userRole: string,
): Promise<AdminCommunityAccess | null> {
  if (userRole === 'super_admin') return { mode: 'full' }
  if (userRole !== 'company_admin') return null

  const user = await prisma.vecindarioUser.findUnique({
    where: { id: userId },
    select: {
      companyAdminCompanyId: true,
      companyAdminCompany: { select: { id: true, kind: true } },
    },
  })
  if (!user?.companyAdminCompanyId || !user.companyAdminCompany) return null
  if (user.companyAdminCompany.kind !== 'prestacion_servicios') return null
  return { mode: 'service_provider', companyId: user.companyAdminCompanyId }
}

export function communityListWhereForAccess(
  access: AdminCommunityAccess,
): Prisma.CommunityWhereInput | undefined {
  if (access.mode === 'full') return undefined
  return { serviceProviderCompanyId: access.companyId }
}

export async function loadCommunityForAdminAccess(
  access: AdminCommunityAccess,
  communityId: number,
): Promise<Community | null> {
  if (access.mode === 'full') {
    return prisma.community.findUnique({ where: { id: communityId } })
  }
  return prisma.community.findFirst({
    where: { id: communityId, serviceProviderCompanyId: access.companyId },
  })
}

export function isFullSuperAdminAccess(access: AdminCommunityAccess): boolean {
  return access.mode === 'full'
}

export function companyKindLabel(kind: CompanyKindValue): string {
  return kind === 'prestacion_servicios' ? 'Prestación de servicios' : 'Administración'
}

export async function parseOptionalCompanyLinkId(
  raw: unknown,
): Promise<{ ok: true; value: number | null } | { ok: false; error: string }> {
  if (raw === null || raw === '' || raw === undefined) {
    return { ok: true, value: null }
  }
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: 'ID de empresa inválido' }
  }
  const co = await prisma.company.findUnique({ where: { id: n }, select: { id: true } })
  if (!co) {
    return { ok: false, error: 'Empresa no encontrada' }
  }
  return { ok: true, value: n }
}

export async function validateCompanyKindForLink(
  companyId: number,
  expectedKind: CompanyKindValue,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const co = await prisma.company.findUnique({
    where: { id: companyId },
    select: { kind: true, name: true },
  })
  if (!co) return { ok: false, error: 'Empresa no encontrada' }
  if (co.kind !== expectedKind) {
    return {
      ok: false,
      error: `La empresa «${co.name}» no es de tipo ${companyKindLabel(expectedKind).toLowerCase()}.`,
    }
  }
  return { ok: true }
}
