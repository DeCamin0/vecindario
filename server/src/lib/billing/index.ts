/**
 * Billing — lógica pura (sin Express, sin Prisma queries).
 * B2: cálculo, tamaño, flags↔contrato, mapping.
 */
export {
  BILLING_MODULE_CODES,
  MODULE_FLAG_MAP,
  SPECIAL_DELIVERY_FLAG_KEY,
  flagKeyForModule,
  moduleCodeForFlag,
  isKnownBillingModuleCode,
  isFunctionalFlagEnabled,
  type BillingModuleCode,
  type BillingFlagKey,
  type ModuleFlagMapping,
} from './module-flags.js'

export {
  money,
  roundMoney,
  formatMoney,
  addMoney,
  subMoney,
  mulMoney,
  clampMoneyNonNegative,
  computeVat,
  type MoneyInput,
} from './money.js'

export {
  suggestSizeSurchargeEur,
  validateSizeTiersCoverage,
  formatSizeTierLabel,
  sizeTiersFingerprint,
  FALLBACK_SIZE_TIERS,
  mapDbSizeTierRows,
  type SizeTier,
  type SizeTierBand,
  type SizeSurchargeSuggestion,
} from './size-surcharge.js'

export {
  parsePutSizeTiersPayload,
  putSizeTiers,
  loadActiveSizeTiers,
} from './size-tiers-write.js'

export {
  computeBillingQuote,
  effectiveChargedForMode,
  type PricingMode,
  type PricingSource,
  type BillingLineInput,
  type ComputeBillingQuoteInput,
  type ComputeBillingQuoteResult,
  type BillingLineBreakdown,
} from './compute-quote.js'

export {
  diffBillingModulesAgainstFlags,
  type ModuleDiffStatus,
  type ModuleDiffItem,
  type SpecialDeliveryDiff,
  type BillingFlagsDiffResult,
  type CommunityFlagsInput,
} from './diff-flags.js'

export {
  COMMERCIAL_STATUSES,
  UNCONFIGURED_STATUS,
  MRR_COMMERCIAL_STATUSES,
  isMrrCommercialStatus,
  isKnownCommercialStatus,
  type CommercialStatus,
} from './commercial-status.js'

export {
  USAGE_MODES,
  DEFAULT_USAGE_MODE,
  NEIGHBOR_ORIENTED_MODULE_CODES,
  INITIAL_PLAN_PRICES,
  isKnownUsageMode,
  catalogPlanPriceForUsageMode,
  buildPlanPriceLookup,
  initialPlanPriceLookup,
  planPriceKey,
  plansAllowedForUsageMode,
  isPlanAllowedForUsageMode,
  planCommercialKind,
  staffOnlyNeighborModulesWarning,
  suggestPackRecommendation,
  type UsageMode,
  type PlanPriceLookup,
  type PackRecommendation,
} from './usage-mode.js'

export {
  buildCommunityBillingReadResponse,
  quoteFromBillingRow,
  serializeBillingContract,
  suggestedDwellingsFromPortalConfig,
  flagsFromCommunity,
  type CommunityBillingRow,
  type CommunityFlagsSnapshot,
  type BillingLineRow,
  type BuildCommunityBillingReadInput,
} from './read-community.js'

export {
  buildBillingSummary,
  type BillingSummaryResult,
} from './read-summary.js'

export {
  parsePutBillingPayload,
  canonicalBillingFingerprint,
  moneyToPrisma,
  type PutBillingPayload,
  type PutBillingLineInput,
  type ValidationResult,
} from './write-validate.js'

export {
  resolveBillingWrite,
  resolveLineCharged,
  defaultIncludedLinesForPlan,
  type ResolvedBillingWrite,
  type CatalogPlan,
  type CatalogModule,
} from './write-resolve.js'

export {
  putCommunityBilling,
  BillingWriteError,
  mapDbBilling,
} from './write-billing.js'

export {
  buildCommunityBillingCardSummary,
  type CommunityBillingCardSummary,
} from './communities-card-summary.js'

export {
  buildBillingCatalogResponse,
} from './catalog-response.js'

export {
  buildBillingPreview,
  existingSnapFromBillingRow,
  type BillingPreviewResult,
  type BillingPreviewOk,
  type BillingPreviewErr,
} from './preview-billing.js'

export {
  parsePutCatalogPayload,
  parsePutCatalogPricesPayload,
  putCatalog,
  putCatalogPrices,
  CatalogWriteError,
  normalizeIncludesCodes,
  includesFingerprint,
} from './catalog-write.js'
