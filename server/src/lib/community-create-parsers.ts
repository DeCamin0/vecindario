/**
 * Parsers compartidos entre POST /api/admin/communities y POST /api/company/communities.
 */

export function parsePortalCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return 1
  if (n > 999) return 999
  return n
}

export function parseResidentSlots(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0) return null
  if (n > 999_999) return 999_999
  return n
}

export function parseBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === 1 || raw === '1') return true
  if (raw === 'false' || raw === 0 || raw === '0') return false
  return fallback
}

export function parsePadelCourtCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 50) return 50
  return n
}

export function parseSalonBookingMode(raw: unknown, fallback: 'slots' | 'day'): 'slots' | 'day' {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (s === 'day' || s === 'full_day' || s === 'fullday') return 'day'
  if (s === 'slots' || s === 'franjas' || s === 'hours') return 'slots'
  return fallback
}

export function parsePadelHoursField(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  if (n < 1) return 1
  if (n > 24) return 24
  return n
}

export function parsePadelMinAdvanceHours(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  if (n < 1) return 1
  if (n > 168) return 168
  return n
}

export function padelHHMMToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number.parseInt(m[1], 10)
  const mi = Number.parseInt(m[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return h * 60 + mi
}

export function parsePadelWallClock(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null) return fallback
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return fallback
  const h = Number.parseInt(m[1], 10)
  const mi = Number.parseInt(m[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return fallback
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

export function parsePlanExpiresOn(
  raw: unknown,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null }
  }
  const s = typeof raw === 'string' ? raw.trim().slice(0, 10) : ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) {
    return { ok: false, error: 'planExpiresOn: usa YYYY-MM-DD o déjalo vacío.' }
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const d = new Date(Date.UTC(y, mo - 1, da))
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) {
    return { ok: false, error: 'planExpiresOn: fecha no válida.' }
  }
  return { ok: true, value: d }
}

export function parsePresidentUnit(
  portalRaw: unknown,
  pisoRaw: unknown,
):
  | { ok: true; presidentPortal: string | null; presidentPiso: string | null }
  | { ok: false; error: string } {
  const portal =
    portalRaw === undefined || portalRaw === null || portalRaw === ''
      ? null
      : typeof portalRaw === 'string'
        ? portalRaw.trim().slice(0, 64) || null
        : null
  const piso =
    pisoRaw === undefined || pisoRaw === null || pisoRaw === ''
      ? null
      : typeof pisoRaw === 'string'
        ? pisoRaw.trim().slice(0, 64) || null
        : null
  if ((portal && !piso) || (!portal && piso)) {
    return {
      ok: false,
      error: 'Presidente por vivienda: indica portal y piso, o déjalos vacíos los dos.',
    }
  }
  return { ok: true, presidentPortal: portal, presidentPiso: piso }
}

export function parseBoardViceUnit(
  portalRaw: unknown,
  pisoRaw: unknown,
):
  | { ok: true; boardVicePortal: string | null; boardVicePiso: string | null }
  | { ok: false; error: string } {
  const portal =
    portalRaw === undefined || portalRaw === null || portalRaw === ''
      ? null
      : typeof portalRaw === 'string'
        ? portalRaw.trim().slice(0, 64) || null
        : null
  const piso =
    pisoRaw === undefined || pisoRaw === null || pisoRaw === ''
      ? null
      : typeof pisoRaw === 'string'
        ? pisoRaw.trim().slice(0, 64) || null
        : null
  if ((portal && !piso) || (!portal && piso)) {
    return {
      ok: false,
      error: 'Vicepresidente (junta): indica portal y piso, o déjalos vacíos los dos.',
    }
  }
  return { ok: true, boardVicePortal: portal, boardVicePiso: piso }
}

export function parseNifCif(raw: unknown): { value: string | null; tooLong: boolean } {
  if (raw === undefined || raw === null) return { value: null, tooLong: false }
  if (typeof raw !== 'string') return { value: null, tooLong: false }
  const t = raw.trim()
  if (!t) return { value: null, tooLong: false }
  if (t.length > 32) return { value: null, tooLong: true }
  return { value: t, tooLong: false }
}

export function parseCommunityAddress(raw: unknown): { value: string | null; tooLong: boolean } {
  if (raw === undefined || raw === null) return { value: null, tooLong: false }
  if (typeof raw !== 'string') return { value: null, tooLong: false }
  const t = raw.trim()
  if (!t) return { value: null, tooLong: false }
  if (t.length > 512) return { value: null, tooLong: true }
  return { value: t, tooLong: false }
}
