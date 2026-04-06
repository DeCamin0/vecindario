import { randomBytes } from 'node:crypto'

export type CustomLocationItem = { id: string; name: string }

const MAX_ITEMS = 30
const MAX_NAME_LEN = 120

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
    const o = item as { id?: unknown; name?: unknown }
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
    out.push({ id: uniqueId, name })
    if (out.length >= MAX_ITEMS) break
  }

  return out
}
