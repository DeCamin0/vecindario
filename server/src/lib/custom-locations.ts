import { randomBytes } from 'node:crypto'

export type CustomLocationItem = {
  id: string
  name: string
  /** null = sin límite (ventana amplia); omitido en legacy = default cliente (14 días). */
  maxDaysInAdvance?: number | null
}

const MAX_ITEMS = 30
const MAX_NAME_LEN = 120
const MAX_ADVANCE_DAYS = 365

function parseMaxDaysInAdvance(raw: unknown): number | null | undefined {
  if (raw === null) return null
  if (raw === undefined || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(MAX_ADVANCE_DAYS, Math.trunc(n))
}

function slugId(s: string): string {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 48)
  return t || `loc-${randomBytes(3).toString('hex')}`
}

/** Valida y normaliza lista desde el cliente (crear / editar comunidad). */
export function parseCustomLocations(raw: unknown): CustomLocationItem[] {
  if (!Array.isArray(raw)) return []
  const out: CustomLocationItem[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as { id?: unknown; name?: unknown; maxDaysInAdvance?: unknown }
    const name =
      typeof o.name === 'string' ? o.name.trim().slice(0, MAX_NAME_LEN) : ''
    if (!name) continue

    let id = typeof o.id === 'string' ? o.id.trim().slice(0, 64) : ''
    if (!id || !/^[_a-z0-9-]+$/i.test(id)) {
      id = slugId(name)
    }
    let uniqueId = id
    let n = 0
    while (seen.has(uniqueId)) {
      n += 1
      uniqueId = `${id}-${n}`
    }
    seen.add(uniqueId)
    const maxDays = parseMaxDaysInAdvance(o.maxDaysInAdvance)
    const entry: CustomLocationItem = { id: uniqueId, name }
    if (maxDays === null) entry.maxDaysInAdvance = null
    else if (maxDays !== undefined) entry.maxDaysInAdvance = maxDays
    out.push(entry)
    if (out.length >= MAX_ITEMS) break
  }

  return out
}
