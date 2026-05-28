export type JuntaBoardRole = 'president' | 'vice_president' | 'vocal' | null

export type CommunityJuntaFields = {
  presidentPortal: string | null
  presidentPiso: string | null
  presidentPuerta?: string | null
  boardVicePortal: string | null
  boardVicePiso: string | null
  boardVicePuerta?: string | null
  boardVocalsJson: unknown
}

function norm(s: string | null | undefined): string {
  return (s || '').trim()
}

/** Misma vivienda: portal + piso + puerta (si el cargo tiene puerta en ficha). */
export function dwellingMatchesResident(
  residentPortal: string,
  residentPiso: string,
  residentPuerta: string,
  slotPortal: string | null,
  slotPiso: string | null,
  slotPuerta: string | null | undefined,
): boolean {
  const rp = norm(residentPortal)
  const rs = norm(residentPiso)
  const rpt = norm(residentPuerta)
  const sp = norm(slotPortal)
  const ss = norm(slotPiso)
  const spt = norm(slotPuerta)
  if (!rp || !rs || !sp || !ss) return false
  if (rp !== sp || rs !== ss) return false
  if (spt) return rpt === spt
  // Legacy: cargo sin puerta en ficha → cualquier puerta en ese portal+piso
  return true
}

/** @deprecated Usar dwellingMatchesResident */
export function unitMatchesResident(
  residentPortal: string,
  residentPiso: string,
  slotPortal: string | null,
  slotPiso: string | null,
): boolean {
  return dwellingMatchesResident(residentPortal, residentPiso, '', slotPortal, slotPiso, null)
}

export function parseBoardVocals(raw: unknown): { portal: string; piso: string; puerta: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { portal: string; piso: string; puerta: string }[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const portal = typeof o.portal === 'string' ? o.portal.trim().slice(0, 64) : ''
    const piso = typeof o.piso === 'string' ? o.piso.trim().slice(0, 64) : ''
    const puerta = typeof o.puerta === 'string' ? o.puerta.trim().slice(0, 64) : ''
    if (portal && piso) out.push({ portal, piso, puerta })
  }
  return out
}

export function juntaRoleForResident(
  portal: string,
  piso: string,
  puerta: string,
  comm: CommunityJuntaFields,
): JuntaBoardRole {
  if (
    dwellingMatchesResident(
      portal,
      piso,
      puerta,
      comm.presidentPortal,
      comm.presidentPiso,
      comm.presidentPuerta,
    )
  ) {
    return 'president'
  }
  if (
    dwellingMatchesResident(
      portal,
      piso,
      puerta,
      comm.boardVicePortal,
      comm.boardVicePiso,
      comm.boardVicePuerta,
    )
  ) {
    return 'vice_president'
  }
  if (
    parseBoardVocals(comm.boardVocalsJson).some((v) =>
      dwellingMatchesResident(portal, piso, puerta, v.portal, v.piso, v.puerta),
    )
  ) {
    return 'vocal'
  }
  return null
}

export type JuntaAssignBody = 'none' | 'president' | 'vice_president' | 'vocal'

/**
 * Quita la vivienda de todos los cargos y aplica el nuevo (un presidente, un vice, vocales por puerta).
 */
export function computeJuntaUpdate(
  comm: CommunityJuntaFields,
  residentPortal: string,
  residentPiso: string,
  residentPuerta: string,
  assign: JuntaAssignBody,
): {
  presidentPortal: string | null
  presidentPiso: string | null
  presidentPuerta: string | null
  boardVicePortal: string | null
  boardVicePiso: string | null
  boardVicePuerta: string | null
  boardVocalsJson: { portal: string; piso: string; puerta: string }[]
} {
  const up = norm(residentPortal).slice(0, 64)
  const us = norm(residentPiso).slice(0, 64)
  const upt = norm(residentPuerta).slice(0, 64)

  let presidentPortal = comm.presidentPortal
  let presidentPiso = comm.presidentPiso
  let presidentPuerta = comm.presidentPuerta ?? null
  let boardVicePortal = comm.boardVicePortal
  let boardVicePiso = comm.boardVicePiso
  let boardVicePuerta = comm.boardVicePuerta ?? null
  let vocals = parseBoardVocals(comm.boardVocalsJson)

  const clearDwelling = () => {
    if (dwellingMatchesResident(up, us, upt, presidentPortal, presidentPiso, presidentPuerta)) {
      presidentPortal = null
      presidentPiso = null
      presidentPuerta = null
    }
    if (dwellingMatchesResident(up, us, upt, boardVicePortal, boardVicePiso, boardVicePuerta)) {
      boardVicePortal = null
      boardVicePiso = null
      boardVicePuerta = null
    }
    vocals = vocals.filter(
      (v) => !dwellingMatchesResident(up, us, upt, v.portal, v.piso, v.puerta),
    )
  }

  clearDwelling()

  if (assign === 'president') {
    presidentPortal = up
    presidentPiso = us
    presidentPuerta = upt || null
  } else if (assign === 'vice_president') {
    boardVicePortal = up
    boardVicePiso = us
    boardVicePuerta = upt || null
  } else if (assign === 'vocal') {
    vocals.push({ portal: up, piso: us, puerta: upt })
  }

  return {
    presidentPortal,
    presidentPiso,
    presidentPuerta,
    boardVicePortal,
    boardVicePiso,
    boardVicePuerta,
    boardVocalsJson: vocals,
  }
}
