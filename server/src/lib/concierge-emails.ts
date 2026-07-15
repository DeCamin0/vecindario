import { normEmail } from './community-user-access.js'
import type { Prisma } from '@prisma/client'

/** Límite blando por lista (titulares o suplentes). */
export const MAX_CONCIERGES = 30
export const MAX_CONCIERGE_SUBSTITUTES = 30

export type ConciergeEntry = {
  email: string
  name: string | null
  /** Por defecto true si falta en JSON (compatibilidad). */
  active: boolean
}

export type ConciergeEmailFields = {
  conciergeEmail?: string | null
  conciergeEmail2?: string | null
  conciergeSubstituteEmail?: string | null
  conciergeSubstituteName?: string | null
  conciergeEmailsJson?: unknown
  conciergeSubstitutesJson?: unknown
}

/** Select Prisma mínimo para `conciergeEmailMatches` / listados. */
export const conciergeEmailPrismaSelect = {
  conciergeEmail: true,
  conciergeEmail2: true,
  conciergeSubstituteEmail: true,
  conciergeSubstituteName: true,
  conciergeEmailsJson: true,
  conciergeSubstitutesJson: true,
} as const

export function parseOptionalStaffLabel(raw: unknown): string | null {
  if (raw == null) return null
  const t = String(raw).trim().slice(0, 255)
  return t || null
}

export function isConciergeEntryActive(entry: Pick<ConciergeEntry, 'active'>): boolean {
  return entry.active !== false
}

function parseActiveField(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false
  return true
}

function entryFromObject(o: Record<string, unknown>): ConciergeEntry | null {
  const em = typeof o.email === 'string' ? o.email.trim() : ''
  if (!em) return null
  return {
    email: em,
    name: parseOptionalStaffLabel(o.name),
    active: parseActiveField(o.active),
  }
}

function pushEntry(
  out: ConciergeEntry[],
  seen: Set<string>,
  emailRaw: unknown,
  nameRaw?: unknown,
  activeRaw?: unknown,
  max = MAX_CONCIERGES,
): void {
  if (typeof emailRaw !== 'string') return
  const n = normEmail(emailRaw)
  if (!n || seen.has(n) || out.length >= max) return
  seen.add(n)
  out.push({
    email: emailRaw.trim(),
    name: parseOptionalStaffLabel(nameRaw),
    active: parseActiveField(activeRaw),
  })
}

function parseJsonEntryList(
  raw: unknown,
  max: number,
): ConciergeEntry[] {
  const seen = new Set<string>()
  const out: ConciergeEntry[] = []
  if (!Array.isArray(raw)) return out

  for (const item of raw) {
    if (typeof item === 'string') {
      pushEntry(out, seen, item, undefined, undefined, max)
      continue
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const parsed = entryFromObject(item as Record<string, unknown>)
      if (!parsed) continue
      const n = normEmail(parsed.email)
      if (!n || seen.has(n) || out.length >= max) continue
      seen.add(n)
      out.push(parsed)
    }
  }
  return out
}

/** Titulares (activos e inactivos). */
export function parseConciergeEntries(c: ConciergeEmailFields): ConciergeEntry[] {
  const fromJson = parseJsonEntryList(c.conciergeEmailsJson, MAX_CONCIERGES)
  if (fromJson.length) return fromJson

  const seen = new Set<string>()
  const out: ConciergeEntry[] = []
  pushEntry(out, seen, c.conciergeEmail, undefined, undefined, MAX_CONCIERGES)
  pushEntry(out, seen, c.conciergeEmail2, undefined, undefined, MAX_CONCIERGES)
  return out
}

/** Suplentes (activos e inactivos). */
export function parseConciergeSubstituteEntries(c: ConciergeEmailFields): ConciergeEntry[] {
  const fromJson = parseJsonEntryList(c.conciergeSubstitutesJson, MAX_CONCIERGE_SUBSTITUTES)
  if (fromJson.length) return fromJson

  const sub = typeof c.conciergeSubstituteEmail === 'string' ? c.conciergeSubstituteEmail.trim() : ''
  if (!sub) return []
  return [
    {
      email: sub,
      name: parseOptionalStaffLabel(c.conciergeSubstituteName),
      active: true,
    },
  ]
}

export function parseConciergeEmailsList(c: ConciergeEmailFields): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of [...parseConciergeEntries(c), ...parseConciergeSubstituteEntries(c)]) {
    const n = normEmail(e.email)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function activeEntries(c: ConciergeEmailFields): ConciergeEntry[] {
  return [...parseConciergeEntries(c), ...parseConciergeSubstituteEntries(c)].filter(
    isConciergeEntryActive,
  )
}

/** Correos con acceso conserje activo (login, permisos, alertas). */
export function listConciergeEmails(c: ConciergeEmailFields): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of activeEntries(c)) {
    const n = normEmail(e.email)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function conciergeNameForEmail(
  c: ConciergeEmailFields,
  email: string | null | undefined,
): string | null {
  const e = normEmail(email)
  if (!e) return null
  const hit = [...parseConciergeEntries(c), ...parseConciergeSubstituteEntries(c)].find(
    (x) => normEmail(x.email) === e,
  )
  return hit?.name ?? null
}

export function conciergeEmailMatches(
  c: ConciergeEmailFields,
  email: string | null | undefined,
): boolean {
  const e = normEmail(email)
  if (!e) return false
  return listConciergeEmails(c).includes(e)
}

/** En ficha pero desactivado (sin acceso). */
export function conciergeEmailListedInactive(
  c: ConciergeEmailFields,
  email: string | null | undefined,
): boolean {
  const e = normEmail(email)
  if (!e || conciergeEmailMatches(c, e)) return false
  return [...parseConciergeEntries(c), ...parseConciergeSubstituteEntries(c)].some(
    (x) => normEmail(x.email) === e && !isConciergeEntryActive(x),
  )
}

/** null si el correo no figura como conserje en la ficha. */
export function conciergeFichaActiveForEmail(
  c: ConciergeEmailFields,
  email: string | null | undefined,
): boolean | null {
  const e = normEmail(email)
  if (!e) return null
  const hit = [...parseConciergeEntries(c), ...parseConciergeSubstituteEntries(c)].find(
    (x) => normEmail(x.email) === e,
  )
  if (!hit) return null
  return isConciergeEntryActive(hit)
}

/** Actualiza active en titular o suplente; null si el correo no está en ficha conserje. */
export function setConciergeFichaActiveForEmail(
  c: ConciergeEmailFields,
  email: string | null | undefined,
  active: boolean,
): { staff: ConciergeEntry[]; substitutes: ConciergeEntry[] } | null {
  const e = normEmail(email)
  if (!e) return null
  let found = false
  const staff = parseConciergeEntries(c).map((entry) => {
    if (normEmail(entry.email) !== e) return entry
    found = true
    return { ...entry, active }
  })
  const substitutes = parseConciergeSubstituteEntries(c).map((entry) => {
    if (normEmail(entry.email) !== e) return entry
    found = true
    return { ...entry, active }
  })
  if (!found) return null
  return { staff, substitutes }
}

function formatEntryLabel(entry: ConciergeEntry, suffix = ''): string {
  const inactive = !isConciergeEntryActive(entry) ? ' (inactivo)' : ''
  const base = entry.name ? `${entry.name} <${entry.email}>` : entry.email
  return `${base}${suffix}${inactive}`
}

export function conciergeFichaSignature(c: ConciergeEmailFields): string {
  const staff = parseConciergeEntries(c).map((e) => ({
    e: normEmail(e.email),
    n: e.name,
    a: isConciergeEntryActive(e),
  }))
  const subs = parseConciergeSubstituteEntries(c).map((e) => ({
    e: normEmail(e.email),
    n: e.name,
    a: isConciergeEntryActive(e),
  }))
  return JSON.stringify({ staff, subs })
}

export function formatConciergeEmailsDisplay(c: ConciergeEmailFields): string {
  const parts = parseConciergeEntries(c).map((e) => formatEntryLabel(e))
  for (const e of parseConciergeSubstituteEntries(c)) {
    parts.push(formatEntryLabel(e, ' (supl.)'))
  }
  return parts.length ? parts.join(', ') : '—'
}

function entryForDb(entry: ConciergeEntry): Record<string, unknown> {
  const o: Record<string, unknown> = { email: entry.email }
  if (entry.name) o.name = entry.name
  if (!isConciergeEntryActive(entry)) o.active = false
  return o
}

function mirrorLegacySubstitute(substitutes: ConciergeEntry[]): {
  conciergeSubstituteEmail: string | null
  conciergeSubstituteName: string | null
} {
  const first = substitutes[0]
  if (!first) {
    return { conciergeSubstituteEmail: null, conciergeSubstituteName: null }
  }
  return {
    conciergeSubstituteEmail: first.email,
    conciergeSubstituteName: first.name,
  }
}

function dedupeSubstitutesAgainstStaff(
  staff: ConciergeEntry[],
  substitutes: ConciergeEntry[],
): ConciergeEntry[] {
  const staffNorms = new Set(staff.map((s) => normEmail(s.email)).filter(Boolean))
  return substitutes.filter((s) => {
    const n = normEmail(s.email)
    return n && !staffNorms.has(n)
  })
}

/** Normaliza payload para guardar en BD. */
export function normalizeConciergeEmailsForDb(
  staffInput: unknown,
  substitutesInput: unknown,
): {
  conciergeEmailsJson: Prisma.InputJsonValue
  conciergeSubstitutesJson: Prisma.InputJsonValue
  conciergeEmail: string | null
  conciergeEmail2: string | null
  conciergeSubstituteEmail: string | null
  conciergeSubstituteName: string | null
} {
  const staff = parseJsonEntryList(staffInput, MAX_CONCIERGES)
  let substitutes = parseJsonEntryList(substitutesInput, MAX_CONCIERGE_SUBSTITUTES)
  substitutes = dedupeSubstitutesAgainstStaff(staff, substitutes)
  const legacy = mirrorLegacySubstitute(substitutes)

  return {
    conciergeEmailsJson: staff.map(entryForDb) as Prisma.InputJsonValue,
    conciergeSubstitutesJson: substitutes.map(entryForDb) as Prisma.InputJsonValue,
    conciergeEmail: staff[0]?.email ?? null,
    conciergeEmail2: staff[1]?.email ?? null,
    conciergeSubstituteEmail: legacy.conciergeSubstituteEmail,
    conciergeSubstituteName: legacy.conciergeSubstituteName,
  }
}

function parseStaffArrayFromBody(
  raw: unknown,
  label: string,
  max: number,
):
  | { ok: true; entries: ConciergeEntry[] }
  | { ok: false; error: string; invalidIndex?: number } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${label} debe ser un array.` }
  }
  if (raw.length > max) {
    return { ok: false, error: `Máximo ${max} en ${label}.` }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const seen = new Set<string>()
  const entries: ConciergeEntry[] = []

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (item === null || item === '') continue

    if (typeof item === 'string') {
      const t = item.trim()
      if (!t) continue
      if (!emailRe.test(t)) {
        return {
          ok: false,
          error: `El correo ${i + 1} en ${label} no tiene formato válido.`,
          invalidIndex: i,
        }
      }
      const n = normEmail(t)
      if (!n || seen.has(n)) continue
      seen.add(n)
      entries.push({ email: t, name: null, active: true })
      continue
    }

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>
      const em = typeof o.email === 'string' ? o.email.trim() : ''
      if (!em) continue
      if (!emailRe.test(em)) {
        return {
          ok: false,
          error: `El correo ${i + 1} en ${label} no tiene formato válido.`,
          invalidIndex: i,
        }
      }
      const n = normEmail(em)
      if (!n || seen.has(n)) continue
      seen.add(n)
      entries.push({
        email: em,
        name: parseOptionalStaffLabel(o.name),
        active: parseActiveField(o.active),
      })
    }
  }

  return { ok: true, entries }
}

export function parseConciergeEmailsFromBody(body: Record<string, unknown>): {
  ok: true
  staff: ConciergeEntry[]
  substitutes: ConciergeEntry[]
  /** true si el body incluía datos de suplentes (array o legacy). */
  hasSubstitutesPayload: boolean
  invalidIndex?: never
} | {
  ok: false
  error: string
  invalidIndex?: number
} {
  const hasStaff =
    Object.prototype.hasOwnProperty.call(body, 'conciergeStaff') ||
    Object.prototype.hasOwnProperty.call(body, 'conciergeEmails')
  const hasSubstitutesArray = Object.prototype.hasOwnProperty.call(body, 'conciergeSubstitutes')
  const hasSubstitute = Object.prototype.hasOwnProperty.call(body, 'conciergeSubstituteEmail')
  const hasSubstituteName = Object.prototype.hasOwnProperty.call(body, 'conciergeSubstituteName')

  if (!hasStaff && !hasSubstitutesArray && !hasSubstitute && !hasSubstituteName) {
    return { ok: false, error: 'Nada que actualizar' }
  }

  let staff: ConciergeEntry[] = []
  if (hasStaff) {
    const raw = body.conciergeStaff ?? body.conciergeEmails
    const parsed = parseStaffArrayFromBody(raw, 'conciergeStaff', MAX_CONCIERGES)
    if (!parsed.ok) return parsed
    staff = parsed.entries
  }

  let substitutes: ConciergeEntry[] = []
  const hasSubstitutesPayload = hasSubstitutesArray || hasSubstitute || hasSubstituteName

  if (hasSubstitutesArray) {
    const parsed = parseStaffArrayFromBody(
      body.conciergeSubstitutes,
      'conciergeSubstitutes',
      MAX_CONCIERGE_SUBSTITUTES,
    )
    if (!parsed.ok) return parsed
    substitutes = parsed.entries
  } else if (hasSubstitute || hasSubstituteName) {
    const s = body.conciergeSubstituteEmail
    if (s === null || s === '') {
      substitutes = []
    } else if (typeof s === 'string') {
      const t = s.trim()
      if (t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
        return { ok: false, error: 'El email del conserje suplente no tiene formato válido.' }
      }
      if (t) {
        let subName: string | null = null
        if (hasSubstituteName) {
          const n = body.conciergeSubstituteName
          if (n === null || n === '') subName = null
          else if (typeof n === 'string') subName = parseOptionalStaffLabel(n)
          else return { ok: false, error: 'conciergeSubstituteName inválido.' }
        }
        substitutes = [{ email: t, name: subName, active: true }]
      }
    } else {
      return { ok: false, error: 'conciergeSubstituteEmail inválido.' }
    }
  }

  return { ok: true, staff, substitutes, hasSubstitutesPayload }
}
