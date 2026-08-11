/**
 * B7.3 — includes editables de packs; snapshots contractuales; seed no-overwrite includes.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSuperAdminRole } from '../../middleware/require-super-admin.js'
import {
  computeBillingQuote,
  defaultIncludedLinesForPlan,
  includesFingerprint,
  initialPlanPriceLookup,
  normalizeIncludesCodes,
  parsePutCatalogPayload,
  resolveBillingWrite,
  type CatalogModule,
  type CatalogPlan,
  type ExistingBillingSnap,
  type PutBillingPayload,
} from './index.js'
import { seedPlanUpdateData } from './seed-catalog-fields.js'

const PLAN_PRICES = initialPlanPriceLookup()

const MODULES: CatalogModule[] = [
  { code: 'incidents', name: 'Incidencias', listPriceEur: '10.00', active: true, sortOrder: 10 },
  { code: 'bookings', name: 'Reservas', listPriceEur: '14.00', active: true, sortOrder: 20 },
  { code: 'services', name: 'Servicios', listPriceEur: '7.00', active: true, sortOrder: 30 },
  { code: 'pool', name: 'Piscina', listPriceEur: '12.00', active: true, sortOrder: 40 },
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

function modulesMap() {
  return new Map(MODULES.map((m) => [m.code, m]))
}

function planComunidad(includes: string[]): CatalogPlan {
  return {
    code: 'comunidad',
    name: 'Vecindario Comunidad',
    monthlyPriceEur: '44.00',
    includes,
    active: true,
  }
}

function planConserjeria(includes: string[]): CatalogPlan {
  return {
    code: 'conserjeria',
    name: 'Vecindario Conserjería',
    monthlyPriceEur: '46.00',
    includes,
    active: true,
  }
}

function planCompleto(includes: string[]): CatalogPlan {
  return {
    code: 'completo',
    name: 'Vecindario Completo',
    monthlyPriceEur: '69.00',
    includes,
    active: true,
  }
}

function basePayload(
  over: Partial<PutBillingPayload> & Pick<PutBillingPayload, 'planCode' | 'lines'>,
): PutBillingPayload {
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

function existingComunidadSnap(): ExistingBillingSnap {
  return {
    id: 9,
    planCode: 'comunidad',
    planName: 'Vecindario Comunidad',
    planListPriceEur: '44.00',
    planChargedPriceEur: '44.00',
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
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    lines: [
      {
        moduleCode: 'incidents',
        moduleName: 'Incidencias',
        includedInPlan: true,
        pricingMode: 'included',
        listPriceEur: '10.00',
        chargedPriceEur: '0.00',
        sortOrder: 10,
      },
      {
        moduleCode: 'bookings',
        moduleName: 'Reservas',
        includedInPlan: true,
        pricingMode: 'included',
        listPriceEur: '14.00',
        chargedPriceEur: '0.00',
        sortOrder: 20,
      },
    ],
  }
}

describe('B7.3 parse planIncludes', () => {
  it('comunidad / conserjeria / completo aceptan includes', () => {
    const p = parsePutCatalogPayload({
      planIncludes: [
        { planCode: 'comunidad', includes: ['bookings', 'incidents', 'services'] },
        { planCode: 'conserjeria', includes: ['parcels', 'diario'] },
        {
          planCode: 'completo',
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
        },
      ],
    })
    assert.equal(p.planIncludes.length, 3)
    assert.deepEqual(p.planIncludes.find((x) => x.planCode === 'comunidad')?.includes, [
      'bookings',
      'incidents',
      'services',
    ])
  })

  it('A medida no acepta includes no vacíos', () => {
    assert.throws(
      () =>
        parsePutCatalogPayload({
          planIncludes: [{ planCode: 'a_medida', includes: ['incidents'] }],
        }),
      (e: { status?: number; body?: { error?: string } }) =>
        e.status === 400 && /A medida/i.test(String(e.body?.error || e.message)),
    )
  })

  it('módulos duplicados → error', () => {
    assert.throws(
      () =>
        parsePutCatalogPayload({
          planIncludes: [{ planCode: 'comunidad', includes: ['incidents', 'incidents'] }],
        }),
      (e: { status?: number }) => e.status === 400,
    )
  })

  it('módulo inválido → error', () => {
    assert.throws(
      () =>
        parsePutCatalogPayload({
          planIncludes: [{ planCode: 'comunidad', includes: ['no_existe'] }],
        }),
      (e: { status?: number }) => e.status === 400,
    )
  })

  it('special_delivery → error', () => {
    assert.throws(
      () =>
        parsePutCatalogPayload({
          planIncludes: [{ planCode: 'comunidad', includes: ['special_delivery'] }],
        }),
      (e: { status?: number }) => e.status === 400,
    )
  })

  it('batch precio + includes en mismo payload', () => {
    const p = parsePutCatalogPayload({
      planPrices: [
        { planCode: 'comunidad', usageMode: 'neighbors_and_staff', monthlyPriceEur: '45.00' },
      ],
      modulePrices: [{ moduleCode: 'bookings', listPriceEur: '16.00' }],
      planIncludes: [{ planCode: 'comunidad', includes: ['incidents', 'bookings', 'services'] }],
    })
    assert.equal(p.planPrices.length, 1)
    assert.equal(p.modulePrices.length, 1)
    assert.equal(p.planIncludes.length, 1)
  })

  it('fingerprint estable (orden independiente)', () => {
    assert.equal(
      includesFingerprint(['bookings', 'incidents']),
      includesFingerprint(['incidents', 'bookings']),
    )
    assert.deepEqual(normalizeIncludesCodes(['services', 'incidents', 'incidents']), [
      'incidents',
      'services',
    ])
  })
})

describe('B7.3 auth company_admin', () => {
  it('company_admin no es super_admin (403 conceptual)', () => {
    assert.equal(isSuperAdminRole('company_admin'), false)
    assert.equal(isSuperAdminRole('super_admin'), true)
  })
})

describe('B7.3 seed no sobrescribe includes', () => {
  it('seedPlanUpdateData no incluye includesJson', () => {
    const up = seedPlanUpdateData({ name: 'Vecindario Comunidad', sortOrder: 10 })
    assert.equal('includesJson' in up, false)
    assert.equal('monthlyPriceEur' in up, false)
  })
})

describe('B7.3 snapshots contratos vs includes catálogo', () => {
  it('contrato existente conserva líneas tras ampliar includes del catálogo', () => {
    const existing = existingComunidadSnap()
    const catalogNow = planComunidad(['incidents', 'bookings', 'services'])
    const r = resolveBillingWrite({
      payload: basePayload({
        planCode: 'comunidad',
        expectedUpdatedAt: existing.updatedAt.toISOString(),
        lines: existing.lines.map((l) => ({
          moduleCode: l.moduleCode,
          pricingMode: 'included' as const,
          includedInPlan: true,
          sortOrder: l.sortOrder,
        })),
      }),
      plan: catalogNow,
      modulesByCode: modulesMap(),
      existing,
      planPrices: PLAN_PRICES,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.lines.length, 2)
    assert.ok(!r.value.lines.some((l) => l.moduleCode === 'services'))
    const q = computeBillingQuote({
      planChargedPriceEur: r.value.planChargedPriceEur,
      sizeSurchargeEur: r.value.sizeSurchargeEur,
      discountEur: r.value.discountEur,
      negotiatedTotalEur: r.value.negotiatedTotalEur,
      vatRatePct: r.value.vatRatePct,
      lines: r.value.lines.map((l) => ({
        moduleCode: l.moduleCode,
        moduleName: l.moduleName,
        includedInPlan: l.includedInPlan,
        pricingMode: l.pricingMode,
        listPriceEur: l.listPriceEur,
        chargedPriceEur: l.chargedPriceEur,
      })),
    })
    assert.equal(q.netEur, '44.00')
  })

  it('contrato nuevo usa includes nuevos del catálogo', () => {
    const catalogNow = planComunidad(['incidents', 'bookings', 'services'])
    const lines = defaultIncludedLinesForPlan(catalogNow, modulesMap())
    assert.equal(lines.length, 3)
    const r = resolveBillingWrite({
      payload: basePayload({ planCode: 'comunidad', lines }),
      plan: catalogNow,
      modulesByCode: modulesMap(),
      existing: null,
      planPrices: PLAN_PRICES,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.deepEqual(
      r.value.lines.map((l) => l.moduleCode).sort(),
      ['bookings', 'incidents', 'services'],
    )
  })

  it('re-save mismo plan no exige includes nuevos del catálogo', () => {
    const existing = existingComunidadSnap()
    const catalogNow = planComunidad(['incidents', 'bookings', 'services'])
    const r = resolveBillingWrite({
      payload: basePayload({
        planCode: 'comunidad',
        expectedUpdatedAt: existing.updatedAt.toISOString(),
        lines: existing.lines.map((l) => ({
          moduleCode: l.moduleCode,
          pricingMode: 'included' as const,
          includedInPlan: true,
          sortOrder: l.sortOrder,
        })),
      }),
      plan: catalogNow,
      modulesByCode: modulesMap(),
      existing,
      planPrices: PLAN_PRICES,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.lines.length, 2)
  })

  it('cambio explícito de plan usa catálogo vigente', () => {
    const existing = existingComunidadSnap()
    const completo = planCompleto([
      'incidents',
      'bookings',
      'services',
      'pool',
      'parcels',
      'key_loans',
      'diario',
      'control_entrada',
    ])
    const lines = defaultIncludedLinesForPlan(completo, modulesMap())
    const r = resolveBillingWrite({
      payload: basePayload({
        planCode: 'completo',
        expectedUpdatedAt: existing.updatedAt.toISOString(),
        lines,
      }),
      plan: completo,
      modulesByCode: modulesMap(),
      existing,
      planPrices: PLAN_PRICES,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.planCode, 'completo')
    assert.equal(r.value.lines.length, 8)
    assert.equal(r.value.planChargedPriceEur, '69.00')
  })

  it('conserjería / completo: defaultIncluded refleja includes del plan', () => {
    const cons = planConserjeria(['parcels', 'key_loans', 'diario', 'control_entrada'])
    assert.equal(defaultIncludedLinesForPlan(cons, modulesMap()).length, 4)
    const full = planCompleto([
      'incidents',
      'bookings',
      'services',
      'pool',
      'parcels',
      'key_loans',
      'diario',
      'control_entrada',
    ])
    assert.equal(defaultIncludedLinesForPlan(full, modulesMap()).length, 8)
  })
})

describe('B7.3 computeBillingQuote intacto', () => {
  it('sigue calculando solo desde snapshots', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: '44.00',
      lines: [
        {
          moduleCode: 'incidents',
          moduleName: 'Incidencias',
          includedInPlan: true,
          pricingMode: 'included',
          listPriceEur: '10.00',
          chargedPriceEur: '0.00',
        },
      ],
    })
    assert.equal(q.netEur, '44.00')
  })
})
