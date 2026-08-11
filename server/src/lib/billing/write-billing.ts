/**
 * Persistencia PUT billing — solo community_billing / lines / audits.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import {
  buildCommunityBillingReadResponse,
  type CommunityBillingRow,
} from './read-community.js'
import { loadActiveSizeTiers } from './size-tiers-write.js'
import { canonicalBillingFingerprint, moneyToPrisma, type PutBillingPayload } from './write-validate.js'
import {
  resolveBillingWrite,
  type CatalogModule,
  type CatalogPlan,
  type ExistingBillingSnap,
  type ResolvedBillingWrite,
} from './write-resolve.js'
import { buildPlanPriceLookup } from './usage-mode.js'
export class BillingWriteError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : 'Billing write error')
    this.status = status
    this.body = body
  }
}

function mapDbBilling(row: {
  id: number
  communityId: number
  planCode: string
  planName: string
  planListPriceEur: { toString(): string }
  planChargedPriceEur: { toString(): string }
  usageMode: string
  commercialStatus: string
  dwellingCount: number | null
  dwellingSource: string
  sizeSurchargeEur: { toString(): string }
  discountEur: { toString(): string }
  discountNote: string | null
  negotiatedTotalEur: { toString(): string } | null
  vatRatePct: { toString(): string }
  currency: string
  notes: string | null
  configuredAt: Date
  configuredByUserId: number | null
  updatedAt: Date
  updatedByUserId: number | null
  lines: Array<{
    moduleCode: string
    moduleName: string
    includedInPlan: boolean
    pricingMode: string
    listPriceEur: { toString(): string }
    chargedPriceEur: { toString(): string }
    sortOrder: number
  }>
}): CommunityBillingRow {
  return {
    id: row.id,
    communityId: row.communityId,
    planCode: row.planCode,
    planName: row.planName,
    planListPriceEur: row.planListPriceEur.toString(),
    planChargedPriceEur: row.planChargedPriceEur.toString(),
    usageMode: row.usageMode,
    commercialStatus: row.commercialStatus,
    dwellingCount: row.dwellingCount,
    dwellingSource: row.dwellingSource,
    sizeSurchargeEur: row.sizeSurchargeEur.toString(),
    discountEur: row.discountEur.toString(),
    discountNote: row.discountNote,
    negotiatedTotalEur: row.negotiatedTotalEur == null ? null : row.negotiatedTotalEur.toString(),
    vatRatePct: row.vatRatePct.toString(),
    currency: row.currency,
    notes: row.notes,
    configuredAt: row.configuredAt,
    configuredByUserId: row.configuredByUserId,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
    lines: row.lines.map((l) => ({
      moduleCode: l.moduleCode,
      moduleName: l.moduleName,
      includedInPlan: l.includedInPlan,
      pricingMode: l.pricingMode,
      listPriceEur: l.listPriceEur.toString(),
      chargedPriceEur: l.chargedPriceEur.toString(),
      sortOrder: l.sortOrder,
    })),
  }
}

function toExistingSnap(row: CommunityBillingRow): ExistingBillingSnap {
  return {
    id: row.id,
    planCode: row.planCode,
    planName: row.planName,
    planListPriceEur: String(row.planListPriceEur),
    planChargedPriceEur: String(row.planChargedPriceEur),
    usageMode: row.usageMode,
    commercialStatus: row.commercialStatus,
    dwellingCount: row.dwellingCount,
    dwellingSource: row.dwellingSource,
    sizeSurchargeEur: String(row.sizeSurchargeEur),
    discountEur: String(row.discountEur),
    discountNote: row.discountNote,
    negotiatedTotalEur: row.negotiatedTotalEur == null ? null : String(row.negotiatedTotalEur),
    vatRatePct: String(row.vatRatePct),
    notes: row.notes,
    updatedAt: row.updatedAt,
    lines: row.lines.map((l) => ({
      moduleCode: l.moduleCode,
      moduleName: l.moduleName,
      includedInPlan: l.includedInPlan,
      pricingMode: l.pricingMode,
      listPriceEur: String(l.listPriceEur),
      chargedPriceEur: String(l.chargedPriceEur),
      sortOrder: l.sortOrder,
    })),
  }
}

function auditPayloadFromResolved(communityId: number, resolved: ResolvedBillingWrite) {
  return {
    communityId,
    planCode: resolved.planCode,
    planName: resolved.planName,
    planListPriceEur: resolved.planListPriceEur,
    planChargedPriceEur: resolved.planChargedPriceEur,
    usageMode: resolved.usageMode,
    commercialStatus: resolved.commercialStatus,
    dwellingCount: resolved.dwellingCount,
    dwellingSource: resolved.dwellingSource,
    sizeSurchargeEur: resolved.sizeSurchargeEur,
    discountEur: resolved.discountEur,
    discountNote: resolved.discountNote,
    negotiatedTotalEur: resolved.negotiatedTotalEur,
    vatRatePct: resolved.vatRatePct,
    notes: resolved.notes,
    lines: resolved.lines,
  }
}

function auditPayloadFromRow(row: CommunityBillingRow) {
  return {
    communityId: row.communityId,
    ...canonicalParts(row),
  }
}

function canonicalParts(row: CommunityBillingRow) {
  return {
    planCode: row.planCode,
    planName: row.planName,
    planListPriceEur: String(row.planListPriceEur),
    planChargedPriceEur: String(row.planChargedPriceEur),
    usageMode: row.usageMode,
    commercialStatus: row.commercialStatus,
    dwellingCount: row.dwellingCount,
    dwellingSource: row.dwellingSource,
    sizeSurchargeEur: String(row.sizeSurchargeEur),
    discountEur: String(row.discountEur),
    discountNote: row.discountNote,
    negotiatedTotalEur: row.negotiatedTotalEur == null ? null : String(row.negotiatedTotalEur),
    vatRatePct: String(row.vatRatePct),
    notes: row.notes,
    lines: row.lines.map((l) => ({
      moduleCode: l.moduleCode,
      moduleName: l.moduleName,
      includedInPlan: l.includedInPlan,
      pricingMode: l.pricingMode,
      listPriceEur: String(l.listPriceEur),
      chargedPriceEur: String(l.chargedPriceEur),
      sortOrder: l.sortOrder,
    })),
  }
}

const communitySelect = {
  id: true,
  name: true,
  portalCount: true,
  portalDwellingConfig: true,
  appNavServicesEnabled: true,
  appNavIncidentsEnabled: true,
  appNavBookingsEnabled: true,
  appNavPoolAccessEnabled: true,
  appNavPaqueteriaEnabled: true,
  paqueteriaSpecialDeliveryEnabled: true,
  paqueteriaKeyLoansEnabled: true,
  appNavCuadernoDiarioEnabled: true,
  appNavControlEntradaEnabled: true,
  billing: {
    include: {
      lines: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
} as const

export async function putCommunityBilling(opts: {
  communityId: number
  actorUserId: number
  actorEmail: string | null
  payload: PutBillingPayload
}): Promise<{ unchanged: boolean; response: ReturnType<typeof buildCommunityBillingReadResponse> }> {
  const { communityId, actorUserId, actorEmail, payload } = opts

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: communitySelect,
  })
  if (!community) {
    throw new BillingWriteError(404, { error: 'Comunidad no encontrada' })
  }

  const [planRow, moduleRows, planPriceRows] = await Promise.all([
    prisma.billingCatalogPlan.findUnique({ where: { code: payload.planCode } }),
    prisma.billingCatalogModule.findMany({ where: { active: true } }),
    prisma.billingCatalogPlanPrice.findMany(),
  ])

  const plan: CatalogPlan | null = planRow
    ? {
        code: planRow.code,
        name: planRow.name,
        monthlyPriceEur: planRow.monthlyPriceEur.toString(),
        includes: Array.isArray(planRow.includesJson)
          ? (planRow.includesJson as unknown[]).map(String)
          : [],
        active: planRow.active,
      }
    : null

  const modulesByCode = new Map<string, CatalogModule>(
    moduleRows.map((m) => [
      m.code,
      {
        code: m.code,
        name: m.name,
        listPriceEur: m.listPriceEur.toString(),
        active: m.active,
        sortOrder: m.sortOrder,
      },
    ]),
  )

  const planPrices = buildPlanPriceLookup(planPriceRows)

  const existingRow = community.billing ? mapDbBilling(community.billing) : null
  const existing = existingRow ? toExistingSnap(existingRow) : null

  // Optimistic concurrency
  if (existing) {
    if (!payload.expectedUpdatedAt) {
      throw new BillingWriteError(400, {
        error: 'expectedUpdatedAt es obligatorio al editar',
        message: 'Envía el updatedAt actual del contrato (optimistic concurrency).',
        currentUpdatedAt: existing.updatedAt.toISOString(),
      })
    }
    const expectedMs = Date.parse(payload.expectedUpdatedAt)
    const currentMs = existing.updatedAt.getTime()
    if (expectedMs !== currentMs) {
      throw new BillingWriteError(409, {
        error: 'Conflict',
        message: 'El contrato fue modificado por otro cambio. Recarga y vuelve a guardar.',
        currentUpdatedAt: existing.updatedAt.toISOString(),
      })
    }
  } else if (payload.expectedUpdatedAt) {
    throw new BillingWriteError(409, {
      error: 'Conflict',
      message: 'La comunidad no tenía billing; expectedUpdatedAt no aplica. Reintenta sin él.',
    })
  }

  const resolved = resolveBillingWrite({
    payload,
    plan,
    modulesByCode,
    existing,
    planPrices,
  })
  if (!resolved.ok) {
    throw new BillingWriteError(resolved.status, {
      error: resolved.error,
      message: resolved.message,
    })
  }

  const next = resolved.value

  // Idempotencia: sin cambios reales → no write / no audit
  if (existingRow) {
    const beforeFp = canonicalBillingFingerprint(canonicalParts(existingRow))
    const afterFp = canonicalBillingFingerprint({
      planCode: next.planCode,
      planName: next.planName,
      planListPriceEur: next.planListPriceEur,
      planChargedPriceEur: next.planChargedPriceEur,
      usageMode: next.usageMode,
      commercialStatus: next.commercialStatus,
      dwellingCount: next.dwellingCount,
      dwellingSource: next.dwellingSource,
      sizeSurchargeEur: next.sizeSurchargeEur,
      discountEur: next.discountEur,
      discountNote: next.discountNote,
      negotiatedTotalEur: next.negotiatedTotalEur,
      vatRatePct: next.vatRatePct,
      notes: next.notes,
      lines: next.lines,
    })
    if (beforeFp === afterFp) {
      const { billing: _b, ...comm } = community
      const sizeTiers = await loadActiveSizeTiers()
      return {
        unchanged: true,
        response: buildCommunityBillingReadResponse({
          community: comm,
          billing: existingRow,
          sizeTiers,
        }),
      }
    }
  }

  const beforeAudit = existingRow ? auditPayloadFromRow(existingRow) : null
  const afterAudit = auditPayloadFromResolved(communityId, next)
  const action = existingRow ? 'update' : 'create'

  await prisma.$transaction(async (tx) => {
    let billingId: number

    if (!existing) {
      const created = await tx.communityBilling.create({
        data: {
          communityId,
          planCode: next.planCode,
          planName: next.planName,
          planListPriceEur: moneyToPrisma(next.planListPriceEur),
          planChargedPriceEur: moneyToPrisma(next.planChargedPriceEur),
          usageMode: next.usageMode,
          commercialStatus: next.commercialStatus,
          dwellingCount: next.dwellingCount,
          dwellingSource: next.dwellingSource,
          sizeSurchargeEur: moneyToPrisma(next.sizeSurchargeEur),
          discountEur: moneyToPrisma(next.discountEur),
          discountNote: next.discountNote,
          negotiatedTotalEur:
            next.negotiatedTotalEur == null ? null : moneyToPrisma(next.negotiatedTotalEur),
          vatRatePct: moneyToPrisma(next.vatRatePct),
          currency: 'EUR',
          notes: next.notes,
          configuredByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      })
      billingId = created.id
      await tx.communityBillingLine.createMany({
        data: next.lines.map((l) => ({
          communityBillingId: billingId,
          moduleCode: l.moduleCode,
          moduleName: l.moduleName,
          includedInPlan: l.includedInPlan,
          pricingMode: l.pricingMode,
          listPriceEur: moneyToPrisma(l.listPriceEur),
          chargedPriceEur: moneyToPrisma(l.chargedPriceEur),
          sortOrder: l.sortOrder,
        })),
      })
    } else {
      billingId = existing.id
      await tx.communityBilling.update({
        where: { id: billingId },
        data: {
          planCode: next.planCode,
          planName: next.planName,
          planListPriceEur: moneyToPrisma(next.planListPriceEur),
          planChargedPriceEur: moneyToPrisma(next.planChargedPriceEur),
          usageMode: next.usageMode,
          commercialStatus: next.commercialStatus,
          dwellingCount: next.dwellingCount,
          dwellingSource: next.dwellingSource,
          sizeSurchargeEur: moneyToPrisma(next.sizeSurchargeEur),
          discountEur: moneyToPrisma(next.discountEur),
          discountNote: next.discountNote,
          negotiatedTotalEur:
            next.negotiatedTotalEur == null ? null : moneyToPrisma(next.negotiatedTotalEur),
          vatRatePct: moneyToPrisma(next.vatRatePct),
          notes: next.notes,
          updatedByUserId: actorUserId,
        },
      })

      // Sync líneas: upsert presentes, delete ausentes (solo de este billing)
      const existingCodes = new Set(existing.lines.map((l) => l.moduleCode))
      const nextCodes = new Set(next.lines.map((l) => l.moduleCode))

      const toDelete = [...existingCodes].filter((c) => !nextCodes.has(c))
      if (toDelete.length > 0) {
        await tx.communityBillingLine.deleteMany({
          where: {
            communityBillingId: billingId,
            moduleCode: { in: toDelete },
          },
        })
      }

      for (const l of next.lines) {
        await tx.communityBillingLine.upsert({
          where: {
            communityBillingId_moduleCode: {
              communityBillingId: billingId,
              moduleCode: l.moduleCode,
            },
          },
          create: {
            communityBillingId: billingId,
            moduleCode: l.moduleCode,
            moduleName: l.moduleName,
            includedInPlan: l.includedInPlan,
            pricingMode: l.pricingMode,
            listPriceEur: moneyToPrisma(l.listPriceEur),
            chargedPriceEur: moneyToPrisma(l.chargedPriceEur),
            sortOrder: l.sortOrder,
          },
          update: {
            moduleName: l.moduleName,
            includedInPlan: l.includedInPlan,
            pricingMode: l.pricingMode,
            listPriceEur: moneyToPrisma(l.listPriceEur),
            chargedPriceEur: moneyToPrisma(l.chargedPriceEur),
            sortOrder: l.sortOrder,
          },
        })
      }
    }

    await tx.communityBillingAudit.create({
      data: {
        communityId,
        actorUserId,
        actorEmail,
        action,
        beforeJson: beforeAudit === null ? Prisma.JsonNull : (beforeAudit as Prisma.InputJsonValue),
        afterJson: afterAudit as Prisma.InputJsonValue,
      },
    })
  })

  // Re-read for response (no Community mutation besides billing relation read)
  const fresh = await prisma.community.findUnique({
    where: { id: communityId },
    select: communitySelect,
  })
  if (!fresh || !fresh.billing) {
    throw new BillingWriteError(500, { error: 'Billing guardado pero no se pudo releer' })
  }

  const { billing: billingRel, ...comm } = fresh
  const sizeTiers = await loadActiveSizeTiers()
  return {
    unchanged: false,
    response: buildCommunityBillingReadResponse({
      community: comm,
      billing: mapDbBilling(billingRel),
      sizeTiers,
    }),
  }
}

export { mapDbBilling }
