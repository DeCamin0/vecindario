/**
 * WRITE set completo de tramos de tamaño (catálogo).
 * Solo billing_catalog_size_tiers + billing_catalog_audits.
 * Nunca toca community_billing*.
 */
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { CatalogWriteError } from './catalog-write.js'
import { formatMoney, roundMoney, type MoneyInput } from './money.js'
import {
  mapDbSizeTierRows,
  sizeTiersFingerprint,
  validateSizeTiersCoverage,
  type SizeTierBand,
} from './size-surcharge.js'

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

function parseIntNonNeg(raw: unknown, field: string): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 0) return n
  }
  throw new CatalogWriteError(400, { error: `${field} debe ser un entero ≥ 0` })
}

export function parsePutSizeTiersPayload(body: unknown): SizeTierBand[] {
  if (!isPlainObject(body)) {
    throw new CatalogWriteError(400, { error: 'Body JSON inválido' })
  }
  for (const key of Object.keys(body)) {
    if (key !== 'tiers') {
      throw new CatalogWriteError(400, {
        error: `Campo no permitido: ${key}`,
        message: 'Solo tiers',
      })
    }
  }
  if (!Array.isArray(body.tiers)) {
    throw new CatalogWriteError(400, { error: 'tiers debe ser un array' })
  }

  const parsed: Array<{ fromUnits: number; toUnits: number | null; surchargeEur: string }> = []
  for (let i = 0; i < body.tiers.length; i += 1) {
    const raw = body.tiers[i]
    if (!isPlainObject(raw)) {
      throw new CatalogWriteError(400, { error: `tiers[${i}] inválido` })
    }
    for (const k of Object.keys(raw)) {
      if (!['fromUnits', 'toUnits', 'surchargeEur'].includes(k)) {
        throw new CatalogWriteError(400, { error: `tiers[${i}].${k} no permitido` })
      }
    }
    const fromUnits = parseIntNonNeg(raw.fromUnits, `tiers[${i}].fromUnits`)
    let toUnits: number | null = null
    if (raw.toUnits !== null && raw.toUnits !== undefined && raw.toUnits !== '') {
      toUnits = parseIntNonNeg(raw.toUnits, `tiers[${i}].toUnits`)
    } else if (raw.toUnits === undefined) {
      throw new CatalogWriteError(400, {
        error: `tiers[${i}].toUnits es obligatorio (usar null para infinito)`,
      })
    }
    const surchargeEur = parseMoneyNonNeg(raw.surchargeEur, `tiers[${i}].surchargeEur`)
    parsed.push({ fromUnits, toUnits, surchargeEur })
  }

  const validated = validateSizeTiersCoverage(parsed)
  if (!validated.ok) {
    throw new CatalogWriteError(400, {
      error: 'Tramos inválidos',
      message: validated.errors.join('; '),
      errors: validated.errors,
    })
  }
  return validated.tiers
}

export async function loadActiveSizeTiers(
  client: { billingCatalogSizeTier: typeof prisma.billingCatalogSizeTier } = prisma,
): Promise<SizeTierBand[]> {
  const rows = await client.billingCatalogSizeTier.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { fromUnits: 'asc' }],
  })
  return mapDbSizeTierRows(rows)
}

/**
 * Reemplaza atómicamente el set completo de tramos.
 * Si el fingerprint no cambia → unchanged, sin audit.
 */
export async function putSizeTiers(opts: {
  actorUserId: number
  actorEmail: string
  body: unknown
}): Promise<{
  unchanged: boolean
  changed: number
  batchId: string | null
  tiers: SizeTierBand[]
}> {
  const next = parsePutSizeTiersPayload(opts.body)
  const batchId = randomUUID()

  return prisma.$transaction(async (tx) => {
    const existing = await tx.billingCatalogSizeTier.findMany({
      orderBy: [{ sortOrder: 'asc' }, { fromUnits: 'asc' }],
    })
    const beforeBands = mapDbSizeTierRows(existing)
    const beforeFp = sizeTiersFingerprint(beforeBands)
    const afterFp = sizeTiersFingerprint(next)
    if (beforeFp === afterFp) {
      return {
        unchanged: true,
        changed: 0,
        batchId: null,
        tiers: beforeBands,
      }
    }

    await tx.billingCatalogSizeTier.deleteMany({})
    for (let i = 0; i < next.length; i += 1) {
      const t = next[i]!
      await tx.billingCatalogSizeTier.create({
        data: {
          fromUnits: t.fromUnits,
          toUnits: t.toUnits,
          surchargeEur: new Prisma.Decimal(t.surchargeEur),
          sortOrder: (i + 1) * 10,
          active: true,
        },
      })
    }

    // Auditoría set completo + una fila por tramo del after (trazabilidad).
    await tx.billingCatalogAudit.create({
      data: {
        actorUserId: opts.actorUserId,
        actorEmail: opts.actorEmail,
        entityType: 'size_tiers',
        entityCode: 'global',
        usageMode: null,
        field: 'set',
        beforeValue: beforeFp.slice(0, 512),
        afterValue: afterFp.slice(0, 512),
        batchId,
      },
    })

    for (const t of next) {
      const code = `${t.fromUnits}-${t.toUnits ?? 'inf'}`
      const prev = beforeBands.find(
        (b) => b.fromUnits === t.fromUnits && b.toUnits === t.toUnits,
      )
      await tx.billingCatalogAudit.create({
        data: {
          actorUserId: opts.actorUserId,
          actorEmail: opts.actorEmail,
          entityType: 'size_tier',
          entityCode: code.slice(0, 64),
          usageMode: null,
          field: 'surchargeEur',
          beforeValue: prev ? prev.surchargeEur : '(missing)',
          afterValue: t.surchargeEur,
          batchId,
        },
      })
    }

    return {
      unchanged: false,
      changed: 1 + next.length,
      batchId,
      tiers: next,
    }
  })
}
