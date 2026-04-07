/**
 * Cuerpo JSON para POST /api/company/communities (paridad con lo que acepta el servidor).
 * @param {Record<string, unknown>} form — campos de formulario (strings y booleanos)
 * @returns {{ body?: Record<string, unknown>, error?: string }}
 */
export function buildCompanyCommunityCreateBody(form) {
  const name = String(form.name ?? '').trim() || 'Sin nombre'
  const contactEmail = String(form.contactEmail ?? '').trim()
  if (!contactEmail) return { error: 'El email de contacto es obligatorio.' }

  const presidentPortal = String(form.presidentPortal ?? '').trim()
  const presidentPiso = String(form.presidentPiso ?? '').trim()
  if ((presidentPortal && !presidentPiso) || (!presidentPortal && presidentPiso)) {
    return {
      error: 'Presidente por vivienda: rellena portal y piso, o déjalos vacíos los dos.',
    }
  }

  const boardVicePortal = String(form.boardVicePortal ?? '').trim()
  const boardVicePiso = String(form.boardVicePiso ?? '').trim()
  if ((boardVicePortal && !boardVicePiso) || (!boardVicePortal && boardVicePiso)) {
    return {
      error: 'Vicepresidente (junta): rellena portal y piso, o déjalos vacíos los dos.',
    }
  }

  const parseJson = (raw, label) => {
    const s = String(raw ?? '').trim()
    if (!s) return { ok: true, value: undefined }
    try {
      return { ok: true, value: JSON.parse(s) }
    } catch {
      return { ok: false, error: `${label}: JSON no válido.` }
    }
  }

  const pjLabels = parseJson(form.portalLabelsJson, 'Etiquetas de portales (JSON)')
  if (!pjLabels.ok) return { error: pjLabels.error }
  const pjDwelling = parseJson(form.portalDwellingConfigJson, 'Config. viviendas por portal (JSON)')
  if (!pjDwelling.ok) return { error: pjDwelling.error }
  const pjVocals = parseJson(form.boardVocalsJson, 'Vocales junta (JSON)')
  if (!pjVocals.ok) return { error: pjVocals.error }
  const pjLocs = parseJson(form.customLocationsJson, 'Espacios / salones (JSON)')
  if (!pjLocs.ok) return { error: pjLocs.error }

  /** @type {Record<string, unknown>} */
  const body = { name, contactEmail }

  const nif = String(form.nifCif ?? '').trim()
  if (nif) body.nifCif = nif
  const addr = String(form.address ?? '').trim()
  if (addr) body.address = addr
  const ac = String(form.accessCode ?? '').trim().toUpperCase()
  if (ac) body.accessCode = ac
  const slug = String(form.loginSlug ?? '').trim()
  if (slug) body.loginSlug = slug

  const pe = String(form.presidentEmail ?? '').trim()
  if (pe) body.presidentEmail = pe
  const ae = String(form.communityAdminEmail ?? '').trim()
  if (ae) body.communityAdminEmail = ae
  const ce = String(form.conciergeEmail ?? '').trim()
  if (ce) body.conciergeEmail = ce
  const pse = String(form.poolStaffEmail ?? '').trim()
  if (pse) body.poolStaffEmail = pse

  if (presidentPortal && presidentPiso) {
    body.presidentPortal = presidentPortal
    body.presidentPiso = presidentPiso
  }
  if (boardVicePortal && boardVicePiso) {
    body.boardVicePortal = boardVicePortal
    body.boardVicePiso = boardVicePiso
  }
  if (pjVocals.value !== undefined) body.boardVocalsJson = pjVocals.value

  const plan = String(form.planExpiresOn ?? '').trim()
  if (plan) body.planExpiresOn = plan

  const pt = String(form.portalCount ?? '').trim()
  if (pt) {
    const pc = Number.parseInt(pt, 10)
    if (Number.isFinite(pc) && pc >= 1) body.portalCount = Math.min(999, pc)
  }
  if (pjLabels.value !== undefined) body.portalLabels = pjLabels.value
  if (pjDwelling.value !== undefined) body.portalDwellingConfig = pjDwelling.value

  const rs = String(form.residentSlots ?? '').trim()
  if (rs) {
    const n = Number.parseInt(rs, 10)
    if (Number.isFinite(n) && n >= 0) body.residentSlots = Math.min(999_999, n)
  }

  body.gymAccessEnabled = Boolean(form.gymAccessEnabled)
  body.appNavServicesEnabled = form.appNavServicesEnabled !== false
  body.appNavIncidentsEnabled = form.appNavIncidentsEnabled !== false
  body.appNavBookingsEnabled = form.appNavBookingsEnabled !== false
  body.appNavPoolAccessEnabled = form.appNavPoolAccessEnabled === true

  const pcc = String(form.padelCourtCount ?? '').trim()
  if (pcc) {
    const n = Number.parseInt(pcc, 10)
    if (Number.isFinite(n) && n >= 0) body.padelCourtCount = Math.min(50, n)
  }
  const pmb = String(form.padelMaxHoursPerBooking ?? '').trim()
  if (pmb) {
    const n = Number.parseInt(pmb, 10)
    if (Number.isFinite(n)) body.padelMaxHoursPerBooking = Math.min(24, Math.max(1, n))
  }
  const pmd = String(form.padelMaxHoursPerApartmentPerDay ?? '').trim()
  if (pmd) {
    const n = Number.parseInt(pmd, 10)
    if (Number.isFinite(n)) body.padelMaxHoursPerApartmentPerDay = Math.min(24, Math.max(1, n))
  }
  const pma = String(form.padelMinAdvanceHours ?? '').trim()
  if (pma) {
    const n = Number.parseInt(pma, 10)
    if (Number.isFinite(n)) body.padelMinAdvanceHours = Math.min(168, Math.max(1, n))
  }

  const pot = String(form.padelOpenTime ?? '').trim()
  if (pot) body.padelOpenTime = pot
  const pct = String(form.padelCloseTime ?? '').trim()
  if (pct) body.padelCloseTime = pct

  const sbm = String(form.salonBookingMode ?? '').trim().toLowerCase()
  if (sbm === 'day' || sbm === 'slots') body.salonBookingMode = sbm

  if (pjLocs.value !== undefined) body.customLocations = pjLocs.value

  return { body }
}
