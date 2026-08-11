import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildBillingPreview } from './preview-billing.js'
import type { CatalogModule, CatalogPlan } from './write-resolve.js'
import type { PutBillingPayload } from './write-validate.js'
import type { CommunityFlagsInput } from './diff-flags.js'
import { initialPlanPriceLookup } from './usage-mode.js'

const PLAN_PRICES = initialPlanPriceLookup()

const plans: CatalogPlan[] = [
  {
    code: 'completo',
    name: 'Vecindario Completo',
    monthlyPriceEur: '69.00',
    includes: [
      'incidents',
      'bookings',
      'services',
      'pool',
      'parcels',
      'key_loans',
      'diario',
      'control_entrada',
    ],
    active: true,
  },
  {
    code: 'conserjeria',
    name: 'Vecindario Conserjería',
    monthlyPriceEur: '46.00',
    includes: ['parcels', 'key_loans', 'diario', 'control_entrada'],
    active: true,
  },
  {
    code: 'a_medida',
    name: 'A medida',
    monthlyPriceEur: '24.00',
    includes: [],
    active: true,
  },
]

const moduleDefs: CatalogModule[] = [
  { code: 'incidents', name: 'Incidencias', listPriceEur: '10.00', active: true, sortOrder: 10 },
  { code: 'bookings', name: 'Reservas', listPriceEur: '14.00', active: true, sortOrder: 20 },
  { code: 'services', name: 'Servicios', listPriceEur: '7.00', active: true, sortOrder: 30 },
  { code: 'pool', name: 'Acceso piscina', listPriceEur: '12.00', active: true, sortOrder: 40 },
  { code: 'parcels', name: 'Paquetería', listPriceEur: '11.00', active: true, sortOrder: 50 },
  { code: 'key_loans', name: 'Llaves', listPriceEur: '4.00', active: true, sortOrder: 60 },
  { code: 'diario', name: 'Diario', listPriceEur: '5.00', active: true, sortOrder: 70 },
  {
    code: 'control_entrada',
    name: 'Control entrada',
    listPriceEur: '6.00',
    active: true,
    sortOrder: 80,
  },
]

const modulesByCode = new Map(moduleDefs.map((m) => [m.code, m]))

const flagsOff: CommunityFlagsInput = {
  appNavServicesEnabled: false,
  appNavIncidentsEnabled: false,
  appNavBookingsEnabled: false,
  appNavPoolAccessEnabled: false,
  appNavPaqueteriaEnabled: false,
  paqueteriaSpecialDeliveryEnabled: false,
  paqueteriaKeyLoansEnabled: false,
  appNavCuadernoDiarioEnabled: false,
  appNavControlEntradaEnabled: false,
}

function basePayload(over: Partial<PutBillingPayload> = {}): PutBillingPayload {
  return {
    planCode: 'a_medida',
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
    lines: [
      {
        moduleCode: 'incidents',
        pricingMode: 'catalog',
        includedInPlan: false,
        sortOrder: 10,
      },
      {
        moduleCode: 'bookings',
        pricingMode: 'catalog',
        includedInPlan: false,
        sortOrder: 20,
      },
    ],
    ...over,
  }
}

describe('B6 preview READ-ONLY', () => {
  it('a_medida + módulos = quote 48 (24+10+14), sin writes', () => {
    const plan = plans.find((p) => p.code === 'a_medida')!
    const r = buildBillingPreview({
      payload: basePayload(),
      plan,
      modulesByCode,
      existing: null,
      flags: flagsOff,
      catalogPlans: plans,
      planPrices: PLAN_PRICES,
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.quote.netEur, '48.00')
    assert.equal(r.quote.planPartEur, '24.00')
    assert.equal(r.quote.modulesPartEur, '24.00')
    assert.equal(r.resolved.planChargedPriceEur, '24.00')
  })

  it('staff_only + conserjeria → plan 39', () => {
    const plan = plans.find((p) => p.code === 'conserjeria')!
    const includes = plan.includes.map((code, i) => ({
      moduleCode: code,
      pricingMode: 'included' as const,
      includedInPlan: true,
      sortOrder: (i + 1) * 10,
    }))
    const r = buildBillingPreview({
      payload: basePayload({
        planCode: 'conserjeria',
        usageMode: 'staff_only',
        lines: includes,
      }),
      plan,
      modulesByCode,
      existing: null,
      flags: flagsOff,
      catalogPlans: plans,
      planPrices: PLAN_PRICES,
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.resolved.planChargedPriceEur, '39.00')
    assert.equal(r.quote.netEur, '39.00')
  })

  it('staff_only + bookings → warning informativo', () => {
    const plan = plans.find((p) => p.code === 'a_medida')!
    const r = buildBillingPreview({
      payload: basePayload({
        usageMode: 'staff_only',
        lines: [
          {
            moduleCode: 'bookings',
            pricingMode: 'catalog',
            includedInPlan: false,
            sortOrder: 20,
          },
        ],
      }),
      plan,
      modulesByCode,
      existing: null,
      flags: flagsOff,
      planPrices: PLAN_PRICES,
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.ok(r.warnings.some((w) => /Solo conserjería/i.test(w)))
  })

  it('staff_only + completo → 400 (no inventa)', () => {
    const plan = plans.find((p) => p.code === 'completo')!
    const r = buildBillingPreview({
      payload: basePayload({
        planCode: 'completo',
        usageMode: 'staff_only',
        lines: plan.includes.map((code, i) => ({
          moduleCode: code,
          pricingMode: 'included' as const,
          includedInPlan: true,
          sortOrder: (i + 1) * 10,
        })),
      }),
      plan,
      modulesByCode,
      existing: null,
      flags: flagsOff,
      planPrices: PLAN_PRICES,
    })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.match(r.error, /usageMode|Plan/i)
  })

  it('sizeSuggestion refleja dwellingCount del payload', () => {
    const plan = plans.find((p) => p.code === 'a_medida')!
    const r = buildBillingPreview({
      payload: basePayload({ dwellingCount: 150, lines: [] }),
      plan,
      modulesByCode,
      existing: null,
      flags: flagsOff,
      planPrices: PLAN_PRICES,
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.sizeSuggestion.suggestedSurchargeEur, '15.00')
    assert.equal(r.sizeSuggestion.requiresManualSurcharge, false)
  })
})
