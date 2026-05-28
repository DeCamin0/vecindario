import type { Community } from '@prisma/client'
import { prisma } from './prisma.js'
import { normEmail } from './community-user-access.js'
import { parseConciergeEmailsList } from './concierge-emails.js'

type PickStaffEmails = Pick<
  Community,
  | 'presidentEmail'
  | 'communityAdminEmail'
  | 'conciergeEmail'
  | 'conciergeEmail2'
  | 'conciergeSubstituteEmail'
  | 'conciergeEmailsJson'
  | 'poolStaffEmail'
>

type StaffSlotRole = 'president' | 'community_admin' | 'concierge' | 'pool_staff'

type StaffSlotKey =
  | 'presidentEmail'
  | 'communityAdminEmail'
  | 'poolStaffEmail'

function emailStillOnCommunityConciergeSlots(
  emailNorm: string,
  after: PickStaffEmails,
): boolean {
  return parseConciergeEmailsList(after).includes(emailNorm)
}

function collectStaffRemovalCandidates(
  before: PickStaffEmails,
  after: PickStaffEmails,
): { emailNorm: string; role: StaffSlotRole }[] {
  const slots: { key: StaffSlotKey; role: StaffSlotRole }[] = [
    { key: 'presidentEmail', role: 'president' },
    { key: 'communityAdminEmail', role: 'community_admin' },
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
      o === normEmail(after.poolStaffEmail) ||
      emailStillOnCommunityConciergeSlots(o, after)
    if (stillOnThisCommunity) continue

    const k = `${o}::${role}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ emailNorm: o, role })
  }

  const beforeMain = new Set(parseConciergeEmailsList(before))
  const afterMain = new Set(parseConciergeEmailsList(after))
  for (const o of beforeMain) {
    if (afterMain.has(o)) continue
    const k = `${o}::concierge`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ emailNorm: o, role: 'concierge' })
  }

  const beforeSub = normEmail(before.conciergeSubstituteEmail)
  const afterSub = normEmail(after.conciergeSubstituteEmail)
  if (beforeSub && beforeSub !== afterSub && !afterMain.has(beforeSub) && beforeSub !== afterSub) {
    const k = `${beforeSub}::concierge`
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ emailNorm: beforeSub, role: 'concierge' })
    }
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
      conciergeEmail2: true,
      conciergeSubstituteEmail: true,
      conciergeEmailsJson: true,
      poolStaffEmail: true,
    },
  })
  for (const r of rows) {
    if (role === 'president' && normEmail(r.presidentEmail) === emailNorm) return true
    if (role === 'community_admin' && normEmail(r.communityAdminEmail) === emailNorm)
      return true
    if (role === 'concierge') {
      if (parseConciergeEmailsList(r).includes(emailNorm)) return true
      if (normEmail(r.conciergeSubstituteEmail) === emailNorm) return true
    }
    if (role === 'pool_staff' && normEmail(r.poolStaffEmail) === emailNorm) return true
  }
  return false
}

export type DemotedStaffEntry = { email: string; previousRole: StaffSlotRole }

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
