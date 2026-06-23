/**
 * Configuración por portal: plantas (pisos) y puertas por planta (letras A–Z o números).
 * Misma semántica en API pública y PATCH admin.
 */

/** Piso para locales comerciales en planta baja (misma etiqueta en web y móvil). */
export const STREET_LOCALE_PISO = 'Bajo'

export type PortalDwellingEntryStored = {
  floors?: number
  doorsPerFloor?: number
  /** Última planta (ático): menos puertas que el resto. Opcional; si falta o iguala a doorsPerFloor, misma estructura en todas las plantas. */
  doorsTopFloor?: number
  doorScheme?: 'letters' | 'numbers'
  /** Locales en planta baja con nombre libre (ej. Farmacia). Opcional por portal. */
  streetLocales?: string[]
}

export type DwellingSelectOptions = {
  pisoOptions: string[]
  puertaOptions: string[]
  /** Si existe, las opciones de puerta dependen del piso elegido (claves "1"…"N" alineadas con pisoOptions). */
  puertaOptionsByPiso?: Record<string, string[]>
}

const MAX_FLOORS = 50
const MAX_DOORS = 26
const MAX_STREET_LOCALES = 20
const MAX_LOCALE_NAME_LEN = 64

/** Normaliza nombres de locales en bajo: sin vacíos, sin duplicados (case-insensitive), máx. 20. */
export function parseStreetLocales(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const name = item.trim().slice(0, MAX_LOCALE_NAME_LEN)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= MAX_STREET_LOCALES) break
  }
  return out
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function doorLabelsForCount(scheme: 'letters' | 'numbers', count: number): string[] {
  const c = clampInt(count, 1, MAX_DOORS)
  if (scheme === 'letters') {
    return Array.from({ length: c }, (_, i) => String.fromCharCode(65 + i))
  }
  return Array.from({ length: c }, (_, i) => String(i + 1))
}

/** Normaliza entrada de BD a array de longitud portalCount (huecos = {}). */
export function normalizePortalDwellingFromDb(raw: unknown, portalCount: number): PortalDwellingEntryStored[] {
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const out: PortalDwellingEntryStored[] = Array.from({ length: n }, () => ({}))
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < n; i += 1) {
    const o = raw[i]
    if (!o || typeof o !== 'object') continue
    const rec = o as Record<string, unknown>
    const floors = typeof rec.floors === 'number' ? rec.floors : Number.parseInt(String(rec.floors ?? ''), 10)
    const doorsPerFloor =
      typeof rec.doorsPerFloor === 'number'
        ? rec.doorsPerFloor
        : Number.parseInt(String(rec.doorsPerFloor ?? ''), 10)
    const doorsTopFloorRaw =
      typeof rec.doorsTopFloor === 'number'
        ? rec.doorsTopFloor
        : Number.parseInt(String(rec.doorsTopFloor ?? ''), 10)
    const schemeRaw = typeof rec.doorScheme === 'string' ? rec.doorScheme.trim().toLowerCase() : ''
    const doorScheme = schemeRaw === 'numbers' ? 'numbers' : schemeRaw === 'letters' ? 'letters' : undefined
    const streetLocales = parseStreetLocales(rec.streetLocales)
    if (!Number.isFinite(floors) || floors < 1 || !Number.isFinite(doorsPerFloor) || doorsPerFloor < 1) {
      if (streetLocales.length > 0) out[i] = { streetLocales }
      continue
    }
    const f = clampInt(floors, 1, MAX_FLOORS)
    const d = clampInt(doorsPerFloor, 1, MAX_DOORS)
    if (doorScheme === 'letters' && d > 26) continue
    if (doorScheme !== 'letters' && doorScheme !== 'numbers') continue
    const scheme: 'letters' | 'numbers' = doorScheme
    let doorsTopFloor: number | undefined
    if (
      f >= 2 &&
      Number.isFinite(doorsTopFloorRaw) &&
      doorsTopFloorRaw >= 1 &&
      doorsTopFloorRaw <= d
    ) {
      const dt = clampInt(doorsTopFloorRaw, 1, d)
      if (doorScheme === 'letters' && dt > 26) continue
      if (dt < d) doorsTopFloor = dt
    }
    const residential: PortalDwellingEntryStored =
      doorsTopFloor != null
        ? { floors: f, doorsPerFloor: d, doorsTopFloor, doorScheme: scheme }
        : { floors: f, doorsPerFloor: d, doorScheme: scheme }
    out[i] =
      streetLocales.length > 0 ? { ...residential, streetLocales } : residential
  }
  return out
}

/**
 * Valida y normaliza el array enviado por el cliente (Super Admin).
 * Cada índice sin datos válidos → {}.
 */
export function parsePortalDwellingConfig(raw: unknown, portalCount: number): PortalDwellingEntryStored[] {
  return normalizePortalDwellingFromDb(raw, portalCount)
}

/** Recorta o rellena con {} al cambiar portalCount. */
export function resizePortalDwellingConfig(
  prevRaw: unknown,
  prevCount: number,
  newCount: number,
): PortalDwellingEntryStored[] {
  const prev = normalizePortalDwellingFromDb(prevRaw, prevCount)
  const n = Math.min(999, Math.max(1, Number(newCount) || 1))
  const out: PortalDwellingEntryStored[] = Array.from({ length: n }, (_, i) => prev[i] ?? {})
  return out
}

function residentialDwellingSelectOptions(entry: PortalDwellingEntryStored): DwellingSelectOptions {
  const floors =
    typeof entry.floors === 'number' && entry.floors >= 1 ? clampInt(entry.floors, 1, MAX_FLOORS) : 0
  const doors =
    typeof entry.doorsPerFloor === 'number' && entry.doorsPerFloor >= 1
      ? clampInt(entry.doorsPerFloor, 1, MAX_DOORS)
      : 0
  const scheme = entry.doorScheme === 'letters' || entry.doorScheme === 'numbers' ? entry.doorScheme : null
  if (!floors || !doors || !scheme) return { pisoOptions: [], puertaOptions: [] }
  if (scheme === 'letters' && doors > 26) return { pisoOptions: [], puertaOptions: [] }

  const pisoOptions = Array.from({ length: floors }, (_, i) => String(i + 1))
  let dt: number | null =
    typeof entry.doorsTopFloor === 'number' && entry.doorsTopFloor >= 1
      ? clampInt(entry.doorsTopFloor, 1, doors)
      : null
  if (floors < 2) dt = null
  if (dt != null && dt >= doors) dt = null

  if (dt == null) {
    const puertaOptions = doorLabelsForCount(scheme, doors)
    return { pisoOptions, puertaOptions }
  }

  const puertaOptionsByPiso: Record<string, string[]> = {}
  for (let pi = 1; pi <= floors; pi += 1) {
    const isLast = pi === floors
    const n = isLast ? dt : doors
    puertaOptionsByPiso[String(pi)] = doorLabelsForCount(scheme, n)
  }
  const puertaOptions = doorLabelsForCount(scheme, doors)
  return { pisoOptions, puertaOptions, puertaOptionsByPiso }
}

export function dwellingSelectOptions(entry: PortalDwellingEntryStored): DwellingSelectOptions {
  const streetLocales = parseStreetLocales(entry.streetLocales)
  const residential = residentialDwellingSelectOptions(entry)

  if (streetLocales.length === 0) return residential

  const bajoKey = STREET_LOCALE_PISO
  const bajoBlock: Record<string, string[]> = { [bajoKey]: streetLocales }

  if (residential.pisoOptions.length === 0) {
    return {
      pisoOptions: [bajoKey],
      puertaOptions: streetLocales,
      puertaOptionsByPiso: bajoBlock,
    }
  }

  let byPiso = residential.puertaOptionsByPiso
  if (!byPiso) {
    byPiso = {}
    for (const piso of residential.pisoOptions) {
      byPiso[piso] = residential.puertaOptions
    }
  }

  return {
    pisoOptions: [bajoKey, ...residential.pisoOptions],
    puertaOptions: residential.puertaOptions,
    puertaOptionsByPiso: { ...bajoBlock, ...byPiso },
  }
}

export function buildDwellingByPortalIndex(
  portalCount: number,
  portalDwellingRaw: unknown,
): DwellingSelectOptions[] {
  const cfg = normalizePortalDwellingFromDb(portalDwellingRaw, portalCount)
  return cfg.map((e) => dwellingSelectOptions(e))
}

/**
 * Cada portal tiene plantas, puertas/planta y esquema (letras o números) — misma regla que selectores en app.
 */
export function isPortalDwellingFullyConfigured(raw: unknown, portalCount: number): boolean {
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const cfg = normalizePortalDwellingFromDb(raw, n)
  for (let i = 0; i < n; i += 1) {
    const opts = dwellingSelectOptions(cfg[i]!)
    if (opts.pisoOptions.length === 0 || opts.puertaOptions.length === 0) return false
  }
  return true
}

/**
 * Suma plantas × puertas por portal (viviendas teóricas) si la configuración de portales está completa.
 * No sustituye «Nº vecinos» en ficha; sirve de referencia cuando el cupo oficial no está indicado.
 */
export function estimateDwellingUnitsFromPortalConfig(raw: unknown, portalCount: number): number | null {
  if (!isPortalDwellingFullyConfigured(raw, portalCount)) return null
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const cfg = normalizePortalDwellingFromDb(raw, n)
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    const e = cfg[i]!
    const f = typeof e.floors === 'number' && e.floors >= 1 ? e.floors : 0
    const d = typeof e.doorsPerFloor === 'number' && e.doorsPerFloor >= 1 ? e.doorsPerFloor : 0
    if (!f || !d) continue
    const dt: number | null =
      typeof e.doorsTopFloor === 'number' && e.doorsTopFloor >= 1 ? clampInt(e.doorsTopFloor, 1, d) : null
    let residential = 0
    if (f < 2 || dt == null || dt >= d) {
      residential = f * d
    } else {
      residential = (f - 1) * d + dt
    }
    sum += residential + parseStreetLocales(e.streetLocales).length
  }
  return sum > 0 ? sum : null
}

function normDwellingPart(s: unknown): string {
  return String(s ?? '').trim()
}

/** Ordena pisos: «Bajo» (locales) primero, luego numéricos. */
export function compareDwellingPiso(a: string, b: string): number {
  const aa = normDwellingPart(a)
  const bb = normDwellingPart(b)
  const aBajo = aa.toLowerCase() === STREET_LOCALE_PISO.toLowerCase()
  const bBajo = bb.toLowerCase() === STREET_LOCALE_PISO.toLowerCase()
  if (aBajo && !bBajo) return -1
  if (!aBajo && bBajo) return 1
  return aa.localeCompare(bb, 'es', { numeric: true })
}

/** Orden lista vecinos: portal → piso (Bajo primero) → puerta → id. */
export function compareResidentsByDwelling(
  a: { portal?: string | null; piso?: string | null; puerta?: string | null; id?: number },
  b: { portal?: string | null; piso?: string | null; puerta?: string | null; id?: number },
): number {
  const c = normDwellingPart(a.portal).localeCompare(normDwellingPart(b.portal), 'es', { numeric: true })
  if (c) return c
  const c2 = compareDwellingPiso(normDwellingPart(a.piso), normDwellingPart(b.piso))
  if (c2) return c2
  const c3 = normDwellingPart(a.puerta).localeCompare(normDwellingPart(b.puerta), 'es', { numeric: true })
  if (c3) return c3
  return (a.id ?? 0) - (b.id ?? 0)
}
