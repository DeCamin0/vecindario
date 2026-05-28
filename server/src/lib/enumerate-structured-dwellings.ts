import { buildDwellingByPortalIndex } from './portal-dwelling-config.js'
import { communityPortalSelectOptions } from './portal-labels.js'

export type StructuredDwellingUnit = { portal: string; piso: string; puerta: string }

function puertasForPiso(
  block: { pisoOptions?: string[]; puertaOptions?: string[]; puertaOptionsByPiso?: Record<string, string[]> },
  piso: string,
): string[] {
  const by = block.puertaOptionsByPiso
  const key = String(piso).trim()
  if (by && typeof by === 'object' && key && Array.isArray(by[key])) {
    return by[key]!.filter((x) => typeof x === 'string' && String(x).trim() !== '')
  }
  const flat = block.puertaOptions ?? []
  return flat.filter((x) => typeof x === 'string' && String(x).trim() !== '')
}

/**
 * Todas las combinaciones portal × piso × puerta definidas en la ficha (Super Admin).
 * Omite portales sin plantas/puertas configuradas. Si no hay lista de portales (texto libre), devuelve [].
 */
export function enumerateStructuredDwellings(
  portalCount: number,
  portalLabelsRaw: unknown,
  portalDwellingRaw: unknown,
): StructuredDwellingUnit[] {
  const portals = communityPortalSelectOptions(portalCount, portalLabelsRaw)
  if (!portals?.length) return []
  const byPortal = buildDwellingByPortalIndex(portalCount, portalDwellingRaw)
  const out: StructuredDwellingUnit[] = []
  for (let i = 0; i < portals.length; i += 1) {
    const block = byPortal[i]
    const pisoOpts = block?.pisoOptions ?? []
    if (!pisoOpts.length) continue
    const portalLabel = portals[i]
    for (const piso of pisoOpts) {
      const puertaOpts = puertasForPiso(block ?? {}, piso)
      if (!puertaOpts.length) continue
      for (const puerta of puertaOpts) {
        out.push({ portal: portalLabel, piso, puerta })
      }
    }
  }
  return out
}

export function dwellingTripletKey(portal: string, piso: string, puerta: string): string {
  return `${portal.trim()}\t${piso.trim()}\t${puerta.trim()}`
}
