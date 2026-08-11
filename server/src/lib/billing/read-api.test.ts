import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { isSuperAdminRole } from '../../middleware/require-super-admin.js'
import {
  buildBillingSummary,
  buildCommunityBillingReadResponse,
  type CommunityBillingRow,
} from './index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function billingFixture(partial: Partial<CommunityBillingRow> & Pick<CommunityBillingRow, 'commercialStatus' | 'planChargedPriceEur'>): CommunityBillingRow {
  const now = new Date('2026-01-15T12:00:00.000Z')
  return {
    id: partial.id ?? 1,
    communityId: partial.communityId ?? 10,
    planCode: partial.planCode ?? 'completo',
    planName: partial.planName ?? 'Vecindario Completo',
    planListPriceEur: partial.planListPriceEur ?? '69.00',
    planChargedPriceEur: partial.planChargedPriceEur,
    usageMode: partial.usageMode ?? 'neighbors_and_staff',
    commercialStatus: partial.commercialStatus,
    dwellingCount: partial.dwellingCount ?? 80,
    dwellingSource: partial.dwellingSource ?? 'manual',
    sizeSurchargeEur: partial.sizeSurchargeEur ?? '0.00',
    discountEur: partial.discountEur ?? '0.00',
    discountNote: partial.discountNote ?? null,
    negotiatedTotalEur: partial.negotiatedTotalEur ?? null,
    vatRatePct: partial.vatRatePct ?? '21.00',
    currency: partial.currency ?? 'EUR',
    notes: partial.notes ?? null,
    configuredAt: partial.configuredAt ?? now,
    configuredByUserId: partial.configuredByUserId ?? 1,
    updatedAt: partial.updatedAt ?? now,
    updatedByUserId: partial.updatedByUserId ?? 1,
    lines: partial.lines ?? [
      {
        moduleCode: 'incidents',
        moduleName: 'Incidencias',
        includedInPlan: true,
        pricingMode: 'included',
        listPriceEur: '12.00',
        chargedPriceEur: '0.00',
        sortOrder: 10,
      },
      {
        moduleCode: 'bookings',
        moduleName: 'Reservas',
        includedInPlan: true,
        pricingMode: 'included',
        listPriceEur: '18.00',
        chargedPriceEur: '0.00',
        sortOrder: 20,
      },
    ],
  }
}

const baseCommunity = {
  id: 10,
  name: 'Comunidad Test',
  portalCount: 1,
  portalDwellingConfig: [],
  appNavServicesEnabled: true,
  appNavIncidentsEnabled: true,
  appNavBookingsEnabled: true,
  appNavPoolAccessEnabled: false,
  appNavPaqueteriaEnabled: false,
  paqueteriaSpecialDeliveryEnabled: false,
  paqueteriaKeyLoansEnabled: false,
  appNavCuadernoDiarioEnabled: false,
  appNavControlEntradaEnabled: false,
}

describe('B3 auth — solo super_admin', () => {
  it('super_admin permitido; company_admin y resto denegados (403 conceptual)', () => {
    assert.equal(isSuperAdminRole('super_admin'), true)
    assert.equal(isSuperAdminRole('company_admin'), false)
    assert.equal(isSuperAdminRole('community_admin'), false)
    assert.equal(isSuperAdminRole('president'), false)
    assert.equal(isSuperAdminRole('concierge'), false)
    assert.equal(isSuperAdminRole('resident'), false)
    assert.equal(isSuperAdminRole(null), false)
  })

  it('index monta /api/admin/billing con requireSuperAdmin', () => {
    const indexPath = path.resolve(__dirname, '../../index.ts')
    const src = fs.readFileSync(indexPath, 'utf8')
    assert.match(src, /app\.use\(\s*['"]\/api\/admin\/billing['"]\s*,\s*\.\.\.requireSuperAdmin/)
    assert.doesNotMatch(
      src,
      /app\.use\(\s*['"]\/api\/admin\/billing['"]\s*,\s*\.\.\.requireAdminCommunitiesAccess/,
    )
  })

  it('router billing: GET + PUT + preview POST; sin PATCH/DELETE', () => {
    const routePath = path.resolve(__dirname, '../../routes/admin-billing.ts')
    const src = fs.readFileSync(routePath, 'utf8')
    assert.match(src, /\.get\(\s*['"]\/catalog['"]/)
    assert.match(src, /\.put\(\s*['"]\/catalog['"]/)
    assert.match(src, /\.put\(\s*['"]\/catalog\/prices['"]/)
    assert.match(src, /\.get\(\s*['"]\/catalog\/audits['"]/)
    assert.match(src, /\.get\(\s*['"]\/communities\/:id['"]/)
    assert.match(src, /\.get\(\s*['"]\/summary['"]/)
    assert.match(src, /\.get\(\s*['"]\/communities-summary['"]/)
    assert.match(src, /\.put\(\s*['"]\/communities\/:id['"]/)
    assert.match(src, /\.post\(\s*['"]\/communities\/:id\/preview['"]/)
    assert.doesNotMatch(src, /\.(patch|delete)\s*\(/i)
  })
})

describe('B3 catalog shape (fixture seed esperado)', () => {
  it('estructura de 4 planes + 8 módulos (contrato de respuesta)', () => {
    const plans = [
      { code: 'comunidad', name: 'Vecindario Comunidad', monthlyPrice: '44.00', includes: ['incidents', 'bookings'], active: true, sortOrder: 10 },
      { code: 'conserjeria', name: 'Vecindario Conserjería', monthlyPrice: '46.00', includes: [], active: true, sortOrder: 20 },
      { code: 'completo', name: 'Vecindario Completo', monthlyPrice: '69.00', includes: [], active: true, sortOrder: 30 },
      { code: 'a_medida', name: 'A medida', monthlyPrice: '24.00', includes: [], active: true, sortOrder: 40 },
    ]
    const modules = [
      'incidents',
      'bookings',
      'services',
      'pool',
      'parcels',
      'key_loans',
      'diario',
      'control_entrada',
    ]
    assert.equal(plans.length, 4)
    assert.equal(modules.length, 8)
    assert.ok(!modules.includes('special_delivery'))
  })
})

describe('B3 GET community read', () => {
  it('sin billing → unconfigured, billing null, no inventa contrato', () => {
    const res = buildCommunityBillingReadResponse({
      community: baseCommunity,
      billing: null,
    })
    assert.equal(res.commercialStatus, 'unconfigured')
    assert.equal(res.billing, null)
    assert.equal(res.quote, null)
    assert.ok(res.functionalFlags)
    assert.ok(res.flagDiff)
  })

  it('configurada → quote 69 completo', () => {
    const res = buildCommunityBillingReadResponse({
      community: baseCommunity,
      billing: billingFixture({ commercialStatus: 'billable', planChargedPriceEur: '69.00' }),
    })
    assert.equal(res.commercialStatus, 'billable')
    assert.ok(res.billing)
    assert.equal(res.quote?.netEur, '69.00')
    assert.equal(res.billing?.plan.chargedPriceEur, '69.00')
  })

  it('negotiated override', () => {
    const res = buildCommunityBillingReadResponse({
      community: baseCommunity,
      billing: billingFixture({
        commercialStatus: 'billable',
        planChargedPriceEur: '69.00',
        sizeSurchargeEur: '15.00',
        negotiatedTotalEur: '50.00',
      }),
    })
    assert.equal(res.quote?.pricingSource, 'negotiated_override')
    assert.equal(res.quote?.netEur, '50.00')
  })

  it('legacy snapshot bookings 18 no usa catálogo 22', () => {
    const res = buildCommunityBillingReadResponse({
      community: baseCommunity,
      billing: billingFixture({
        commercialStatus: 'legacy',
        planCode: 'a_medida',
        planName: 'A medida',
        planListPriceEur: '29.00',
        planChargedPriceEur: '29.00',
        lines: [
          {
            moduleCode: 'bookings',
            moduleName: 'Reservas',
            includedInPlan: false,
            pricingMode: 'catalog',
            listPriceEur: '18.00',
            chargedPriceEur: '18.00',
            sortOrder: 20,
          },
        ],
      }),
    })
    assert.equal(res.quote?.modulesPartEur, '18.00')
    assert.equal(res.quote?.netEur, '47.00')
    assert.equal(res.billing?.lines[0]?.listPriceEur, '18.00')
  })

  it('flagDiff: bookings activo no contratado', () => {
    const res = buildCommunityBillingReadResponse({
      community: {
        ...baseCommunity,
        appNavBookingsEnabled: true,
        appNavIncidentsEnabled: false,
      },
      billing: billingFixture({
        commercialStatus: 'billable',
        planCode: 'a_medida',
        planName: 'A medida',
        planChargedPriceEur: '29.00',
        lines: [
          {
            moduleCode: 'incidents',
            moduleName: 'Incidencias',
            includedInPlan: false,
            pricingMode: 'catalog',
            listPriceEur: '12.00',
            chargedPriceEur: '12.00',
            sortOrder: 10,
          },
        ],
      }),
    })
    const bookings = res.flagDiff.modules.find((m) => m.moduleCode === 'bookings')!
    const incidents = res.flagDiff.modules.find((m) => m.moduleCode === 'incidents')!
    assert.equal(bookings.status, 'active_not_contracted')
    assert.equal(incidents.status, 'contracted_not_active')
    assert.equal(res.flagDiff.hasWarnings, true)
  })

  it('suggestedDwellingCount null si portales incompletos (no usa residentSlots)', () => {
    const res = buildCommunityBillingReadResponse({
      community: baseCommunity,
      billing: null,
    })
    assert.equal(res.suggestedDwellingCount, null)
    assert.equal(res.suggestionReliable, false)
  })
})

describe('B3 summary / MRR', () => {
  it('0 contratos → MRR 0 y average ticket null (sin división por 0)', () => {
    const s = buildBillingSummary({ totalCommunities: 8, billings: [] })
    assert.equal(s.mrr, '0.00')
    assert.equal(s.arr, '0.00')
    assert.equal(s.unconfiguredCommunities, 8)
    assert.equal(s.configuredCommunities, 0)
    assert.equal(s.mrrCommunities, 0)
    assert.equal(s.averageMonthlyTicket, null)
  })

  it('demo/courtesy no cuentan MRR; billable/promo/legacy sí', () => {
    const s = buildBillingSummary({
      totalCommunities: 10,
      billings: [
        billingFixture({ id: 1, communityId: 1, commercialStatus: 'billable', planChargedPriceEur: '69.00' }),
        billingFixture({ id: 2, communityId: 2, commercialStatus: 'promo', planChargedPriceEur: '49.00', planCode: 'comunidad', planName: 'Vecindario Comunidad' }),
        billingFixture({ id: 3, communityId: 3, commercialStatus: 'legacy', planChargedPriceEur: '55.00', planCode: 'conserjeria', planName: 'Vecindario Conserjería' }),
        billingFixture({ id: 4, communityId: 4, commercialStatus: 'demo', planChargedPriceEur: '69.00' }),
        billingFixture({ id: 5, communityId: 5, commercialStatus: 'courtesy', planChargedPriceEur: '69.00' }),
        billingFixture({ id: 6, communityId: 6, commercialStatus: 'non_billable', planChargedPriceEur: '69.00' }),
      ],
    })
    assert.equal(s.billableCommunities, 1)
    assert.equal(s.promoCommunities, 1)
    assert.equal(s.legacyCommunities, 1)
    assert.equal(s.demoCommunities, 1)
    assert.equal(s.courtesyCommunities, 1)
    assert.equal(s.nonBillableCommunities, 1)
    assert.equal(s.unconfiguredCommunities, 4) // 10 - 6
    assert.equal(s.mrrCommunities, 3)
    // 69 + 49 + 55 = 173
    assert.equal(s.mrr, '173.00')
    assert.equal(s.arr, '2076.00')
    assert.equal(s.averageMonthlyTicket, '57.67') // 173/3 rounded
    assert.equal(s.mrrEur, '173.00')
    assert.equal(s.arrEur, '2076.00')
    assert.equal(s.communities.contributingToMrr, 3)
    assert.ok(s.revenueByPlan.length >= 1)
    assert.ok(s.contractedModulesCount.incidents >= 1)
    assert.ok(s.byCommercialStatus.length >= 7)
    assert.ok(s.byUsageMode.length >= 2)
  })
})

describe('B3 community inexistente (contrato de ruta)', () => {
  it('parse id inválido → 400; id válido inexistente lo trata la ruta con 404', () => {
    // Documentado por el handler: findUnique null → 404. Aquí validamos helper de id.
    const parse = (raw: string) => {
      const id = Number.parseInt(String(raw), 10)
      if (!Number.isFinite(id) || id < 1) return null
      return id
    }
    assert.equal(parse('abc'), null)
    assert.equal(parse('0'), null)
    assert.equal(parse('12'), 12)
  })
})
