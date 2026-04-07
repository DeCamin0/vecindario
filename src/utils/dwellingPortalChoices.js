export function normDwellPart(s) {
  return String(s ?? '').trim()
}

/**
 * Puertas ya asignadas a otro vecino en el mismo portal+piso (alta / edición).
 * @param {Array<{ id: number, portal?: string|null, piso?: string|null, puerta?: string|null }>} residents
 * @param {number | null} excludeResidentId - en edición, el vecino actual no cuenta como «ocupación»
 * @returns {Set<string>}
 */
export function occupiedPuertasForUnit(residents, portal, piso, excludeResidentId) {
  const p = normDwellPart(portal)
  const pi = normDwellPart(piso)
  const out = new Set()
  if (!p || !pi || !Array.isArray(residents)) return out
  for (const r of residents) {
    if (excludeResidentId != null && r.id === excludeResidentId) continue
    if (normDwellPart(r.portal) === p && normDwellPart(r.piso) === pi) {
      const u = normDwellPart(r.puerta)
      if (u) out.add(u)
    }
  }
  return out
}

/**
 * Opciones de piso/puerta según portal seleccionado (índice en lista de portales de la comunidad).
 * @param {string} portalValue
 * @param {string[] | null} portalsList
 * @param {unknown} dwellingByPortalIndex - respuesta API: array de { pisoOptions, puertaOptions }
 * @returns {{ pisoOptions: string[] | null, puertaOptions: string[] | null }}
 */
export function pisoPuertaChoicesForPortal(portalValue, portalsList, dwellingByPortalIndex) {
  if (!portalsList?.length || !Array.isArray(dwellingByPortalIndex)) {
    return { pisoOptions: null, puertaOptions: null }
  }
  const pv = String(portalValue ?? '').trim()
  const idx = portalsList.indexOf(pv)
  if (idx < 0) return { pisoOptions: null, puertaOptions: null }
  const block = dwellingByPortalIndex[idx]
  if (!block || typeof block !== 'object') return { pisoOptions: null, puertaOptions: null }
  const po = Array.isArray(block.pisoOptions)
    ? block.pisoOptions.filter((x) => typeof x === 'string' && String(x).trim())
    : []
  const pu = Array.isArray(block.puertaOptions)
    ? block.puertaOptions.filter((x) => typeof x === 'string' && String(x).trim())
    : []
  return {
    pisoOptions: po.length > 0 ? po : null,
    puertaOptions: pu.length > 0 ? pu : null,
  }
}
