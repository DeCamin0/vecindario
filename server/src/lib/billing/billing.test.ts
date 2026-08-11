import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeBillingQuote,
  diffBillingModulesAgainstFlags,
  formatMoney,
  suggestSizeSurchargeEur,
  type BillingLineInput,
} from './index.js'

function line(
  partial: Partial<BillingLineInput> & Pick<BillingLineInput, 'moduleCode' | 'pricingMode'>,
): BillingLineInput {
  return {
    moduleName: partial.moduleName ?? partial.moduleCode,
    includedInPlan: partial.includedInPlan ?? false,
    listPriceEur: partial.listPriceEur ?? partial.chargedPriceEur ?? 0,
    chargedPriceEur: partial.chargedPriceEur ?? 0,
    ...partial,
  }
}

describe('computeBillingQuote — planes', () => {
  it('A medida: 29 + incidents 12 + bookings 18 = 59', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 29,
      lines: [
        line({ moduleCode: 'incidents', pricingMode: 'catalog', chargedPriceEur: 12, listPriceEur: 12 }),
        line({ moduleCode: 'bookings', pricingMode: 'catalog', chargedPriceEur: 18, listPriceEur: 18 }),
      ],
    })
    assert.equal(q.pricingSource, 'calculated')
    assert.equal(q.planPartEur, '29.00')
    assert.equal(q.modulesPartEur, '30.00')
    assert.equal(q.netEur, '59.00')
    assert.equal(q.vatEur, '12.39') // 59 * 0.21 = 12.39
    assert.equal(q.grossEur, '71.39')
  })

  it('Plan Comunidad: 49 + incidents/bookings included = 49', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 49,
      lines: [
        line({
          moduleCode: 'incidents',
          pricingMode: 'included',
          includedInPlan: true,
          listPriceEur: 12,
          chargedPriceEur: 0,
        }),
        line({
          moduleCode: 'bookings',
          pricingMode: 'included',
          includedInPlan: true,
          listPriceEur: 18,
          chargedPriceEur: 0,
        }),
      ],
    })
    assert.equal(q.netEur, '49.00')
    assert.equal(q.modulesPartEur, '0.00')
  })

  it('Plan Completo: 69 todos included = 69', () => {
    const codes = [
      'incidents',
      'bookings',
      'services',
      'pool',
      'parcels',
      'key_loans',
      'diario',
      'control_entrada',
    ]
    const q = computeBillingQuote({
      planChargedPriceEur: 69,
      lines: codes.map((moduleCode) =>
        line({
          moduleCode,
          pricingMode: 'included',
          includedInPlan: true,
          listPriceEur: 99,
          chargedPriceEur: 99, // debe ignorarse por included
        }),
      ),
    })
    assert.equal(q.netEur, '69.00')
    assert.equal(q.modulesPartEur, '0.00')
  })
})

describe('computeBillingQuote — modos y ajustes', () => {
  it('custom 6.50 suma ese importe', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 29,
      lines: [
        line({
          moduleCode: 'services',
          pricingMode: 'custom',
          chargedPriceEur: '6.50',
          listPriceEur: 8,
        }),
      ],
    })
    assert.equal(q.modulesPartEur, '6.50')
    assert.equal(q.netEur, '35.50')
  })

  it('free charged 0', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 29,
      lines: [
        line({
          moduleCode: 'pool',
          pricingMode: 'free',
          chargedPriceEur: 15,
          listPriceEur: 15,
        }),
      ],
    })
    assert.equal(q.modulesPartEur, '0.00')
    assert.equal(q.netEur, '29.00')
  })

  it('discount 69 - 10 = 59', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 69,
      lines: [],
      discountEur: 10,
    })
    assert.equal(q.netEur, '59.00')
    assert.equal(q.discountEur, '10.00')
  })

  it('size +15 y +30', () => {
    assert.equal(
      computeBillingQuote({ planChargedPriceEur: 49, lines: [], sizeSurchargeEur: 15 }).netEur,
      '64.00',
    )
    assert.equal(
      computeBillingQuote({ planChargedPriceEur: 49, lines: [], sizeSurchargeEur: 30 }).netEur,
      '79.00',
    )
  })

  it('negotiated override gana sobre cálculo', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 69,
      lines: [],
      sizeSurchargeEur: 15,
      discountEur: 5,
      negotiatedTotalEur: 50,
    })
    assert.equal(q.pricingSource, 'negotiated_override')
    assert.equal(q.calculatedSubtotalEur, '79.00') // 69+15-5
    assert.equal(q.netEur, '50.00')
    assert.equal(q.vatEur, '10.50')
    assert.equal(q.grossEur, '60.50')
  })

  it('IVA 21%', () => {
    const q = computeBillingQuote({ planChargedPriceEur: 100, lines: [], vatRatePct: 21 })
    assert.equal(q.vatRatePct, '21.00')
    assert.equal(q.vatEur, '21.00')
    assert.equal(q.grossEur, '121.00')
  })

  it('legacy snapshot 18 sigue 18 aunque “catálogo” fixture sea 22', () => {
    const catalogFuture = 22
    const q = computeBillingQuote({
      planChargedPriceEur: 29,
      lines: [
        line({
          moduleCode: 'bookings',
          pricingMode: 'catalog',
          listPriceEur: 18, // snapshot histórico
          chargedPriceEur: 18,
        }),
      ],
    })
    assert.equal(q.modulesPartEur, '18.00')
    assert.notEqual(q.modulesPartEur, formatMoney(catalogFuture))
    assert.equal(q.netEur, '47.00')
  })

  it('neto nunca negativo (descuento excesivo)', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 29,
      lines: [],
      discountEur: 100,
    })
    assert.equal(q.netEur, '0.00')
    assert.equal(q.vatEur, '0.00')
    assert.equal(q.grossEur, '0.00')
  })

  it('descuento negativo se trata como 0', () => {
    const q = computeBillingQuote({
      planChargedPriceEur: 29,
      lines: [],
      discountEur: -5,
    })
    assert.equal(q.discountEur, '0.00')
    assert.equal(q.netEur, '29.00')
  })
})

describe('suggestSizeSurchargeEur', () => {
  it('tramos 0 / 15 / 30 / 45 (defaults)', () => {
    assert.equal(suggestSizeSurchargeEur(80).suggestedSurchargeEur, '0.00')
    assert.equal(suggestSizeSurchargeEur(100).requiresManualSurcharge, false)
    assert.equal(suggestSizeSurchargeEur(101).suggestedSurchargeEur, '15.00')
    assert.equal(suggestSizeSurchargeEur(200).suggestedSurchargeEur, '15.00')
    assert.equal(suggestSizeSurchargeEur(201).suggestedSurchargeEur, '30.00')
    assert.equal(suggestSizeSurchargeEur(300).suggestedSurchargeEur, '30.00')
    assert.equal(suggestSizeSurchargeEur(301).suggestedSurchargeEur, '45.00')
    assert.equal(suggestSizeSurchargeEur(301).requiresManualSurcharge, false)
    assert.equal(suggestSizeSurchargeEur(301).tierLabel, '301+')
  })

  it('301+ es tramo normal con sugerencia (no manual obligatorio)', () => {
    const s = suggestSizeSurchargeEur(500)
    assert.equal(s.tier, 'xl')
    assert.equal(s.requiresManualSurcharge, false)
    assert.equal(s.suggestedSurchargeEur, '45.00')
  })

  it('unknown también requiere manual', () => {
    const s = suggestSizeSurchargeEur(null)
    assert.equal(s.tier, 'unknown')
    assert.equal(s.requiresManualSurcharge, true)
  })

  it('respeta tramos custom del catálogo', () => {
    const custom = [
      { fromUnits: 0, toUnits: 50, surchargeEur: '0.00' },
      { fromUnits: 51, toUnits: null, surchargeEur: '99.00' },
    ]
    assert.equal(suggestSizeSurchargeEur(50, custom).suggestedSurchargeEur, '0.00')
    assert.equal(suggestSizeSurchargeEur(51, custom).suggestedSurchargeEur, '99.00')
  })

  it('suplemento manual existente no lo bloquea la lib (solo sugerencia)', () => {
    // La lib de quote acepta cualquier sizeSurchargeEur ya fijado (p.ej. 301+ con 40€).
    const q = computeBillingQuote({
      planChargedPriceEur: 69,
      lines: [],
      sizeSurchargeEur: 40,
    })
    assert.equal(q.sizeSurchargeEur, '40.00')
    assert.equal(q.netEur, '109.00')
  })
})

describe('diffBillingModulesAgainstFlags', () => {
  it('activo + contratado → ok', () => {
    const d = diffBillingModulesAgainstFlags(
      { appNavIncidentsEnabled: true },
      ['incidents'],
    )
    const row = d.modules.find((m) => m.moduleCode === 'incidents')!
    assert.equal(row.status, 'ok')
  })

  it('activo + no contratado → active_not_contracted', () => {
    const d = diffBillingModulesAgainstFlags(
      { appNavBookingsEnabled: true },
      [],
    )
    const row = d.modules.find((m) => m.moduleCode === 'bookings')!
    assert.equal(row.status, 'active_not_contracted')
    assert.equal(d.hasWarnings, true)
  })

  it('contratado + no activo → contracted_not_active', () => {
    const d = diffBillingModulesAgainstFlags(
      { appNavPoolAccessEnabled: false },
      ['pool'],
    )
    const row = d.modules.find((m) => m.moduleCode === 'pool')!
    assert.equal(row.functionallyActive, false)
    assert.equal(row.status, 'contracted_not_active')
  })

  it('defaults true: flag undefined cuenta activo', () => {
    const d = diffBillingModulesAgainstFlags({}, [])
    const incidents = d.modules.find((m) => m.moduleCode === 'incidents')!
    assert.equal(incidents.functionallyActive, true)
    assert.equal(incidents.status, 'active_not_contracted')
  })

  it('Entrega especial no crea cobro; aviso si ON sin parcels contratado', () => {
    const d = diffBillingModulesAgainstFlags(
      { paqueteriaSpecialDeliveryEnabled: true, appNavPaqueteriaEnabled: true },
      [], // sin parcels en contrato
    )
    assert.equal(d.specialDelivery.status, 'info_without_parcels_contract')
    assert.ok(!d.modules.some((m) => m.moduleCode === ('special_delivery' as never)))
  })

  it('Entrega especial OK si parcels contratado', () => {
    const d = diffBillingModulesAgainstFlags(
      { paqueteriaSpecialDeliveryEnabled: true },
      ['parcels'],
    )
    assert.equal(d.specialDelivery.status, 'ok')
    assert.equal(d.specialDelivery.parcelsContracted, true)
  })
})
