/**
 * Helpers puros del editor de billing (form ↔ PUT payload).
 * No calcula cuotas: el preview/PUT del backend es la fuente de verdad.
 */

export const USAGE_MODES = [
  {
    value: 'neighbors_and_staff',
    label: 'Vecinos + conserjería',
    help: 'Acceso para residentes y personal de la comunidad.',
  },
  {
    value: 'staff_only',
    label: 'Solo conserjería',
    help: 'Uso operativo por conserjería/personal, sin orientar el servicio a residentes.',
  },
]

export const COMMERCIAL_STATUS_OPTIONS = [
  { value: 'billable', label: 'Facturable' },
  { value: 'demo', label: 'Demo' },
  { value: 'courtesy', label: 'Cortesía' },
  { value: 'promo', label: 'Promoción' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'non_billable', label: 'No facturable' },
]

export const MODULE_MODE_OPTIONS = [
  { value: 'not_contracted', label: 'No contratado' },
  { value: 'included', label: 'Incluido en plan' },
  { value: 'catalog', label: 'Precio catálogo' },
  { value: 'free', label: 'Gratis' },
  { value: 'custom', label: 'Precio personalizado' },
]

/** Espejo UI de planesAllowedForUsageMode (backend valida). */
export function plansAllowedForUsageMode(usageMode) {
  if (usageMode === 'staff_only') return ['conserjeria', 'a_medida']
  return ['comunidad', 'conserjeria', 'completo', 'a_medida']
}

export function isPlanAllowedForUsageMode(planCode, usageMode) {
  return plansAllowedForUsageMode(usageMode).includes(planCode)
}

/**
 * Includes forzados en UI:
 * - Contrato existente + mismo plan → líneas included del snapshot.
 * - Alta o cambio de plan → includes vigentes del catálogo.
 */
export function forcedIncludeCodes({ plan, billing, formPlanCode }) {
  const samePlan =
    Boolean(billing?.plan?.code) &&
    Boolean(formPlanCode) &&
    billing.plan.code === formPlanCode
  if (samePlan) {
    return (billing.lines || [])
      .filter((l) => l && (l.includedInPlan || l.pricingMode === 'included'))
      .map((l) => String(l.moduleCode))
  }
  return Array.isArray(plan?.includes) ? plan.includes.map(String) : []
}

export function emptyModuleState(catalogModules = []) {
  const out = {}
  for (const m of catalogModules) {
    if (!m?.code || m.code === 'special_delivery') continue
    out[m.code] = { mode: 'not_contracted', customPrice: '' }
  }
  return out
}

/**
 * Al cambiar de plan: fuerza includes → included; libera includes viejos a catalog
 * si seguían como included.
 */
export function applyPlanToModuleStates(prevModules, plan, catalogModules) {
  const includes = new Set(Array.isArray(plan?.includes) ? plan.includes.map(String) : [])
  const next = emptyModuleState(catalogModules)
  for (const code of Object.keys(next)) {
    const prev = prevModules?.[code]
    if (includes.has(code)) {
      next[code] = { mode: 'included', customPrice: prev?.customPrice || '' }
      continue
    }
    if (!prev) continue
    if (prev.mode === 'included') {
      next[code] = { mode: 'catalog', customPrice: prev.customPrice || '' }
    } else {
      next[code] = { mode: prev.mode, customPrice: prev.customPrice || '' }
    }
  }
  return next
}

export function createDefaultForm(catalog) {
  const modules = catalog?.modules || []
  const plans = (catalog?.plans || []).filter((p) => p.active !== false)
  const defaultPlan =
    plans.find((p) => p.code === 'a_medida') || plans[0] || { code: 'a_medida', includes: [] }
  const usageMode = 'neighbors_and_staff'
  return {
    usageMode,
    planCode: defaultPlan.code,
    commercialStatus: 'billable',
    dwellingCount: '',
    dwellingSource: 'unknown',
    sizeSurchargeEur: '0',
    discountEur: '0',
    discountNote: '',
    useNegotiated: false,
    negotiatedTotalEur: '',
    vatRatePct: '21',
    notes: '',
    modules: applyPlanToModuleStates({}, defaultPlan, modules),
  }
}

export function formFromBillingDetail(detail, catalog) {
  const base = createDefaultForm(catalog)
  const billing = detail?.billing
  if (!billing) return base

  const modules = emptyModuleState(catalog?.modules || [])
  for (const line of billing.lines || []) {
    if (!line?.moduleCode || !modules[line.moduleCode]) continue
    const mode = line.pricingMode === 'included' || line.includedInPlan ? 'included' : line.pricingMode
    modules[line.moduleCode] = {
      mode: ['included', 'catalog', 'free', 'custom'].includes(mode) ? mode : 'catalog',
      customPrice: mode === 'custom' ? String(line.chargedPriceEur ?? '') : '',
    }
  }

  return {
    usageMode: billing.usageMode || detail.usageMode || 'neighbors_and_staff',
    planCode: billing.plan?.code || base.planCode,
    commercialStatus: billing.commercialStatus || 'billable',
    dwellingCount: billing.dwellingCount == null ? '' : String(billing.dwellingCount),
    dwellingSource: billing.dwellingSource || 'unknown',
    sizeSurchargeEur: String(billing.sizeSurchargeEur ?? '0'),
    discountEur: String(billing.discountEur ?? '0'),
    discountNote: billing.discountNote || '',
    useNegotiated: billing.negotiatedTotalEur != null && billing.negotiatedTotalEur !== '',
    negotiatedTotalEur:
      billing.negotiatedTotalEur == null ? '' : String(billing.negotiatedTotalEur),
    vatRatePct: String(billing.vatRatePct ?? '21'),
    notes: billing.notes || '',
    modules,
  }
}

function moneyOrZero(raw) {
  const s = String(raw ?? '').trim().replace(',', '.')
  if (!s) return '0.00'
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n.toFixed(2)
}

/**
 * Formulario UI → body PUT/preview.
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function formToPutPayload(form, { expectedUpdatedAt = null, catalogModules = [] } = {}) {
  if (!form?.planCode) return { ok: false, error: 'Selecciona un plan' }
  if (!form.usageMode) return { ok: false, error: 'Selecciona el modo de uso' }
  if (!isPlanAllowedForUsageMode(form.planCode, form.usageMode)) {
    return {
      ok: false,
      error: 'Plan no disponible para este modo de uso',
    }
  }

  const sizeSurchargeEur = moneyOrZero(form.sizeSurchargeEur)
  if (sizeSurchargeEur == null) return { ok: false, error: 'Suplemento por tamaño no válido' }
  const discountEur = moneyOrZero(form.discountEur)
  if (discountEur == null) return { ok: false, error: 'Descuento no válido' }

  let vatRatePct = moneyOrZero(form.vatRatePct)
  if (vatRatePct == null) return { ok: false, error: 'IVA no válido' }
  const vatN = Number(vatRatePct)
  if (vatN < 0 || vatN > 100) return { ok: false, error: 'IVA debe estar entre 0 y 100' }

  let dwellingCount = null
  if (form.dwellingCount !== '' && form.dwellingCount != null) {
    const n = Number(form.dwellingCount)
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: 'Número de viviendas no válido' }
    }
    dwellingCount = n
  }

  let negotiatedTotalEur = null
  if (form.useNegotiated) {
    const neg = moneyOrZero(form.negotiatedTotalEur)
    if (neg == null) return { ok: false, error: 'Precio negociado no válido' }
    negotiatedTotalEur = neg
  }

  const catalogOrder = new Map(
    (catalogModules || []).map((m, i) => [m.code, m.sortOrder ?? (i + 1) * 10]),
  )

  const lines = []
  const mods = form.modules || {}
  for (const code of Object.keys(mods)) {
    const row = mods[code]
    if (!row || row.mode === 'not_contracted') continue
    const pricingMode = row.mode
    const line = {
      moduleCode: code,
      pricingMode,
      includedInPlan: pricingMode === 'included',
      sortOrder: catalogOrder.get(code) ?? lines.length * 10 + 10,
    }
    if (pricingMode === 'custom') {
      const charged = moneyOrZero(row.customPrice)
      if (charged == null) {
        return { ok: false, error: `Precio personalizado no válido (${code})` }
      }
      line.chargedPriceEur = charged
    }
    lines.push(line)
  }

  lines.sort((a, b) => a.sortOrder - b.sortOrder || a.moduleCode.localeCompare(b.moduleCode))

  return {
    ok: true,
    value: {
      planCode: form.planCode,
      usageMode: form.usageMode,
      commercialStatus: form.commercialStatus || 'billable',
      dwellingCount,
      dwellingSource: form.dwellingSource || (dwellingCount != null ? 'manual' : 'unknown'),
      sizeSurchargeEur,
      discountEur,
      discountNote: form.discountNote?.trim() ? form.discountNote.trim() : null,
      negotiatedTotalEur,
      vatRatePct,
      notes: form.notes?.trim() ? form.notes.trim() : null,
      expectedUpdatedAt,
      lines,
    },
  }
}

/** Snapshot estable para dirty-check (sin expectedUpdatedAt). */
export function formFingerprint(form) {
  const parsed = formToPutPayload(form, { expectedUpdatedAt: null })
  if (!parsed.ok) return JSON.stringify(form)
  const { expectedUpdatedAt: _e, ...rest } = parsed.value
  return JSON.stringify(rest)
}
