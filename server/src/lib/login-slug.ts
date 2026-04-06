const RESERVED = new Set([
  'admin',
  'api',
  'login',
  'register',
  'access',
  'static',
  'assets',
  'c',
  'completar-piso',
  'community-admin',
  'super-admin',
])

const MIN_LEN = 2
const MAX_LEN = 64

/**
 * Normaliza slug para URL: minúsculas, solo a-z 0-9 y guiones, sin repetir --.
 */
export function normalizeLoginSlugInput(raw: unknown): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') return ''
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/-+$/g, '')
  return s
}

export type ParseLoginSlugResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

/** Vacío → null (sin enlace corto). Texto → normalizar y validar. */
export function parseLoginSlugField(raw: unknown): ParseLoginSlugResult {
  const n = normalizeLoginSlugInput(raw)
  if (!n) return { ok: true, value: null }
  if (n.length < MIN_LEN) {
    return { ok: false, error: `El slug debe tener al menos ${MIN_LEN} caracteres (letras, números o guiones).` }
  }
  if (RESERVED.has(n)) {
    return { ok: false, error: 'Ese identificador está reservado; elige otro slug.' }
  }
  return { ok: true, value: n }
}
