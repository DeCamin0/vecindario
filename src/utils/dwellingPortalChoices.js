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
 * @param {string[] | null | undefined} portalsList - vacío o null con un solo bloque en `dwellingByPortalIndex` → índice 0.
 * @param {unknown} dwellingByPortalIndex - respuesta API: array de { pisoOptions, puertaOptions, puertaOptionsByPiso? }
 * @param {string} [selectedPiso] - si hay puertaOptionsByPiso, filtra puertas para esa planta
 * @returns {{ pisoOptions: string[] | null, puertaOptions: string[] | null }}
 */
export function pisoPuertaChoicesForPortal(portalValue, portalsList, dwellingByPortalIndex, selectedPiso) {
  if (!Array.isArray(dwellingByPortalIndex) || dwellingByPortalIndex.length < 1) {
    return { pisoOptions: null, puertaOptions: null }
  }

  let idx = -1
  if (portalsList?.length) {
    const pv = String(portalValue ?? '').trim()
    idx = portalsList.indexOf(pv)
  } else if (dwellingByPortalIndex.length === 1) {
    /** Un solo portal sin lista de etiquetas (API `portals: null`): usar plantas/puertas del índice 0. */
    idx = 0
  }

  if (idx < 0) return { pisoOptions: null, puertaOptions: null }
  const block = dwellingByPortalIndex[idx]
  if (!block || typeof block !== 'object') return { pisoOptions: null, puertaOptions: null }
  const po = Array.isArray(block.pisoOptions)
    ? block.pisoOptions.filter((x) => typeof x === 'string' && String(x).trim())
    : []
  const pisoKey = normDwellPart(selectedPiso)
  const byPiso = block.puertaOptionsByPiso
  let pu = []
  if (byPiso && typeof byPiso === 'object' && pisoKey && Array.isArray(byPiso[pisoKey])) {
    pu = byPiso[pisoKey].filter((x) => typeof x === 'string' && String(x).trim())
  } else if (Array.isArray(block.puertaOptions)) {
    pu = block.puertaOptions.filter((x) => typeof x === 'string' && String(x).trim())
  }
  return {
    pisoOptions: po.length > 0 ? po : null,
    puertaOptions: pu.length > 0 ? pu : null,
  }
}
