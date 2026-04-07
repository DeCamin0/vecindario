import type { Community } from '@prisma/client'
import { prisma } from './prisma.js'
import { normEmail } from './community-user-access.js'

type PickStaffEmails = Pick<
  Community,
  'presidentEmail' | 'communityAdminEmail' | 'conciergeEmail' | 'poolStaffEmail'
>

type StaffSlotRole = 'president' | 'community_admin' | 'concierge' | 'pool_staff'

/**
 * Emails que dejan de ocupar un puesto en la ficha de ESTA comunidad
 * y ya no siguen en otro puesto de la misma ficha (tras el PATCH).
 */
function collectStaffRemovalCandidates(
  before: PickStaffEmails,
  after: PickStaffEmails,
): { emailNorm: string; role: StaffSlotRole }[] {
  const slots: {
    key: keyof PickStaffEmails
    role: StaffSlotRole
  }[] = [
    { key: 'presidentEmail', role: 'president' },
    { key: 'communityAdminEmail', role: 'community_admin' },
    { key: 'conciergeEmail', role: 'concierge' },
    { key: 'poolStaffEmail', role: 'pool_staff' },
  ]
  const seen = new Set<string>()
  const out: { emailNorm: string; role: StaffSlotRole }[] = []

  for (const { key, role } of slots) {
    const o = normEmail(before[key])
    const n = normEmail(after[key])
    if (!o || o === n) continue

    const stillOnThisCommunity =
      o === normEmail(after.presidentEmail) ||
      o === normEmail(after.communityAdminEmail) ||
      o === normEmail(after.conciergeEmail) ||
      o === normEmail(after.poolStaffEmail)
    if (stillOnThisCommunity) continue

    const k = `${o}::${role}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ emailNorm: o, role })
  }
  return out
}

async function emailStillListedWithStaffRole(
  emailNorm: string,
  role: StaffSlotRole,
): Promise<boolean> {
  const rows = await prisma.community.findMany({
    select: {
      presidentEmail: true,
      communityAdminEmail: true,
      conciergeEmail: true,
      poolStaffEmail: true,
    },
  })
  for (const r of rows) {
    if (role === 'president' && normEmail(r.presidentEmail) === emailNorm) return true
    if (role === 'community_admin' && normEmail(r.communityAdminEmail) === emailNorm)
      return true
    if (role === 'concierge' && normEmail(r.conciergeEmail) === emailNorm) return true
    if (role === 'pool_staff' && normEmail(r.poolStaffEmail) === emailNorm) return true
  }
  return false
}

export type DemotedStaffEntry = { email: string; previousRole: StaffSlotRole }

/**
 * Cuentas que ya no tienen ninguna comunidad donde sigan como presidente/admin/conserje/socorrista
 * pasan a rol vecino (resident), para que no queden «presidentes huérfanos».
 */
export async function demoteOrphanedStaffAfterEmailChange(
  before: PickStaffEmails,
  after: PickStaffEmails,
): Promise<{ demoted: DemotedStaffEntry[] }> {
  const candidates = collectStaffRemovalCandidates(before, after)
  const demoted: DemotedStaffEntry[] = []

  for (const { emailNorm, role } of candidates) {
    const stillListed = await emailStillListedWithStaffRole(emailNorm, role)
    if (stillListed) continue

    const user = await prisma.vecindarioUser.findUnique({
      where: { email: emailNorm },
      select: { id: true, email: true, role: true },
    })
    if (!user || user.role === 'super_admin' || user.role === 'company_admin') continue
    if (user.role !== role) continue

    await prisma.vecindarioUser.update({
      where: { id: user.id },
      data: { role: 'resident' },
    })
    demoted.push({ email: user.email ?? emailNorm, previousRole: role })
  }

  return { demoted }
}
