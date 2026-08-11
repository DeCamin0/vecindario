/**
 * Resuelve snapshots de plan/líneas a partir de catálogo + contrato existente.
 * Nunca escribe flags ni Community.
 */
import { formatMoney } from './money.js'
import { effectiveChargedForMode, type PricingMode } from './compute-quote.js'
import type { PutBillingLineInput, PutBillingPayload } from './write-validate.js'
import {
  catalogPlanPriceForUsageMode,
  isPlanAllowedForUsageMode,
  type PlanPriceLookup,
  type UsageMode,
} from './usage-mode.js'

export type CatalogPlan = {
  code: string
  name: string
  monthlyPriceEur: string
  includes: string[]
  active: boolean
}

export type CatalogModule = {
  code: string
  name: string
  listPriceEur: string
  active: boolean
  sortOrder: number
}

export type ExistingLineSnap = {
  moduleCode: string
  moduleName: string
  includedInPlan: boolean
  pricingMode: string
  listPriceEur: string
  chargedPriceEur: string
  sortOrder: number
}

export type ExistingBillingSnap = {
  id: number
  planCode: string
  planName: string
  planListPriceEur: string
  planChargedPriceEur: string
  usageMode: string
  commercialStatus: string
  dwellingCount: number | null
  dwellingSource: string
  sizeSurchargeEur: string
  discountEur: string
  discountNote: string | null
  negotiatedTotalEur: string | null
  vatRatePct: string
  notes: string | null
  updatedAt: Date
  lines: ExistingLineSnap[]
}

export type ResolvedBillingLine = {
  moduleCode: string
  moduleName: string
  includedInPlan: boolean
  pricingMode: PricingMode
  listPriceEur: string
  chargedPriceEur: string
  sortOrder: number
}

export type ResolvedBillingWrite = {
  planCode: string
  planName: string
  planListPriceEur: string
  planChargedPriceEur: string
  usageMode: UsageMode
  commercialStatus: string
  dwellingCount: number | null
  dwellingSource: string
  sizeSurchargeEur: string
  discountEur: string
  discountNote: string | null
  negotiatedTotalEur: string | null
  vatRatePct: string
  notes: string | null
  lines: ResolvedBillingLine[]
}

export type ResolveErr = { ok: false; status: 400; error: string; message?: string }
export type ResolveOk = { ok: true; value: ResolvedBillingWrite }
export type ResolveResult = ResolveOk | ResolveErr

function includesList(plan: CatalogPlan): string[] {
  return Array.isArray(plan.includes) ? plan.includes.map(String) : []
}

/**
 * charged efectivo persistido según modo (included/free → 0).
 */
export function resolveLineCharged(
  mode: PricingMode,
  chargedFromInput: string | undefined,
  listPrice: string,
  existingCharged: string | undefined,
): string {
  if (mode === 'included' || mode === 'free') {
    return formatMoney(0)
  }
  if (chargedFromInput != null) return formatMoney(chargedFromInput)
  if (mode === 'catalog') {
    // Prefer existing snapshot, else list snapshot
    if (existingCharged != null) return formatMoney(existingCharged)
    return formatMoney(listPrice)
  }
  // custom must have been validated to include charged
  return formatMoney(chargedFromInput ?? 0)
}

export function resolveBillingWrite(input: {
  payload: PutBillingPayload
  plan: CatalogPlan | null
  modulesByCode: Map<string, CatalogModule>
  existing: ExistingBillingSnap | null
  /** Precios plan×usageMode desde DB (obligatorio en producción tras B7.2). */
  planPrices?: PlanPriceLookup | null
}): ResolveResult {
  const { payload, plan, modulesByCode, existing, planPrices } = input

  if (!plan || !plan.active) {
    return {
      ok: false,
      status: 400,
      error: 'Plan no válido o inactivo',
      message: `planCode desconocido o no activo: ${payload.planCode}`,
    }
  }

  if (!isPlanAllowedForUsageMode(plan.code, payload.usageMode)) {
    return {
      ok: false,
      status: 400,
      error: 'Plan no disponible para este usageMode',
      message:
        payload.usageMode === 'staff_only'
          ? 'En Solo conserjería usa: conserjeria | a_medida'
          : undefined,
    }
  }

  const existingLines = new Map((existing?.lines ?? []).map((l) => [l.moduleCode, l]))

  const modePrice = catalogPlanPriceForUsageMode(
    plan.code,
    payload.usageMode,
    plan.monthlyPriceEur,
    planPrices,
  )
  if (modePrice == null) {
    return {
      ok: false,
      status: 400,
      error: 'Precio de plan no disponible en catálogo',
      message: `Falta precio DB para ${plan.code} / ${payload.usageMode}`,
    }
  }

  // Plan snapshots
  let planListPriceEur: string
  if (payload.planListPriceEur != null) {
    planListPriceEur = formatMoney(payload.planListPriceEur)
  } else if (
    existing &&
    existing.planCode === plan.code &&
    existing.usageMode === payload.usageMode
  ) {
    planListPriceEur = formatMoney(existing.planListPriceEur)
  } else {
    planListPriceEur = formatMoney(modePrice)
  }

  let planChargedPriceEur: string
  if (payload.planChargedPriceEur != null) {
    planChargedPriceEur = formatMoney(payload.planChargedPriceEur)
  } else if (
    existing &&
    existing.planCode === plan.code &&
    existing.usageMode === payload.usageMode
  ) {
    planChargedPriceEur = formatMoney(existing.planChargedPriceEur)
  } else {
    planChargedPriceEur = formatMoney(modePrice)
  }

  const planName =
    existing && existing.planCode === plan.code ? existing.planName : plan.name

  const resolvedLines: ResolvedBillingLine[] = []

  for (const line of payload.lines) {
    const cat = modulesByCode.get(line.moduleCode)
    if (!cat || !cat.active) {
      return {
        ok: false,
        status: 400,
        error: `Módulo no válido o inactivo: ${line.moduleCode}`,
      }
    }
    const prev = existingLines.get(line.moduleCode)

    const moduleName = line.moduleName ?? prev?.moduleName ?? cat.name
    const listPriceEur = formatMoney(
      line.listPriceEur ?? prev?.listPriceEur ?? cat.listPriceEur,
    )
    const chargedPriceEur = resolveLineCharged(
      line.pricingMode,
      line.chargedPriceEur,
      listPriceEur,
      prev?.chargedPriceEur,
    )

    // Sanity: effectiveChargedForMode aligns
    const effective = formatMoney(effectiveChargedForMode(line.pricingMode, chargedPriceEur))

    resolvedLines.push({
      moduleCode: line.moduleCode,
      moduleName,
      includedInPlan: line.includedInPlan || line.pricingMode === 'included',
      pricingMode: line.pricingMode,
      listPriceEur,
      chargedPriceEur: effective,
      sortOrder: line.sortOrder || cat.sortOrder,
    })
  }

  // Plan includes must be present as included/free.
  // Re-save mismo plan+usageMode: exigir includes del CONTRATO (snapshot), no del catálogo vigente.
  // Alta o cambio de plan: exigir includes actuales del catálogo.
  const samePlanResave =
    Boolean(existing) &&
    existing!.planCode === plan.code &&
    existing!.usageMode === payload.usageMode

  const mustInclude = samePlanResave
    ? existing!.lines
        .filter((l) => l.includedInPlan || l.pricingMode === 'included')
        .map((l) => l.moduleCode)
    : includesList(plan)
  const byCode = new Map(resolvedLines.map((l) => [l.moduleCode, l]))
  for (const code of mustInclude) {
    const row = byCode.get(code)
    if (!row) {
      return {
        ok: false,
        status: 400,
        error: `Falta módulo incluido del plan: ${code}`,
        message: samePlanResave
          ? `El contrato conserva el módulo ${code} como incluido.`
          : `El plan ${plan.code} requiere la línea ${code} (included/free).`,
      }
    }
    if (!(row.includedInPlan || row.pricingMode === 'included' || row.pricingMode === 'free')) {
      return {
        ok: false,
        status: 400,
        error: `Módulo del plan debe ir incluido: ${code}`,
        message: `Usa pricingMode included (o free) para ${code} en plan ${plan.code}.`,
      }
    }
  }

  return {
    ok: true,
    value: {
      planCode: plan.code,
      planName,
      planListPriceEur,
      planChargedPriceEur,
      usageMode: payload.usageMode,
      commercialStatus: payload.commercialStatus,
      dwellingCount: payload.dwellingCount,
      dwellingSource: payload.dwellingSource,
      sizeSurchargeEur: payload.sizeSurchargeEur,
      discountEur: payload.discountEur,
      discountNote: payload.discountNote,
      negotiatedTotalEur: payload.negotiatedTotalEur,
      vatRatePct: payload.vatRatePct,
      notes: payload.notes,
      lines: resolvedLines,
    },
  }
}

/** Helper para armar líneas included de un plan (tests / seeds futuros). */
export function defaultIncludedLinesForPlan(
  plan: CatalogPlan,
  modulesByCode: Map<string, CatalogModule>,
): PutBillingLineInput[] {
  return includesList(plan).map((code, i) => {
    const m = modulesByCode.get(code)
    return {
      moduleCode: code,
      pricingMode: 'included' as const,
      includedInPlan: true,
      listPriceEur: m ? formatMoney(m.listPriceEur) : '0.00',
      chargedPriceEur: '0.00',
      moduleName: m?.name,
      sortOrder: m?.sortOrder ?? (i + 1) * 10,
    }
  })
}
