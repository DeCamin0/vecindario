/**
 * Admin billing — READ + WRITE (PUT) + preview READ-ONLY (POST) + catalog prices PUT.
 * Montar con requireSuperAdmin (nunca requireAdminCommunitiesAccess).
 *
 * WRITE contratos: community_billing / lines / audits.
 * WRITE catálogo: billing_catalog_plan_prices / modules.list_price / billing_catalog_audits.
 * Preview: cero DB writes / audit.
 */
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import {
  buildCommunityBillingReadResponse,
  flagsFromCommunity,
} from '../lib/billing/read-community.js'
import { buildBillingSummary } from '../lib/billing/read-summary.js'
import { formatMoney } from '../lib/billing/money.js'
import { parsePutBillingPayload } from '../lib/billing/write-validate.js'
import { BillingWriteError, mapDbBilling, putCommunityBilling } from '../lib/billing/write-billing.js'
import { buildCommunityBillingCardSummary } from '../lib/billing/communities-card-summary.js'
import {
  buildBillingPreview,
  existingSnapFromBillingRow,
} from '../lib/billing/preview-billing.js'
import { buildBillingCatalogResponse } from '../lib/billing/catalog-response.js'
import { buildPlanPriceLookup } from '../lib/billing/usage-mode.js'
import {
  CatalogWriteError,
  putCatalog,
} from '../lib/billing/catalog-write.js'
import {
  loadActiveSizeTiers,
  putSizeTiers,
} from '../lib/billing/size-tiers-write.js'
import type { CatalogModule, CatalogPlan } from '../lib/billing/write-resolve.js'

export const adminBillingRouter = Router()

function parseCommunityId(raw: string): number | null {
  const id = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(id) || id < 1) return null
  return id
}

const communityReadSelect = {
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

adminBillingRouter.get('/catalog', async (_req, res) => {
  try {
    const [plans, modules, planPrices, sizeTiers] = await Promise.all([
      prisma.billingCatalogPlan.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogModule.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogPlanPrice.findMany(),
      prisma.billingCatalogSizeTier.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { fromUnits: 'asc' }],
      }),
    ])
    res.json(buildBillingCatalogResponse({ plans, modules, planPrices, sizeTiers }))
  } catch (e) {
    console.error('[admin billing catalog]', e)
    res.status(500).json({ error: 'Error al cargar el catálogo de billing' })
  }
})

/**
 * PUT catálogo — precios + includes (batch atómico).
 * Solo billing_catalog_* (+ audits). Nunca community_billing* / Community / flags.
 */
async function handlePutCatalog(req: import('express').Request, res: import('express').Response) {
  try {
    const actor = await prisma.vecindarioUser.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, role: true },
    })
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Se requiere cuenta de super administrador.',
        currentRole: actor?.role ?? null,
      })
      return
    }

    const result = await putCatalog({
      actorUserId: actor.id,
      actorEmail: actor.email ?? '',
      body: req.body,
    })

    const [plans, modules, planPrices, sizeTiers] = await Promise.all([
      prisma.billingCatalogPlan.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogModule.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogPlanPrice.findMany(),
      prisma.billingCatalogSizeTier.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { fromUnits: 'asc' }],
      }),
    ])

    res.json({
      ...buildBillingCatalogResponse({ plans, modules, planPrices, sizeTiers }),
      meta: {
        unchanged: result.unchanged,
        changed: result.changed,
        batchId: result.batchId,
      },
    })
  } catch (e) {
    if (e instanceof CatalogWriteError) {
      res.status(e.status).json(e.body)
      return
    }
    console.error('[admin billing catalog put]', e)
    res.status(500).json({ error: 'Error al guardar el catálogo' })
  }
}

adminBillingRouter.put('/catalog', handlePutCatalog)
/** Alias B7.2 (mismo handler). */
adminBillingRouter.put('/catalog/prices', handlePutCatalog)

/**
 * PUT tramos por tamaño — set completo atómico.
 * Solo billing_catalog_size_tiers + audits. Nunca community_billing*.
 */
adminBillingRouter.put('/catalog/size-tiers', async (req, res) => {
  try {
    const actor = await prisma.vecindarioUser.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, role: true },
    })
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Se requiere cuenta de super administrador.',
        currentRole: actor?.role ?? null,
      })
      return
    }

    const result = await putSizeTiers({
      actorUserId: actor.id,
      actorEmail: actor.email ?? '',
      body: req.body,
    })

    const [plans, modules, planPrices, sizeTiers] = await Promise.all([
      prisma.billingCatalogPlan.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogModule.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogPlanPrice.findMany(),
      prisma.billingCatalogSizeTier.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { fromUnits: 'asc' }],
      }),
    ])

    res.json({
      ...buildBillingCatalogResponse({ plans, modules, planPrices, sizeTiers }),
      meta: {
        unchanged: result.unchanged,
        changed: result.changed,
        batchId: result.batchId,
      },
    })
  } catch (e) {
    if (e instanceof CatalogWriteError) {
      res.status(e.status).json(e.body)
      return
    }
    console.error('[admin billing size-tiers put]', e)
    res.status(500).json({ error: 'Error al guardar tramos de tamaño' })
  }
})

/** Historial ligero (prioridad baja B7.2; listo si hace falta). */
adminBillingRouter.get('/catalog/audits', async (req, res) => {
  try {
    const raw = Number.parseInt(String(req.query.limit ?? '40'), 10)
    const take = Number.isFinite(raw) ? Math.min(100, Math.max(1, raw)) : 40
    const items = await prisma.billingCatalogAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    })
    res.json({
      items: items.map((a) => ({
        id: a.id,
        actorUserId: a.actorUserId,
        actorEmail: a.actorEmail,
        entityType: a.entityType,
        entityCode: a.entityCode,
        usageMode: a.usageMode,
        field: a.field,
        beforeValue: a.beforeValue,
        afterValue: a.afterValue,
        batchId: a.batchId,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    console.error('[admin billing catalog audits]', e)
    res.status(500).json({ error: 'Error al cargar auditorías de catálogo' })
  }
})

adminBillingRouter.get('/communities/:id', async (req, res) => {
  const id = parseCommunityId(req.params.id)
  if (id == null) {
    res.status(400).json({ error: 'Id de comunidad no válido' })
    return
  }
  try {
    const community = await prisma.community.findUnique({
      where: { id },
      select: communityReadSelect,
    })
    if (!community) {
      res.status(404).json({ error: 'Comunidad no encontrada' })
      return
    }

    const { billing: billingRel, ...comm } = community
    const sizeTiers = await loadActiveSizeTiers()
    const payload = buildCommunityBillingReadResponse({
      community: comm,
      billing: billingRel ? mapDbBilling(billingRel) : null,
      sizeTiers,
    })
    res.json(payload)
  } catch (e) {
    console.error('[admin billing community]', e)
    res.status(500).json({ error: 'Error al cargar billing de la comunidad' })
  }
})

adminBillingRouter.get('/summary', async (_req, res) => {
  try {
    const [totalCommunities, rows] = await Promise.all([
      prisma.community.count(),
      prisma.communityBilling.findMany({
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      }),
    ])
    const summary = buildBillingSummary({
      totalCommunities,
      billings: rows.map(mapDbBilling),
    })
    res.json(summary)
  } catch (e) {
    console.error('[admin billing summary]', e)
    res.status(500).json({ error: 'Error al cargar el resumen de billing' })
  }
})

/**
 * Batch para cards Super Admin — 1 query communities + 1 query billings (vía include).
 * No expone datos a company_admin (ruta con requireSuperAdmin).
 */
adminBillingRouter.get('/communities-summary', async (_req, res) => {
  try {
    const communities = await prisma.community.findMany({
      select: {
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
            lines: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: { id: 'asc' },
    })

    const items = communities.map((c) => {
      const { billing: billingRel, ...comm } = c
      return buildCommunityBillingCardSummary({
        community: comm,
        billing: billingRel ? mapDbBilling(billingRel) : null,
      })
    })

    res.json({ items })
  } catch (e) {
    console.error('[admin billing communities-summary]', e)
    res.status(500).json({ error: 'Error al cargar el resumen de billing por comunidades' })
  }
})

/**
 * POST preview — READ-ONLY: parse + resolve + compute quote.
 * Cero writes / audit / create / update. Mismo body que PUT (expectedUpdatedAt ignorado).
 */
adminBillingRouter.post('/communities/:id/preview', async (req, res) => {
  const id = parseCommunityId(req.params.id)
  if (id == null) {
    res.status(400).json({ error: 'Id de comunidad no válido' })
    return
  }

  const parsed = parsePutBillingPayload(req.body)
  if (!parsed.ok) {
    res.status(parsed.status).json({ error: parsed.error, message: parsed.message })
    return
  }

  try {
    const community = await prisma.community.findUnique({
      where: { id },
      select: communityReadSelect,
    })
    if (!community) {
      res.status(404).json({ error: 'Comunidad no encontrada' })
      return
    }

    const [planRow, moduleRows, allPlanRows, planPriceRows, sizeTiers] = await Promise.all([
      prisma.billingCatalogPlan.findUnique({ where: { code: parsed.value.planCode } }),
      prisma.billingCatalogModule.findMany({ where: { active: true } }),
      prisma.billingCatalogPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.billingCatalogPlanPrice.findMany(),
      loadActiveSizeTiers(),
    ])

    const plan: CatalogPlan | null = planRow
      ? {
          code: planRow.code,
          name: planRow.name,
          monthlyPriceEur: formatMoney(planRow.monthlyPriceEur),
          includes: Array.isArray(planRow.includesJson) ? (planRow.includesJson as string[]) : [],
          active: planRow.active,
        }
      : null

    const catalogPlans: CatalogPlan[] = allPlanRows.map((p) => ({
      code: p.code,
      name: p.name,
      monthlyPriceEur: formatMoney(p.monthlyPriceEur),
      includes: Array.isArray(p.includesJson) ? (p.includesJson as string[]) : [],
      active: p.active,
    }))

    const modulesByCode = new Map<string, CatalogModule>(
      moduleRows.map((m) => [
        m.code,
        {
          code: m.code,
          name: m.name,
          listPriceEur: formatMoney(m.listPriceEur),
          active: m.active,
          sortOrder: m.sortOrder,
        },
      ]),
    )

    const planPrices = buildPlanPriceLookup(planPriceRows)

    const { billing: billingRel, ...comm } = community
    const existing = billingRel ? existingSnapFromBillingRow(mapDbBilling(billingRel)) : null
    const flags = flagsFromCommunity(comm)

    const preview = buildBillingPreview({
      payload: parsed.value,
      plan,
      modulesByCode,
      existing,
      flags,
      catalogPlans,
      planPrices,
      sizeTiers,
    })

    if (!preview.ok) {
      res.status(preview.status).json({ error: preview.error, message: preview.message })
      return
    }

    res.json({
      communityId: id,
      communityName: community.name,
      resolved: preview.resolved,
      quote: preview.quote,
      sizeSuggestion: preview.sizeSuggestion,
      flagDiff: preview.flagDiff,
      warnings: preview.warnings,
      packRecommendation: preview.packRecommendation,
      meta: { readOnly: true, persisted: false },
    })
  } catch (e) {
    console.error('[admin billing preview]', e)
    res.status(500).json({ error: 'Error al calcular preview de billing' })
  }
})

/**
 * PUT — crea o actualiza contrato comercial (transacción + audit).
 * No modifica Community / flags / status / planExpiresOn.
 */
adminBillingRouter.put('/communities/:id', async (req, res) => {
  const id = parseCommunityId(req.params.id)
  if (id == null) {
    res.status(400).json({ error: 'Id de comunidad no válido' })
    return
  }

  const parsed = parsePutBillingPayload(req.body)
  if (!parsed.ok) {
    res.status(parsed.status).json({ error: parsed.error, message: parsed.message })
    return
  }

  try {
    const actor = await prisma.vecindarioUser.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, role: true },
    })
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Se requiere cuenta de super administrador.',
        currentRole: actor?.role ?? null,
      })
      return
    }

    const result = await putCommunityBilling({
      communityId: id,
      actorUserId: actor.id,
      actorEmail: actor.email,
      payload: parsed.value,
    })

    res.status(result.unchanged ? 200 : 200).json({
      ...result.response,
      meta: { unchanged: result.unchanged },
    })
  } catch (e) {
    if (e instanceof BillingWriteError) {
      res.status(e.status).json(e.body)
      return
    }
    console.error('[admin billing put]', e)
    res.status(500).json({ error: 'Error al guardar billing de la comunidad' })
  }
})
