/**
 * B7.2 — cutover precios DB, snapshots, seed no-overwrite, parse PUT catalog.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBillingCatalogResponse,
  buildPlanPriceLookup,
  catalogPlanPriceForUsageMode,
  computeBillingQuote,
  initialPlanPriceLookup,
  INITIAL_PLAN_PRICES,
  parsePutCatalogPricesPayload,
  resolveBillingWrite,
  type CatalogModule,
  type CatalogPlan,
  type ExistingBillingSnap,
  type PutBillingPayload,
} from './index.js'
import {
  seedModuleUpdateData,
  seedPlanUpdateData,
} from './seed-catalog-fields.js'

const PLAN_PRICES = initialPlanPriceLookup()

const PLAN_A_MEDIDA: CatalogPlan = {
  code: 'a_medida',
  name: 'A medida',
  monthlyPriceEur: '24.00',
  includes: [],
  active: true,
}

const MODULES: CatalogModule[] = [
  { code: 'incidents', name: 'Incidencias', listPriceEur: '10.00', active: true, sortOrder: 10 },
  { code: 'bookings', name: 'Reservas', listPriceEur: '14.00', active: true, sortOrder: 20 },
]

function modulesMap(over?: CatalogModule[]) {
  const list = over ?? MODULES
  return new Map(list.map((m) => [m.code, m]))
}

function basePayload(over: Partial<PutBillingPayload> & Pick<PutBillingPayload, 'planCode' | 'lines'>): PutBillingPayload {
  return {
    usageMode: 'neighbors_and_staff',
    commercialStatus: 'billable',
    dwellingCount: 80,
    dwellingSource: 'manual',
    sizeSurchargeEur: '0.00',
    discountEur: '0.00',
    discountNote: null,
    negotiatedTotalEur: null,
    vatRatePct: '21.00',
    notes: null,
    expectedUpdatedAt: null,
    ...over,
  }
}

describe('B7.2 precios desde lookup DB (no TS authority)', () => {
  it('INITIAL_PLAN_PRICES cubre matriz comercial', () => {
    assert.equal(INITIAL_PLAN_PRICES.length, 6)
    assert.equal(catalogPlanPriceForUsageMode('conserjeria', 'staff_only', '46.00', PLAN_PRICES), '39.00')
    assert.equal(catalogPlanPriceForUsageMode('a_medida', 'staff_only', '24.00', PLAN_PRICES), '16.00')
    assert.equal(catalogPlanPriceForUsageMode('a_medida', 'neighbors_and_staff', '24.00', PLAN_PRICES), '24.00')
  })

  it('sin lookup staff_only → null (no inventa)', () => {
    assert.equal(catalogPlanPriceForUsageMode('conserjeria', 'staff_only', '46.00', null), null)
  })

  it('GET catalog lee planPrices (DB), no constantes ocultas', () => {
    const res = buildBillingCatalogResponse({
      plans: [
        {
          code: 'a_medida',
          name: 'A medida',
          monthlyPriceEur: '24.00',
          includesJson: [],
          active: true,
          sortOrder: 40,
        },
        {
          code: 'conserjeria',
          name: 'Vecindario Conserjería',
          monthlyPriceEur: '46.00',
          includesJson: ['parcels'],
          active: true,
          sortOrder: 20,
        },
      ],
      modules: [
        {
          code: 'bookings',
          name: 'Reservas',
          listPriceEur: '14.00',
          flagKey: 'appNavBookingsEnabled',
          parentCode: null,
          active: true,
          sortOrder: 20,
        },
      ],
      planPrices: [
        { planCode: 'a_medida', usageMode: 'neighbors_and_staff', monthlyPriceEur: '24.00' },
        { planCode: 'a_medida', usageMode: 'staff_only', monthlyPriceEur: '16.00' },
        { planCode: 'conserjeria', usageMode: 'neighbors_and_staff', monthlyPriceEur: '46.00' },
        { planCode: 'conserjeria', usageMode: 'staff_only', monthlyPriceEur: '39.00' },
      ],
    })
    assert.equal(
      res.usageModes.staff_only.plans.find((p) => p.code === 'a_medida')?.monthlyPrice,
      '16.00',
    )
    // Override en DB se refleja (única fuente)
    const res2 = buildBillingCatalogResponse({
      plans: res.plans.map((p) => ({
        code: p.code,
        name: p.name,
        monthlyPriceEur: p.monthlyPrice,
        includesJson: p.includes,
        active: p.active,
        sortOrder: p.sortOrder,
      })),
      modules: [
        {
          code: 'bookings',
          name: 'Reservas',
          listPriceEur: '16.00',
          flagKey: 'appNavBookingsEnabled',
          parentCode: null,
          active: true,
          sortOrder: 20,
        },
      ],
      planPrices: [
        { planCode: 'a_medida', usageMode: 'neighbors_and_staff', monthlyPriceEur: '25.00' },
        { planCode: 'a_medida', usageMode: 'staff_only', monthlyPriceEur: '16.00' },
        { planCode: 'conserjeria', usageMode: 'neighbors_and_staff', monthlyPriceEur: '46.00' },
        { planCode: 'conserjeria', usageMode: 'staff_only', monthlyPriceEur: '39.00' },
      ],
    })
    assert.equal(
      res2.usageModes.neighbors_and_staff.plans.find((p) => p.code === 'a_medida')?.monthlyPrice,
      '25.00',
    )
    assert.equal(res2.modules.find((m) => m.code === 'bookings')?.listPrice, '16.00')
  })
})

describe('B7.2 snapshot contrato vs catálogo', () => {
  it('contrato existente bookings 14€; catálogo→16€; snapshot sigue 14; MRR intacto; nuevo usa 16', () => {
    const existing: ExistingBillingSnap = {
      id: 1,
      planCode: 'a_medida',
      planName: 'A medida',
      planListPriceEur: '24.00',
      planChargedPriceEur: '24.00',
      usageMode: 'neighbors_and_staff',
      commercialStatus: 'billable',
      dwellingCount: 80,
      dwellingSource: 'manual',
      sizeSurchargeEur: '0.00',
      discountEur: '0.00',
      discountNote: null,
      negotiatedTotalEur: null,
      vatRatePct: '21.00',
      notes: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      lines: [
        {
          moduleCode: 'bookings',
          moduleName: 'Reservas',
          includedInPlan: false,
          pricingMode: 'catalog',
          listPriceEur: '14.00',
          chargedPriceEur: '14.00',
          sortOrder: 20,
        },
      ],
    }

    const catalogAfter: CatalogModule[] = [
      { code: 'incidents', name: 'Incidencias', listPriceEur: '10.00', active: true, sortOrder: 10 },
      { code: 'bookings', name: 'Reservas', listPriceEur: '16.00', active: true, sortOrder: 20 },
    ]

    const keep = resolveBillingWrite({
      payload: basePayload({
        planCode: 'a_medida',
        expectedUpdatedAt: existing.updatedAt.toISOString(),
        lines: [
          {
            moduleCode: 'bookings',
            pricingMode: 'catalog',
            includedInPlan: false,
            sortOrder: 20,
          },
        ],
      }),
      plan: PLAN_A_MEDIDA,
      modulesByCode: modulesMap(catalogAfter),
      existing,
      planPrices: PLAN_PRICES,
    })
    assert.ok(keep.ok)
    if (!keep.ok) return
    assert.equal(keep.value.lines[0]?.listPriceEur, '14.00')
    assert.equal(keep.value.lines[0]?.chargedPriceEur, '14.00')

    const quoteBefore = computeBillingQuote({
      planChargedPriceEur: existing.planChargedPriceEur,
      sizeSurchargeEur: existing.sizeSurchargeEur,
      discountEur: existing.discountEur,
      negotiatedTotalEur: existing.negotiatedTotalEur,
      vatRatePct: existing.vatRatePct,
      lines: existing.lines.map((l) => ({
        moduleCode: l.moduleCode,
        moduleName: l.moduleName,
        includedInPlan: l.includedInPlan,
        pricingMode: l.pricingMode as 'catalog',
        listPriceEur: l.listPriceEur,
        chargedPriceEur: l.chargedPriceEur,
      })),
    })
    const quoteAfter = computeBillingQuote({
      planChargedPriceEur: keep.value.planChargedPriceEur,
      sizeSurchargeEur: keep.value.sizeSurchargeEur,
      discountEur: keep.value.discountEur,
      negotiatedTotalEur: keep.value.negotiatedTotalEur,
      vatRatePct: keep.value.vatRatePct,
      lines: keep.value.lines.map((l) => ({
        moduleCode: l.moduleCode,
        moduleName: l.moduleName,
        includedInPlan: l.includedInPlan,
        pricingMode: l.pricingMode,
        listPriceEur: l.listPriceEur,
        chargedPriceEur: l.chargedPriceEur,
      })),
    })
    assert.equal(quoteBefore.netEur, '38.00')
    assert.equal(quoteAfter.netEur, '38.00')

    const neu = resolveBillingWrite({
      payload: basePayload({
        planCode: 'a_medida',
        lines: [
          {
            moduleCode: 'bookings',
            pricingMode: 'catalog',
            includedInPlan: false,
            sortOrder: 20,
          },
        ],
      }),
      plan: PLAN_A_MEDIDA,
      modulesByCode: modulesMap(catalogAfter),
      existing: null,
      planPrices: PLAN_PRICES,
    })
    assert.ok(neu.ok)
    if (!neu.ok) return
    assert.equal(neu.value.lines[0]?.listPriceEur, '16.00')
    assert.equal(neu.value.lines[0]?.chargedPriceEur, '16.00')
  })
})

describe('B7.2 seed no-overwrite precios', () => {
  it('update de seed no incluye monthlyPriceEur ni listPriceEur', () => {
    const planUp = seedPlanUpdateData({
      name: 'A medida',
      sortOrder: 40,
    })
    const modUp = seedModuleUpdateData({
      code: 'bookings',
      name: 'Reservas',
      listPriceEur: '14.00',
      flagKey: 'appNavBookingsEnabled',
      sortOrder: 20,
    })
    assert.equal('monthlyPriceEur' in planUp, false)
    assert.equal('listPriceEur' in modUp, false)
    assert.equal('includesJson' in planUp, false)
    // Simula: Reservas editada a 16€; seed update no la toca
    assert.equal(modUp.name, 'Reservas')
  })
})

describe('B7.2 PUT catalog/prices parse', () => {
  it('payload cerrado; rechaza campos extra', () => {
    assert.throws(
      () => parsePutCatalogPricesPayload({ foo: 1 }),
      (e: { status?: number }) => e.status === 400,
    )
  })

  it('acepta planPrices + modulePrices', () => {
    const p = parsePutCatalogPricesPayload({
      planPrices: [
        { planCode: 'a_medida', usageMode: 'staff_only', monthlyPriceEur: '17.00' },
      ],
      modulePrices: [{ moduleCode: 'bookings', listPriceEur: '16.00' }],
    })
    assert.equal(p.planPrices.length, 1)
    assert.equal(p.modulePrices[0]?.listPriceEur, '16.00')
  })

  it('rechaza plan no disponible en usageMode', () => {
    assert.throws(
      () =>
        parsePutCatalogPricesPayload({
          planPrices: [
            { planCode: 'completo', usageMode: 'staff_only', monthlyPriceEur: '69.00' },
          ],
        }),
      (e: { status?: number }) => e.status === 400,
    )
  })
})

describe('B7.2 buildPlanPriceLookup', () => {
  it('formatea desde filas DB', () => {
    const map = buildPlanPriceLookup([
      { planCode: 'a_medida', usageMode: 'staff_only', monthlyPriceEur: '16' },
    ])
    assert.equal(map.get('a_medida::staff_only'), '16.00')
  })
})
