export type JuntaBoardRole = 'president' | 'vice_president' | 'vocal' | null

export type CommunityJuntaFields = {
  presidentPortal: string | null
  presidentPiso: string | null
  boardVicePortal: string | null
  boardVicePiso: string | null
  boardVocalsJson: unknown
}

function norm(s: string | null | undefined): string {
  return (s || '').trim()
}

export function unitMatchesResident(
  residentPortal: string,
  residentPiso: string,
  slotPortal: string | null,
  slotPiso: string | null,
): boolean {
  return norm(slotPortal) === norm(residentPortal) && norm(slotPiso) === norm(residentPiso)
}

export function parseBoardVocals(raw: unknown): { portal: string; piso: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { portal: string; piso: string }[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const portal = typeof o.portal === 'string' ? o.portal.trim().slice(0, 64) : ''
    const piso = typeof o.piso === 'string' ? o.piso.trim().slice(0, 64) : ''
    if (portal && piso) out.push({ portal, piso })
  }
  return out
}

export function juntaRoleForResident(
  portal: string,
  piso: string,
  comm: CommunityJuntaFields,
): JuntaBoardRole {
  if (unitMatchesResident(portal, piso, comm.presidentPortal, comm.presidentPiso)) return 'president'
  if (unitMatchesResident(portal, piso, comm.boardVicePortal, comm.boardVicePiso)) return 'vice_president'
  if (parseBoardVocals(comm.boardVocalsJson).some((v) => unitMatchesResident(portal, piso, v.portal, v.piso)))
    return 'vocal'
  return null
}

export type JuntaAssignBody = 'none' | 'president' | 'vice_president' | 'vocal'

/**
 * Quita la vivienda de todos los cargos y aplica el nuevo (presidente pisa al anterior; un solo vice).
 */
export function computeJuntaUpdate(
  comm: CommunityJuntaFields,
  residentPortal: string,
  residentPiso: string,
  assign: JuntaAssignBody,
): {
  presidentPortal: string | null
  presidentPiso: string | null
  boardVicePortal: string | null
  boardVicePiso: string | null
  boardVocalsJson: { portal: string; piso: string }[]
} {
  const up = norm(residentPortal).slice(0, 64)
  const us = norm(residentPiso).slice(0, 64)

  let presidentPortal = comm.presidentPortal
  let presidentPiso = comm.presidentPiso
  let boardVicePortal = comm.boardVicePortal
  let boardVicePiso = comm.boardVicePiso
  let vocals = parseBoardVocals(comm.boardVocalsJson)

  if (unitMatchesResident(up, us, presidentPortal, presidentPiso)) {
    presidentPortal = null
    presidentPiso = null
  }
  if (unitMatchesResident(up, us, boardVicePortal, boardVicePiso)) {
    boardVicePortal = null
    boardVicePiso = null
  }
  vocals = vocals.filter((v) => !unitMatchesResident(up, us, v.portal, v.piso))

  if (assign === 'president') {
    presidentPortal = up
    presidentPiso = us
  } else if (assign === 'vice_president') {
    boardVicePortal = up
    boardVicePiso = us
  } else if (assign === 'vocal') {
    vocals.push({ portal: up, piso: us })
  }

  return {
    presidentPortal,
    presidentPiso,
    boardVicePortal,
    boardVicePiso,
    boardVocalsJson: vocals,
  }
}
