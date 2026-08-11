import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSuperAdminRole } from '../../middleware/require-super-admin.js'
import {
  canonicalBillingFingerprint,
  defaultIncludedLinesForPlan,
  initialPlanPriceLookup,
  parsePutBillingPayload,
  resolveBillingWrite,
  resolveLineCharged,
  type CatalogModule,
  type CatalogPlan,
  type PutBillingPayload,
} from './index.js'

const PLAN_PRICES = initialPlanPriceLookup()

const PLAN_COMPLETO: CatalogPlan = {
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
}

const PLAN_COMUNIDAD: CatalogPlan = {
  code: 'comunidad',
  name: 'Vecindario Comunidad',
  monthlyPriceEur: '44.00',
  includes: ['incidents', 'bookings'],
  active: true,
}

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
  { code: 'services', name: 'Servicios', listPriceEur: '7.00', active: true, sortOrder: 30 },
  { code: 'pool', name: 'Acceso piscina', listPriceEur: '12.00', active: true, sortOrder: 40 },
  { code: 'parcels', name: 'Paquetería', listPriceEur: '11.00', active: true, sortOrder: 50 },
  { code: 'key_loans', name: 'Registro de llaves', listPriceEur: '4.00', active: true, sortOrder: 60 },
  { code: 'diario', name: 'Cuaderno diario', listPriceEur: '5.00', active: true, sortOrder: 70 },
  { code: 'control_entrada', name: 'Control de entrada', listPriceEur: '6.00', active: true, sortOrder: 80 },
]

function modulesMap() {
  return new Map(MODULES.map((m) => [m.code, m]))
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

describe('B4 auth', () => {
  it('company_admin no es super_admin (403 en ruta)', () => {
    assert.equal(isSuperAdminRole('company_admin'), false)
    assert.equal(isSuperAdminRole('super_admin'), true)
  })
})

describe('B4 parsePutBillingPayload', () => {
  it('plan inválido / vacío → 400', () => {
    const r = parsePutBillingPayload({
      planCode: '',
      commercialStatus: 'billable',
      lines: [],
    })
    assert.equal(r.ok, false)
  })

  it('módulo inválido → 400', () => {
    const r = parsePutBillingPayload({
      planCode: 'a_medida',
      commercialStatus: 'billable',
      lines: [{ moduleCode: 'nope', pricingMode: 'catalog', chargedPriceEur: 1 }],
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /Módulo no válido/)
  })

  it('módulo duplicado → 400', () => {
    const r = parsePutBillingPayload({
      planCode: 'a_medida',
      commercialStatus: 'billable',
      lines: [
        { moduleCode: 'incidents', pricingMode: 'catalog', chargedPriceEur: 12 },
        { moduleCode: 'incidents', pricingMode: 'catalog', chargedPriceEur: 12 },
      ],
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /duplicado/)
  })

  it('custom sin precio → 400', () => {
    const r = parsePutBillingPayload({
      planCode: 'a_medida',
      commercialStatus: 'billable',
      lines: [{ moduleCode: 'services', pricingMode: 'custom' }],
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /custom requiere chargedPriceEur/)
  })

  it('importes negativos → 400', () => {
    const r = parsePutBillingPayload({
      planCode: 'a_medida',
      commercialStatus: 'billable',
      discountEur: -1,
      lines: [],
    })
    assert.equal(r.ok, false)
  })

  it('entrega especial como línea → 400', () => {
    const r = parsePutBillingPayload({
      planCode: 'a_medida',
      commercialStatus: 'billable',
      lines: [{ moduleCode: 'special_delivery', pricingMode: 'catalog', chargedPriceEur: 3 }],
    })
    assert.equal(r.ok, false)
  })

  it('commercialStatus inválido → 400', () => {
    const r = parsePutBillingPayload({
      planCode: 'completo',
      commercialStatus: 'unconfigured',
      lines: [],
    })
    assert.equal(r.ok, false)
  })

  it('payload válido a_medida', () => {
    const r = parsePutBillingPayload({
      planCode: 'a_medida',
      commercialStatus: 'billable',
      dwellingCount: 120,
      sizeSurchargeEur: '15.00',
      discountEur: '10',
      vatRatePct: 21,
      lines: [
        { moduleCode: 'incidents', pricingMode: 'catalog', chargedPriceEur: '12.00', listPriceEur: '12.00' },
        { moduleCode: 'bookings', pricingMode: 'catalog', chargedPriceEur: '18.00' },
      ],
    })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.value.discountEur, '10.00')
      assert.equal(r.value.lines.length, 2)
    }
  })
})

describe('B4 resolveBillingWrite / snapshots', () => {
  it('Completo snapshot plan = 69; included charged 0', () => {
    const lines = defaultIncludedLinesForPlan(PLAN_COMPLETO, modulesMap())
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'completo',
        lines: lines.map((l) => ({
          moduleCode: l.moduleCode,
          pricingMode: l.pricingMode,
          includedInPlan: true,
          listPriceEur: l.listPriceEur,
          chargedPriceEur: '99.00', // debe forzar a 0 por included
        })),
      }),
    )
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: PLAN_COMPLETO,
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.value.planChargedPriceEur, '69.00')
    assert.equal(r.value.planListPriceEur, '69.00')
    assert.equal(r.value.lines.length, 8)
    assert.ok(r.value.lines.every((l) => l.chargedPriceEur === '0.00'))
  })

  it('a_medida + catalog modules', () => {
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'a_medida',
        lines: [
          { moduleCode: 'incidents', pricingMode: 'catalog', chargedPriceEur: '12.00', listPriceEur: '12.00' },
          { moduleCode: 'bookings', pricingMode: 'catalog', chargedPriceEur: '18.00', listPriceEur: '18.00' },
        ],
      }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: PLAN_A_MEDIDA,
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.planChargedPriceEur, '24.00')
    assert.equal(r.value.lines.find((l) => l.moduleCode === 'bookings')?.chargedPriceEur, '18.00')
  })

  it('plan comunidad exige includes', () => {
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'comunidad',
        lines: [{ moduleCode: 'incidents', pricingMode: 'included', includedInPlan: true }],
      }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: PLAN_COMUNIDAD,
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /Falta módulo incluido/)
  })

  it('edición mantiene snapshot bookings 18 aunque catálogo fixture 22', () => {
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'a_medida',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
        lines: [
          {
            moduleCode: 'bookings',
            pricingMode: 'catalog',
            // sin list/charged → toma existing
          },
        ],
      }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const catalogFuture = new Map(modulesMap())
    catalogFuture.set('bookings', {
      code: 'bookings',
      name: 'Reservas',
      listPriceEur: '22.00',
      active: true,
      sortOrder: 20,
    })
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: PLAN_A_MEDIDA,
      modulesByCode: catalogFuture,
      planPrices: PLAN_PRICES,
      existing: {
        id: 1,
        planCode: 'a_medida',
        planName: 'A medida',
        planListPriceEur: '29.00',
        planChargedPriceEur: '29.00',
        usageMode: 'neighbors_and_staff',
        commercialStatus: 'legacy',
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
            listPriceEur: '18.00',
            chargedPriceEur: '18.00',
            sortOrder: 20,
          },
        ],
      },
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.lines[0]?.listPriceEur, '18.00')
    assert.equal(r.value.lines[0]?.chargedPriceEur, '18.00')
  })

  it('staff_only + conserjeria → snapshot 39', () => {
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'conserjeria',
        usageMode: 'staff_only',
        lines: [
          { moduleCode: 'parcels', pricingMode: 'included', includedInPlan: true, listPriceEur: '11.00' },
          { moduleCode: 'key_loans', pricingMode: 'included', includedInPlan: true, listPriceEur: '4.00' },
          { moduleCode: 'diario', pricingMode: 'included', includedInPlan: true, listPriceEur: '5.00' },
          { moduleCode: 'control_entrada', pricingMode: 'included', includedInPlan: true, listPriceEur: '6.00' },
        ],
      }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: {
        code: 'conserjeria',
        name: 'Vecindario Conserjería',
        monthlyPriceEur: '46.00',
        includes: ['parcels', 'key_loans', 'diario', 'control_entrada'],
        active: true,
      },
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.planChargedPriceEur, '39.00')
    assert.equal(r.value.usageMode, 'staff_only')
  })

  it('staff_only + completo → 400', () => {
    const r = parsePutBillingPayload(
      basePayload({
        planCode: 'completo',
        usageMode: 'staff_only',
        lines: defaultIncludedLinesForPlan(PLAN_COMPLETO, modulesMap()),
      }),
    )
    assert.equal(r.ok, false)
  })

  it('staff_only + a_medida base 16', () => {
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'a_medida',
        usageMode: 'staff_only',
        lines: [],
      }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: PLAN_A_MEDIDA,
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.planChargedPriceEur, '16.00')
  })

  it('custom / free / discount / size / negotiated / vat resueltos', () => {
    const parsed = parsePutBillingPayload(
      basePayload({
        planCode: 'a_medida',
        discountEur: '5.00',
        sizeSurchargeEur: '15.00',
        negotiatedTotalEur: '40.00',
        vatRatePct: '21.00',
        lines: [
          { moduleCode: 'services', pricingMode: 'custom', chargedPriceEur: '6.50', listPriceEur: '8.00' },
          { moduleCode: 'pool', pricingMode: 'free', listPriceEur: '15.00', chargedPriceEur: '15.00' },
        ],
      }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: PLAN_A_MEDIDA,
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.lines.find((l) => l.moduleCode === 'services')?.chargedPriceEur, '6.50')
    assert.equal(r.value.lines.find((l) => l.moduleCode === 'pool')?.chargedPriceEur, '0.00')
    assert.equal(r.value.discountEur, '5.00')
    assert.equal(r.value.sizeSurchargeEur, '15.00')
    assert.equal(r.value.negotiatedTotalEur, '40.00')
    assert.equal(r.value.vatRatePct, '21.00')
  })

  it('plan inactivo → 400', () => {
    const parsed = parsePutBillingPayload(
      basePayload({ planCode: 'completo', lines: defaultIncludedLinesForPlan(PLAN_COMPLETO, modulesMap()) }),
    )
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const r = resolveBillingWrite({
      payload: parsed.value,
      plan: { ...PLAN_COMPLETO, active: false },
      modulesByCode: modulesMap(),
      planPrices: PLAN_PRICES,
      existing: null,
    })
    assert.equal(r.ok, false)
  })
})

describe('B4 resolveLineCharged + idempotencia fingerprint', () => {
  it('included/free → 0', () => {
    assert.equal(resolveLineCharged('included', '12.00', '12.00', undefined), '0.00')
    assert.equal(resolveLineCharged('free', '12.00', '12.00', undefined), '0.00')
  })

  it('fingerprint estable detecta igualdad', () => {
    const a = canonicalBillingFingerprint({
      planCode: 'completo',
      planName: 'Vecindario Completo',
      planListPriceEur: '69',
      planChargedPriceEur: '69.00',
      usageMode: 'neighbors_and_staff',
      commercialStatus: 'billable',
      dwellingCount: 80,
      dwellingSource: 'manual',
      sizeSurchargeEur: '0',
      discountEur: '0.00',
      discountNote: null,
      negotiatedTotalEur: null,
      vatRatePct: '21',
      notes: null,
      lines: [
        {
          moduleCode: 'incidents',
          moduleName: 'Incidencias',
          includedInPlan: true,
          pricingMode: 'included',
          listPriceEur: '12.00',
          chargedPriceEur: '0.00',
          sortOrder: 10,
        },
      ],
    })
    const b = canonicalBillingFingerprint({
      planCode: 'completo',
      planName: 'Vecindario Completo',
      planListPriceEur: '69.00',
      planChargedPriceEur: '69.00',
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
      lines: [
        {
          moduleCode: 'incidents',
          moduleName: 'Incidencias',
          includedInPlan: true,
          pricingMode: 'included',
          listPriceEur: '12.00',
          chargedPriceEur: '0.00',
          sortOrder: 10,
        },
      ],
    })
    assert.equal(a, b)
  })
})

describe('B4 concurrency contract', () => {
  it('edición sin expectedUpdatedAt debe rechazarse en write service (documentado)', () => {
    const create = parsePutBillingPayload(
      basePayload({
        planCode: 'a_medida',
        expectedUpdatedAt: null,
        lines: [],
      }),
    )
    assert.ok(create.ok)
    if (create.ok) assert.equal(create.value.expectedUpdatedAt, null)
  })
})
