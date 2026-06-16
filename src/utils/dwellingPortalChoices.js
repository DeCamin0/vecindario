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

/** Clave estable portal + piso + puerta (filtros, selects). */
export function dwellingUnitKey(portal, piso, puerta) {
  return `${normDwellPart(portal)}\t${normDwellPart(piso)}\t${normDwellPart(puerta)}`
}

/** Etiqueta legible: «Portal · Piso · Puerta». */
export function formatDwellingLabel(portal, piso, puerta) {
  return [normDwellPart(portal), normDwellPart(piso), normDwellPart(puerta)].filter(Boolean).join(' · ')
}

function enumerateDwellingBlock(portal, block, add) {
  if (!block || typeof block !== 'object') return
  const po = Array.isArray(block.pisoOptions)
    ? block.pisoOptions.filter((x) => typeof x === 'string' && String(x).trim())
    : []
  const byPiso = block.puertaOptionsByPiso
  if (byPiso && typeof byPiso === 'object') {
    for (const piso of po) {
      const pk = normDwellPart(piso)
      const puertas = Array.isArray(byPiso[pk])
        ? byPiso[pk]
        : Array.isArray(byPiso[piso])
          ? byPiso[piso]
          : []
      for (const puerta of puertas) {
        if (typeof puerta === 'string' && String(puerta).trim()) add(portal, piso, puerta)
      }
    }
    return
  }
  const pu = Array.isArray(block.puertaOptions)
    ? block.puertaOptions.filter((x) => typeof x === 'string' && String(x).trim())
    : []
  for (const piso of po) {
    for (const puerta of pu) add(portal, piso, puerta)
  }
}

/**
 * Todas las viviendas definidas en la ficha de la comunidad (portales + plantas + puertas).
 * @returns {Array<{ key: string, portal: string, piso: string, puerta: string, label: string }>}
 */
export function listAllCommunityDwellings(portalsList, dwellingByPortalIndex) {
  const seen = new Set()
  const out = []
  const add = (portal, piso, puerta) => {
    const key = dwellingUnitKey(portal, piso, puerta)
    if (!normDwellPart(piso) || !normDwellPart(puerta) || seen.has(key)) return
    seen.add(key)
    out.push({
      key,
      portal: normDwellPart(portal),
      piso: normDwellPart(piso),
      puerta: normDwellPart(puerta),
      label: formatDwellingLabel(portal, piso, puerta),
    })
  }
  if (!Array.isArray(dwellingByPortalIndex) || dwellingByPortalIndex.length < 1) return out
  if (portalsList?.length) {
    for (let i = 0; i < portalsList.length; i++) {
      enumerateDwellingBlock(portalsList[i], dwellingByPortalIndex[i], add)
    }
  } else if (dwellingByPortalIndex.length === 1) {
    enumerateDwellingBlock('', dwellingByPortalIndex[0], add)
  }
  return out.sort((a, b) => {
    const c = a.portal.localeCompare(b.portal, 'es', { numeric: true })
    if (c) return c
    const c2 = a.piso.localeCompare(b.piso, 'es', { numeric: true })
    if (c2) return c2
    return a.puerta.localeCompare(b.puerta, 'es', { numeric: true })
  })
}

/** Viviendas únicas a partir de registros (p. ej. paquetes). */
export function listDwellingsFromRecords(records, pick) {
  const seen = new Set()
  const out = []
  if (!Array.isArray(records)) return out
  for (const row of records) {
    if (!row || typeof row !== 'object') continue
    const { portal, piso, puerta } = pick(row)
    const key = dwellingUnitKey(portal, piso, puerta)
    if (!normDwellPart(piso) || !normDwellPart(puerta) || seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      portal: normDwellPart(portal),
      piso: normDwellPart(piso),
      puerta: normDwellPart(puerta),
      label: formatDwellingLabel(portal, piso, puerta),
    })
  }
  return out.sort((a, b) => {
    const c = a.portal.localeCompare(b.portal, 'es', { numeric: true })
    if (c) return c
    const c2 = a.piso.localeCompare(b.piso, 'es', { numeric: true })
    if (c2) return c2
    return a.puerta.localeCompare(b.puerta, 'es', { numeric: true })
  })
}
