/**
 * T6 — Tramos de tamaño: validación, lookup, snapshot/MRR intacto.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeBillingQuote,
  FALLBACK_SIZE_TIERS,
  parsePutSizeTiersPayload,
  sizeTiersFingerprint,
  suggestSizeSurchargeEur,
  validateSizeTiersCoverage,
  CatalogWriteError,
} from './index.js'
import { buildBillingSummary } from './read-summary.js'

describe('validateSizeTiersCoverage', () => {
  it('acepta defaults 0→∞ continuos', () => {
    const r = validateSizeTiersCoverage(FALLBACK_SIZE_TIERS)
    assert.equal(r.ok, true)
  })

  it('rechaza hueco', () => {
    const r = validateSizeTiersCoverage([
      { fromUnits: 0, toUnits: 100, surchargeEur: '0' },
      { fromUnits: 102, toUnits: null, surchargeEur: '10' },
    ])
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.ok(r.errors.some((e) => e.includes('Hueco')))
  })

  it('rechaza solape', () => {
    const r = validateSizeTiersCoverage([
      { fromUnits: 0, toUnits: 100, surchargeEur: '0' },
      { fromUnits: 100, toUnits: null, surchargeEur: '10' },
    ])
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.ok(r.errors.some((e) => e.includes('Solape') || e.includes('Hueco')))
  })

  it('rechaza sin infinito o infinito no último', () => {
    const noInf = validateSizeTiersCoverage([
      { fromUnits: 0, toUnits: 100, surchargeEur: '0' },
      { fromUnits: 101, toUnits: 200, surchargeEur: '10' },
    ])
    assert.equal(noInf.ok, false)

    const midInf = validateSizeTiersCoverage([
      { fromUnits: 0, toUnits: null, surchargeEur: '0' },
      { fromUnits: 1, toUnits: 10, surchargeEur: '1' },
    ])
    assert.equal(midInf.ok, false)
  })

  it('exige fromUnits=0', () => {
    const r = validateSizeTiersCoverage([
      { fromUnits: 1, toUnits: null, surchargeEur: '0' },
    ])
    assert.equal(r.ok, false)
  })
})

describe('parsePutSizeTiersPayload', () => {
  it('parsea set válido', () => {
    const tiers = parsePutSizeTiersPayload({
      tiers: [
        { fromUnits: 0, toUnits: 10, surchargeEur: '0' },
        { fromUnits: 11, toUnits: null, surchargeEur: '5.5' },
      ],
    })
    assert.equal(tiers.length, 2)
    assert.equal(tiers[1]?.surchargeEur, '5.50')
  })

  it('rechaza body con campos extra', () => {
    assert.throws(
      () => parsePutSizeTiersPayload({ tiers: [], foo: 1 }),
      (e: unknown) => e instanceof CatalogWriteError && e.status === 400,
    )
  })
})

describe('snapshot / MRR vs catálogo de tramos', () => {
  it('cambiar sugerencia de tramo no altera quote con sizeSurchargeEur contractual', () => {
    const contractual = '30.00'
    const catalogSuggest = suggestSizeSurchargeEur(350, [
      { fromUnits: 0, toUnits: 100, surchargeEur: '0.00' },
      { fromUnits: 101, toUnits: null, surchargeEur: '99.00' },
    ])
    assert.equal(catalogSuggest.suggestedSurchargeEur, '99.00')

    const quote = computeBillingQuote({
      planChargedPriceEur: 69,
      lines: [],
      sizeSurchargeEur: contractual,
    })
    assert.equal(quote.sizeSurchargeEur, '30.00')
    assert.equal(quote.netEur, '99.00')
  })

  it('MRR B8 usa sizeSurchargeEur snapshot, no el catálogo', () => {
    const summary = buildBillingSummary({
      totalCommunities: 1,
      billings: [
        {
          id: 1,
          communityId: 1,
          planCode: 'completo',
          planName: 'Completo',
          planListPriceEur: '69.00',
          planChargedPriceEur: '69.00',
          usageMode: 'neighbors_and_staff',
          commercialStatus: 'billable',
          dwellingCount: 400,
          dwellingSource: 'manual',
          sizeSurchargeEur: '40.00',
          discountEur: '0.00',
          discountNote: null,
          negotiatedTotalEur: null,
          vatRatePct: '21.00',
          currency: 'EUR',
          notes: null,
          configuredAt: new Date(),
          configuredByUserId: 1,
          updatedAt: new Date(),
          updatedByUserId: 1,
          lines: [],
        },
      ],
    })
    // 69 + 40 = 109 net; catalog would suggest 45 for 400 but MRR must keep 40
    assert.equal(summary.mrrEur, '109.00')
    assert.equal(
      sizeTiersFingerprint(FALLBACK_SIZE_TIERS),
      '0-100:0.00|101-200:15.00|201-300:30.00|301-inf:45.00',
    )
  })
})
