/**
 * Preview READ-ONLY de billing: validate + resolve + compute quote.
 * Cero writes / audit / create / update.
 */
import { computeBillingQuote } from './compute-quote.js'
import {
  diffBillingModulesAgainstFlags,
  type BillingFlagsDiffResult,
  type CommunityFlagsInput,
} from './diff-flags.js'
import {
  suggestSizeSurchargeEur,
  type SizeSurchargeSuggestion,
  type SizeTierBand,
} from './size-surcharge.js'
import {
  catalogPlanPriceForUsageMode,
  staffOnlyNeighborModulesWarning,
  suggestPackRecommendation,
  type PackRecommendation,
  type PlanPriceLookup,
  type UsageMode,
} from './usage-mode.js'
import type { PutBillingPayload } from './write-validate.js'
import {
  resolveBillingWrite,
  type CatalogModule,
  type CatalogPlan,
  type ExistingBillingSnap,
  type ResolvedBillingWrite,
} from './write-resolve.js'
import type { ComputeBillingQuoteResult } from './compute-quote.js'

export type BillingPreviewOk = {
  ok: true
  resolved: ResolvedBillingWrite
  quote: ComputeBillingQuoteResult
  sizeSuggestion: SizeSurchargeSuggestion
  flagDiff: BillingFlagsDiffResult
  warnings: string[]
  packRecommendation: PackRecommendation | null
}

export type BillingPreviewErr = {
  ok: false
  status: 400
  error: string
  message?: string
}

export type BillingPreviewResult = BillingPreviewOk | BillingPreviewErr

/**
 * Calcula preview autoritativo sin persistir.
 * Reutiliza resolveBillingWrite + computeBillingQuote (misma ruta que el PUT).
 */
export function buildBillingPreview(input: {
  payload: PutBillingPayload
  plan: CatalogPlan | null
  modulesByCode: Map<string, CatalogModule>
  existing: ExistingBillingSnap | null
  flags: CommunityFlagsInput
  /** Planes catálogo para recomendación comercial (opcional). */
  catalogPlans?: CatalogPlan[]
  planPrices?: PlanPriceLookup | null
  /** Tramos globales activos (si omitido, FALLBACK_SIZE_TIERS). */
  sizeTiers?: SizeTierBand[]
}): BillingPreviewResult {
  const resolved = resolveBillingWrite({
    payload: input.payload,
    plan: input.plan,
    modulesByCode: input.modulesByCode,
    existing: input.existing,
    planPrices: input.planPrices,
  })
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      error: resolved.error,
      message: resolved.message,
    }
  }

  const value = resolved.value
  const quote = computeBillingQuote({
    planChargedPriceEur: value.planChargedPriceEur,
    lines: value.lines.map((l) => ({
      moduleCode: l.moduleCode,
      moduleName: l.moduleName,
      includedInPlan: l.includedInPlan,
      pricingMode: l.pricingMode,
      listPriceEur: l.listPriceEur,
      chargedPriceEur: l.chargedPriceEur,
    })),
    sizeSurchargeEur: value.sizeSurchargeEur,
    discountEur: value.discountEur,
    negotiatedTotalEur: value.negotiatedTotalEur,
    vatRatePct: value.vatRatePct,
  })

  const contractedCodes = value.lines.map((l) => l.moduleCode)
  const flagDiff = diffBillingModulesAgainstFlags(input.flags, contractedCodes)
  const sizeSuggestion = suggestSizeSurchargeEur(value.dwellingCount, input.sizeTiers)

  const warnings: string[] = []
  if (flagDiff.hasWarnings) {
    warnings.push('Hay discrepancias entre módulos activos (flags) y módulos contratados.')
  }
  if (sizeSuggestion.requiresManualSurcharge) {
    warnings.push('Viviendas desconocidas o sin tramo coincidente: revisar suplemento manual.')
  }
  const staffNeighborWarn = staffOnlyNeighborModulesWarning(value.usageMode, contractedCodes)
  if (staffNeighborWarn) warnings.push(staffNeighborWarn)

  const packs = (input.catalogPlans ?? []).map((p) => {
    const monthly =
      catalogPlanPriceForUsageMode(
        p.code,
        value.usageMode as UsageMode,
        p.monthlyPriceEur,
        input.planPrices,
      ) ?? p.monthlyPriceEur
    return {
      code: p.code,
      name: p.name,
      includes: Array.isArray(p.includes) ? p.includes.map(String) : [],
      monthlyPriceEur: monthly,
    }
  })

  const packRecommendation = suggestPackRecommendation({
    planCode: value.planCode,
    usageMode: value.usageMode,
    contractedModuleCodes: contractedCodes,
    netEur: quote.netEur,
    packs,
  })

  return {
    ok: true,
    resolved: value,
    quote,
    sizeSuggestion,
    flagDiff,
    warnings,
    packRecommendation,
  }
}

export function existingSnapFromBillingRow(row: {
  id: number
  planCode: string
  planName: string
  planListPriceEur: { toString(): string } | string
  planChargedPriceEur: { toString(): string } | string
  usageMode: string
  commercialStatus: string
  dwellingCount: number | null
  dwellingSource: string
  sizeSurchargeEur: { toString(): string } | string
  discountEur: { toString(): string } | string
  discountNote: string | null
  negotiatedTotalEur: { toString(): string } | string | null
  vatRatePct: { toString(): string } | string
  notes: string | null
  updatedAt: Date
  lines: Array<{
    moduleCode: string
    moduleName: string
    includedInPlan: boolean
    pricingMode: string
    listPriceEur: { toString(): string } | string
    chargedPriceEur: { toString(): string } | string
    sortOrder: number
  }>
}): ExistingBillingSnap {
  const s = (v: { toString(): string } | string) => String(typeof v === 'string' ? v : v.toString())
  return {
    id: row.id,
    planCode: row.planCode,
    planName: row.planName,
    planListPriceEur: s(row.planListPriceEur),
    planChargedPriceEur: s(row.planChargedPriceEur),
    usageMode: row.usageMode,
    commercialStatus: row.commercialStatus,
    dwellingCount: row.dwellingCount,
    dwellingSource: row.dwellingSource,
    sizeSurchargeEur: s(row.sizeSurchargeEur),
    discountEur: s(row.discountEur),
    discountNote: row.discountNote,
    negotiatedTotalEur: row.negotiatedTotalEur == null ? null : s(row.negotiatedTotalEur),
    vatRatePct: s(row.vatRatePct),
    notes: row.notes,
    updatedAt: row.updatedAt,
    lines: row.lines.map((l) => ({
      moduleCode: l.moduleCode,
      moduleName: l.moduleName,
      includedInPlan: l.includedInPlan,
      pricingMode: l.pricingMode,
      listPriceEur: s(l.listPriceEur),
      chargedPriceEur: s(l.chargedPriceEur),
      sortOrder: l.sortOrder,
    })),
  }
}
