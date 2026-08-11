/**
 * Batch READ: resumen compacto de billing por comunidad (cards Super Admin).
 */
import {
  buildCommunityBillingReadResponse,
  type CommunityBillingRow,
  type CommunityFlagsSnapshot,
} from './read-community.js'
import { mapDbBilling } from './write-billing.js'
import { UNCONFIGURED_STATUS } from './commercial-status.js'

export type CommunityBillingCardSummary = {
  communityId: number
  commercialStatus: string
  usageMode: string | null
  planCode: string | null
  planName: string | null
  dwellingCount: number | null
  netEur: string | null
  vatEur: string | null
  grossEur: string | null
  pricingSource: string | null
  planPartEur: string | null
  sizeSurchargeEur: string | null
  discountEur: string | null
  modulesActive: number
  modulesContracted: number
  discrepancyCount: number
  hasWarnings: boolean
}

export function buildCommunityBillingCardSummary(input: {
  community: {
    id: number
    name: string
    portalCount: number
    portalDwellingConfig: unknown
  } & CommunityFlagsSnapshot
  billing: CommunityBillingRow | null
}): CommunityBillingCardSummary {
  const full = buildCommunityBillingReadResponse(input)
  const modulesActive = full.flagDiff.modules.filter((m) => m.functionallyActive).length
  const modulesContracted = full.flagDiff.modules.filter((m) => m.commerciallyContracted).length
  const moduleDiscrepancies = full.flagDiff.modules.filter((m) => m.status !== 'ok').length
  const specialWarn = full.flagDiff.specialDelivery.status !== 'ok' ? 1 : 0

  if (!input.billing || !full.quote) {
    return {
      communityId: input.community.id,
      commercialStatus: UNCONFIGURED_STATUS,
      usageMode: null,
      planCode: null,
      planName: null,
      dwellingCount: null,
      netEur: null,
      vatEur: null,
      grossEur: null,
      pricingSource: null,
      planPartEur: null,
      sizeSurchargeEur: null,
      discountEur: null,
      modulesActive,
      modulesContracted: 0,
      discrepancyCount: 0,
      hasWarnings: false,
    }
  }

  return {
    communityId: input.community.id,
    commercialStatus: full.commercialStatus,
    usageMode: full.usageMode,
    planCode: full.billing?.plan.code ?? null,
    planName: full.billing?.plan.name ?? null,
    dwellingCount: full.billing?.dwellingCount ?? null,
    netEur: full.quote.netEur,
    vatEur: full.quote.vatEur,
    grossEur: full.quote.grossEur,
    pricingSource: full.quote.pricingSource,
    planPartEur: full.quote.planPartEur,
    sizeSurchargeEur: full.quote.sizeSurchargeEur,
    discountEur: full.quote.discountEur,
    modulesActive,
    modulesContracted,
    discrepancyCount: moduleDiscrepancies + specialWarn,
    hasWarnings: full.flagDiff.hasWarnings || (full.warnings?.length ?? 0) > 0,
  }
}

export { mapDbBilling }
