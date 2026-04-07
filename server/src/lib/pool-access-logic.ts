import type { Community } from '@prisma/client'

export type CommunityPoolConfigSlice = Pick<
  Community,
  | 'poolAccessSystemEnabled'
  | 'poolSeasonActive'
  | 'poolSeasonStart'
  | 'poolSeasonEnd'
  | 'poolHoursNote'
>

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Piscina operativa para nuevos códigos / validación:
 * - interruptor maestro
 * - temporada activa (flag)
 * - si hay fechas inicio/fin, hoy (UTC date) debe estar en el rango inclusive
 */
export function isCommunityPoolOpen(comm: CommunityPoolConfigSlice): boolean {
  if (!comm.poolAccessSystemEnabled) return false
  if (!comm.poolSeasonActive) return false
  const start = comm.poolSeasonStart
  const end = comm.poolSeasonEnd
  if (start && end) {
    const today = startOfUtcDay(new Date())
    const s = startOfUtcDay(start)
    const e = startOfUtcDay(end)
    if (today < s || today > e) return false
  }
  return true
}

export function parseAccessCountLabel(raw: string | null | undefined): { display: string; numeric: number | null } {
  const t = (raw ?? '').trim()
  if (!t) return { display: '—', numeric: null }
  const n = Number.parseInt(t, 10)
  if (Number.isFinite(n) && String(n) === t) return { display: String(n), numeric: n }
  return { display: t, numeric: null }
}

export function buildPoolQrPayload(communityId: number, code: string): string {
  return `vecindario:pool:v1:${communityId}:${code}`
}

/** Ambos campos deben ser enteros en texto (ej. "4", "2"), como en la ficha del vecino. */
export function poolAccessQuotasComplete(
  poolAccessOwner: string | null | undefined,
  poolAccessGuest: string | null | undefined,
): boolean {
  const o = parseAccessCountLabel(poolAccessOwner)
  const g = parseAccessCountLabel(poolAccessGuest)
  return o.numeric !== null && g.numeric !== null
}

export const POOL_ACCESS_QUOTAS_INCOMPLETE_HINT_ES =
  'Para generar código, la administración debe completar en tu ficha los accesos de piscina (titular e invitados) como números enteros. Contacta con administración o conserjería.'

/** Máximo de personas que puede entrar en un solo registro (titular + invitados en ficha). */
export function maxAdmitForHousehold(
  ownerNumeric: number | null,
  guestNumeric: number | null,
): number | null {
  if (ownerNumeric === null || guestNumeric === null) return null
  const n = ownerNumeric + guestNumeric
  return n >= 1 ? n : null
}
