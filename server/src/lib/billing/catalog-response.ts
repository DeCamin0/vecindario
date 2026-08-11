/**
 * Ensambla respuesta GET /catalog (READ-ONLY) con precios por usageMode desde DB.
 */
import { formatMoney } from './money.js'
import {
  formatSizeTierLabel,
  mapDbSizeTierRows,
  type SizeTierBand,
} from './size-surcharge.js'
import {
  USAGE_MODES,
  buildPlanPriceLookup,
  planCommercialKind,
  planPriceKey,
  plansAllowedForUsageMode,
  type UsageMode,
} from './usage-mode.js'

export type CatalogPlanRow = {
  code: string
  name: string
  monthlyPriceEur: { toString(): string } | string
  includesJson: unknown
  active: boolean
  sortOrder: number
}

export type CatalogModuleRow = {
  code: string
  name: string
  listPriceEur: { toString(): string } | string
  flagKey: string | null
  parentCode: string | null
  active: boolean
  sortOrder: number
}

export type CatalogPlanPriceRow = {
  planCode: string
  usageMode: string
  monthlyPriceEur: { toString(): string } | string
}

function includesOf(plan: CatalogPlanRow): string[] {
  return Array.isArray(plan.includesJson) ? plan.includesJson.map(String) : []
}

function moneyStr(v: { toString(): string } | string): string {
  return formatMoney(typeof v === 'string' ? v : v.toString())
}

const USAGE_LABELS: Record<UsageMode, string> = {
  neighbors_and_staff: 'Vecinos + conserjería',
  staff_only: 'Solo conserjería',
}

export type CatalogSizeTierRow = {
  fromUnits: number
  toUnits: number | null
  surchargeEur: { toString(): string } | string
  sortOrder?: number
  active?: boolean
}

export function buildBillingCatalogResponse(input: {
  plans: CatalogPlanRow[]
  modules: CatalogModuleRow[]
  planPrices: CatalogPlanPriceRow[]
  sizeTiers?: CatalogSizeTierRow[] | SizeTierBand[]
}) {
  const plansByCode = new Map(input.plans.map((p) => [p.code, p]))
  const priceLookup = buildPlanPriceLookup(input.planPrices)

  const plans = input.plans.map((p) => {
    const monthlyPrice = moneyStr(p.monthlyPriceEur)
    const pricesByUsageMode: Record<string, string | null> = {}
    for (const mode of USAGE_MODES) {
      const allowed = plansAllowedForUsageMode(mode).includes(p.code)
      if (!allowed) {
        pricesByUsageMode[mode] = null
        continue
      }
      pricesByUsageMode[mode] =
        priceLookup.get(planPriceKey(p.code, mode)) ??
        (mode === 'neighbors_and_staff' ? monthlyPrice : null)
    }
    return {
      code: p.code,
      name: p.name,
      monthlyPrice,
      kind: planCommercialKind(p.code),
      includes: includesOf(p),
      active: p.active,
      sortOrder: p.sortOrder,
      pricesByUsageMode,
      availableForUsageModes: USAGE_MODES.filter((m) => plansAllowedForUsageMode(m).includes(p.code)),
    }
  })

  const modules = input.modules.map((m) => ({
    code: m.code,
    name: m.name,
    listPrice: moneyStr(m.listPriceEur),
    flagKey: m.flagKey ?? '',
    parentCode: m.parentCode,
    active: m.active,
    sortOrder: m.sortOrder,
  }))

  const usageModes: Record<
    string,
    {
      code: UsageMode
      label: string
      plans: Array<{
        code: string
        name: string
        kind: 'platform' | 'pack'
        monthlyPrice: string
        includes: string[]
      }>
    }
  > = {}

  for (const mode of USAGE_MODES) {
    const allowedCodes = plansAllowedForUsageMode(mode)
    usageModes[mode] = {
      code: mode,
      label: USAGE_LABELS[mode],
      plans: allowedCodes
        .map((code) => {
          const row = plansByCode.get(code)
          if (!row || !row.active) return null
          const price =
            priceLookup.get(planPriceKey(code, mode)) ??
            (mode === 'neighbors_and_staff' ? moneyStr(row.monthlyPriceEur) : null)
          if (price == null) return null
          return {
            code,
            name: row.name,
            kind: planCommercialKind(code),
            monthlyPrice: price,
            includes: includesOf(row),
          }
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
    }
  }

  const sizeTiers = mapDbSizeTierRows(input.sizeTiers ?? []).map((t) => ({
    fromUnits: t.fromUnits,
    toUnits: t.toUnits,
    surchargeEur: t.surchargeEur,
    label: formatSizeTierLabel(t.fromUnits, t.toUnits),
  }))

  return { plans, modules, usageModes, sizeTiers }
}
