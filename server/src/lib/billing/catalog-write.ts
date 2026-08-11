/**
 * WRITE catálogo comercial (precios + includes de packs).
 * Solo tablas catalog + billing_catalog_audits.
 * Nunca toca community_billing*.
 */
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { formatMoney, money, roundMoney, type MoneyInput } from './money.js'
import { isKnownBillingModuleCode } from './module-flags.js'
import {
  isKnownUsageMode,
  isPlanAllowedForUsageMode,
  planCommercialKind,
  type UsageMode,
} from './usage-mode.js'

export class CatalogWriteError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : 'Catalog write error')
    this.status = status
    this.body = body
  }
}

type PlanPriceInput = {
  planCode: string
  usageMode: UsageMode
  monthlyPriceEur: string
}

type ModulePriceInput = {
  moduleCode: string
  listPriceEur: string
}

type PlanIncludesInput = {
  planCode: string
  includes: string[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function parseMoneyNonNeg(raw: unknown, field: string): string {
  if (raw === undefined || raw === null || raw === '') {
    throw new CatalogWriteError(400, { error: `${field} es obligatorio` })
  }
  try {
    const d = roundMoney(raw as MoneyInput)
    if (d.isNegative()) {
      throw new CatalogWriteError(400, { error: `${field} no puede ser negativo` })
    }
    if (!d.isFinite()) {
      throw new CatalogWriteError(400, { error: `${field} no válido` })
    }
    return formatMoney(d)
  } catch (e) {
    if (e instanceof CatalogWriteError) throw e
    throw new CatalogWriteError(400, { error: `${field} no es un importe válido` })
  }
}

/** Normaliza includes: únicos, ordenados, sin vacíos. */
export function normalizeIncludesCodes(codes: Iterable<string>): string[] {
  const set = new Set<string>()
  for (const raw of codes) {
    const c = String(raw ?? '').trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function includesFingerprint(codes: Iterable<string>): string {
  return JSON.stringify(normalizeIncludesCodes(codes))
}

function parseIncludesArray(raw: unknown, field: string): string[] {
  if (!Array.isArray(raw)) {
    throw new CatalogWriteError(400, { error: `${field} debe ser un array` })
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i += 1) {
    const code = typeof raw[i] === 'string' ? raw[i].trim() : ''
    if (!code) {
      throw new CatalogWriteError(400, { error: `${field}[${i}] vacío` })
    }
    if (code === 'special_delivery') {
      throw new CatalogWriteError(400, {
        error: 'special_delivery no es módulo comercial',
        message: 'Entrega especial va incluida en Paquetería (parcels).',
      })
    }
    if (!isKnownBillingModuleCode(code)) {
      throw new CatalogWriteError(400, { error: `Módulo no válido: ${code}` })
    }
    if (seen.has(code)) {
      throw new CatalogWriteError(400, { error: `Módulo duplicado en includes: ${code}` })
    }
    seen.add(code)
    out.push(code)
  }
  return normalizeIncludesCodes(out)
}

const ALLOWED_ROOT = new Set(['planPrices', 'modulePrices', 'planIncludes'])

export function parsePutCatalogPayload(body: unknown): {
  planPrices: PlanPriceInput[]
  modulePrices: ModulePriceInput[]
  planIncludes: PlanIncludesInput[]
} {
  if (!isPlainObject(body)) {
    throw new CatalogWriteError(400, { error: 'Body JSON inválido' })
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_ROOT.has(key)) {
      throw new CatalogWriteError(400, {
        error: `Campo no permitido: ${key}`,
        message: 'Solo planPrices | modulePrices | planIncludes',
      })
    }
  }

  const planPrices: PlanPriceInput[] = []
  const modulePrices: ModulePriceInput[] = []
  const planIncludes: PlanIncludesInput[] = []
  const seenPlan = new Set<string>()
  const seenMod = new Set<string>()
  const seenInc = new Set<string>()

  if (body.planPrices !== undefined) {
    if (!Array.isArray(body.planPrices)) {
      throw new CatalogWriteError(400, { error: 'planPrices debe ser un array' })
    }
    for (let i = 0; i < body.planPrices.length; i += 1) {
      const raw = body.planPrices[i]
      if (!isPlainObject(raw)) {
        throw new CatalogWriteError(400, { error: `planPrices[${i}] inválido` })
      }
      for (const k of Object.keys(raw)) {
        if (!['planCode', 'usageMode', 'monthlyPriceEur'].includes(k)) {
          throw new CatalogWriteError(400, { error: `planPrices[${i}].${k} no permitido` })
        }
      }
      const planCode = typeof raw.planCode === 'string' ? raw.planCode.trim() : ''
      const usageModeRaw = typeof raw.usageMode === 'string' ? raw.usageMode.trim() : ''
      if (!planCode) throw new CatalogWriteError(400, { error: `planPrices[${i}].planCode obligatorio` })
      if (!isKnownUsageMode(usageModeRaw)) {
        throw new CatalogWriteError(400, {
          error: `planPrices[${i}].usageMode no válido`,
          message: 'Usa: neighbors_and_staff | staff_only',
        })
      }
      if (!isPlanAllowedForUsageMode(planCode, usageModeRaw)) {
        throw new CatalogWriteError(400, {
          error: `Plan ${planCode} no disponible para ${usageModeRaw}`,
        })
      }
      const key = `${planCode}::${usageModeRaw}`
      if (seenPlan.has(key)) {
        throw new CatalogWriteError(400, { error: `planPrices duplicado: ${key}` })
      }
      seenPlan.add(key)
      planPrices.push({
        planCode,
        usageMode: usageModeRaw,
        monthlyPriceEur: parseMoneyNonNeg(raw.monthlyPriceEur, `planPrices[${i}].monthlyPriceEur`),
      })
    }
  }

  if (body.modulePrices !== undefined) {
    if (!Array.isArray(body.modulePrices)) {
      throw new CatalogWriteError(400, { error: 'modulePrices debe ser un array' })
    }
    for (let i = 0; i < body.modulePrices.length; i += 1) {
      const raw = body.modulePrices[i]
      if (!isPlainObject(raw)) {
        throw new CatalogWriteError(400, { error: `modulePrices[${i}] inválido` })
      }
      for (const k of Object.keys(raw)) {
        if (!['moduleCode', 'listPriceEur'].includes(k)) {
          throw new CatalogWriteError(400, { error: `modulePrices[${i}].${k} no permitido` })
        }
      }
      const moduleCode = typeof raw.moduleCode === 'string' ? raw.moduleCode.trim() : ''
      if (!moduleCode) {
        throw new CatalogWriteError(400, { error: `modulePrices[${i}].moduleCode obligatorio` })
      }
      if (moduleCode === 'special_delivery') {
        throw new CatalogWriteError(400, { error: 'special_delivery no es módulo comercial' })
      }
      if (seenMod.has(moduleCode)) {
        throw new CatalogWriteError(400, { error: `modulePrices duplicado: ${moduleCode}` })
      }
      seenMod.add(moduleCode)
      modulePrices.push({
        moduleCode,
        listPriceEur: parseMoneyNonNeg(raw.listPriceEur, `modulePrices[${i}].listPriceEur`),
      })
    }
  }

  if (body.planIncludes !== undefined) {
    if (!Array.isArray(body.planIncludes)) {
      throw new CatalogWriteError(400, { error: 'planIncludes debe ser un array' })
    }
    for (let i = 0; i < body.planIncludes.length; i += 1) {
      const raw = body.planIncludes[i]
      if (!isPlainObject(raw)) {
        throw new CatalogWriteError(400, { error: `planIncludes[${i}] inválido` })
      }
      for (const k of Object.keys(raw)) {
        if (!['planCode', 'includes'].includes(k)) {
          throw new CatalogWriteError(400, { error: `planIncludes[${i}].${k} no permitido` })
        }
      }
      const planCode = typeof raw.planCode === 'string' ? raw.planCode.trim() : ''
      if (!planCode) {
        throw new CatalogWriteError(400, { error: `planIncludes[${i}].planCode obligatorio` })
      }
      if (seenInc.has(planCode)) {
        throw new CatalogWriteError(400, { error: `planIncludes duplicado: ${planCode}` })
      }
      seenInc.add(planCode)

      if (planCommercialKind(planCode) === 'platform' || planCode === 'a_medida') {
        const includes = parseIncludesArray(raw.includes ?? [], `planIncludes[${i}].includes`)
        if (includes.length > 0) {
          throw new CatalogWriteError(400, {
            error: 'A medida no admite módulos incluidos',
            message: 'Los módulos se contratan por separado.',
          })
        }
        planIncludes.push({ planCode: 'a_medida', includes: [] })
        continue
      }

      const includes = parseIncludesArray(raw.includes, `planIncludes[${i}].includes`)
      planIncludes.push({ planCode, includes })
    }
  }

  if (planPrices.length === 0 && modulePrices.length === 0 && planIncludes.length === 0) {
    throw new CatalogWriteError(400, {
      error: 'Sin cambios',
      message: 'Envía planPrices, modulePrices y/o planIncludes',
    })
  }

  return { planPrices, modulePrices, planIncludes }
}

/** @deprecated alias B7.2 */
export const parsePutCatalogPricesPayload = parsePutCatalogPayload

export async function putCatalog(opts: {
  actorUserId: number
  actorEmail: string
  body: unknown
}): Promise<{
  unchanged: boolean
  changed: number
  batchId: string | null
}> {
  const parsed = parsePutCatalogPayload(opts.body)
  const batchId = randomUUID()

  return prisma.$transaction(async (tx) => {
    let changed = 0

    // Validar módulos de includes contra catálogo activo
    if (parsed.planIncludes.length > 0) {
      const activeMods = await tx.billingCatalogModule.findMany({
        where: { active: true },
        select: { code: true },
      })
      const activeSet = new Set(activeMods.map((m) => m.code))
      for (const row of parsed.planIncludes) {
        for (const code of row.includes) {
          if (!activeSet.has(code)) {
            throw new CatalogWriteError(400, {
              error: `Módulo inactivo o desconocido: ${code}`,
            })
          }
        }
        const plan = await tx.billingCatalogPlan.findUnique({ where: { code: row.planCode } })
        if (!plan) {
          throw new CatalogWriteError(400, { error: `Plan desconocido: ${row.planCode}` })
        }
      }
    }

    for (const row of parsed.planPrices) {
      const existing = await tx.billingCatalogPlanPrice.findUnique({
        where: {
          planCode_usageMode: { planCode: row.planCode, usageMode: row.usageMode },
        },
      })
      if (!existing) {
        const plan = await tx.billingCatalogPlan.findUnique({ where: { code: row.planCode } })
        if (!plan) {
          throw new CatalogWriteError(400, { error: `Plan desconocido: ${row.planCode}` })
        }
        await tx.billingCatalogPlanPrice.create({
          data: {
            planCode: row.planCode,
            usageMode: row.usageMode,
            monthlyPriceEur: new Prisma.Decimal(row.monthlyPriceEur),
          },
        })
        await tx.billingCatalogAudit.create({
          data: {
            actorUserId: opts.actorUserId,
            actorEmail: opts.actorEmail,
            entityType: 'plan_price',
            entityCode: row.planCode,
            usageMode: row.usageMode,
            field: 'monthlyPriceEur',
            beforeValue: '(missing)',
            afterValue: row.monthlyPriceEur,
            batchId,
          },
        })
        changed += 1
        if (row.usageMode === 'neighbors_and_staff') {
          await tx.billingCatalogPlan.update({
            where: { code: row.planCode },
            data: { monthlyPriceEur: new Prisma.Decimal(row.monthlyPriceEur) },
          })
        }
        continue
      }

      const before = formatMoney(existing.monthlyPriceEur.toString())
      if (before === row.monthlyPriceEur) continue

      await tx.billingCatalogPlanPrice.update({
        where: { id: existing.id },
        data: { monthlyPriceEur: new Prisma.Decimal(row.monthlyPriceEur) },
      })
      await tx.billingCatalogAudit.create({
        data: {
          actorUserId: opts.actorUserId,
          actorEmail: opts.actorEmail,
          entityType: 'plan_price',
          entityCode: row.planCode,
          usageMode: row.usageMode,
          field: 'monthlyPriceEur',
          beforeValue: before,
          afterValue: row.monthlyPriceEur,
          batchId,
        },
      })
      if (row.usageMode === 'neighbors_and_staff') {
        await tx.billingCatalogPlan.update({
          where: { code: row.planCode },
          data: { monthlyPriceEur: new Prisma.Decimal(row.monthlyPriceEur) },
        })
      }
      changed += 1
    }

    for (const row of parsed.modulePrices) {
      const existing = await tx.billingCatalogModule.findUnique({ where: { code: row.moduleCode } })
      if (!existing) {
        throw new CatalogWriteError(400, { error: `Módulo desconocido: ${row.moduleCode}` })
      }
      const before = formatMoney(existing.listPriceEur.toString())
      if (before === row.listPriceEur) continue

      await tx.billingCatalogModule.update({
        where: { code: row.moduleCode },
        data: { listPriceEur: new Prisma.Decimal(row.listPriceEur) },
      })
      await tx.billingCatalogAudit.create({
        data: {
          actorUserId: opts.actorUserId,
          actorEmail: opts.actorEmail,
          entityType: 'module_price',
          entityCode: row.moduleCode,
          usageMode: null,
          field: 'listPriceEur',
          beforeValue: before,
          afterValue: row.listPriceEur,
          batchId,
        },
      })
      changed += 1
    }

    for (const row of parsed.planIncludes) {
      const plan = await tx.billingCatalogPlan.findUnique({ where: { code: row.planCode } })
      if (!plan) {
        throw new CatalogWriteError(400, { error: `Plan desconocido: ${row.planCode}` })
      }
      const beforeCodes = Array.isArray(plan.includesJson)
        ? (plan.includesJson as unknown[]).map(String)
        : []
      const beforeFp = includesFingerprint(beforeCodes)
      const afterFp = includesFingerprint(row.includes)
      if (beforeFp === afterFp) continue

      await tx.billingCatalogPlan.update({
        where: { code: row.planCode },
        data: { includesJson: row.includes },
      })
      await tx.billingCatalogAudit.create({
        data: {
          actorUserId: opts.actorUserId,
          actorEmail: opts.actorEmail,
          entityType: 'plan_includes',
          entityCode: row.planCode,
          usageMode: null,
          field: 'includesJson',
          beforeValue: beforeFp,
          afterValue: afterFp,
          batchId,
        },
      })
      changed += 1
    }

    return {
      unchanged: changed === 0,
      changed,
      batchId: changed > 0 ? batchId : null,
    }
  })
}

/** @deprecated alias B7.2 */
export const putCatalogPrices = putCatalog

/** Helper test: money compare. */
export function moneyEquals(a: string, b: string): boolean {
  return money(a).equals(money(b))
}
