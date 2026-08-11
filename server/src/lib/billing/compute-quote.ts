/**
 * Motor puro de cuota mensual (snapshot del contrato — no consulta catálogo).
 */
import {
  addMoney,
  clampMoneyNonNegative,
  computeVat,
  formatMoney,
  money,
  roundMoney,
  type MoneyInput,
} from './money.js'

export type PricingMode = 'catalog' | 'included' | 'free' | 'custom'
export type PricingSource = 'calculated' | 'negotiated_override'

export type BillingLineInput = {
  moduleCode: string
  moduleName?: string
  includedInPlan: boolean
  pricingMode: PricingMode
  /** Snapshot histórico — no se usa para sumar; solo breakdown/auditoría. */
  listPriceEur: MoneyInput
  /** Precio cobrado snapshot de la línea. */
  chargedPriceEur: MoneyInput
}

export type ComputeBillingQuoteInput = {
  /** Precio cobrado del plan/pack (snapshot). */
  planChargedPriceEur: MoneyInput
  lines: BillingLineInput[]
  sizeSurchargeEur?: MoneyInput
  discountEur?: MoneyInput
  /** Si no null/undefined, sustituye el neto calculado. */
  negotiatedTotalEur?: MoneyInput | null
  /** Default 21. */
  vatRatePct?: MoneyInput
}

export type BillingLineBreakdown = {
  moduleCode: string
  moduleName: string | null
  includedInPlan: boolean
  pricingMode: PricingMode
  listPriceEur: string
  chargedPriceEur: string
  /** Si esta línea entra en modulesPart (no included). */
  contributesToModulesPart: boolean
}

export type ComputeBillingQuoteResult = {
  pricingSource: PricingSource
  planPartEur: string
  modulesPartEur: string
  sizeSurchargeEur: string
  discountEur: string
  /** Subtotal antes de override / clamp. */
  calculatedSubtotalEur: string
  netEur: string
  vatRatePct: string
  vatEur: string
  grossEur: string
  lines: BillingLineBreakdown[]
}

/**
 * charged efectivo según modo (defensivo; el contrato ya debería traer charged correcto).
 * - included / free → 0
 * - catalog / custom → charged snapshot
 */
export function effectiveChargedForMode(
  pricingMode: PricingMode,
  chargedPriceEur: MoneyInput,
): ReturnType<typeof roundMoney> {
  if (pricingMode === 'included' || pricingMode === 'free') {
    return roundMoney(0)
  }
  return roundMoney(chargedPriceEur)
}

/**
 * Fórmula:
 *   si negotiated_total != null → net = negotiated_total
 *   si no → net = max(0, plan + Σ charged(!included) + size − discount)
 *   vat = round(net * vatRate/100); gross = net + vat
 *
 * Trabaja solo con snapshots del input — nunca con catálogo actual.
 */
export function computeBillingQuote(input: ComputeBillingQuoteInput): ComputeBillingQuoteResult {
  const planPart = roundMoney(input.planChargedPriceEur)
  const sizePart = roundMoney(input.sizeSurchargeEur ?? 0)
  const discountRaw = money(input.discountEur ?? 0)
  const discount = discountRaw.isNegative() ? roundMoney(0) : roundMoney(discountRaw)

  const lines: BillingLineBreakdown[] = []
  let modulesSum = money(0)

  for (const line of input.lines) {
    const mode = line.pricingMode
    const charged =
      line.includedInPlan || mode === 'included' || mode === 'free'
        ? roundMoney(0)
        : effectiveChargedForMode(mode, line.chargedPriceEur)

    const contributes = !line.includedInPlan && mode !== 'included'
    // Incluidos no suman. free/catalog/custom no-incluidos suman su charged (free→0).
    if (contributes) {
      modulesSum = modulesSum.plus(charged)
    }

    lines.push({
      moduleCode: line.moduleCode,
      moduleName: line.moduleName ?? null,
      includedInPlan: line.includedInPlan,
      pricingMode: mode,
      listPriceEur: formatMoney(line.listPriceEur),
      chargedPriceEur: formatMoney(charged),
      contributesToModulesPart: contributes,
    })
  }

  const modulesPart = roundMoney(modulesSum)
  const calculatedSubtotal = clampMoneyNonNegative(
    addMoney(planPart, modulesPart, sizePart).minus(discount),
  )

  const hasOverride =
    input.negotiatedTotalEur != null &&
    input.negotiatedTotalEur !== undefined &&
    String(input.negotiatedTotalEur).trim() !== ''

  let pricingSource: PricingSource
  let net
  if (hasOverride) {
    pricingSource = 'negotiated_override'
    net = clampMoneyNonNegative(input.negotiatedTotalEur as MoneyInput)
  } else {
    pricingSource = 'calculated'
    net = calculatedSubtotal
  }

  const vatRate = input.vatRatePct ?? 21
  const { vatEur, grossEur, vatRatePct } = computeVat(net, vatRate)

  return {
    pricingSource,
    planPartEur: formatMoney(planPart),
    modulesPartEur: formatMoney(modulesPart),
    sizeSurchargeEur: formatMoney(sizePart),
    discountEur: formatMoney(discount),
    calculatedSubtotalEur: formatMoney(calculatedSubtotal),
    netEur: formatMoney(net),
    vatRatePct: formatMoney(vatRatePct),
    vatEur: formatMoney(vatEur),
    grossEur: formatMoney(grossEur),
    lines,
  }
}
