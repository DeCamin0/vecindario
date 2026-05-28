import { normEmail } from './community-user-access.js'

export const MAX_CONCIERGES = 5

export type ConciergeEntry = { email: string; name: string | null }

export type ConciergeEmailFields = {
  conciergeEmail?: string | null
  conciergeEmail2?: string | null
  conciergeSubstituteEmail?: string | null
  conciergeSubstituteName?: string | null
  conciergeEmailsJson?: unknown
}

export function parseOptionalStaffLabel(raw: unknown): string | null {
  if (raw == null) return null
  const t = String(raw).trim().slice(0, 255)
  return t || null
}

function pushEntry(
  out: ConciergeEntry[],
  seen: Set<string>,
  emailRaw: unknown,
  nameRaw?: unknown,
): void {
  if (typeof emailRaw !== 'string') return
  const n = normEmail(emailRaw)
  if (!n || seen.has(n) || out.length >= MAX_CONCIERGES) return
  seen.add(n)
  out.push({ email: emailRaw.trim(), name: parseOptionalStaffLabel(nameRaw) })
}

/** Lista principal (1–5), sin suplente. */
export function parseConciergeEntries(c: ConciergeEmailFields): ConciergeEntry[] {
  const seen = new Set<string>()
  const out: ConciergeEntry[] = []

  if (Array.isArray(c.conciergeEmailsJson)) {
    for (const item of c.conciergeEmailsJson) {
      if (typeof item === 'string') {
        pushEntry(out, seen, item)
        continue
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as Record<string, unknown>
        pushEntry(out, seen, o.email, o.name)
      }
    }
    if (out.length) return out
  }

  pushEntry(out, seen, c.conciergeEmail)
  pushEntry(out, seen, c.conciergeEmail2)
  return out
}

export function parseConciergeEmailsList(c: ConciergeEmailFields): string[] {
  return parseConciergeEntries(c).map((e) => e.email)
}

/** Todos los correos con acceso conserje (lista + suplente). */
export function listConciergeEmails(c: ConciergeEmailFields): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of parseConciergeEntries(c)) {
    const n = normEmail(e.email)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  const sub = normEmail(c.conciergeSubstituteEmail)
  if (sub && !seen.has(sub)) out.push(sub)
  return out
}

export function conciergeNameForEmail(
  c: ConciergeEmailFields,
  email: string | null | undefined,
): string | null {
  const e = normEmail(email)
  if (!e) return null
  const hit = parseConciergeEntries(c).find((x) => normEmail(x.email) === e)
  if (hit?.name) return hit.name
  if (normEmail(c.conciergeSubstituteEmail) === e) {
    return parseOptionalStaffLabel(c.conciergeSubstituteName)
  }
  return null
}

export function conciergeEmailMatches(
  c: ConciergeEmailFields,
  email: string | null | undefined,
): boolean {
  const e = normEmail(email)
  if (!e) return false
  return listConciergeEmails(c).includes(e)
}

export function formatConciergeEmailsDisplay(c: ConciergeEmailFields): string {
  const parts = parseConciergeEntries(c).map((e) =>
    e.name ? `${e.name} <${e.email}>` : e.email,
  )
  const sub = normEmail(c.conciergeSubstituteEmail)
  if (sub) {
    const sn = parseOptionalStaffLabel(c.conciergeSubstituteName)
    parts.push(sn ? `${sn} <${c.conciergeSubstituteEmail!.trim()}> (supl.)` : `${sub} (supl.)`)
  }
  return parts.length ? parts.join(', ') : '—'
}

/** Normaliza payload para guardar en BD. */
export function normalizeConciergeEmailsForDb(
  staffInput: unknown,
  substituteInput: unknown,
  substituteNameInput?: unknown,
): {
  conciergeEmailsJson: ConciergeEntry[]
  conciergeEmail: string | null
  conciergeEmail2: string | null
  conciergeSubstituteEmail: string | null
  conciergeSubstituteName: string | null
} {
  const seen = new Set<string>()
  const list: ConciergeEntry[] = []
  const rawList = Array.isArray(staffInput) ? staffInput : []

  for (const item of rawList) {
    if (typeof item === 'string') {
      pushEntry(list, seen, item)
      continue
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>
      pushEntry(list, seen, o.email, o.name)
    }
  }

  const subRaw = typeof substituteInput === 'string' ? substituteInput.trim() : ''
  const subNorm = normEmail(subRaw)
  let substitute: string | null = subRaw || null
  if (substitute && subNorm && list.some((x) => normEmail(x.email) === subNorm)) {
    substitute = null
  }

  const subName =
    substitute && substituteNameInput !== undefined
      ? parseOptionalStaffLabel(substituteNameInput)
      : null

  return {
    conciergeEmailsJson: list,
    conciergeEmail: list[0]?.email ?? null,
    conciergeEmail2: list[1]?.email ?? null,
    conciergeSubstituteEmail: substitute,
    conciergeSubstituteName: subName,
  }
}

export function parseConciergeEmailsFromBody(body: Record<string, unknown>): {
  ok: true
  staff: ConciergeEntry[]
  substitute: string | null | undefined
  substituteName: string | null | undefined
  invalidIndex?: never
} | {
  ok: false
  error: string
  invalidIndex?: number
} {
  const hasStaff =
    Object.prototype.hasOwnProperty.call(body, 'conciergeStaff') ||
    Object.prototype.hasOwnProperty.call(body, 'conciergeEmails')
  const hasSubstitute = Object.prototype.hasOwnProperty.call(body, 'conciergeSubstituteEmail')
  const hasSubstituteName = Object.prototype.hasOwnProperty.call(body, 'conciergeSubstituteName')

  if (!hasStaff && !hasSubstitute && !hasSubstituteName) {
    return { ok: false, error: 'Nada que actualizar' }
  }

  const staff: ConciergeEntry[] = []
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (hasStaff) {
    const raw = body.conciergeStaff ?? body.conciergeEmails
    if (!Array.isArray(raw)) {
      return { ok: false, error: 'conciergeStaff debe ser un array.' }
    }
    if (raw.length > MAX_CONCIERGES) {
      return { ok: false, error: `Máximo ${MAX_CONCIERGES} conserjes en la ficha.` }
    }
    const seen = new Set<string>()
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i]
      if (item === null || item === '') continue

      if (typeof item === 'string') {
        const t = item.trim()
        if (!t) continue
        if (!emailRe.test(t)) {
          return {
            ok: false,
            error: `El correo del conserje ${i + 1} no tiene formato válido.`,
            invalidIndex: i,
          }
        }
        const n = normEmail(t)
        if (!n || seen.has(n)) continue
        seen.add(n)
        staff.push({ email: t, name: null })
        continue
      }

      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as Record<string, unknown>
        const em = typeof o.email === 'string' ? o.email.trim() : ''
        if (!em) continue
        if (!emailRe.test(em)) {
          return {
            ok: false,
            error: `El correo del conserje ${i + 1} no tiene formato válido.`,
            invalidIndex: i,
          }
        }
        const n = normEmail(em)
        if (!n || seen.has(n)) continue
        seen.add(n)
        staff.push({ email: em, name: parseOptionalStaffLabel(o.name) })
      }
    }
  }

  let substitute: string | null | undefined = undefined
  if (hasSubstitute) {
    const s = body.conciergeSubstituteEmail
    if (s === null || s === '') substitute = null
    else if (typeof s === 'string') {
      const t = s.trim()
      if (t && !emailRe.test(t)) {
        return { ok: false, error: 'El email del conserje suplente no tiene formato válido.' }
      }
      substitute = t || null
    } else {
      return { ok: false, error: 'conciergeSubstituteEmail inválido.' }
    }
  }

  let substituteName: string | null | undefined = undefined
  if (hasSubstituteName) {
    const n = body.conciergeSubstituteName
    if (n === null || n === '') substituteName = null
    else if (typeof n === 'string') substituteName = parseOptionalStaffLabel(n)
    else return { ok: false, error: 'conciergeSubstituteName inválido.' }
  }

  return { ok: true, staff, substitute, substituteName }
}
