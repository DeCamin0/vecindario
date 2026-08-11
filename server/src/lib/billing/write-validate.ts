/**
 * Validación pura del payload PUT billing (sin DB).
 */
import { Prisma } from '@prisma/client'
import { isKnownCommercialStatus, type CommercialStatus } from './commercial-status.js'
import { isKnownBillingModuleCode, BILLING_MODULE_CODES } from './module-flags.js'
import { formatMoney, money, roundMoney, type MoneyInput } from './money.js'
import type { PricingMode } from './compute-quote.js'
import {
  DEFAULT_USAGE_MODE,
  isKnownUsageMode,
  isPlanAllowedForUsageMode,
  type UsageMode,
} from './usage-mode.js'

export const DWELLING_SOURCES = ['manual', 'suggested_accepted', 'unknown'] as const
export type DwellingSource = (typeof DWELLING_SOURCES)[number]

export const PRICING_MODES: readonly PricingMode[] = ['catalog', 'included', 'free', 'custom']

export type PutBillingLineInput = {
  moduleCode: string
  pricingMode: PricingMode
  includedInPlan: boolean
  /** Snapshot explícito; si omitido se resuelve en write (existente → catálogo). */
  listPriceEur?: string
  chargedPriceEur?: string
  moduleName?: string
  sortOrder: number
}

export type PutBillingPayload = {
  planCode: string
  usageMode: UsageMode
  commercialStatus: CommercialStatus
  dwellingCount: number | null
  dwellingSource: DwellingSource
  sizeSurchargeEur: string
  discountEur: string
  discountNote: string | null
  negotiatedTotalEur: string | null
  vatRatePct: string
  notes: string | null
  /** Snapshot plan explícito (opcional). */
  planListPriceEur?: string
  planChargedPriceEur?: string
  /** ISO del updatedAt actual; obligatorio si ya existe contrato. */
  expectedUpdatedAt: string | null
  lines: PutBillingLineInput[]
}

export type ValidationOk = { ok: true; value: PutBillingPayload }
export type ValidationErr = { ok: false; status: 400; error: string; message?: string }
export type ValidationResult = ValidationOk | ValidationErr

const NOTES_MAX = 4000
const DISCOUNT_NOTE_MAX = 512
const DWELLING_MAX = 50_000

function err(error: string, message?: string): ValidationErr {
  return { ok: false, status: 400, error, message }
}

function parseMoneyField(
  raw: unknown,
  field: string,
  opts: { required: boolean; allowNull?: boolean },
): { ok: true; value: string | null } | ValidationErr {
  if (raw === undefined || raw === null || raw === '') {
    if (opts.allowNull) return { ok: true, value: null }
    if (!opts.required) return { ok: true, value: '0.00' }
    return err(`${field} es obligatorio`)
  }
  try {
    const d = roundMoney(raw as MoneyInput)
    if (d.isNegative()) return err(`${field} no puede ser negativo`)
    if (!d.isFinite()) return err(`${field} no válido`)
    return { ok: true, value: formatMoney(d) }
  } catch {
    return err(`${field} no es un importe válido`)
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Parsea y valida el body del PUT. No toca DB ni Community.
 */
export function parsePutBillingPayload(body: unknown): ValidationResult {
  if (!isPlainObject(body)) {
    return err('Body JSON inválido')
  }

  const planCode = typeof body.planCode === 'string' ? body.planCode.trim() : ''
  if (!planCode) return err('planCode es obligatorio')

  const usageModeRaw =
    typeof body.usageMode === 'string' ? body.usageMode.trim() : DEFAULT_USAGE_MODE
  if (!isKnownUsageMode(usageModeRaw)) {
    return err(
      'usageMode no válido',
      'Usa: neighbors_and_staff | staff_only',
    )
  }
  if (!isPlanAllowedForUsageMode(planCode, usageModeRaw)) {
    return err(
      'Plan no disponible para este usageMode',
      usageModeRaw === 'staff_only'
        ? 'En Solo conserjería usa: conserjeria | a_medida'
        : 'Plan no permitido para neighbors_and_staff',
    )
  }

  const commercialStatusRaw =
    typeof body.commercialStatus === 'string' ? body.commercialStatus.trim() : ''
  if (!isKnownCommercialStatus(commercialStatusRaw)) {
    return err(
      'commercialStatus no válido',
      `Usa uno de: billable, demo, courtesy, promo, legacy, non_billable`,
    )
  }

  let dwellingCount: number | null = null
  if (body.dwellingCount !== undefined && body.dwellingCount !== null && body.dwellingCount !== '') {
    const n = Number(body.dwellingCount)
    if (!Number.isInteger(n) || n < 0 || n > DWELLING_MAX) {
      return err('dwellingCount no válido', `Entero entre 0 y ${DWELLING_MAX}, o null`)
    }
    dwellingCount = n
  }

  const dwellingSourceRaw =
    typeof body.dwellingSource === 'string' ? body.dwellingSource.trim() : 'unknown'
  if (!(DWELLING_SOURCES as readonly string[]).includes(dwellingSourceRaw)) {
    return err('dwellingSource no válido', `Usa: ${DWELLING_SOURCES.join(', ')}`)
  }

  const sizeP = parseMoneyField(body.sizeSurchargeEur, 'sizeSurchargeEur', { required: false })
  if (!sizeP.ok) return sizeP
  const discountP = parseMoneyField(body.discountEur, 'discountEur', { required: false })
  if (!discountP.ok) return discountP
  const negotiatedP = parseMoneyField(body.negotiatedTotalEur, 'negotiatedTotalEur', {
    required: false,
    allowNull: true,
  })
  if (!negotiatedP.ok) return negotiatedP

  const vatRaw = body.vatRatePct === undefined || body.vatRatePct === null || body.vatRatePct === ''
    ? 21
    : body.vatRatePct
  let vatRatePct: string
  try {
    const vat = money(vatRaw as MoneyInput)
    if (!vat.isFinite() || vat.isNegative() || vat.greaterThan(100)) {
      return err('vatRatePct no válido', 'Debe estar entre 0 y 100')
    }
    vatRatePct = formatMoney(vat)
  } catch {
    return err('vatRatePct no válido')
  }

  let discountNote: string | null = null
  if (body.discountNote != null && body.discountNote !== '') {
    if (typeof body.discountNote !== 'string') return err('discountNote no válido')
    discountNote = body.discountNote.trim().slice(0, DISCOUNT_NOTE_MAX) || null
  }

  let notes: string | null = null
  if (body.notes != null && body.notes !== '') {
    if (typeof body.notes !== 'string') return err('notes no válido')
    if (body.notes.length > NOTES_MAX) {
      return err('notes demasiado largo', `Máximo ${NOTES_MAX} caracteres`)
    }
    notes = body.notes.trim() || null
  }

  let planListPriceEur: string | undefined
  if (body.planListPriceEur !== undefined && body.planListPriceEur !== null && body.planListPriceEur !== '') {
    const p = parseMoneyField(body.planListPriceEur, 'planListPriceEur', { required: true })
    if (!p.ok) return p
    planListPriceEur = p.value!
  }
  let planChargedPriceEur: string | undefined
  if (
    body.planChargedPriceEur !== undefined &&
    body.planChargedPriceEur !== null &&
    body.planChargedPriceEur !== ''
  ) {
    const p = parseMoneyField(body.planChargedPriceEur, 'planChargedPriceEur', { required: true })
    if (!p.ok) return p
    planChargedPriceEur = p.value!
  }

  let expectedUpdatedAt: string | null = null
  if (body.expectedUpdatedAt != null && body.expectedUpdatedAt !== '') {
    if (typeof body.expectedUpdatedAt !== 'string') return err('expectedUpdatedAt no válido')
    const t = Date.parse(body.expectedUpdatedAt)
    if (!Number.isFinite(t)) return err('expectedUpdatedAt no es una fecha ISO válida')
    expectedUpdatedAt = new Date(t).toISOString()
  }

  if (!Array.isArray(body.lines)) {
    return err('lines debe ser un array')
  }

  const lines: PutBillingLineInput[] = []
  const seen = new Set<string>()

  for (let i = 0; i < body.lines.length; i += 1) {
    const raw = body.lines[i]
    if (!isPlainObject(raw)) return err(`lines[${i}] inválido`)

    const moduleCode = typeof raw.moduleCode === 'string' ? raw.moduleCode.trim() : ''
    if (!moduleCode) return err(`lines[${i}].moduleCode es obligatorio`)
    if (moduleCode === 'special_delivery') {
      return err(
        'Entrega especial no es un módulo cobrable',
        'Va incluida en Paquetería (parcels); no envíes línea aparte.',
      )
    }
    if (!isKnownBillingModuleCode(moduleCode)) {
      return err(`Módulo no válido: ${moduleCode}`, `Códigos: ${BILLING_MODULE_CODES.join(', ')}`)
    }
    if (seen.has(moduleCode)) {
      return err(`Módulo duplicado: ${moduleCode}`)
    }
    seen.add(moduleCode)

    const pricingMode = typeof raw.pricingMode === 'string' ? raw.pricingMode.trim() : ''
    if (!(PRICING_MODES as readonly string[]).includes(pricingMode)) {
      return err(`lines[${i}].pricingMode no válido`, `Usa: ${PRICING_MODES.join(', ')}`)
    }
    const mode = pricingMode as PricingMode

    const includedInPlan =
      typeof raw.includedInPlan === 'boolean' ? raw.includedInPlan : mode === 'included'

    let listPriceEur: string | undefined
    if (raw.listPriceEur !== undefined && raw.listPriceEur !== null && raw.listPriceEur !== '') {
      const p = parseMoneyField(raw.listPriceEur, `lines[${i}].listPriceEur`, { required: true })
      if (!p.ok) return p
      listPriceEur = p.value!
    }

    let chargedPriceEur: string | undefined
    if (raw.chargedPriceEur !== undefined && raw.chargedPriceEur !== null && raw.chargedPriceEur !== '') {
      const p = parseMoneyField(raw.chargedPriceEur, `lines[${i}].chargedPriceEur`, {
        required: true,
      })
      if (!p.ok) return p
      chargedPriceEur = p.value!
    }

    if (mode === 'custom' && chargedPriceEur == null) {
      return err(`lines[${i}]: pricingMode custom requiere chargedPriceEur`)
    }

    const moduleName =
      typeof raw.moduleName === 'string' && raw.moduleName.trim()
        ? raw.moduleName.trim().slice(0, 128)
        : undefined

    let sortOrder = typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)
      ? Math.trunc(raw.sortOrder)
      : (i + 1) * 10
    if (sortOrder < 0 || sortOrder > 1_000_000) sortOrder = (i + 1) * 10

    lines.push({
      moduleCode,
      pricingMode: mode,
      includedInPlan,
      listPriceEur,
      chargedPriceEur,
      moduleName,
      sortOrder,
    })
  }

  return {
    ok: true,
    value: {
      planCode,
      usageMode: usageModeRaw,
      commercialStatus: commercialStatusRaw,
      dwellingCount,
      dwellingSource: dwellingSourceRaw as DwellingSource,
      sizeSurchargeEur: sizeP.value ?? '0.00',
      discountEur: discountP.value ?? '0.00',
      discountNote,
      negotiatedTotalEur: negotiatedP.value,
      vatRatePct,
      notes,
      planListPriceEur,
      planChargedPriceEur,
      expectedUpdatedAt,
      lines,
    },
  }
}

/** Comparación estable para idempotencia (sin timestamps). */
export function canonicalBillingFingerprint(input: {
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
  lines: Array<{
    moduleCode: string
    moduleName: string
    includedInPlan: boolean
    pricingMode: string
    listPriceEur: string
    chargedPriceEur: string
    sortOrder: number
  }>
}): string {
  const lines = [...input.lines]
    .map((l) => ({
      moduleCode: l.moduleCode,
      moduleName: l.moduleName,
      includedInPlan: l.includedInPlan,
      pricingMode: l.pricingMode,
      listPriceEur: formatMoney(l.listPriceEur),
      chargedPriceEur: formatMoney(l.chargedPriceEur),
      sortOrder: l.sortOrder,
    }))
    .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode))
  return JSON.stringify({
    planCode: input.planCode,
    planName: input.planName,
    planListPriceEur: formatMoney(input.planListPriceEur),
    planChargedPriceEur: formatMoney(input.planChargedPriceEur),
    usageMode: input.usageMode,
    commercialStatus: input.commercialStatus,
    dwellingCount: input.dwellingCount,
    dwellingSource: input.dwellingSource,
    sizeSurchargeEur: formatMoney(input.sizeSurchargeEur),
    discountEur: formatMoney(input.discountEur),
    discountNote: input.discountNote,
    negotiatedTotalEur:
      input.negotiatedTotalEur == null ? null : formatMoney(input.negotiatedTotalEur),
    vatRatePct: formatMoney(input.vatRatePct),
    notes: input.notes,
    lines,
  })
}

export function moneyToPrisma(value: string): Prisma.Decimal {
  return new Prisma.Decimal(formatMoney(value))
}
