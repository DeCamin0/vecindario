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
  /**
   * Puertas distintas por planta (claves "1"…"N"). Si está completo para todas las plantas, tiene prioridad
   * sobre doorsPerFloor / doorsTopFloor. Compatible con comunidades ya configuradas sin este campo.
   */
  doorsPerFloorByPiso?: Record<string, number>
  doorScheme?: 'letters' | 'numbers'
  /** Locales en planta baja con nombre libre (ej. Farmacia). Opcional por portal. */
  streetLocales?: string[]
  /** Si true, el bloque tiene viviendas en planta baja (Bajo/Bº) además de pisos 1, 2, 3… */
  residentialGroundFloor?: boolean
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

function parseResidentialGroundFloor(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === '1' || raw === 'true'
}

function mergePuertaLists(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const p of list) {
      const t = String(p).trim()
      if (!t) continue
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
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

/** Mapa planta → puertas; null si falta alguna planta o hay valores inválidos. 0 = planta sin viviendas. */
function parseDoorsPerFloorByPiso(
  raw: unknown,
  floors: number,
  scheme: 'letters' | 'numbers',
): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || floors < 1) return null
  const rec = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  for (let pi = 1; pi <= floors; pi += 1) {
    const key = String(pi)
    const v = rec[key] ?? rec[pi as unknown as string]
    const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
    if (!Number.isFinite(n) || n < 0) return null
    const c = clampInt(n, 0, MAX_DOORS)
    if (scheme === 'letters' && c > 26) return null
    out[key] = c
  }
  return out
}

function parseBajoDoorsFromMap(
  raw: unknown,
  scheme: 'letters' | 'numbers',
): number | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const v = rec[STREET_LOCALE_PISO] ?? rec.Bajo ?? rec.bajo
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return null
  const c = clampInt(n, 1, MAX_DOORS)
  if (scheme === 'letters' && c > 26) return null
  return c
}

function sumDoorsPerFloorByPiso(
  map: Record<string, number>,
  floors: number,
  includeBajo: boolean,
): number {
  let sum = 0
  if (includeBajo) {
    const bajo = map[STREET_LOCALE_PISO]
    if (typeof bajo !== 'number' || bajo < 1) return 0
    sum += bajo
  }
  for (let pi = 1; pi <= floors; pi += 1) {
    const n = map[String(pi)]
    if (typeof n !== 'number' || n < 0) return 0
    if (n >= 1) sum += n
  }
  return sum
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
    const residentialGroundFloor = parseResidentialGroundFloor(rec.residentialGroundFloor)
    const floorsOnly =
      Number.isFinite(floors) && floors >= 1 && doorScheme && (!Number.isFinite(doorsPerFloor) || doorsPerFloor < 1)
    if (floorsOnly) {
      const fOnly = clampInt(floors, 1, MAX_FLOORS)
      const byPisoOnly = parseDoorsPerFloorByPiso(rec.doorsPerFloorByPiso, fOnly, doorScheme)
      if (byPisoOnly) {
        let maxDoors = Math.max(0, ...Object.values(byPisoOnly))
        if (residentialGroundFloor) {
          const bajo = parseBajoDoorsFromMap(rec.doorsPerFloorByPiso, doorScheme)
          if (bajo) maxDoors = Math.max(maxDoors, bajo)
        }
        if (maxDoors < 1) continue
        out[i] = {
          floors: fOnly,
          doorsPerFloor: maxDoors,
          doorsPerFloorByPiso: byPisoOnly,
          doorScheme,
          ...(streetLocales.length > 0 ? { streetLocales } : {}),
          ...(residentialGroundFloor ? { residentialGroundFloor: true } : {}),
        }
        continue
      }
    }
    if (!Number.isFinite(floors) || floors < 1 || !Number.isFinite(doorsPerFloor) || doorsPerFloor < 1) {
      if (streetLocales.length > 0 || residentialGroundFloor) {
        out[i] = {
          ...(streetLocales.length > 0 ? { streetLocales } : {}),
          ...(residentialGroundFloor ? { residentialGroundFloor: true } : {}),
        }
      }
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
    const byPiso = parseDoorsPerFloorByPiso(rec.doorsPerFloorByPiso, f, scheme)
    const residential: PortalDwellingEntryStored = byPiso
      ? { floors: f, doorsPerFloor: d, doorsPerFloorByPiso: byPiso, doorScheme: scheme }
      : doorsTopFloor != null
        ? { floors: f, doorsPerFloor: d, doorsTopFloor, doorScheme: scheme }
        : { floors: f, doorsPerFloor: d, doorScheme: scheme }
    const withGround = residentialGroundFloor ? { ...residential, residentialGroundFloor: true } : residential
    out[i] =
      streetLocales.length > 0 ? { ...withGround, streetLocales } : withGround
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
  const byPisoMap = parseDoorsPerFloorByPiso(entry.doorsPerFloorByPiso, floors, scheme)
  if (byPisoMap) {
    const puertaOptionsByPiso: Record<string, string[]> = {}
    let maxDoors = 0
    const activePisos: string[] = []
    for (let pi = 1; pi <= floors; pi += 1) {
      const n = byPisoMap[String(pi)]!
      if (n < 1) continue
      maxDoors = Math.max(maxDoors, n)
      activePisos.push(String(pi))
      puertaOptionsByPiso[String(pi)] = doorLabelsForCount(scheme, n)
    }
    let pisoOptions = activePisos
    if (entry.residentialGroundFloor) {
      const bajoCount =
        parseBajoDoorsFromMap(entry.doorsPerFloorByPiso, scheme) ??
        clampInt(doors, 1, MAX_DOORS)
      const bajoKey = STREET_LOCALE_PISO
      puertaOptionsByPiso[bajoKey] = doorLabelsForCount(scheme, bajoCount)
      maxDoors = Math.max(maxDoors, bajoCount)
      pisoOptions = [bajoKey, ...pisoOptions]
    }
    if (pisoOptions.length === 0 || maxDoors < 1) {
      return { pisoOptions: [], puertaOptions: [] }
    }
    return {
      pisoOptions,
      puertaOptions: doorLabelsForCount(scheme, maxDoors),
      puertaOptionsByPiso,
    }
  }

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

function applyResidentialGroundFloor(
  entry: PortalDwellingEntryStored,
  residential: DwellingSelectOptions,
): DwellingSelectOptions {
  if (!entry.residentialGroundFloor || residential.pisoOptions.length === 0) return residential

  const bajoKey = STREET_LOCALE_PISO
  if (residential.pisoOptions.includes(bajoKey)) return residential

  const doors =
    typeof entry.doorsPerFloor === 'number' && entry.doorsPerFloor >= 1
      ? clampInt(entry.doorsPerFloor, 1, MAX_DOORS)
      : 0
  const scheme = entry.doorScheme === 'letters' || entry.doorScheme === 'numbers' ? entry.doorScheme : null
  if (!doors || !scheme) return residential

  const bajoDoors = doorLabelsForCount(scheme, doors)
  let byPiso = residential.puertaOptionsByPiso
  if (!byPiso) {
    byPiso = {}
    for (const piso of residential.pisoOptions) {
      byPiso[piso] = residential.puertaOptions
    }
  }
  const mergedBajo = mergePuertaLists(byPiso[bajoKey] ?? [], bajoDoors)
  return {
    pisoOptions: residential.pisoOptions[0] === bajoKey
      ? residential.pisoOptions
      : [bajoKey, ...residential.pisoOptions],
    puertaOptions: residential.puertaOptions,
    puertaOptionsByPiso: { ...byPiso, [bajoKey]: mergedBajo },
  }
}

export function dwellingSelectOptions(entry: PortalDwellingEntryStored): DwellingSelectOptions {
  const streetLocales = parseStreetLocales(entry.streetLocales)
  const opts = applyResidentialGroundFloor(entry, residentialDwellingSelectOptions(entry))

  if (streetLocales.length === 0) return opts

  const bajoKey = STREET_LOCALE_PISO
  let byPiso = opts.puertaOptionsByPiso
  if (!byPiso) {
    byPiso = {}
    for (const piso of opts.pisoOptions) {
      byPiso[piso] = opts.puertaOptions
    }
  }
  const mergedBajo = mergePuertaLists(byPiso[bajoKey] ?? [], streetLocales)
  byPiso = { ...byPiso, [bajoKey]: mergedBajo }
  const pisoOptions = opts.pisoOptions.includes(bajoKey) ? opts.pisoOptions : [bajoKey, ...opts.pisoOptions]

  return {
    pisoOptions,
    puertaOptions: opts.puertaOptions,
    puertaOptionsByPiso: byPiso,
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
    const scheme = e.doorScheme === 'letters' || e.doorScheme === 'numbers' ? e.doorScheme : 'numbers'
    const byPiso = parseDoorsPerFloorByPiso(e.doorsPerFloorByPiso, f, scheme)
    let residential = 0
    if (byPiso) {
      residential = sumDoorsPerFloorByPiso(byPiso, f, false)
      if (e.residentialGroundFloor) {
        residential += parseBajoDoorsFromMap(e.doorsPerFloorByPiso, scheme) ?? d
      }
    } else {
      const dt: number | null =
        typeof e.doorsTopFloor === 'number' && e.doorsTopFloor >= 1 ? clampInt(e.doorsTopFloor, 1, d) : null
      if (f < 2 || dt == null || dt >= d) {
        residential = f * d
      } else {
        residential = (f - 1) * d + dt
      }
    }
    sum += residential + parseStreetLocales(e.streetLocales).length
    if (e.residentialGroundFloor && !byPiso) sum += d
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
