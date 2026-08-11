/**
 * Modo de uso comercial (no funcional).
 * Precios de plan: SOLO desde DB (BillingCatalogPlanPrice) vía PlanPriceLookup.
 * Nunca inferir de flags/roles.
 */
import { formatMoney, money } from './money.js'

export const USAGE_MODES = ['neighbors_and_staff', 'staff_only'] as const
export type UsageMode = (typeof USAGE_MODES)[number]

export const DEFAULT_USAGE_MODE: UsageMode = 'neighbors_and_staff'

/** Módulos orientados a vecinos (warning si staff_only + contratados). */
export const NEIGHBOR_ORIENTED_MODULE_CODES = [
  'incidents',
  'bookings',
  'services',
  'pool',
] as const

/** Clave estable plan+mode para lookup de precios DB. */
export function planPriceKey(planCode: string, usageMode: string): string {
  return `${planCode}::${usageMode}`
}

export type PlanPriceLookup = ReadonlyMap<string, string>

export function buildPlanPriceLookup(
  rows: Iterable<{ planCode: string; usageMode: string; monthlyPriceEur: { toString(): string } | string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(planPriceKey(row.planCode, row.usageMode), formatMoney(row.monthlyPriceEur.toString()))
  }
  return map
}

export function isKnownUsageMode(v: string): v is UsageMode {
  return (USAGE_MODES as readonly string[]).includes(v)
}

/**
 * Precio de lista / cobrado sugerido del plan según usageMode.
 * Autoridad: `prices` (DB). Sin fila en lookup:
 * - neighbors → espejo `catalogMonthlyPriceEur`
 * - staff_only → null (caller debe fallar; no inventar override)
 */
export function catalogPlanPriceForUsageMode(
  planCode: string,
  usageMode: UsageMode,
  catalogMonthlyPriceEur: string,
  prices?: PlanPriceLookup | null,
): string | null {
  if (prices) {
    const hit = prices.get(planPriceKey(planCode, usageMode))
    if (hit != null) return formatMoney(hit)
  }
  if (usageMode === 'neighbors_and_staff') {
    return formatMoney(catalogMonthlyPriceEur)
  }
  return null
}

/** Lookup de precios iniciales (tests / seed create-only; no autoridad en runtime). */
export function initialPlanPriceLookup(): PlanPriceLookup {
  return buildPlanPriceLookup(INITIAL_PLAN_PRICES)
}

/** Planes ofrecidos por defecto según modo (UI B6 / validación WRITE). */
export function plansAllowedForUsageMode(usageMode: UsageMode): readonly string[] {
  if (usageMode === 'staff_only') {
    return ['conserjeria', 'a_medida']
  }
  return ['comunidad', 'conserjeria', 'completo', 'a_medida']
}

export function isPlanAllowedForUsageMode(planCode: string, usageMode: UsageMode): boolean {
  return plansAllowedForUsageMode(usageMode).includes(planCode)
}

export function planCommercialKind(planCode: string): 'platform' | 'pack' {
  return planCode === 'a_medida' ? 'platform' : 'pack'
}

export function staffOnlyNeighborModulesWarning(
  usageMode: string,
  contractedModuleCodes: Iterable<string>,
): string | null {
  if (usageMode !== 'staff_only') return null
  const hired = [...contractedModuleCodes].filter((c) =>
    (NEIGHBOR_ORIENTED_MODULE_CODES as readonly string[]).includes(c),
  )
  if (hired.length === 0) return null
  return 'Esta comunidad está configurada como Solo conserjería, pero tiene módulos orientados a vecinos contratados.'
}

export type PackRecommendCandidate = {
  code: string
  name: string
  includes: string[]
  monthlyPriceEur: string
}

export type PackRecommendation = {
  planCode: string
  planName: string
  packPriceEur: string
  message: string
}

/**
 * Recomendación comercial para A medida (solo aviso; nunca cambia el plan).
 * Elige el pack permitido cuyo includes ⊆ contratados y con más módulos cubiertos.
 */
export function suggestPackRecommendation(input: {
  planCode: string
  usageMode: UsageMode
  contractedModuleCodes: Iterable<string>
  netEur: string
  packs: PackRecommendCandidate[]
}): PackRecommendation | null {
  if (input.planCode !== 'a_medida') return null

  const contracted = new Set([...input.contractedModuleCodes].map(String))
  if (contracted.size === 0) return null

  let net: ReturnType<typeof money>
  try {
    net = money(input.netEur)
  } catch {
    return null
  }
  if (!net.isFinite() || net.isNegative()) return null

  const allowed = new Set(plansAllowedForUsageMode(input.usageMode))
  type Scored = PackRecommendCandidate & { savings: ReturnType<typeof money>; includeCount: number }
  const scored: Scored[] = []

  for (const pack of input.packs) {
    if (pack.code === 'a_medida') continue
    if (!allowed.has(pack.code)) continue
    const includes = Array.isArray(pack.includes) ? pack.includes.map(String) : []
    if (includes.length === 0) continue
    if (!includes.every((c) => contracted.has(c))) continue

    let packPrice: ReturnType<typeof money>
    try {
      packPrice = money(pack.monthlyPriceEur)
    } catch {
      continue
    }
    if (!packPrice.isFinite() || packPrice.isNegative()) continue
    if (net.lessThan(packPrice)) continue

    const savings = net.minus(packPrice)
    scored.push({ ...pack, savings, includeCount: includes.length })
  }

  if (scored.length === 0) return null

  scored.sort((a, b) => {
    if (b.includeCount !== a.includeCount) return b.includeCount - a.includeCount
    const sav = b.savings.comparedTo(a.savings)
    if (sav !== 0) return sav
    return a.code.localeCompare(b.code)
  })

  const best = scored[0]!
  return {
    planCode: best.code,
    planName: best.name,
    packPriceEur: formatMoney(best.monthlyPriceEur),
    message: `Con esta configuración te conviene ${best.name}`,
  }
}

/** Filas iniciales de precios (solo para seed create-only / migración backfill). */
export const INITIAL_PLAN_PRICES: ReadonlyArray<{
  planCode: string
  usageMode: UsageMode
  monthlyPriceEur: string
}> = [
  { planCode: 'a_medida', usageMode: 'neighbors_and_staff', monthlyPriceEur: '24.00' },
  { planCode: 'a_medida', usageMode: 'staff_only', monthlyPriceEur: '16.00' },
  { planCode: 'comunidad', usageMode: 'neighbors_and_staff', monthlyPriceEur: '44.00' },
  { planCode: 'conserjeria', usageMode: 'neighbors_and_staff', monthlyPriceEur: '46.00' },
  { planCode: 'conserjeria', usageMode: 'staff_only', monthlyPriceEur: '39.00' },
  { planCode: 'completo', usageMode: 'neighbors_and_staff', monthlyPriceEur: '69.00' },
]
