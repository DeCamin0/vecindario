import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  catalogPlanPriceForUsageMode,
  initialPlanPriceLookup,
  plansAllowedForUsageMode,
  suggestPackRecommendation,
} from './usage-mode.js'
import { buildBillingCatalogResponse } from './catalog-response.js'

const PLAN_PRICES = initialPlanPriceLookup()

describe('B7.1 usageMode precios', () => {
  it('precios por modo (desde lookup DB)', () => {
    assert.equal(
      catalogPlanPriceForUsageMode('conserjeria', 'neighbors_and_staff', '46.00', PLAN_PRICES),
      '46.00',
    )
    assert.equal(
      catalogPlanPriceForUsageMode('conserjeria', 'staff_only', '46.00', PLAN_PRICES),
      '39.00',
    )
    assert.equal(catalogPlanPriceForUsageMode('a_medida', 'staff_only', '24.00', PLAN_PRICES), '16.00')
    assert.equal(
      catalogPlanPriceForUsageMode('a_medida', 'neighbors_and_staff', '24.00', PLAN_PRICES),
      '24.00',
    )
    assert.equal(
      catalogPlanPriceForUsageMode('comunidad', 'neighbors_and_staff', '44.00', PLAN_PRICES),
      '44.00',
    )
    assert.equal(
      catalogPlanPriceForUsageMode('completo', 'neighbors_and_staff', '69.00', PLAN_PRICES),
      '69.00',
    )
  })

  it('planes permitidos', () => {
    assert.deepEqual(plansAllowedForUsageMode('staff_only'), ['conserjeria', 'a_medida'])
    assert.ok(plansAllowedForUsageMode('neighbors_and_staff').includes('completo'))
  })

  it('recomendación pack Completo cuando A medida cubre includes y net >= pack', () => {
    const r = suggestPackRecommendation({
      planCode: 'a_medida',
      usageMode: 'neighbors_and_staff',
      contractedModuleCodes: [
        'incidents',
        'bookings',
        'services',
        'pool',
        'parcels',
        'key_loans',
        'diario',
        'control_entrada',
      ],
      netEur: '93.00',
      packs: [
        {
          code: 'comunidad',
          name: 'Vecindario Comunidad',
          includes: ['incidents', 'bookings'],
          monthlyPriceEur: '44.00',
        },
        {
          code: 'conserjeria',
          name: 'Vecindario Conserjería',
          includes: ['parcels', 'key_loans', 'diario', 'control_entrada'],
          monthlyPriceEur: '46.00',
        },
        {
          code: 'completo',
          name: 'Vecindario Completo',
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
          monthlyPriceEur: '69.00',
        },
      ],
    })
    assert.ok(r)
    assert.equal(r?.planCode, 'completo')
    assert.match(r?.message || '', /Completo/)
  })

  it('recomendación Comunidad con 2 módulos vecinos', () => {
    const r = suggestPackRecommendation({
      planCode: 'a_medida',
      usageMode: 'neighbors_and_staff',
      contractedModuleCodes: ['incidents', 'bookings'],
      netEur: '48.00',
      packs: [
        {
          code: 'comunidad',
          name: 'Vecindario Comunidad',
          includes: ['incidents', 'bookings'],
          monthlyPriceEur: '44.00',
        },
        {
          code: 'completo',
          name: 'Vecindario Completo',
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
          monthlyPriceEur: '69.00',
        },
      ],
    })
    assert.equal(r?.planCode, 'comunidad')
  })

  it('sin recomendación si no es a_medida', () => {
    const r = suggestPackRecommendation({
      planCode: 'completo',
      usageMode: 'neighbors_and_staff',
      contractedModuleCodes: ['incidents', 'bookings'],
      netEur: '80.00',
      packs: [],
    })
    assert.equal(r, null)
  })
})

describe('B7.1 catalog response', () => {
  it('usageModes solo lista planes disponibles por modo', () => {
    const res = buildBillingCatalogResponse({
      plans: [
        {
          code: 'comunidad',
          name: 'Vecindario Comunidad',
          monthlyPriceEur: '44.00',
          includesJson: ['incidents', 'bookings'],
          active: true,
          sortOrder: 10,
        },
        {
          code: 'conserjeria',
          name: 'Vecindario Conserjería',
          monthlyPriceEur: '46.00',
          includesJson: ['parcels'],
          active: true,
          sortOrder: 20,
        },
        {
          code: 'completo',
          name: 'Vecindario Completo',
          monthlyPriceEur: '69.00',
          includesJson: [],
          active: true,
          sortOrder: 30,
        },
        {
          code: 'a_medida',
          name: 'A medida',
          monthlyPriceEur: '24.00',
          includesJson: [],
          active: true,
          sortOrder: 40,
        },
      ],
      modules: [
        {
          code: 'incidents',
          name: 'Incidencias',
          listPriceEur: '10.00',
          flagKey: 'appNavIncidentsEnabled',
          parentCode: null,
          active: true,
          sortOrder: 10,
        },
      ],
      planPrices: [
        { planCode: 'a_medida', usageMode: 'neighbors_and_staff', monthlyPriceEur: '24.00' },
        { planCode: 'a_medida', usageMode: 'staff_only', monthlyPriceEur: '16.00' },
        { planCode: 'comunidad', usageMode: 'neighbors_and_staff', monthlyPriceEur: '44.00' },
        { planCode: 'conserjeria', usageMode: 'neighbors_and_staff', monthlyPriceEur: '46.00' },
        { planCode: 'conserjeria', usageMode: 'staff_only', monthlyPriceEur: '39.00' },
        { planCode: 'completo', usageMode: 'neighbors_and_staff', monthlyPriceEur: '69.00' },
      ],
    })
    assert.equal(res.usageModes.staff_only.plans.length, 2)
    assert.deepEqual(
      res.usageModes.staff_only.plans.map((p) => p.code).sort(),
      ['a_medida', 'conserjeria'],
    )
    assert.equal(
      res.usageModes.staff_only.plans.find((p) => p.code === 'a_medida')?.monthlyPrice,
      '16.00',
    )
    assert.equal(
      res.usageModes.staff_only.plans.find((p) => p.code === 'conserjeria')?.monthlyPrice,
      '39.00',
    )
    assert.equal(
      res.usageModes.neighbors_and_staff.plans.find((p) => p.code === 'a_medida')?.kind,
      'platform',
    )
    assert.equal(res.plans.find((p) => p.code === 'completo')?.pricesByUsageMode.staff_only, null)
  })
})
