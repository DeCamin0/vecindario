/**
 * B8 — summary comercial / MRR / ARR / segmentaciones.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSuperAdminRole } from '../../middleware/require-super-admin.js'
import { buildBillingSummary, type CommunityBillingRow } from './index.js'

function billingFixture(
  partial: Partial<CommunityBillingRow> &
    Pick<CommunityBillingRow, 'commercialStatus' | 'planChargedPriceEur'>,
): CommunityBillingRow {
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

describe('B8 summary dashboard', () => {
  it('0 contratos → MRR/ARR 0, ticket null, unconfigured = total', () => {
    const s = buildBillingSummary({ totalCommunities: 5, billings: [] })
    assert.equal(s.mrrEur, '0.00')
    assert.equal(s.arrEur, '0.00')
    assert.equal(s.averageMonthlyTicketEur, null)
    assert.equal(s.communities.total, 5)
    assert.equal(s.communities.configured, 0)
    assert.equal(s.communities.unconfigured, 5)
    assert.equal(s.communities.contributingToMrr, 0)
    assert.equal(s.byPlan.length, 0)
    assert.equal(s.modules.length, 0)
    assert.equal(s.negotiatedContractsCount, 0)
    assert.equal(s.amountsAreNetWithoutVat, true)
    assert.ok(s.byUsageMode.every((u) => u.communityCount === 0 && u.mrrEur === '0.00'))
    assert.equal(
      s.byCommercialStatus.find((x) => x.status === 'unconfigured')?.communityCount,
      5,
    )
  })

  it('1 billable → MRR = netEur', () => {
    const s = buildBillingSummary({
      totalCommunities: 3,
      billings: [
        billingFixture({
          commercialStatus: 'billable',
          planChargedPriceEur: '44.00',
          planCode: 'comunidad',
          planName: 'Vecindario Comunidad',
        }),
      ],
    })
    assert.equal(s.mrrEur, '44.00')
    assert.equal(s.arrEur, '528.00')
    assert.equal(s.averageMonthlyTicketEur, '44.00')
    assert.equal(s.communities.configured, 1)
    assert.equal(s.communities.unconfigured, 2)
    assert.equal(s.communities.contributingToMrr, 1)
  })

  it('varios billable suman MRR', () => {
    const s = buildBillingSummary({
      totalCommunities: 2,
      billings: [
        billingFixture({
          id: 1,
          communityId: 1,
          commercialStatus: 'billable',
          planChargedPriceEur: '69.00',
        }),
        billingFixture({
          id: 2,
          communityId: 2,
          commercialStatus: 'billable',
          planChargedPriceEur: '44.00',
          planCode: 'comunidad',
          planName: 'Vecindario Comunidad',
        }),
      ],
    })
    assert.equal(s.mrrEur, '113.00')
    assert.equal(s.arrEur, '1356.00')
    assert.equal(s.averageMonthlyTicketEur, '56.50')
  })

  it('demo / courtesy / non_billable no aportan MRR; promo / legacy sí', () => {
    const s = buildBillingSummary({
      totalCommunities: 10,
      billings: [
        billingFixture({
          id: 1,
          communityId: 1,
          commercialStatus: 'billable',
          planChargedPriceEur: '69.00',
        }),
        billingFixture({
          id: 2,
          communityId: 2,
          commercialStatus: 'promo',
          planChargedPriceEur: '49.00',
          planCode: 'comunidad',
          planName: 'Vecindario Comunidad',
        }),
        billingFixture({
          id: 3,
          communityId: 3,
          commercialStatus: 'legacy',
          planChargedPriceEur: '55.00',
          planCode: 'conserjeria',
          planName: 'Vecindario Conserjería',
        }),
        billingFixture({
          id: 4,
          communityId: 4,
          commercialStatus: 'demo',
          planChargedPriceEur: '69.00',
        }),
        billingFixture({
          id: 5,
          communityId: 5,
          commercialStatus: 'courtesy',
          planChargedPriceEur: '69.00',
        }),
        billingFixture({
          id: 6,
          communityId: 6,
          commercialStatus: 'non_billable',
          planChargedPriceEur: '69.00',
        }),
      ],
    })
    assert.equal(s.mrrEur, '173.00')
    assert.equal(s.communities.contributingToMrr, 3)
    assert.equal(s.communities.notContributingToMrr, 3)
    assert.equal(s.byCommercialStatus.find((x) => x.status === 'demo')?.communityCount, 1)
    assert.equal(s.byCommercialStatus.find((x) => x.status === 'unconfigured')?.communityCount, 4)
  })

  it('negotiated override usa quote.netEur', () => {
    const s = buildBillingSummary({
      totalCommunities: 1,
      billings: [
        billingFixture({
          commercialStatus: 'billable',
          planChargedPriceEur: '69.00',
          negotiatedTotalEur: '40.00',
        }),
      ],
    })
    assert.equal(s.mrrEur, '40.00')
    assert.equal(s.negotiatedContractsCount, 1)
  })

  it('descuento y size surcharge en netEur', () => {
    const withDisc = buildBillingSummary({
      totalCommunities: 1,
      billings: [
        billingFixture({
          commercialStatus: 'billable',
          planChargedPriceEur: '69.00',
          discountEur: '10.00',
          lines: [],
        }),
      ],
    })
    assert.equal(withDisc.mrrEur, '59.00')

    const withSize = buildBillingSummary({
      totalCommunities: 1,
      billings: [
        billingFixture({
          commercialStatus: 'billable',
          planChargedPriceEur: '44.00',
          sizeSurchargeEur: '15.00',
          lines: [],
        }),
      ],
    })
    assert.equal(withSize.mrrEur, '59.00')
  })

  it('segmentación usageMode + MRR por modalidad', () => {
    const s = buildBillingSummary({
      totalCommunities: 3,
      billings: [
        billingFixture({
          id: 1,
          communityId: 1,
          commercialStatus: 'billable',
          usageMode: 'neighbors_and_staff',
          planChargedPriceEur: '69.00',
        }),
        billingFixture({
          id: 2,
          communityId: 2,
          commercialStatus: 'billable',
          usageMode: 'staff_only',
          planCode: 'conserjeria',
          planName: 'Vecindario Conserjería',
          planChargedPriceEur: '39.00',
          lines: [
            {
              moduleCode: 'parcels',
              moduleName: 'Paquetería',
              includedInPlan: true,
              pricingMode: 'included',
              listPriceEur: '11.00',
              chargedPriceEur: '0.00',
              sortOrder: 10,
            },
          ],
        }),
        billingFixture({
          id: 3,
          communityId: 3,
          commercialStatus: 'demo',
          usageMode: 'staff_only',
          planCode: 'a_medida',
          planName: 'A medida',
          planChargedPriceEur: '16.00',
          lines: [],
        }),
      ],
    })
    const neighbors = s.byUsageMode.find((u) => u.usageMode === 'neighbors_and_staff')
    const staff = s.byUsageMode.find((u) => u.usageMode === 'staff_only')
    assert.equal(neighbors?.communityCount, 1)
    assert.equal(neighbors?.mrrEur, '69.00')
    assert.equal(staff?.communityCount, 2)
    assert.equal(staff?.mrrEur, '39.00') // demo no suma
  })

  it('distribución por planes con snapshot (no catálogo)', () => {
    const s = buildBillingSummary({
      totalCommunities: 2,
      billings: [
        billingFixture({
          id: 1,
          communityId: 1,
          commercialStatus: 'legacy',
          planCode: 'completo',
          planName: 'Vecindario Completo',
          planChargedPriceEur: '60.00', // snapshot distinto del catálogo 69
        }),
        billingFixture({
          id: 2,
          communityId: 2,
          commercialStatus: 'billable',
          planCode: 'a_medida',
          planName: 'A medida',
          planChargedPriceEur: '24.00',
          lines: [
            {
              moduleCode: 'services',
              moduleName: 'Servicios',
              includedInPlan: false,
              pricingMode: 'catalog',
              listPriceEur: '7.00',
              chargedPriceEur: '7.00',
              sortOrder: 30,
            },
          ],
        }),
      ],
    })
    const completo = s.byPlan.find((p) => p.planCode === 'completo')
    const medida = s.byPlan.find((p) => p.planCode === 'a_medida')
    assert.equal(completo?.communityCount, 1)
    assert.equal(completo?.mrrEur, '60.00')
    assert.equal(medida?.communityCount, 1)
    assert.equal(medida?.mrrEur, '31.00') // 24+7
  })

  it('módulos contratados: included/catalog/custom/free cuentan; % sobre configuradas', () => {
    const s = buildBillingSummary({
      totalCommunities: 4,
      billings: [
        billingFixture({
          id: 1,
          communityId: 1,
          commercialStatus: 'billable',
          planChargedPriceEur: '24.00',
          planCode: 'a_medida',
          planName: 'A medida',
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
            {
              moduleCode: 'pool',
              moduleName: 'Piscina',
              includedInPlan: false,
              pricingMode: 'free',
              listPriceEur: '12.00',
              chargedPriceEur: '0.00',
              sortOrder: 40,
            },
          ],
        }),
        billingFixture({
          id: 2,
          communityId: 2,
          commercialStatus: 'demo',
          planChargedPriceEur: '44.00',
          planCode: 'comunidad',
          planName: 'Vecindario Comunidad',
          lines: [
            {
              moduleCode: 'bookings',
              moduleName: 'Reservas',
              includedInPlan: true,
              pricingMode: 'included',
              listPriceEur: '14.00',
              chargedPriceEur: '0.00',
              sortOrder: 20,
            },
            {
              moduleCode: 'services',
              moduleName: 'Servicios',
              includedInPlan: false,
              pricingMode: 'custom',
              listPriceEur: '7.00',
              chargedPriceEur: '5.00',
              sortOrder: 30,
            },
          ],
        }),
      ],
    })
    const bookings = s.modules.find((m) => m.moduleCode === 'bookings')
    const pool = s.modules.find((m) => m.moduleCode === 'pool')
    const services = s.modules.find((m) => m.moduleCode === 'services')
    assert.equal(bookings?.contractedCommunityCount, 2)
    assert.equal(bookings?.percentageConfigured, 100)
    assert.equal(pool?.contractedCommunityCount, 1)
    assert.equal(pool?.percentageConfigured, 50)
    assert.equal(services?.contractedCommunityCount, 1)
  })

  it('comunidad sin billing solo en unconfigured', () => {
    const s = buildBillingSummary({
      totalCommunities: 4,
      billings: [
        billingFixture({
          commercialStatus: 'billable',
          planChargedPriceEur: '69.00',
        }),
      ],
    })
    assert.equal(s.communities.unconfigured, 3)
    assert.ok(!s.byUsageMode.some((u) => u.communityCount > 1))
  })

  it('company_admin no es super_admin (403 conceptual)', () => {
    assert.equal(isSuperAdminRole('company_admin'), false)
    assert.equal(isSuperAdminRole('super_admin'), true)
  })
})
