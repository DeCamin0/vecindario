/**
 * Lectura / ensamblado de respuesta billing por comunidad (sin writes).
 */
import {
  computeBillingQuote,
  type BillingLineInput,
  type ComputeBillingQuoteResult,
  type PricingMode,
} from './compute-quote.js'
import {
  diffBillingModulesAgainstFlags,
  type BillingFlagsDiffResult,
  type CommunityFlagsInput,
} from './diff-flags.js'
import { formatMoney, type MoneyInput } from './money.js'
import { suggestSizeSurchargeEur, type SizeTierBand } from './size-surcharge.js'
import { UNCONFIGURED_STATUS } from './commercial-status.js'
import {
  estimateDwellingUnitsFromPortalConfig,
  isPortalDwellingFullyConfigured,
} from '../portal-dwelling-config.js'
import { staffOnlyNeighborModulesWarning } from './usage-mode.js'

export type CommunityFlagsSnapshot = {
  appNavServicesEnabled: boolean
  appNavIncidentsEnabled: boolean
  appNavBookingsEnabled: boolean
  appNavPoolAccessEnabled: boolean
  appNavPaqueteriaEnabled: boolean
  paqueteriaSpecialDeliveryEnabled: boolean
  paqueteriaKeyLoansEnabled: boolean
  appNavCuadernoDiarioEnabled: boolean
  appNavControlEntradaEnabled: boolean
}

export type BillingLineRow = {
  moduleCode: string
  moduleName: string
  includedInPlan: boolean
  pricingMode: string
  listPriceEur: MoneyInput
  chargedPriceEur: MoneyInput
  sortOrder: number
}

export type CommunityBillingRow = {
  id: number
  communityId: number
  planCode: string
  planName: string
  planListPriceEur: MoneyInput
  planChargedPriceEur: MoneyInput
  usageMode: string
  commercialStatus: string
  dwellingCount: number | null
  dwellingSource: string
  sizeSurchargeEur: MoneyInput
  discountEur: MoneyInput
  discountNote: string | null
  negotiatedTotalEur: MoneyInput | null
  vatRatePct: MoneyInput
  currency: string
  notes: string | null
  configuredAt: Date
  configuredByUserId: number | null
  updatedAt: Date
  updatedByUserId: number | null
  lines: BillingLineRow[]
}

function toPricingMode(raw: string): PricingMode {
  if (raw === 'included' || raw === 'free' || raw === 'custom' || raw === 'catalog') {
    return raw
  }
  return 'catalog'
}

export function flagsFromCommunity(c: CommunityFlagsSnapshot): CommunityFlagsInput {
  return {
    appNavServicesEnabled: c.appNavServicesEnabled,
    appNavIncidentsEnabled: c.appNavIncidentsEnabled,
    appNavBookingsEnabled: c.appNavBookingsEnabled,
    appNavPoolAccessEnabled: c.appNavPoolAccessEnabled,
    appNavPaqueteriaEnabled: c.appNavPaqueteriaEnabled,
    paqueteriaSpecialDeliveryEnabled: c.paqueteriaSpecialDeliveryEnabled,
    paqueteriaKeyLoansEnabled: c.paqueteriaKeyLoansEnabled,
    appNavCuadernoDiarioEnabled: c.appNavCuadernoDiarioEnabled,
    appNavControlEntradaEnabled: c.appNavControlEntradaEnabled,
  }
}

export function suggestedDwellingsFromPortalConfig(
  portalDwellingConfig: unknown,
  portalCount: number,
): {
  suggestedDwellingCount: number | null
  suggestionReliable: boolean
} {
  const reliable = isPortalDwellingFullyConfigured(portalDwellingConfig, portalCount)
  if (!reliable) {
    return { suggestedDwellingCount: null, suggestionReliable: false }
  }
  const n = estimateDwellingUnitsFromPortalConfig(portalDwellingConfig, portalCount)
  return {
    suggestedDwellingCount: n,
    suggestionReliable: n != null && n > 0,
  }
}

export function quoteFromBillingRow(billing: CommunityBillingRow): ComputeBillingQuoteResult {
  const lines: BillingLineInput[] = billing.lines.map((l) => ({
    moduleCode: l.moduleCode,
    moduleName: l.moduleName,
    includedInPlan: l.includedInPlan,
    pricingMode: toPricingMode(l.pricingMode),
    listPriceEur: l.listPriceEur,
    chargedPriceEur: l.chargedPriceEur,
  }))
  return computeBillingQuote({
    planChargedPriceEur: billing.planChargedPriceEur,
    lines,
    sizeSurchargeEur: billing.sizeSurchargeEur,
    discountEur: billing.discountEur,
    negotiatedTotalEur: billing.negotiatedTotalEur,
    vatRatePct: billing.vatRatePct,
  })
}

export function serializeBillingContract(billing: CommunityBillingRow) {
  const quote = quoteFromBillingRow(billing)
  return {
    id: billing.id,
    communityId: billing.communityId,
    plan: {
      code: billing.planCode,
      name: billing.planName,
      listPriceEur: formatMoney(billing.planListPriceEur),
      chargedPriceEur: formatMoney(billing.planChargedPriceEur),
    },
    usageMode: billing.usageMode,
    commercialStatus: billing.commercialStatus,
    dwellingCount: billing.dwellingCount,
    dwellingSource: billing.dwellingSource,
    sizeSurchargeEur: formatMoney(billing.sizeSurchargeEur),
    discountEur: formatMoney(billing.discountEur),
    discountNote: billing.discountNote,
    negotiatedTotalEur:
      billing.negotiatedTotalEur == null ? null : formatMoney(billing.negotiatedTotalEur),
    vatRatePct: formatMoney(billing.vatRatePct),
    currency: billing.currency,
    notes: billing.notes,
    lines: [...billing.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.moduleCode.localeCompare(b.moduleCode))
      .map((l) => ({
        moduleCode: l.moduleCode,
        moduleName: l.moduleName,
        includedInPlan: l.includedInPlan,
        pricingMode: toPricingMode(l.pricingMode),
        listPriceEur: formatMoney(l.listPriceEur),
        chargedPriceEur: formatMoney(l.chargedPriceEur),
        sortOrder: l.sortOrder,
      })),
    quote,
    configuredAt: billing.configuredAt.toISOString(),
    configuredByUserId: billing.configuredByUserId,
    updatedAt: billing.updatedAt.toISOString(),
    updatedByUserId: billing.updatedByUserId,
  }
}

export type BuildCommunityBillingReadInput = {
  community: {
    id: number
    name: string
    portalCount: number
    portalDwellingConfig: unknown
  } & CommunityFlagsSnapshot
  billing: CommunityBillingRow | null
  /** Tramos globales activos; si omitido, FALLBACK_SIZE_TIERS. */
  sizeTiers?: SizeTierBand[]
}

export function buildCommunityBillingReadResponse(input: BuildCommunityBillingReadInput) {
  const flags = flagsFromCommunity(input.community)
  const { suggestedDwellingCount, suggestionReliable } = suggestedDwellingsFromPortalConfig(
    input.community.portalDwellingConfig,
    input.community.portalCount,
  )
  const sizeSuggestion = suggestSizeSurchargeEur(
    input.billing?.dwellingCount ?? suggestedDwellingCount,
    input.sizeTiers,
  )

  if (!input.billing) {
    const flagDiff = diffBillingModulesAgainstFlags(flags, [])
    return {
      communityId: input.community.id,
      communityName: input.community.name,
      commercialStatus: UNCONFIGURED_STATUS,
      usageMode: null,
      billing: null,
      quote: null,
      functionalFlags: flags,
      flagDiff,
      suggestedDwellingCount,
      suggestionReliable,
      sizeSuggestion,
      warnings: flagDiff.hasWarnings
        ? ['Hay diferencias potenciales entre flags activos y un contrato aún no configurado (solo informativo).']
        : [],
    }
  }

  const contractedCodes = input.billing.lines.map((l) => l.moduleCode)
  const flagDiff: BillingFlagsDiffResult = diffBillingModulesAgainstFlags(flags, contractedCodes)
  const contract = serializeBillingContract(input.billing)
  const warnings: string[] = []
  if (flagDiff.hasWarnings) {
    warnings.push('Hay discrepancias entre módulos activos (flags) y módulos contratados.')
  }
  if (sizeSuggestion.requiresManualSurcharge) {
    warnings.push('Viviendas desconocidas o sin tramo coincidente: revisar suplemento manual.')
  }
  const staffNeighborWarn = staffOnlyNeighborModulesWarning(
    input.billing.usageMode,
    contractedCodes,
  )
  if (staffNeighborWarn) warnings.push(staffNeighborWarn)

  return {
    communityId: input.community.id,
    communityName: input.community.name,
    commercialStatus: input.billing.commercialStatus,
    usageMode: input.billing.usageMode,
    billing: contract,
    quote: contract.quote,
    functionalFlags: flags,
    flagDiff,
    suggestedDwellingCount,
    suggestionReliable,
    sizeSuggestion,
    warnings,
  }
}
