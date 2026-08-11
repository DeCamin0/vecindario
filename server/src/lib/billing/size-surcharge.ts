/**
 * Suplemento por tramo de viviendas contractuales (dwellingCount).
 *
 * Lookup desde catálogo global (billing_catalog_size_tiers).
 * FALLBACK_SIZE_TIERS solo para tests / vacío temporal — mismos defaults del seed.
 *
 * Nunca escribe community_billing: solo sugiere. Snapshot = sizeSurchargeEur del contrato.
 */
import { formatMoney } from './money.js'

export type SizeTierBand = {
  fromUnits: number
  toUnits: number | null
  surchargeEur: string
}

/** Defaults seed (0–100 / 101–200 / 201–300 / 301–∞). */
export const FALLBACK_SIZE_TIERS: SizeTierBand[] = [
  { fromUnits: 0, toUnits: 100, surchargeEur: '0.00' },
  { fromUnits: 101, toUnits: 200, surchargeEur: '15.00' },
  { fromUnits: 201, toUnits: 300, surchargeEur: '30.00' },
  { fromUnits: 301, toUnits: null, surchargeEur: '45.00' },
]

/** @deprecated Prefer tierLabel / matchedTier. Conservado por compat. */
export type SizeTier = 's' | 'm' | 'l' | 'xl' | 'unknown'

export type SizeSurchargeSuggestion = {
  /** Código legado aproximado (compat UI/tests). Preferir tierLabel. */
  tier: SizeTier
  dwellingCount: number | null
  matchedTier: SizeTierBand | null
  /** p.ej. "0–100", "301+". */
  tierLabel: string | null
  /** Sugerencia de tramo; null si unknown o sin match. */
  suggestedSurchargeEur: string | null
  /**
   * true si no hay viviendas válidas o no hay tramo coincidente en el catálogo.
   * Ya NO significa “301+ obligatorio manual”: 301+ es tramo normal configurable.
   */
  requiresManualSurcharge: boolean
}

export function formatSizeTierLabel(fromUnits: number, toUnits: number | null): string {
  if (toUnits == null) return `${fromUnits}+`
  return `${fromUnits}–${toUnits}`
}

export function mapDbSizeTierRows(
  rows: Array<{
    fromUnits: number
    toUnits: number | null
    surchargeEur: { toString(): string } | string
  }>,
): SizeTierBand[] {
  return rows.map((r) => ({
    fromUnits: r.fromUnits,
    toUnits: r.toUnits,
    surchargeEur: formatMoney(
      typeof r.surchargeEur === 'string' ? r.surchargeEur : r.surchargeEur.toString(),
    ),
  }))
}

function legacyTierCode(matched: SizeTierBand | null, dwellingCount: number | null): SizeTier {
  if (matched == null || dwellingCount == null) return 'unknown'
  if (matched.toUnits == null) return 'xl'
  if (matched.toUnits <= 100) return 's'
  if (matched.toUnits <= 200) return 'm'
  if (matched.toUnits <= 300) return 'l'
  return 'xl'
}

/**
 * Empareja dwellingCount con el primer tramo inclusivo [from, to] (to null = ∞).
 * @param tiers Catálogo activo; por defecto FALLBACK_SIZE_TIERS (tests).
 */
export function suggestSizeSurchargeEur(
  dwellingCount: number | null | undefined,
  tiers: SizeTierBand[] = FALLBACK_SIZE_TIERS,
): SizeSurchargeSuggestion {
  if (dwellingCount == null || !Number.isFinite(dwellingCount) || dwellingCount < 0) {
    return {
      tier: 'unknown',
      dwellingCount: null,
      matchedTier: null,
      tierLabel: null,
      suggestedSurchargeEur: null,
      requiresManualSurcharge: true,
    }
  }
  const n = Math.floor(dwellingCount)
  const matched =
    tiers.find(
      (t) => n >= t.fromUnits && (t.toUnits == null || n <= t.toUnits),
    ) ?? null

  if (!matched) {
    return {
      tier: 'unknown',
      dwellingCount: n,
      matchedTier: null,
      tierLabel: null,
      suggestedSurchargeEur: null,
      requiresManualSurcharge: true,
    }
  }

  return {
    tier: legacyTierCode(matched, n),
    dwellingCount: n,
    matchedTier: matched,
    tierLabel: formatSizeTierLabel(matched.fromUnits, matched.toUnits),
    suggestedSurchargeEur: formatMoney(matched.surchargeEur),
    requiresManualSurcharge: false,
  }
}

export type SizeTiersValidationOk = { ok: true; tiers: SizeTierBand[] }
export type SizeTiersValidationErr = { ok: false; errors: string[] }

/**
 * Valida set completo: inicio 0, continuo sin huecos/solapes, un infinito último, ≥1 tramo.
 */
export function validateSizeTiersCoverage(
  rawTiers: Array<{ fromUnits: number; toUnits: number | null; surchargeEur: string }>,
): SizeTiersValidationOk | SizeTiersValidationErr {
  const errors: string[] = []
  if (!Array.isArray(rawTiers) || rawTiers.length === 0) {
    return { ok: false, errors: ['Se requiere al menos un tramo'] }
  }

  const tiers = rawTiers.map((t) => ({
    fromUnits: t.fromUnits,
    toUnits: t.toUnits,
    surchargeEur: formatMoney(t.surchargeEur),
  }))

  for (let i = 0; i < tiers.length; i += 1) {
    const t = tiers[i]!
    if (!Number.isInteger(t.fromUnits) || t.fromUnits < 0) {
      errors.push(`Tramo ${i + 1}: fromUnits debe ser entero ≥ 0`)
    }
    if (t.toUnits != null) {
      if (!Number.isInteger(t.toUnits) || t.toUnits < 0) {
        errors.push(`Tramo ${i + 1}: toUnits debe ser entero ≥ 0 o null`)
      } else if (t.toUnits < t.fromUnits) {
        errors.push(`Tramo ${i + 1}: toUnits < fromUnits`)
      }
    }
    const surchargeNum = Number(t.surchargeEur)
    if (!Number.isFinite(surchargeNum) || surchargeNum < 0) {
      errors.push(`Tramo ${i + 1}: surchargeEur debe ser ≥ 0`)
    }
  }

  const sorted = [...tiers].sort((a, b) => a.fromUnits - b.fromUnits)
  if (sorted[0]!.fromUnits !== 0) {
    errors.push('El primer tramo debe empezar en fromUnits = 0')
  }

  const infiniteIdx = sorted.findIndex((t) => t.toUnits == null)
  const infiniteCount = sorted.filter((t) => t.toUnits == null).length
  if (infiniteCount !== 1) {
    errors.push('Debe existir exactamente un tramo infinito (toUnits = null)')
  } else if (infiniteIdx !== sorted.length - 1) {
    errors.push('El tramo infinito debe ser el último')
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i]!
    const next = sorted[i + 1]!
    if (cur.toUnits == null) {
      errors.push('Solo el último tramo puede ser infinito')
      break
    }
    if (next.fromUnits !== cur.toUnits + 1) {
      if (next.fromUnits <= cur.toUnits) {
        errors.push(
          `Solape entre ${formatSizeTierLabel(cur.fromUnits, cur.toUnits)} y ${formatSizeTierLabel(next.fromUnits, next.toUnits)}`,
        )
      } else {
        errors.push(
          `Hueco entre ${formatSizeTierLabel(cur.fromUnits, cur.toUnits)} y ${formatSizeTierLabel(next.fromUnits, next.toUnits)}`,
        )
      }
    }
  }

  const fromSeen = new Set<number>()
  for (const t of sorted) {
    if (fromSeen.has(t.fromUnits)) {
      errors.push(`fromUnits duplicado: ${t.fromUnits}`)
    }
    fromSeen.add(t.fromUnits)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, tiers: sorted }
}

/** Fingerprint compacto para auditoría (cabe en VARCHAR 512 con sets razonables). */
export function sizeTiersFingerprint(tiers: SizeTierBand[]): string {
  return tiers
    .map((t) => `${t.fromUnits}-${t.toUnits ?? 'inf'}:${formatMoney(t.surchargeEur)}`)
    .join('|')
}
