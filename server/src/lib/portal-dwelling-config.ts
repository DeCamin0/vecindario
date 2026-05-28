/**
 * Configuración por portal: plantas (pisos) y puertas por planta (letras A–Z o números).
 * Misma semántica en API pública y PATCH admin.
 */

export type PortalDwellingEntryStored = {
  floors?: number
  doorsPerFloor?: number
  /** Última planta (ático): menos puertas que el resto. Opcional; si falta o iguala a doorsPerFloor, misma estructura en todas las plantas. */
  doorsTopFloor?: number
  doorScheme?: 'letters' | 'numbers'
}

export type DwellingSelectOptions = {
  pisoOptions: string[]
  puertaOptions: string[]
  /** Si existe, las opciones de puerta dependen del piso elegido (claves "1"…"N" alineadas con pisoOptions). */
  puertaOptionsByPiso?: Record<string, string[]>
}

const MAX_FLOORS = 50
const MAX_DOORS = 26

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
    if (!Number.isFinite(floors) || floors < 1 || !Number.isFinite(doorsPerFloor) || doorsPerFloor < 1) continue
    const f = clampInt(floors, 1, MAX_FLOORS)
    const d = clampInt(doorsPerFloor, 1, MAX_DOORS)
    if (doorScheme === 'letters' && d > 26) continue
    if (doorScheme !== 'letters' && doorScheme !== 'numbers') continue
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
    out[i] = doorsTopFloor != null ? { floors: f, doorsPerFloor: d, doorsTopFloor, doorScheme } : { floors: f, doorsPerFloor: d, doorScheme }
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

export function dwellingSelectOptions(entry: PortalDwellingEntryStored): DwellingSelectOptions {
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
    if (f < 2 || dt == null || dt >= d) {
      sum += f * d
      continue
    }
    sum += (f - 1) * d + dt
  }
  return sum > 0 ? sum : null
}
