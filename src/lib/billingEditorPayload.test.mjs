import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyPlanToModuleStates,
  forcedIncludeCodes,
  formToPutPayload,
  isPlanAllowedForUsageMode,
  plansAllowedForUsageMode,
  createDefaultForm,
  formFromBillingDetail,
} from './billingEditorPayload.js'

const catalog = {
  plans: [
    {
      code: 'comunidad',
      name: 'Vecindario Comunidad',
      monthlyPrice: '49.00',
      includes: ['incidents', 'bookings'],
      active: true,
    },
    {
      code: 'conserjeria',
      name: 'Vecindario Conserjería',
      monthlyPrice: '55.00',
      includes: ['parcels', 'key_loans', 'diario', 'control_entrada'],
      active: true,
    },
    {
      code: 'completo',
      name: 'Vecindario Completo',
      monthlyPrice: '69.00',
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
    { code: 'a_medida', name: 'A medida', monthlyPrice: '29.00', includes: [], active: true },
  ],
  modules: [
    { code: 'incidents', name: 'Incidencias', listPrice: '12.00', sortOrder: 10 },
    { code: 'bookings', name: 'Reservas', listPrice: '18.00', sortOrder: 20 },
    { code: 'services', name: 'Servicios', listPrice: '8.00', sortOrder: 30 },
    { code: 'pool', name: 'Piscina', listPrice: '15.00', sortOrder: 40 },
    { code: 'parcels', name: 'Paquetería', listPrice: '12.00', sortOrder: 50 },
    { code: 'key_loans', name: 'Llaves', listPrice: '4.00', sortOrder: 60 },
    { code: 'diario', name: 'Diario', listPrice: '5.00', sortOrder: 70 },
    { code: 'control_entrada', name: 'Control', listPrice: '7.00', sortOrder: 80 },
  ],
}

describe('billingEditorPayload', () => {
  it('planes por usageMode', () => {
    assert.deepEqual(plansAllowedForUsageMode('staff_only'), ['conserjeria', 'a_medida'])
    assert.equal(isPlanAllowedForUsageMode('completo', 'staff_only'), false)
    assert.equal(isPlanAllowedForUsageMode('completo', 'neighbors_and_staff'), true)
  })

  it('create → payload create con expectedUpdatedAt null', () => {
    const form = createDefaultForm(catalog)
    form.modules.incidents = { mode: 'catalog', customPrice: '' }
    const r = formToPutPayload(form, { expectedUpdatedAt: null, catalogModules: catalog.modules })
    assert.equal(r.ok, true)
    assert.equal(r.value.expectedUpdatedAt, null)
    assert.equal(r.value.usageMode, 'neighbors_and_staff')
    assert.ok(r.value.lines.some((l) => l.moduleCode === 'incidents' && l.pricingMode === 'catalog'))
  })

  it('custom exige precio; not_contracted no va en lines', () => {
    const form = createDefaultForm(catalog)
    form.planCode = 'a_medida'
    form.modules = applyPlanToModuleStates({}, catalog.plans[3], catalog.modules)
    form.modules.bookings = { mode: 'custom', customPrice: '9.5' }
    form.modules.pool = { mode: 'not_contracted', customPrice: '' }
    const r = formToPutPayload(form, { catalogModules: catalog.modules })
    assert.equal(r.ok, true)
    assert.equal(r.value.lines.length, 1)
    assert.equal(r.value.lines[0].chargedPriceEur, '9.50')
  })

  it('negotiated override en payload', () => {
    const form = createDefaultForm(catalog)
    form.useNegotiated = true
    form.negotiatedTotalEur = '40'
    const r = formToPutPayload(form, { catalogModules: catalog.modules })
    assert.equal(r.ok, true)
    assert.equal(r.value.negotiatedTotalEur, '40.00')
  })

  it('edit: expectedUpdatedAt se propaga', () => {
    const form = createDefaultForm(catalog)
    const r = formToPutPayload(form, {
      expectedUpdatedAt: '2026-08-11T12:00:00.000Z',
      catalogModules: catalog.modules,
    })
    assert.equal(r.ok, true)
    assert.equal(r.value.expectedUpdatedAt, '2026-08-11T12:00:00.000Z')
  })

  it('formFromBillingDetail mapea lines y negotiated', () => {
    const form = formFromBillingDetail(
      {
        billing: {
          usageMode: 'staff_only',
          plan: { code: 'conserjeria' },
          commercialStatus: 'promo',
          dwellingCount: 120,
          dwellingSource: 'manual',
          sizeSurchargeEur: '15.00',
          discountEur: '5.00',
          discountNote: 'lanzamiento',
          negotiatedTotalEur: '40.00',
          vatRatePct: '21.00',
          notes: 'nota',
          lines: [
            {
              moduleCode: 'parcels',
              pricingMode: 'included',
              includedInPlan: true,
              chargedPriceEur: '0.00',
            },
            {
              moduleCode: 'bookings',
              pricingMode: 'custom',
              includedInPlan: false,
              chargedPriceEur: '10.00',
            },
          ],
        },
      },
      catalog,
    )
    assert.equal(form.usageMode, 'staff_only')
    assert.equal(form.useNegotiated, true)
    assert.equal(form.modules.parcels.mode, 'included')
    assert.equal(form.modules.bookings.mode, 'custom')
    assert.equal(form.modules.bookings.customPrice, '10.00')
  })

  it('staff_only + completo → error de payload', () => {
    const form = createDefaultForm(catalog)
    form.usageMode = 'staff_only'
    form.planCode = 'completo'
    const r = formToPutPayload(form, { catalogModules: catalog.modules })
    assert.equal(r.ok, false)
  })

  it('forcedIncludeCodes: mismo plan usa snapshot; cambio de plan usa catálogo', () => {
    const billing = {
      plan: { code: 'comunidad' },
      lines: [
        { moduleCode: 'incidents', includedInPlan: true, pricingMode: 'included' },
        { moduleCode: 'bookings', includedInPlan: true, pricingMode: 'included' },
      ],
    }
    const planCatalog = {
      code: 'comunidad',
      includes: ['incidents', 'bookings', 'services'],
    }
    assert.deepEqual(
      forcedIncludeCodes({ plan: planCatalog, billing, formPlanCode: 'comunidad' }).sort(),
      ['bookings', 'incidents'],
    )
    assert.deepEqual(
      forcedIncludeCodes({
        plan: catalog.plans.find((p) => p.code === 'completo'),
        billing,
        formPlanCode: 'completo',
      }).sort(),
      [
        'bookings',
        'control_entrada',
        'diario',
        'incidents',
        'key_loans',
        'parcels',
        'pool',
        'services',
      ],
    )
  })
})
