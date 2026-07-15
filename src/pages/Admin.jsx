import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAuth,
  VEC_IMPERSONATE_CHILD_READY,
  VEC_IMPERSONATE_PAYLOAD,
} from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { buildCommunityLoginUrl } from '../utils/communityLoginUrl.js'
import {
  conciergeEmailsFromCommunity,
  conciergeEmailsSummary,
  conciergePayloadFromForm,
  emptyConciergeSlot,
  hasAnyConciergeEmail,
} from '../utils/conciergeEmailsForm.js'
import ConciergeStaffEditor from '../components/ConciergeStaffEditor.jsx'
import CommunityLoginQrModal from '../components/CommunityLoginQrModal.jsx'
import { useDialog } from '../context/DialogContext.jsx'
import CommunityDashboardStats from '../components/CommunityDashboardStats.jsx'
import {
  SERVICE_CATEGORIES,
  defaultServiceCategoryModesRecord,
} from '../constants/serviceRequests.js'
import { openVecindarioImpersonationTab } from '../utils/openVecindarioImpersonationTab.js'
import {
  formatPadelHoursDisplay,
  formatPadelHoursInputValue,
  parsePadelHoursFormValue,
  sanitizePadelHoursInput,
} from '../utils/padelHours.js'
import './Admin.css'

function statusLabel(status) {
  if (status === 'demo') return 'Demo'
  if (status === 'inactive') return 'Inactive'
  if (status === 'pending_approval') return 'Pendiente'
  return 'Active'
}

/** Mismo criterio que el servidor: slug estable derivado del nombre (solo para datos antiguos sin id). */
function slugFromNameClient(name) {
  const t = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 48)
  return t
}

function newUniqueSpaceId() {
  return `esp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Emails de administradores de empresa (cuando la comunidad tiene companyId y no admin en ficha). */
function companyAdminEmailsForCommunity(community, companiesList) {
  const coId = community?.companyId != null ? Number(community.companyId) : null
  if (!coId || !Array.isArray(companiesList)) return []
  const co = companiesList.find((x) => Number(x.id) === coId)
  if (!co || !Array.isArray(co.companyAdmins)) return []
  return co.companyAdmins
    .map((a) => (typeof a.email === 'string' ? a.email.trim() : ''))
    .filter(Boolean)
}

function adminOnboardingMailSummary(community, companiesList, companyNameById) {
  const ficha = community.communityAdminEmail?.trim()
  if (ficha) return ficha
  const companyEmails = companyAdminEmailsForCommunity(community, companiesList)
  if (companyEmails.length) {
    const coName =
      community.companyId != null
        ? companyNameById.get(Number(community.companyId)) || ''
        : ''
    const prefix = coName ? `empresa «${coName}»: ` : 'empresa: '
    return `${prefix}${companyEmails.join(', ')}`
  }
  if (community.companyId != null) {
    return 'sin email en ficha ni administradores en la empresa'
  }
  return 'sin email'
}

function hasAdminOnboardingMailTarget(community, companiesList) {
  return (
    Boolean(community.communityAdminEmail?.trim()) ||
    companyAdminEmailsForCommunity(community, companiesList).length > 0
  )
}

/** Valor válido para input type="time" (HH:mm). */
function padWallClockForInput(raw, fallback) {
  const t = String(raw ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t)
  if (!m) return fallback
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return fallback
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** Garantiza id por fila: reservas y URLs usan id; el nombre solo es la etiqueta visible. */
function parseTimeSlotsFromApi(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((s, idx) => ({
    key: `ts-${typeof s?.id === 'string' ? s.id : idx}-${idx}`,
    id: typeof s?.id === 'string' && s.id.trim() ? s.id.trim() : `slot-${idx + 1}`,
    label: typeof s?.label === 'string' ? s.label : '',
    start: typeof s?.start === 'string' ? s.start : '12:00',
    end: typeof s?.end === 'string' ? s.end : '17:00',
  }))
}

function normalizeCustomSpacesFromApi(customLocations) {
  if (!Array.isArray(customLocations)) return []
  const seen = new Set()
  return customLocations.map((item, idx) => {
    const name = typeof item?.name === 'string' ? item.name : ''
    let id = typeof item?.id === 'string' ? item.id.trim() : ''
    if (!id) {
      id = slugFromNameClient(name) || `legacy_${idx}`
    }
    let uniqueId = id
    let n = 0
    while (seen.has(uniqueId)) {
      n += 1
      uniqueId = `${id}_${n}`
    }
    seen.add(uniqueId)
    const rawMax = item?.maxDaysInAdvance
    let advanceLimitEnabled = true
    let maxDaysInAdvance = '14'
    if (rawMax === null) {
      advanceLimitEnabled = false
    } else if (rawMax !== undefined && Number.isFinite(Number(rawMax))) {
      advanceLimitEnabled = true
      maxDaysInAdvance = String(Math.min(365, Math.max(1, Math.trunc(Number(rawMax)))))
    }
    const rawMin = item?.minDaysInAdvance
    const minAdvanceEnabled =
      rawMin !== undefined && rawMin !== null && Number.isFinite(Number(rawMin)) && Number(rawMin) > 0
    const timeSlots = parseTimeSlotsFromApi(item?.timeSlots)
    const hasRegs =
      Boolean(String(item?.rulesText ?? '').trim()) ||
      (item?.usageFeeEur != null && Number(item.usageFeeEur) > 0) ||
      (item?.depositEur != null && Number(item.depositEur) > 0) ||
      minAdvanceEnabled ||
      timeSlots.length > 0
    return {
      key: `row-${uniqueId}-${idx}`,
      id: uniqueId,
      name,
      advanceLimitEnabled,
      maxDaysInAdvance,
      minAdvanceEnabled,
      minDaysInAdvance: minAdvanceEnabled
        ? String(Math.min(365, Math.max(1, Math.trunc(Number(rawMin)))))
        : '7',
      rulesText: typeof item?.rulesText === 'string' ? item.rulesText : '',
      usageFeeEur: item?.usageFeeEur != null && item.usageFeeEur !== '' ? String(item.usageFeeEur) : '',
      depositEur: item?.depositEur != null && item.depositEur !== '' ? String(item.depositEur) : '',
      customSlotsEnabled: timeSlots.length > 0,
      timeSlots,
      regulationsOpen: hasRegs,
    }
  })
}

function spacesPreview(customLocations) {
  if (!Array.isArray(customLocations) || customLocations.length === 0) return '—'
  return customLocations
    .map((x) => (typeof x?.name === 'string' ? x.name : ''))
    .filter(Boolean)
    .slice(0, 4)
    .join(', ')
}

/** Valor para input type="date" desde API (ISO / DATE). */
function planExpiresOnForInput(raw) {
  if (raw == null || raw === '') return ''
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw))
  return m ? m[1] : ''
}

/** Etiqueta legible en tarjeta (calendario UTC = día guardado en BD). */
function formatPlanExpiresForCard(iso) {
  if (iso == null || iso === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  return new Date(Date.UTC(y, mo - 1, da)).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function normalizePortalLabelsFromApi(raw, portalCount) {
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const out = Array.from({ length: n }, () => '')
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < n; i += 1) {
    const s = typeof raw[i] === 'string' ? raw[i].trim().slice(0, 64) : ''
    out[i] = s
  }
  return out
}

/** Borrador UI: plantas / puertas por portal (PATCH como JSON). */
const MAX_STREET_LOCALES = 20
const MAX_LOCALE_NAME_LEN = 64

function normalizeStreetLocalesFromApi(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
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

function emptyPortalDwellingDraft() {
  return {
    floors: '',
    doorsPerFloor: '',
    doorsTopFloor: '',
    doorScheme: 'letters',
    streetLocales: [],
    residentialGroundFloor: false,
    useVariableDoorsPerFloor: false,
    doorsPerFloorByPiso: [],
  }
}

const BAJO_PISO_KEY = 'Bajo'

function hasVariableDoorsFromApi(o, floorsNum) {
  if (!o || typeof o !== 'object' || floorsNum < 1) return false
  const raw = o.doorsPerFloorByPiso
  if (!raw || typeof raw !== 'object') return false
  if (typeof raw[BAJO_PISO_KEY] === 'number') return true
  for (let pi = 1; pi <= floorsNum; pi += 1) {
    if (typeof raw[String(pi)] === 'number') return true
  }
  return false
}

function variableFloorRows(dwelling) {
  if (!dwelling?.useVariableDoorsPerFloor) return []
  const f = parseInt(String(dwelling.floors ?? '').trim(), 10)
  if (!Number.isFinite(f) || f < 1) return []
  const rows = []
  if (dwelling.residentialGroundFloor) {
    rows.push({ label: 'Bajo', mapKey: BAJO_PISO_KEY, draftIndex: rows.length })
  }
  for (let pi = 1; pi <= f; pi += 1) {
    rows.push({ label: `Planta ${pi}`, mapKey: String(pi), draftIndex: rows.length })
  }
  return rows
}

function doorsPerFloorByPisoArrayFromApi(o, floors, residentialGroundFloor) {
  if (!o || typeof o !== 'object' || !Number.isFinite(floors) || floors < 1) return null
  const raw = o.doorsPerFloorByPiso
  if (!raw || typeof raw !== 'object') return null
  const arr = []
  if (residentialGroundFloor) {
    const bajo = raw[BAJO_PISO_KEY]
    if (typeof bajo === 'number' && bajo >= 1) {
      arr.push(String(bajo))
    } else {
      const fallback =
        typeof o.doorsPerFloor === 'number' && o.doorsPerFloor >= 1 ? String(o.doorsPerFloor) : ''
      arr.push(fallback !== '' ? fallback : '1')
    }
  }
  for (let pi = 1; pi <= floors; pi += 1) {
    const v = raw[String(pi)]
    if (typeof v !== 'number' || v < 0) return null
    arr.push(String(v))
  }
  return arr
}

function resizeDoorsPerFloorByPisoDraft(prevArr, floors, defaultDoors, includeBajo) {
  const def = String(defaultDoors ?? '').trim() || '1'
  const prev = Array.isArray(prevArr) ? prevArr : []
  const out = []
  const hadBajoRow = prev.length === floors + 1
  if (includeBajo) {
    const bajoVal = hadBajoRow ? String(prev[0] ?? '').trim() : ''
    out.push(bajoVal !== '' ? bajoVal : def)
  }
  const srcStart = hadBajoRow ? 1 : 0
  for (let pi = 0; pi < floors; pi += 1) {
    const existing = String(prev[srcStart + pi] ?? '').trim()
    out.push(existing !== '' ? existing : def)
  }
  return out
}

function normalizePortalDwellingDraftFromApi(raw, portalCount) {
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const arr = Array.isArray(raw) ? raw : []
  return Array.from({ length: n }, (_, i) => {
    const o = arr[i]
    if (!o || typeof o !== 'object') {
      return emptyPortalDwellingDraft()
    }
    const floors = typeof o.floors === 'number' && o.floors >= 1 ? String(o.floors) : ''
    const floorsNum = floors !== '' ? parseInt(floors, 10) : 0
    const doorsPerFloor =
      typeof o.doorsPerFloor === 'number' && o.doorsPerFloor >= 1 ? String(o.doorsPerFloor) : ''
    const doorsTopFloor =
      typeof o.doorsTopFloor === 'number' && o.doorsTopFloor >= 1 ? String(o.doorsTopFloor) : ''
    const doorScheme = o.doorScheme === 'numbers' ? 'numbers' : 'letters'
    const streetLocales = normalizeStreetLocalesFromApi(o.streetLocales)
    const residentialGroundFloor = o.residentialGroundFloor === true
    const byPisoArr =
      floorsNum > 0 ? doorsPerFloorByPisoArrayFromApi(o, floorsNum, residentialGroundFloor) : null
    const useVariable = hasVariableDoorsFromApi(o, floorsNum) || byPisoArr != null
    return {
      floors,
      doorsPerFloor,
      doorsTopFloor,
      doorScheme,
      streetLocales,
      residentialGroundFloor,
      useVariableDoorsPerFloor: useVariable,
      doorsPerFloorByPiso:
        byPisoArr ??
        (useVariable
          ? resizeDoorsPerFloorByPisoDraft([], floorsNum, doorsPerFloor, residentialGroundFloor)
          : []),
    }
  })
}

function streetLocalesFromDraft(d) {
  return Array.isArray(d?.streetLocales) ? d.streetLocales : []
}

function validateStreetLocalesDraft(names, portalLabel) {
  const seen = new Set()
  for (const raw of names) {
    const name = String(raw ?? '').trim()
    if (!name) {
      return `Indica un nombre para cada local en ${portalLabel} (o elimina la fila vacía).`
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      return `Nombres de local duplicados en ${portalLabel}: «${name}».`
    }
    seen.add(key)
  }
  return null
}

function buildStreetLocalesForSave(names) {
  return normalizeStreetLocalesFromApi(names)
}

/**
 * Viviendas teóricas por portal según borrador (misma regla que el cupo automático en servidor:
 * plantas × puertas, o (plantas−1)×puertas + última planta si aplica).
 */
function estimatePortalDwellingUnitsFromDraft(d) {
  if (!d || typeof d !== 'object') return null
  const f = parseInt(String(d.floors ?? '').trim(), 10)
  if (!Number.isFinite(f) || f < 1 || f > 50) return null

  let total = null
  if (d.useVariableDoorsPerFloor && Array.isArray(d.doorsPerFloorByPiso)) {
    let sum = 0
    for (const row of variableFloorRows(d)) {
      const n = parseInt(String(d.doorsPerFloorByPiso[row.draftIndex] ?? '').trim(), 10)
      if (!Number.isFinite(n) || n < 0 || n > 26) return null
      sum += n
    }
    total = sum
  } else {
    const dp = parseInt(String(d.doorsPerFloor ?? '').trim(), 10)
    if (!Number.isFinite(dp) || dp < 1 || dp > 26) return null

    const dtRaw = String(d.doorsTopFloor ?? '').trim()
    if (dtRaw === '' || f < 2) {
      total = f * dp
    } else {
      const dt = parseInt(dtRaw, 10)
      if (!Number.isFinite(dt) || dt < 1 || dt > dp) return null
      if (dt >= dp) total = f * dp
      else total = (f - 1) * dp + dt
    }
  }

  if (d.residentialGroundFloor && !d.useVariableDoorsPerFloor) {
    const dp = parseInt(String(d.doorsPerFloor ?? '').trim(), 10)
    if (Number.isFinite(dp) && dp >= 1) total += dp
  }
  return total
}

/** Resumen en tarjeta: muestra alias o «Portal N». */
function portalsAliasesPreview(portalCount, portalLabels) {
  const n = Number(portalCount) || 1
  const labels = normalizePortalLabelsFromApi(portalLabels, n)
  const parts = labels.map((label, i) => {
    const t = label && String(label).trim()
    return t || `Portal ${i + 1}`
  })
  if (parts.length <= 5) return parts.join(' · ')
  return `${parts.slice(0, 5).join(' · ')}…`
}

function formatPresidentOnCard(c) {
  const pp = (c.presidentPortal || '').trim()
  const ps = (c.presidentPiso || '').trim()
  if (pp && ps) return `vivienda: portal ${pp} · piso ${ps}`
  const em = (c.presidentEmail || '').trim()
  if (em) return `${em} (legado correo)`
  return '—'
}

function roleLabelEs(role) {
  const m = {
    president: 'Presidente',
    community_admin: 'Administrador',
    concierge: 'Conserje',
    pool_staff: 'Socorrista (piscina)',
    resident: 'Vecino',
    super_admin: 'Super admin',
  }
  return m[role] || role
}

/**
 * La ficha guarda correos por puesto; la cuenta tiene un rol. «Vinculado» = coincide para impersonar.
 * No es un fallo de BD al cambiar solo el texto de la ficha: hay que alinear rol + campo de correo.
 */
function staffFichaRowBlockedReason(row) {
  if (!row.user || row.canImpersonate) return null
  if (row.user.role === 'super_admin') {
    return {
      short: 'Super admin: sin acciones por comunidad',
      title:
        'Por seguridad, el super administrador no se trata como personal vinculado a una comunidad desde este modal.',
    }
  }
  return {
    short: 'Rol o correo no alineados con la ficha',
    title:
      'Ejemplo: este correo está en Conserje/contacto pero la cuenta es Administrador — entonces debe coincidir con «Email administrador de comunidad», o cambia el rol del usuario a Conserje. Presidente/Administrador/Conserje/Socorrista exigen rol en BD igual al puesto y el mismo correo en el campo correspondiente de la ficha.',
  }
}

const emptyForm = {
  name: '',
  nifCif: '',
  address: '',
  accessCode: '',
  loginSlug: '',
  contactEmail: '',
  presidentPortal: '',
  presidentPiso: '',
  communityAdminEmail: '',
  communityAdminName: '',
  conciergeStaff: [emptyConciergeSlot()],
  conciergeSubstitutes: [],
  poolStaffEmail: '',
  status: 'active',
  portalCount: '1',
  residentSlots: '',
  gymAccessEnabled: false,
  poolAccessSystemEnabled: false,
  poolSeasonActive: false,
  poolSeasonStart: '',
  poolSeasonEnd: '',
  poolHoursNote: '',
  poolMaxOccupancy: '',
  appNavServicesEnabled: true,
  appNavIncidentsEnabled: true,
  appNavBookingsEnabled: true,
  appNavPoolAccessEnabled: false,
  appNavPaqueteriaEnabled: false,
  paqueteriaSpecialDeliveryEnabled: false,
  paqueteriaKeyLoansEnabled: false,
  appNavCuadernoDiarioEnabled: false,
  serviceCategoryModes: defaultServiceCategoryModesRecord(),
  padelCourtCount: '0',
  padelMaxHoursPerBooking: '2',
  padelMaxHoursApartmentDay: '4',
  padelMinAdvanceHours: '24',
  padelOpenTime: '08:00',
  padelCloseTime: '22:00',
  /** Salones (sala reuniones, salón social, espacios propios): slots = franjas; day = día completo */
  salonBookingMode: 'slots',
  customSpaces: [],
  /** YYYY-MM-DD o vacío = sin caducidad de plan */
  planExpiresOn: '',
  companyId: '',
  serviceProviderCompanyId: '',
}

export default function Admin() {
  const { accessToken, userRole, user } = useAuth()
  const isFullSuperAdmin = userRole === 'super_admin'
  const isScopedServiceAdmin =
    userRole === 'company_admin' &&
    (user?.company?.scopedSuperAdmin === true || user?.company?.kind === 'prestacion_servicios')
  const { confirm, prompt } = useDialog()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successFlash, setSuccessFlash] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const communityUsesCompanyAdmin = String(form.companyId ?? '').trim() !== ''
  const [saving, setSaving] = useState(false)
  const [onboardingMailOpen, setOnboardingMailOpen] = useState(false)
  const [onboardingMailCommunity, setOnboardingMailCommunity] = useState(null)
  const [onboardingMailSel, setOnboardingMailSel] = useState({
    invitePresident: false,
    inviteAdmin: false,
    inviteConcierge: false,
    invitePoolStaff: false,
    contactSummary: false,
  })
  const [onboardingMailSending, setOnboardingMailSending] = useState(false)
  const [usersModalCommunity, setUsersModalCommunity] = useState(null)
  const [usersModalData, setUsersModalData] = useState(null)
  const [usersModalLoading, setUsersModalLoading] = useState(false)
  const [usersModalError, setUsersModalError] = useState('')
  const [usersActionBusyId, setUsersActionBusyId] = useState(null)
  const [usersConciergeStatusBusy, setUsersConciergeStatusBusy] = useState(null)
  const [usersBulkDeleteBusy, setUsersBulkDeleteBusy] = useState(false)
  const [usersTempPasswordFlash, setUsersTempPasswordFlash] = useState('')
  const [portalsModalCommunity, setPortalsModalCommunity] = useState(null)
  const [portalsDraft, setPortalsDraft] = useState([])
  const [portalsDwellingDraft, setPortalsDwellingDraft] = useState([])
  const [portalsSaving, setPortalsSaving] = useState(false)
  const [portalsError, setPortalsError] = useState('')
  const [qrModal, setQrModal] = useState(null)
  const [posterPdfBusyId, setPosterPdfBusyId] = useState(null)
  const [navTabSavingId, setNavTabSavingId] = useState(null)
  const [companiesList, setCompaniesList] = useState([])
  const [companyOptions, setCompanyOptions] = useState({ administration: [], service: [] })
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyKind, setNewCompanyKind] = useState('administracion')
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [companyAdminForm, setCompanyAdminForm] = useState({
    open: false,
    companyId: null,
    email: '',
    name: '',
    password: '',
  })
  const [companyAdminBusy, setCompanyAdminBusy] = useState(false)
  const [companyAdminFlash, setCompanyAdminFlash] = useState('')
  const [companyPasswordFlash, setCompanyPasswordFlash] = useState('')
  const [companyPasswordBusy, setCompanyPasswordBusy] = useState(null)
  const [companyAdminLoginBusyId, setCompanyAdminLoginBusyId] = useState(null)
  const [companyAdminDeleteBusyId, setCompanyAdminDeleteBusyId] = useState(null)
  const [companyKindBusyId, setCompanyKindBusyId] = useState(null)
  const [passwordPickModal, setPasswordPickModal] = useState({
    open: false,
    companyId: null,
    companyName: '',
    sendEmail: false,
    admins: [],
    loading: false,
    error: '',
  })
  const [approvalBusyId, setApprovalBusyId] = useState(null)
  /** KPIs globales (solo comunidades operativas); se cargan con las comunidades. */
  const [operationalStats, setOperationalStats] = useState(null)

  const pendingCommunities = useMemo(
    () => communities.filter((c) => c.status === 'pending_approval'),
    [communities],
  )

  /** Misma regla que el API: activa + demo cu uso; fuera pendiente de aprobación e inactiva. */
  const operationalCommunitiesCount = useMemo(
    () =>
      communities.filter((c) => c.status === 'active' || c.status === 'demo').length,
    [communities],
  )

  const companyNameById = useMemo(() => {
    const m = new Map()
    for (const c of companiesList) {
      if (c?.id != null) m.set(Number(c.id), typeof c.name === 'string' ? c.name : '')
    }
    for (const c of companyOptions.administration) {
      if (c?.id != null) m.set(Number(c.id), typeof c.name === 'string' ? c.name : '')
    }
    for (const c of companyOptions.service) {
      if (c?.id != null) m.set(Number(c.id), typeof c.name === 'string' ? c.name : '')
    }
    return m
  }, [companiesList, companyOptions])

  const loadCompanyOptions = useCallback(async () => {
    if (!accessToken) {
      setCompanyOptions({ administration: [], service: [] })
      return
    }
    try {
      const res = await fetch(apiUrl('/api/admin/communities/company-options'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setCompanyOptions({
        administration: Array.isArray(d.administration) ? d.administration : [],
        service: Array.isArray(d.service) ? d.service : [],
      })
    } catch {
      setCompanyOptions({ administration: [], service: [] })
    }
  }, [accessToken])

  const loadCompaniesList = useCallback(async () => {
    if (!accessToken || !isFullSuperAdmin) {
      setCompaniesList([])
      return
    }
    setCompaniesLoading(true)
    try {
      const res = await fetch(apiUrl('/api/admin/companies'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setCompaniesList(Array.isArray(d) ? d : [])
    } catch {
      setCompaniesList([])
    } finally {
      setCompaniesLoading(false)
    }
  }, [accessToken, isFullSuperAdmin])

  useEffect(() => {
    loadCompaniesList()
    loadCompanyOptions()
  }, [loadCompaniesList, loadCompanyOptions])

  useEffect(() => {
    if (!companyAdminFlash) return
    const t = setTimeout(() => setCompanyAdminFlash(''), 15000)
    return () => clearTimeout(t)
  }, [companyAdminFlash])

  useEffect(() => {
    if (!companyPasswordFlash) return
    const t = setTimeout(() => setCompanyPasswordFlash(''), 120000)
    return () => clearTimeout(t)
  }, [companyPasswordFlash])

  useEffect(() => {
    if (!usersTempPasswordFlash) return
    const t = setTimeout(() => setUsersTempPasswordFlash(''), 120000)
    return () => clearTimeout(t)
  }, [usersTempPasswordFlash])

  const runCompanyAdminPasswordReset = async (companyId, userId, sendEmailFlag) => {
    if (!accessToken) return
    setError('')
    setCompanyPasswordBusy(`${companyId}-${sendEmailFlag ? 'email' : 'show'}`)
    try {
      const res = await fetch(
        apiUrl(`/api/admin/companies/${companyId}/admins/${userId}/reset-password`),
        {
          method: 'POST',
          headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify({ sendEmail: sendEmailFlag }),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(d.message || d.error || `Error ${res.status}`)
      }
      if (sendEmailFlag) {
        setSuccessFlash(d.message || `Correo enviado a ${d.email || ''}.`)
      } else {
        const pw = d.temporaryPassword
        const em = d.email || ''
        setCompanyPasswordFlash(
          pw
            ? `Nueva contraseña temporal para ${em}: ${pw} — cópiala ahora; la anterior ya no vale.`
            : d.message || 'Contraseña actualizada.',
        )
      }
    } catch (e) {
      setError(e.message || 'No se pudo completar la acción')
    } finally {
      setCompanyPasswordBusy(null)
    }
  }

  const onCompanyPasswordAction = async (co, sendEmailFlag) => {
    if (!accessToken) return
    const n = co.companyAdminCount ?? 0
    if (n < 1) {
      setError('Esta empresa no tiene administradores de empresa.')
      return
    }
    if (n === 1) {
      const res = await fetch(apiUrl(`/api/admin/companies/${co.id}/admins`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.admins?.[0]?.id) {
        setError(d.error || 'No se pudo cargar el administrador.')
        return
      }
      await runCompanyAdminPasswordReset(co.id, d.admins[0].id, sendEmailFlag)
      return
    }
    setPasswordPickModal({
      open: true,
      companyId: co.id,
      companyName: co.name,
      sendEmail: sendEmailFlag,
      admins: [],
      loading: true,
      error: '',
    })
    try {
      const res = await fetch(apiUrl(`/api/admin/companies/${co.id}/admins`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      const list = Array.isArray(data.admins) ? data.admins : []
      setPasswordPickModal((m) => ({
        ...m,
        loading: false,
        admins: list,
        error: list.length === 0 ? 'No hay administradores en esta empresa.' : '',
      }))
    } catch (e) {
      setPasswordPickModal((m) => ({
        ...m,
        loading: false,
        error: e.message || 'No se pudo cargar la lista',
      }))
    }
  }

  const patchCommunityStatus = async (communityId, status) => {
    if (!accessToken) return
    setApprovalBusyId(communityId)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/admin/communities/${communityId}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setCommunities((prev) => prev.map((c) => (c.id === communityId ? { ...c, ...d } : c)))
      setSuccessFlash(status === 'active' ? 'Comunidad activada.' : 'Comunidad desactivada.')
      await loadCommunities()
    } catch (e) {
      setError(e.message || 'No se pudo actualizar el estado')
    } finally {
      setApprovalBusyId(null)
    }
  }

  const createCompany = async (e) => {
    e.preventDefault()
    if (!accessToken) return
    const n = newCompanyName.trim()
    if (!n) {
      setError('Indica el nombre de la empresa.')
      return
    }
    setCreatingCompany(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/admin/companies'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, kind: newCompanyKind }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setNewCompanyName('')
      setNewCompanyKind('administracion')
      setSuccessFlash(`Empresa creada: ${d.name || n}`)
      await loadCompaniesList()
      await loadCompanyOptions()
    } catch (err) {
      setError(err.message || 'No se pudo crear la empresa')
    } finally {
      setCreatingCompany(false)
    }
  }

  const patchCompanyKind = async (co, nextKind) => {
    if (!accessToken || !co?.id) return
    const current = co.kind === 'prestacion_servicios' ? 'prestacion_servicios' : 'administracion'
    if (nextKind === current) return
    setCompanyKindBusyId(co.id)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/admin/companies/${co.id}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: co.name, kind: nextKind }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setSuccessFlash(
        nextKind === 'prestacion_servicios'
          ? `«${co.name}» marcada como prestador de servicios.`
          : `«${co.name}» marcada como administración de fincas.`,
      )
      await loadCompaniesList()
      await loadCompanyOptions()
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el tipo de empresa')
    } finally {
      setCompanyKindBusyId(null)
    }
  }

  const submitCompanyAdmin = async (e) => {
    e.preventDefault()
    if (!accessToken || !companyAdminForm.companyId) return
    const email = companyAdminForm.email.trim().toLowerCase()
    if (!email) {
      setError('Email obligatorio para el administrador de empresa.')
      return
    }
    setCompanyAdminBusy(true)
    setError('')
    try {
      const body = {
        email,
        name: companyAdminForm.name.trim() || undefined,
        ...(companyAdminForm.password.trim().length >= 8
          ? { password: companyAdminForm.password.trim() }
          : {}),
      }
      const res = await fetch(apiUrl(`/api/admin/companies/${companyAdminForm.companyId}/admins`), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setCompanyAdminFlash(
        d.temporaryPassword
          ? `${d.promoted ? 'Cuenta promovida a administrador de empresa' : 'Usuario creado'}. Contraseña temporal: ${d.temporaryPassword} (cópiala ahora).`
          : d.promoted
            ? 'Cuenta de administrador de comunidad promovida a administrador de empresa.'
            : 'Administrador de empresa creado.',
      )
      setCompanyAdminForm({ open: false, companyId: null, email: '', name: '', password: '' })
      await loadCompaniesList()
    } catch (err) {
      setError(err.message || 'No se pudo crear el administrador')
    } finally {
      setCompanyAdminBusy(false)
    }
  }

  const patchCommunityNavTabs = async (community, payload) => {
    if (!accessToken || !community?.id) return
    setNavTabSavingId(community.id)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/admin/communities/${community.id}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setCommunities((prev) =>
        prev.map((c) => (c.id === community.id ? { ...c, ...payload } : c)),
      )
      setSuccessFlash('Pestañas de la app actualizadas.')
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setNavTabSavingId(null)
    }
  }

  const copyCommunityLoginUrl = useCallback(async (loginSlug) => {
    const url = buildCommunityLoginUrl(loginSlug)
    if (!url) {
      setError('Sin slug configurado.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setSuccessFlash('Enlace de acceso copiado al portapapeles.')
    } catch {
      setError('No se pudo copiar. Copia el enlace manualmente.')
    }
  }, [])

  const downloadCommunityPoster = useCallback(async (community) => {
    const slug = (community.loginSlug || '').trim()
    if (!slug) {
      setError('Configura el slug de acceso en la ficha antes de generar el cartel.')
      return
    }
    setPosterPdfBusyId(community.id)
    setError('')
    try {
      const { generateCommunityPosterPdf } = await import('../utils/generateCommunityPosterPdf.js')
      await generateCommunityPosterPdf({
        communityName: community.name,
        address: community.address,
        accessCode: community.accessCode,
        loginUrl: buildCommunityLoginUrl(slug),
        loginSlug: slug,
      })
      setSuccessFlash(`Cartel PDF descargado — ${community.name}.`)
    } catch (e) {
      setError(e.message || 'No se pudo generar el cartel PDF')
    } finally {
      setPosterPdfBusyId(null)
    }
  }, [])

  /** Agrupa comunidades por email de administrador de comunidad (ficha). */
  const administratorsDirectory = useMemo(() => {
    const map = new Map()
    for (const c of communities) {
      const em = String(c.communityAdminEmail || '')
        .trim()
        .toLowerCase()
      if (!em) continue
      if (!map.has(em)) map.set(em, [])
      map.get(em).push({
        id: c.id,
        name: c.name,
        status: c.status || 'active',
      })
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([email, rows]) => ({
        email,
        communities: [...rows].sort((x, y) => String(x.name).localeCompare(String(y.name))),
      }))
  }, [communities])

  const loadCommunities = useCallback(async () => {
    if (!accessToken) {
      setCommunities([])
      setOperationalStats(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/admin/communities?includeStats=1'), {
        headers: jsonAuthHeaders(accessToken),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        if (res.status === 403) {
          throw new Error(
            d.message ||
              d.error ||
              'Sin permisos de super administrador. Cierra sesión e inicia con la cuenta de administrador global.',
          )
        }
        throw new Error(d.error || d.message || `Error ${res.status}`)
      }
      const data = await res.json()
      setCommunities(Array.isArray(data) ? data : [])
      try {
        const aggRes = await fetch(apiUrl('/api/admin/communities/stats-aggregate'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const agg = await aggRes.json().catch(() => ({}))
        if (aggRes.ok) {
          setOperationalStats({
            plannedResidentSlots: Number(agg.plannedResidentSlots) || 0,
            openIncidents: Number(agg.openIncidents) || 0,
            activeBookings: Number(agg.activeBookings) || 0,
          })
        } else {
          setOperationalStats(null)
        }
      } catch {
        setOperationalStats(null)
      }
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las comunidades')
      setCommunities([])
      setOperationalStats(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadCommunities()
  }, [loadCommunities])

  useEffect(() => {
    if (!successFlash) return
    const t = setTimeout(() => setSuccessFlash(''), 8000)
    return () => clearTimeout(t)
  }, [successFlash])

  /** Alta nueva: rellenar código VEC propuesto por el servidor (editable). */
  useEffect(() => {
    if (!modalOpen || editingId != null || !accessToken) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/admin/communities/suggest-access-code'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const d = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || typeof d.accessCode !== 'string' || !d.accessCode.trim()) return
        setForm((f) => {
          if (f.accessCode.trim() !== '') return f
          return { ...f, accessCode: d.accessCode.trim().toUpperCase() }
        })
      } catch {
        /* el usuario puede escribir el código a mano o dejar vacío */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modalOpen, editingId, accessToken])

  const openAdd = () => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      ...(isScopedServiceAdmin && user?.company?.id != null
        ? { serviceProviderCompanyId: String(user.company.id) }
        : {}),
    })
    setModalOpen(true)
  }

  const openEdit = (c) => {
    setEditingId(c.id)
    setForm({
      name: c.name || '',
      nifCif: c.nifCif || '',
      address: c.address || '',
      accessCode: c.accessCode || '',
      loginSlug: c.loginSlug || '',
      contactEmail: c.contactEmail || '',
      presidentPortal: c.presidentPortal || '',
      presidentPiso: c.presidentPiso || '',
      communityAdminEmail: c.communityAdminEmail || '',
      communityAdminName: c.communityAdminName || '',
      ...conciergeEmailsFromCommunity(c),
      poolStaffEmail: c.poolStaffEmail || '',
      status: c.status || 'active',
      portalCount: String(c.portalCount ?? 1),
      residentSlots: c.residentSlots != null ? String(c.residentSlots) : '',
      gymAccessEnabled: Boolean(c.gymAccessEnabled),
      poolAccessSystemEnabled: Boolean(c.poolAccessSystemEnabled),
      poolSeasonActive: Boolean(c.poolSeasonActive),
      poolSeasonStart: planExpiresOnForInput(c.poolSeasonStart),
      poolSeasonEnd: planExpiresOnForInput(c.poolSeasonEnd),
      poolHoursNote: c.poolHoursNote != null ? String(c.poolHoursNote) : '',
      poolMaxOccupancy: c.poolMaxOccupancy != null ? String(c.poolMaxOccupancy) : '',
      appNavServicesEnabled: c.appNavServicesEnabled !== false,
      appNavIncidentsEnabled: c.appNavIncidentsEnabled !== false,
      appNavBookingsEnabled: c.appNavBookingsEnabled !== false,
      appNavPoolAccessEnabled: c.appNavPoolAccessEnabled === true,
      appNavPaqueteriaEnabled: c.appNavPaqueteriaEnabled === true,
      paqueteriaSpecialDeliveryEnabled: c.paqueteriaSpecialDeliveryEnabled === true,
      paqueteriaKeyLoansEnabled: c.paqueteriaKeyLoansEnabled === true,
      appNavCuadernoDiarioEnabled: c.appNavCuadernoDiarioEnabled === true,
      serviceCategoryModes: (() => {
        const base = defaultServiceCategoryModesRecord()
        const raw = c.serviceRequestCategoryModesJson
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          for (const { id } of SERVICE_CATEGORIES) {
            if (raw[id] === 'soon') base[id] = 'soon'
          }
        }
        return base
      })(),
      padelCourtCount: String(c.padelCourtCount ?? 0),
      padelMaxHoursPerBooking: formatPadelHoursInputValue(c.padelMaxHoursPerBooking, 2),
      padelMaxHoursApartmentDay: formatPadelHoursInputValue(c.padelMaxHoursPerApartmentPerDay, 4),
      padelMinAdvanceHours: String(c.padelMinAdvanceHours ?? 24),
      padelOpenTime: padWallClockForInput(c.padelOpenTime, '08:00'),
      padelCloseTime: padWallClockForInput(c.padelCloseTime, '22:00'),
      salonBookingMode: c.salonBookingMode === 'day' ? 'day' : 'slots',
      customSpaces: normalizeCustomSpacesFromApi(c.customLocations),
      planExpiresOn: planExpiresOnForInput(c.planExpiresOn),
      companyId: c.companyId != null ? String(c.companyId) : '',
      serviceProviderCompanyId:
        c.serviceProviderCompanyId != null ? String(c.serviceProviderCompanyId) : '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const openPortalsModal = (c) => {
    setPortalsError('')
    setPortalsModalCommunity(c)
    setPortalsDraft(normalizePortalLabelsFromApi(c.portalLabels, c.portalCount))
    setPortalsDwellingDraft(normalizePortalDwellingDraftFromApi(c.portalDwellingConfig, c.portalCount))
  }

  const closePortalsModal = () => {
    setPortalsModalCommunity(null)
    setPortalsDraft([])
    setPortalsDwellingDraft([])
    setPortalsError('')
  }

  /** Copia plantas / puertas por planta / etiquetas del primer portal con datos al resto (no toca alias). */
  const replicatePortalDwellingToAll = () => {
    const draft = portalsDwellingDraft
    let src = -1
    for (let i = 0; i < draft.length; i += 1) {
      const d = draft[i] || {}
      const hasFloors = String(d.floors ?? '').trim() !== ''
      const hasDoors = String(d.doorsPerFloor ?? '').trim() !== ''
      const hasVariable =
        d.useVariableDoorsPerFloor &&
        Array.isArray(d.doorsPerFloorByPiso) &&
        d.doorsPerFloorByPiso.some((x) => String(x ?? '').trim() !== '')
      const scheme = d.doorScheme === 'numbers' ? 'numbers' : 'letters'
      if (hasFloors || hasDoors || hasVariable || scheme === 'numbers') {
        src = i
        break
      }
    }
    if (src < 0) {
      setPortalsError(
        'Indica plantas o puertas por planta en al menos un portal (o elige «Números» en etiquetas) para poder replicar.',
      )
      return
    }
    setPortalsError('')
    const t = draft[src] || {}
    const floors = String(t.floors ?? '').trim()
    const doorsPerFloor = String(t.doorsPerFloor ?? '').trim()
    const doorsTopFloor = String(t.doorsTopFloor ?? '').trim()
    const doorScheme = t.doorScheme === 'numbers' ? 'numbers' : 'letters'
    const useVariableDoorsPerFloor = !!t.useVariableDoorsPerFloor
    const doorsPerFloorByPiso = Array.isArray(t.doorsPerFloorByPiso) ? [...t.doorsPerFloorByPiso] : []
    setPortalsDwellingDraft((prev) =>
      prev.map((row) => ({
        floors,
        doorsPerFloor,
        doorsTopFloor,
        doorScheme,
        useVariableDoorsPerFloor,
        doorsPerFloorByPiso: [...doorsPerFloorByPiso],
        streetLocales: streetLocalesFromDraft(row),
        residentialGroundFloor: !!row?.residentialGroundFloor,
      })),
    )
  }

  const savePortalsModal = async () => {
    if (!accessToken || !portalsModalCommunity) return
    setPortalsSaving(true)
    setPortalsError('')
    try {
      for (let i = 0; i < portalsDwellingDraft.length; i += 1) {
        const portalLabel = portalsDraft[i]?.trim() || `Portal ${i + 1}`
        const localeErr = validateStreetLocalesDraft(streetLocalesFromDraft(portalsDwellingDraft[i]), portalLabel)
        if (localeErr) {
          setPortalsError(localeErr)
          return
        }
        const d = portalsDwellingDraft[i]
        if (d?.useVariableDoorsPerFloor) {
          const f = parseInt(String(d.floors ?? '').trim(), 10)
          if (!Number.isFinite(f) || f < 1 || f > 50) {
            setPortalsError(`Indica el número de plantas en ${portalLabel} para usar puertas distintas por planta.`)
            return
          }
          const scheme = d.doorScheme === 'numbers' ? 'numbers' : 'letters'
          let unitSum = 0
          for (const row of variableFloorRows(d)) {
            const n = parseInt(String(d.doorsPerFloorByPiso?.[row.draftIndex] ?? '').trim(), 10)
            if (!Number.isFinite(n) || n < 0 || n > 26) {
              setPortalsError(`Completa las puertas de ${row.label} en ${portalLabel} (0 = sin viviendas).`)
              return
            }
            if (scheme === 'letters' && n > 26) {
              setPortalsError(`Máximo 26 puertas con letras en ${row.label} (${portalLabel}).`)
              return
            }
            unitSum += n
          }
          if (unitSum < 1) {
            setPortalsError(`Indica al menos una vivienda en ${portalLabel} (suma de puertas por planta).`)
            return
          }
        }
      }
      const portalDwellingConfig = portalsDwellingDraft.map((d) => {
        const streetLocales = buildStreetLocalesForSave(streetLocalesFromDraft(d))
        const residentialGroundFloor = d.residentialGroundFloor === true
        const extras = {}
        if (streetLocales.length > 0) extras.streetLocales = streetLocales
        if (residentialGroundFloor) extras.residentialGroundFloor = true
        const f = parseInt(String(d.floors ?? '').trim(), 10)
        const dp = parseInt(String(d.doorsPerFloor ?? '').trim(), 10)
        const scheme = d.doorScheme === 'numbers' ? 'numbers' : 'letters'
        const useVariable = d.useVariableDoorsPerFloor === true

        if (useVariable && Number.isFinite(f) && f >= 1 && f <= 50) {
          const map = {}
          let maxDoors = 0
          for (const row of variableFloorRows(d)) {
            const n = parseInt(String(d.doorsPerFloorByPiso?.[row.draftIndex] ?? '').trim(), 10)
            if (!Number.isFinite(n) || n < 0 || n > 26) {
              return Object.keys(extras).length > 0 ? extras : {}
            }
            if (scheme === 'letters' && n > 26) {
              return Object.keys(extras).length > 0 ? extras : {}
            }
            map[row.mapKey] = n
            maxDoors = Math.max(maxDoors, n)
          }
          let base = { floors: f, doorsPerFloor: maxDoors, doorScheme: scheme, doorsPerFloorByPiso: map }
          if (residentialGroundFloor) base = { ...base, residentialGroundFloor: true }
          if (streetLocales.length > 0) base = { ...base, streetLocales }
          return base
        }

        if (!Number.isFinite(f) || !Number.isFinite(dp) || f < 1 || f > 50 || dp < 1 || dp > 26) {
          return Object.keys(extras).length > 0 ? extras : {}
        }
        if (scheme === 'letters' && dp > 26) {
          return Object.keys(extras).length > 0 ? extras : {}
        }
        let base = { floors: f, doorsPerFloor: dp, doorScheme: scheme }
        const dtRaw = String(d.doorsTopFloor ?? '').trim()
        if (f >= 2 && dtRaw !== '') {
          const dt = parseInt(dtRaw, 10)
          if (Number.isFinite(dt) && dt >= 1 && dt < dp && !(scheme === 'letters' && dt > 26)) {
            base = { ...base, doorsTopFloor: dt }
          }
        }
        if (residentialGroundFloor) base = { ...base, residentialGroundFloor: true }
        if (streetLocales.length > 0) base = { ...base, streetLocales }
        return base
      })
      const res = await fetch(apiUrl(`/api/admin/communities/${portalsModalCommunity.id}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalLabels: portalsDraft, portalDwellingConfig }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      const autoCupo = d.residentSlots != null && Number(d.residentSlots) > 0
      setSuccessFlash(
        autoCupo
          ? `Portales guardados. «Nº vecinos» (cupo) actualizado automáticamente a ${d.residentSlots} (viviendas + locales en bajo por portal).`
          : 'Portales y estructura de plantas/puertas guardados. Completa todos los portales para fijar el cupo automáticamente.',
      )
      closePortalsModal()
      await loadCommunities()
    } catch (e) {
      setPortalsError(e.message || 'No se pudo guardar')
    } finally {
      setPortalsSaving(false)
    }
  }

  const addCustomSpaceRow = () => {
    setForm((f) => ({
      ...f,
      customSpaces: [
        ...f.customSpaces,
        {
          key: `k-${Date.now()}`,
          id: newUniqueSpaceId(),
          name: '',
          advanceLimitEnabled: true,
          maxDaysInAdvance: '14',
          minAdvanceEnabled: false,
          minDaysInAdvance: '7',
          rulesText: '',
          usageFeeEur: '',
          depositEur: '',
          customSlotsEnabled: false,
          timeSlots: [],
          regulationsOpen: false,
        },
      ],
    }))
  }

  const removeCustomSpaceRow = (key) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.filter((s) => s.key !== key),
    }))
  }

  const updateCustomSpace = (key, name) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) => (s.key === key ? { ...s, name } : s)),
    }))
  }

  const updateCustomSpaceAdvanceLimit = (key, enabled) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) =>
        s.key === key ? { ...s, advanceLimitEnabled: enabled } : s,
      ),
    }))
  }

  const updateCustomSpaceMaxDays = (key, value) => {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 3)
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) =>
        s.key === key ? { ...s, maxDaysInAdvance: digits } : s,
      ),
    }))
  }

  const patchCustomSpace = (key, patch) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }))
  }

  const addCustomSpaceTimeSlot = (spaceKey) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) => {
        if (s.key !== spaceKey) return s
        const slots = Array.isArray(s.timeSlots) ? [...s.timeSlots] : []
        const n = slots.length + 1
        return {
          ...s,
          customSlotsEnabled: true,
          timeSlots: [
            ...slots,
            { key: `ts-new-${Date.now()}`, id: `turno-${n}`, label: `Turno ${n}`, start: '12:00', end: '17:00' },
          ],
        }
      }),
    }))
  }

  const updateCustomSpaceTimeSlot = (spaceKey, slotKey, field, value) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) => {
        if (s.key !== spaceKey) return s
        return {
          ...s,
          timeSlots: (s.timeSlots || []).map((slot) =>
            slot.key === slotKey ? { ...slot, [field]: value } : slot,
          ),
        }
      }),
    }))
  }

  const removeCustomSpaceTimeSlot = (spaceKey, slotKey) => {
    setForm((f) => ({
      ...f,
      customSpaces: f.customSpaces.map((s) => {
        if (s.key !== spaceKey) return s
        const next = (s.timeSlots || []).filter((slot) => slot.key !== slotKey)
        return { ...s, timeSlots: next, customSlotsEnabled: next.length > 0 }
      }),
    }))
  }

  const submitForm = async (e) => {
    e.preventDefault()
    if (!accessToken) return
    const contact = form.contactEmail.trim()
    if (!contact) {
      setError('El email de contacto de la comunidad es obligatorio.')
      return
    }
    const name = form.name.trim() || 'Sin nombre'
    const nifCif = form.nifCif.trim()
    if (nifCif.length > 32) {
      setError('El NIF/CIF no puede superar 32 caracteres.')
      return
    }
    const address = form.address.trim()
    if (address.length > 512) {
      setError('La dirección no puede superar 512 caracteres.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const portalCount = Math.min(999, Math.max(1, Number.parseInt(form.portalCount, 10) || 1))
      const rs = form.residentSlots.trim()
      const residentSlots = rs === '' ? null : Math.min(999_999, Math.max(0, Number.parseInt(rs, 10) || 0))
      const padelCourtCount = Math.min(50, Math.max(0, Number.parseInt(form.padelCourtCount, 10) || 0))
      let padelMaxHoursPerBooking = parsePadelHoursFormValue(form.padelMaxHoursPerBooking, 2)
      let padelMaxHoursPerApartmentPerDay = parsePadelHoursFormValue(form.padelMaxHoursApartmentDay, 4)
      if (padelMaxHoursPerApartmentPerDay < padelMaxHoursPerBooking) {
        padelMaxHoursPerApartmentPerDay = padelMaxHoursPerBooking
      }

      const padelMinAdvanceHours = Math.min(
        168,
        Math.max(1, Number.parseInt(form.padelMinAdvanceHours, 10) || 24),
      )
      const normalizeHHMM = (raw) => {
        const t = String(raw ?? '').trim()
        const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t)
        if (!m) return null
        const h = Number(m[1])
        const mi = Number(m[2])
        if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null
        return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
      }
      const padelOpenTime = normalizeHHMM(form.padelOpenTime) || '08:00'
      const padelCloseTime = normalizeHHMM(form.padelCloseTime) || '22:00'
      const openMin = Number(padelOpenTime.slice(0, 2)) * 60 + Number(padelOpenTime.slice(3, 5))
      const closeMin = Number(padelCloseTime.slice(0, 2)) * 60 + Number(padelCloseTime.slice(3, 5))
      if (openMin >= closeMin) {
        setError('La hora de apertura de pádel debe ser anterior a la de cierre (mismo día).')
        setSaving(false)
        return
      }

      const poolCapRaw = form.poolMaxOccupancy.trim()
      let poolMaxOccupancy = null
      if (poolCapRaw !== '') {
        const pc = Number.parseInt(poolCapRaw, 10)
        if (!Number.isInteger(pc) || pc < 1 || pc > 5000) {
          setError('Aforo piscina (instalación): entero entre 1 y 5000, o vacío para sin límite.')
          setSaving(false)
          return
        }
        poolMaxOccupancy = pc
      }

      const customLocations = form.customSpaces
        .filter((s) => s.name.trim())
        .map((s) => {
          const name = s.name.trim()
          let id = s.id.trim()
          if (!id) id = slugFromNameClient(name) || newUniqueSpaceId()
          const row = { id, name }
          if (s.advanceLimitEnabled) {
            const n = Number.parseInt(String(s.maxDaysInAdvance ?? '').trim(), 10)
            row.maxDaysInAdvance = Math.min(365, Math.max(1, Number.isFinite(n) ? n : 14))
          } else {
            row.maxDaysInAdvance = null
          }
          if (s.minAdvanceEnabled) {
            const mn = Number.parseInt(String(s.minDaysInAdvance ?? '').trim(), 10)
            if (Number.isFinite(mn) && mn >= 1) row.minDaysInAdvance = Math.min(365, mn)
          }
          const rules = String(s.rulesText ?? '').trim()
          if (rules) row.rulesText = rules.slice(0, 8000)
          const fee = Number.parseFloat(String(s.usageFeeEur ?? '').replace(',', '.'))
          if (Number.isFinite(fee) && fee > 0) row.usageFeeEur = Math.round(fee * 100) / 100
          const dep = Number.parseFloat(String(s.depositEur ?? '').replace(',', '.'))
          if (Number.isFinite(dep) && dep > 0) row.depositEur = Math.round(dep * 100) / 100
          if (s.customSlotsEnabled && Array.isArray(s.timeSlots) && s.timeSlots.length > 0) {
            const slots = []
            for (const slot of s.timeSlots) {
              const label = String(slot.label ?? '').trim().slice(0, 80)
              const start = String(slot.start ?? '').trim()
              const end = String(slot.end ?? '').trim()
              if (!label || !/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) continue
              let sid = String(slot.id ?? '').trim().slice(0, 64)
              if (!sid) sid = `turno-${slots.length + 1}`
              slots.push({ id: sid, label, start, end })
            }
            if (slots.length > 0) row.timeSlots = slots
          }
          return row
        })

      const url = editingId
        ? apiUrl(`/api/admin/communities/${editingId}`)
        : apiUrl('/api/admin/communities')

      const rawCo = String(form.companyId ?? '').trim()
      let companyIdPayload = null
      if (rawCo !== '') {
        const n = Number.parseInt(rawCo, 10)
        if (!Number.isInteger(n) || n < 1) {
          setError('ID de empresa de administración inválido (o déjalo vacío).')
          setSaving(false)
          return
        }
        companyIdPayload = n
      }

      let serviceProviderCompanyIdPayload = null
      if (isScopedServiceAdmin && user?.company?.id != null) {
        serviceProviderCompanyIdPayload = Number(user.company.id)
      } else {
        const rawSp = String(form.serviceProviderCompanyId ?? '').trim()
        if (rawSp !== '') {
          const n = Number.parseInt(rawSp, 10)
          if (!Number.isInteger(n) || n < 1) {
            setError('ID de empresa de servicios inválido (o déjalo vacío).')
            setSaving(false)
            return
          }
          serviceProviderCompanyIdPayload = n
        }
      }
      if (
        companyIdPayload != null &&
        serviceProviderCompanyIdPayload != null &&
        companyIdPayload === serviceProviderCompanyIdPayload
      ) {
        setError('La empresa de administración y la de servicios deben ser distintas.')
        setSaving(false)
        return
      }

      const common = {
        name,
        nifCif: nifCif || null,
        address: address || null,
        contactEmail: contact,
        presidentEmail: null,
        loginSlug: form.loginSlug.trim(),
        communityAdminEmail: communityUsesCompanyAdmin ? null : form.communityAdminEmail.trim() || null,
        communityAdminName: communityUsesCompanyAdmin ? null : form.communityAdminName.trim() || null,
        ...conciergePayloadFromForm(form),
        poolStaffEmail: form.poolStaffEmail.trim(),
        status: form.status,
        companyId: companyIdPayload,
        serviceProviderCompanyId: serviceProviderCompanyIdPayload,
        portalCount,
        residentSlots,
        gymAccessEnabled: form.gymAccessEnabled,
        poolAccessSystemEnabled: form.poolAccessSystemEnabled,
        poolSeasonActive: form.poolSeasonActive,
        poolSeasonStart: form.poolSeasonStart.trim() || null,
        poolSeasonEnd: form.poolSeasonEnd.trim() || null,
        poolHoursNote: form.poolHoursNote.trim() || null,
        poolMaxOccupancy,
        appNavServicesEnabled: form.appNavServicesEnabled,
        appNavIncidentsEnabled: form.appNavIncidentsEnabled,
        appNavBookingsEnabled: form.appNavBookingsEnabled,
        appNavPoolAccessEnabled: form.appNavPoolAccessEnabled,
        appNavPaqueteriaEnabled: form.appNavPaqueteriaEnabled,
        paqueteriaSpecialDeliveryEnabled:
          form.appNavPaqueteriaEnabled && form.paqueteriaSpecialDeliveryEnabled,
        paqueteriaKeyLoansEnabled: form.appNavPaqueteriaEnabled && form.paqueteriaKeyLoansEnabled,
        appNavCuadernoDiarioEnabled: form.appNavCuadernoDiarioEnabled,
        serviceRequestCategoryModes: form.serviceCategoryModes,
        padelCourtCount,
        padelMaxHoursPerBooking,
        padelMaxHoursPerApartmentPerDay,
        padelMinAdvanceHours,
        padelOpenTime,
        padelCloseTime,
        salonBookingMode: form.salonBookingMode === 'day' ? 'day' : 'slots',
        customLocations,
        planExpiresOn: form.planExpiresOn.trim() || null,
      }

      const body = editingId
        ? { ...common, accessCode: form.accessCode.trim() }
        : { ...common, accessCode: form.accessCode.trim() || null }

      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)

      if (!editingId && d.accessCode) {
        let msg = `Comunidad creada. Código de acceso: ${d.accessCode} — compártelo con administradores y vecinos para vincular la comunidad.`
        msg +=
          ' No se ha enviado ningún correo automático: las cuentas de acceso (si eran nuevas) están creadas. Usa «Enviar correos de alta» en la lista para mandar invitaciones cuando quieras.'
        const ob = d.onboarding
        if (ob?.devPasswords?.length) {
          msg += ` · Contraseñas provisionales (cópialas ya): ${ob.devPasswords.map((x) => `${x.email} → ${x.password}`).join(' · ')}`
        }
        if (ob?.errors?.length) {
          msg += ` · Avisos: ${ob.errors.join('; ')}`
        }
        setSuccessFlash(msg)
      } else {
        let msg = `Cambios guardados (portales: ${d.portalCount ?? '—'}, cupo vecinos: ${
          d.residentSlots != null ? d.residentSlots : '—'
        }).`
        if (d.onboarding) {
          msg +=
            ' Emails de presidente / administrador / conserje / socorrista sincronizados con cuentas (sin enviar correos automáticos).'
          if (d.onboarding.devPasswords?.length) {
            msg += ` · Contraseñas nuevas (cópialas): ${d.onboarding.devPasswords.map((x) => `${x.email} → ${x.password}`).join(' · ')}`
          }
          if (d.onboarding.errors?.length) {
            msg += ` · Avisos: ${d.onboarding.errors.join('; ')}`
          }
        }
        if (d.staffDemoted?.length) {
          const roleEs = {
            president: 'presidente',
            community_admin: 'administrador',
            concierge: 'conserje',
            pool_staff: 'socorrista',
          }
          msg += ` · Cuentas que ya no figuran en la ficha: pasadas a vecino — ${d.staffDemoted.map((x) => `${x.email} (era ${roleEs[x.previousRole] || x.previousRole})`).join('; ')}`
        }
        const conserjesLabel = conciergeEmailsSummary(d)
        msg += ` · Guardado en servidor: presidente ${formatPresidentOnCard(d)}, admin ${d.communityAdminEmail?.trim() || '—'}, conserje ${conserjesLabel || '—'}, socorrista ${d.poolStaffEmail?.trim() || '—'}.`
        setSuccessFlash(msg)
      }
      closeModal()
      await loadCommunities()
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const openOnboardingMail = (c) => {
    setOnboardingMailCommunity(c)
    setOnboardingMailSel({
      invitePresident: false,
      inviteAdmin: false,
      inviteConcierge: false,
      invitePoolStaff: false,
      contactSummary: false,
    })
    setOnboardingMailOpen(true)
  }

  const closeOnboardingMail = () => {
    setOnboardingMailOpen(false)
    setOnboardingMailCommunity(null)
  }

  const submitOnboardingMail = async (e) => {
    e.preventDefault()
    if (!accessToken || !onboardingMailCommunity) return
    setOnboardingMailSending(true)
    setError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/communities/${onboardingMailCommunity.id}/send-onboarding-mails`),
        {
          method: 'POST',
          headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(onboardingMailSel),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      const sent = (d.invitations || []).filter((i) => i.emailSent).length
      let msg = `Envío completado: ${sent} correo(s) de invitación enviado(s).`
      if (d.contactSummarySent) msg += ' Resumen enviado al email de contacto de la comunidad.'
      if (d.devPasswords?.length) {
        msg += ` Contraseñas nuevas (cópialas): ${d.devPasswords.map((x) => `${x.email} → ${x.password}`).join(' · ')}`
      }
      if (d.errors?.length) msg += ` · Avisos: ${d.errors.join('; ')}`
      setSuccessFlash(msg)
      closeOnboardingMail()
    } catch (err) {
      setError(err.message || 'No se pudieron enviar los correos')
    } finally {
      setOnboardingMailSending(false)
    }
  }

  const loadCommunityUsers = async (c) => {
    if (!accessToken || !c?.id) return
    setUsersModalLoading(true)
    setUsersModalError('')
    setUsersModalData(null)
    try {
      const res = await fetch(apiUrl(`/api/admin/communities/${c.id}/users`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setUsersModalData(d)
    } catch (err) {
      setUsersModalError(err.message || 'No se pudieron cargar los usuarios')
    } finally {
      setUsersModalLoading(false)
    }
  }

  const openCommunityUsers = (c) => {
    setUsersModalCommunity(c)
    setUsersTempPasswordFlash('')
    loadCommunityUsers(c)
  }

  const closeCommunityUsers = () => {
    setUsersModalCommunity(null)
    setUsersModalData(null)
    setUsersModalError('')
    setUsersTempPasswordFlash('')
    setUsersBulkDeleteBusy(false)
  }

  const deleteCompanyAdmin = async (companyId, admin, companyName) => {
    if (!accessToken) return
    const label = admin.email || admin.name || `usuario ${admin.id}`
    const okConfirm = await confirm({
      title: 'Eliminar administrador de empresa',
      message: `¿Eliminar la cuenta de ${label} (${companyName || 'empresa'})?\n\nYa no podrá acceder como administrador de empresa. No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!okConfirm) return
    setCompanyAdminDeleteBusyId(admin.id)
    setError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/companies/${companyId}/admins/${admin.id}`),
        {
          method: 'DELETE',
          headers: jsonAuthHeaders(accessToken),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`)
      setSuccessFlash(d.message || 'Administrador de empresa eliminado.')
      await loadCompaniesList()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el administrador')
    } finally {
      setCompanyAdminDeleteBusyId(null)
    }
  }

  const impersonateCompanyAdmin = async (companyId, userId, companyName) => {
    if (!accessToken) return
    setCompanyAdminLoginBusyId(userId)
    setError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/companies/${companyId}/admins/${userId}/impersonate`),
        {
          method: 'POST',
          headers: jsonAuthHeaders(accessToken),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      openVecindarioImpersonationTab({
        accessToken: d.accessToken,
        user: d.user,
        company: d.company ?? { id: companyId, name: companyName || 'Empresa' },
      })
      const serviceSuper =
        d.company?.scopedSuperAdmin === true || d.company?.kind === 'prestacion_servicios'
      setSuccessFlash(
        serviceSuper
          ? 'Se abrió una pestaña como prestador de servicios (panel super admin acotado). Esta pestaña sigue siendo super administrador.'
          : 'Se abrió una pestaña como administrador de empresa. Esta pestaña sigue siendo super administrador.',
      )
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión como administrador de empresa')
    } finally {
      setCompanyAdminLoginBusyId(null)
    }
  }

  const impersonateUser = async (userId) => {
    if (!accessToken || !usersModalCommunity) return
    setUsersActionBusyId(userId)
    setError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/communities/${usersModalCommunity.id}/impersonate`),
        {
          method: 'POST',
          headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      const { accessToken: token, user, community } = d
      if (!token || !user || !community?.name) throw new Error('Respuesta incompleta del servidor')
      const code = (community.accessCode || usersModalCommunity.accessCode || '').trim()
      const nonce = crypto.randomUUID()
      const targetUrl = new URL(import.meta.env.BASE_URL || '/', window.location.origin)
      targetUrl.hash = `impersonate=${nonce}`

      const origin = window.location.origin
      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        window.removeEventListener('message', onMessage)
        clearTimeout(timer)
      }

      const onMessage = (ev) => {
        if (ev.origin !== origin) return
        if (
          !ev.data ||
          ev.data.type !== VEC_IMPERSONATE_CHILD_READY ||
          ev.data.nonce !== nonce
        ) {
          return
        }
        cleanup()
        const src = ev.source
        if (src && typeof src.postMessage === 'function') {
          src.postMessage(
            {
              type: VEC_IMPERSONATE_PAYLOAD,
              nonce,
              payload: {
                accessToken: token,
                user,
                community: {
                  id: community.id,
                  name: community.name,
                  accessCode: code,
                },
              },
            },
            origin,
          )
        }
      }

      window.addEventListener('message', onMessage)
      const timer = setTimeout(cleanup, 180_000)

      /* Sin noopener: la pestaña nueva necesita window.opener para el handoff por postMessage. */
      const win = window.open(targetUrl.toString(), '_blank')
      if (!win) {
        cleanup()
        throw new Error(
          'El navegador bloqueó la ventana nueva. Permite ventanas emergentes para este sitio e inténtalo de nuevo.',
        )
      }
      closeCommunityUsers()
      setSuccessFlash(
        'Se abrió una pestaña con la sesión de ese usuario. Esta pestaña sigue siendo super administrador.',
      )
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión como ese usuario')
    } finally {
      setUsersActionBusyId(null)
    }
  }

  const deleteAllCommunityResidents = async () => {
    if (!accessToken || !usersModalCommunity || !(usersModalData?.residentsFromBookings?.length)) return
    const name = String(usersModalCommunity.name || '').trim()
    const ok = await confirm({
      title: 'Eliminar todas las cuentas de vecinos',
      message:
        `¿Eliminar permanentemente todas las cuentas de vecinos (rol «residente») de «${name}»?\n\n` +
        'No se borran administrador, presidente, conserje ni socorrista de la ficha.\n' +
        'Las reservas se conservan pero quedarán sin usuario asociado.\n' +
        'Las incidencias y solicitudes de servicio de esta comunidad creadas por esos vecinos se eliminan.\n\n' +
        'Esta acción no se puede deshacer.',
      confirmLabel: 'Continuar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const typed = await prompt({
      title: 'Confirmar nombre de la comunidad',
      message: `Escribe el nombre exacto de la comunidad para confirmar:\n\n${name}`,
      placeholder: name,
      confirmLabel: 'Eliminar cuentas',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (typed == null) return
    if (typed.trim().toLowerCase() !== name.toLowerCase()) {
      setUsersModalError('El nombre no coincide. No se ha borrado nada.')
      return
    }
    setUsersBulkDeleteBusy(true)
    setUsersModalError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/communities/${usersModalCommunity.id}/residents/bulk-delete`),
        {
          method: 'POST',
          headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmCommunityName: name }),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setSuccessFlash(d.message || `Eliminadas ${d.deleted ?? 0} cuenta(s) de vecino.`)
      await loadCommunityUsers(usersModalCommunity)
    } catch (err) {
      setUsersModalError(err.message || 'No se pudieron borrar las cuentas')
    } finally {
      setUsersBulkDeleteBusy(false)
    }
  }

  const deleteCommunityUser = async (userId, label) => {
    if (!accessToken || !usersModalCommunity) return
    const okConfirm = await confirm({
      title: 'Eliminar cuenta',
      message: `¿Eliminar la cuenta de ${label}?\n\nSi figura en la ficha de la comunidad, su correo también se quitará de esos campos. No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!okConfirm) return
    setUsersActionBusyId(userId)
    setUsersModalError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/communities/${usersModalCommunity.id}/users/${userId}`),
        {
          method: 'DELETE',
          headers: jsonAuthHeaders(accessToken),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setUsersTempPasswordFlash(d.message || 'Cuenta eliminada.')
      await loadCommunityUsers(usersModalCommunity)
    } catch (err) {
      setUsersModalError(err.message || 'No se pudo eliminar la cuenta')
    } finally {
      setUsersActionBusyId(null)
    }
  }

  const toggleConciergeFichaActive = async (email, currentlyActive, label) => {
    if (!accessToken || !usersModalCommunity) return
    const nextActive = !currentlyActive
    if (!nextActive) {
      const okConfirm = await confirm({
        title: 'Desactivar conserje',
        message: `¿Desactivar a ${label} en la ficha?\n\nNo podrá entrar en la app hasta reactivarlo. El correo permanece en la ficha (vacaciones / relevo).`,
        confirmLabel: 'Desactivar',
        cancelLabel: 'Cancelar',
        variant: 'warning',
      })
      if (!okConfirm) return
    }
    setUsersConciergeStatusBusy(email)
    setUsersModalError('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/communities/${usersModalCommunity.id}/concierge-ficha-active`),
        {
          method: 'PATCH',
          headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, active: nextActive }),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setUsersTempPasswordFlash(d.message || (nextActive ? 'Conserje activado.' : 'Conserje desactivado.'))
      await loadCommunityUsers(usersModalCommunity)
      setCommunities((prev) =>
        prev.map((c) => (c.id === usersModalCommunity.id ? { ...c, ...(d.community || {}) } : c)),
      )
    } catch (err) {
      setUsersModalError(err.message || 'No se pudo cambiar el estado')
    } finally {
      setUsersConciergeStatusBusy(null)
    }
  }

  const issueTemporaryPassword = async (userId, label) => {
    if (!accessToken || !usersModalCommunity) return
    const okConfirm = await confirm({
      title: 'Contraseña temporal',
      message: `¿Generar una contraseña temporal nueva para ${label}? La contraseña anterior dejará de valer.`,
      confirmLabel: 'Generar',
      cancelLabel: 'Cancelar',
      variant: 'warning',
    })
    if (!okConfirm) return
    setUsersActionBusyId(userId)
    setUsersModalError('')
    setUsersTempPasswordFlash('')
    try {
      const res = await fetch(
        apiUrl(`/api/admin/communities/${usersModalCommunity.id}/temporary-password`),
        {
          method: 'POST',
          headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      const pw = d.temporaryPassword
      setUsersTempPasswordFlash(
        pw
          ? `Contraseña temporal para ${label}: ${pw} — cópiala ahora; la anterior ya no vale.`
          : d.message || 'Contraseña actualizada.',
      )
    } catch (err) {
      setUsersModalError(err.message || 'No se pudo generar la contraseña temporal')
    } finally {
      setUsersActionBusyId(null)
    }
  }

  const removeCommunity = async (c) => {
    if (!accessToken) return
    const ok = await confirm({
      title: 'Eliminar comunidad',
      message: `¿Eliminar la comunidad «${c.name}»? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/admin/communities/${c.id}`), {
        method: 'DELETE',
        headers: jsonAuthHeaders(accessToken),
      })
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Error ${res.status}`)
      }
      await loadCommunities()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar')
    }
  }

  const stats = [
    {
      key: 'communities',
      value: operationalCommunitiesCount,
      label: 'Comunidades operativas',
      trend:
        communities.length > operationalCommunitiesCount
          ? `${communities.length} fichas en total (solo activas y demo cuentan arriba)`
          : null,
      icon: '🏘️',
    },
    {
      key: 'residents',
      value:
        operationalStats == null
          ? '—'
          : operationalStats.plannedResidentSlots > 0
            ? operationalStats.plannedResidentSlots
            : '—',
      label: 'Cupo vecinos (planificado)',
      trend:
        operationalStats == null
          ? 'Cargando…'
          : operationalStats.plannedResidentSlots > 0
            ? 'Suma en comunidades activas y demo: Nº vecinos en ficha o, si falta, estimado por portales'
            : 'Ninguna comunidad operativa tiene cupo (ni Nº vecinos ni portales completos para estimar)',
      icon: '👤',
    },
    {
      key: 'incidents',
      value: operationalStats == null ? '—' : operationalStats.openIncidents,
      label: 'Incidencias abiertas',
      trend:
        operationalStats == null
          ? 'Cargando…'
          : 'Pendientes en comunidades operativas',
      icon: '⚠️',
      accent: true,
    },
    {
      key: 'bookings',
      value: operationalStats == null ? '—' : operationalStats.activeBookings,
      label: 'Reservas activas',
      trend:
        operationalStats == null
          ? 'Cargando…'
          : 'Confirmadas desde hoy (zona Europe/Madrid)',
      icon: '📅',
    },
  ]

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-header-inner">
          <div className="admin-dashboard-brand">
            <h1 className="admin-dashboard-title">
              {isScopedServiceAdmin
                ? `Panel ${user?.company?.name?.trim() || 'prestador de servicios'}`
                : 'Panel super administrador'}
            </h1>
            <p className="admin-dashboard-subtitle">
              {isScopedServiceAdmin
                ? 'Gestión acotada de las comunidades donde prestáis servicios'
                : 'Gestión de comunidades, ajustes, incidencias y reservas'}
            </p>
          </div>
          <div className="admin-dashboard-header-actions">
            <span
              className={`admin-badge${isScopedServiceAdmin ? ' admin-badge--company' : ''}`}
              aria-label={isScopedServiceAdmin ? 'Empresa prestadora' : 'Super administrador'}
            >
              {isScopedServiceAdmin
                ? user?.company?.name?.trim() || 'Prestador de servicios'
                : 'Super administrador'}
            </span>
            {isFullSuperAdmin ? (
              <>
                <Link to="/admin/solicitudes-oferta" className="btn btn--ghost">
                  Solicitudes de oferta
                </Link>
                <Link to="/admin/services" className="btn btn--ghost">
                  Solicitudes de servicio
                </Link>
              </>
            ) : null}
            <Link to="/" className="admin-dashboard-back btn btn--ghost">
              Volver a la app vecinos
            </Link>
            <button type="button" className="admin-dashboard-add btn btn--primary" onClick={openAdd}>
              + Añadir comunidad
            </button>
          </div>
        </div>
      </header>

      <main className="admin-dashboard-main">
        <div className="admin-dashboard-inner">
          {successFlash && (
            <p className="admin-banner-success" role="status">
              {successFlash}
            </p>
          )}
          {error && (
            <p className="admin-banner-error" role="alert">
              {error}
            </p>
          )}

          <section className="admin-stats">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className={`admin-stat-card card ${stat.accent ? 'admin-stat-card--accent' : ''}`}
              >
                <div className="admin-stat-top">
                  <span className="admin-stat-icon" aria-hidden="true">{stat.icon}</span>
                  <span className="admin-stat-label">{stat.label}</span>
                </div>
                <span className={`admin-stat-value ${stat.accent ? 'admin-stat-value--accent' : ''}`}>
                  {stat.value}
                </span>
                {stat.trend && <span className="admin-stat-trend">{stat.trend}</span>}
              </div>
            ))}
          </section>

          {pendingCommunities.length > 0 ? (
            <section className="admin-section">
              <div className="admin-section-head">
                <h2 className="admin-section-title">Comunidades pendientes de aprobación</h2>
              </div>
              <p className="admin-directory-intro">
                Creadas por administradores de empresa. Actívalas cuando estén listas para uso (VEC, vecinos,
                etc.).
              </p>
              <div className="admin-communities">
                {pendingCommunities.map((c) => (
                  <article key={c.id} className="admin-community-row card">
                    <div className="admin-community-info">
                      <div className="admin-community-head">
                        <h3 className="admin-community-name">{c.name}</h3>
                        <span className="admin-community-status admin-community-status--pending_approval">
                          Pendiente
                        </span>
                      </div>
                      <div className="admin-community-details">
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">ID</span>
                          {c.id}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Administración</span>
                          {c.companyId != null
                            ? companyNameById.get(Number(c.companyId)) || `id ${c.companyId}`
                            : '—'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Servicios</span>
                          {c.serviceProviderCompanyId != null
                            ? companyNameById.get(Number(c.serviceProviderCompanyId)) ||
                              `id ${c.serviceProviderCompanyId}`
                            : '—'}
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Contacto</span>
                          {c.contactEmail || '—'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">NIF/CIF</span>
                          {c.nifCif || '—'}
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Dirección</span>
                          <span className="admin-address-preview">{c.address?.trim() || '—'}</span>
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">VEC</span>
                          <code>{c.accessCode || '—'}</code>
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Portales</span>
                          <span>
                            {c.portalCount ?? 1} — {portalsAliasesPreview(c.portalCount, c.portalLabels)}
                          </span>
                        </span>
                      </div>
                      {c.dashboardStats ? (
                        <CommunityDashboardStats
                          stats={c.dashboardStats}
                          residentSlots={c.residentSlots}
                        />
                      ) : null}
                    </div>
                    <div className="admin-community-row-actions">
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={approvalBusyId === c.id}
                        onClick={() => void patchCommunityStatus(c.id, 'active')}
                      >
                        {approvalBusyId === c.id ? '…' : 'Activar comunidad'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={approvalBusyId === c.id}
                        onClick={() => void patchCommunityStatus(c.id, 'inactive')}
                      >
                        Desactivar comunidad
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(c)}>
                        Editar ficha
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {isFullSuperAdmin ? (
          <section className="admin-section">
            <div className="admin-section-head">
              <h2 className="admin-section-title">Empresas y administradores de empresa</h2>
            </div>
            <p className="admin-directory-intro">
              Crea una empresa y luego añade uno o varios correos con rol{' '}
              <strong>administrador de empresa</strong> (cada uno es un usuario distinto con acceso al panel
              de la firma). Las comunidades que creen quedarán pendientes hasta que las actives aquí.
            </p>
            {companyAdminFlash && (
              <p className="admin-banner-success" role="status">
                {companyAdminFlash}
              </p>
            )}
            {companyPasswordFlash && (
              <p className="admin-banner-success" role="alert">
                {companyPasswordFlash}
              </p>
            )}
            <form className="card admin-new-company" onSubmit={createCompany}>
              <div className="admin-new-company__body">
                <div className="admin-new-company__intro">
                  <h3 className="admin-new-company__title">Nueva empresa</h3>
                  <p className="admin-new-company__subtitle">
                    Añade el nombre comercial de la firma. Después podrás vincular comunidades y crear
                    administradores de empresa.
                  </p>
                </div>
                <div className="admin-new-company__field">
                  <label className="admin-label" htmlFor="new-company-kind">
                    Tipo de empresa
                  </label>
                  <select
                    id="new-company-kind"
                    className="admin-input admin-select"
                    value={newCompanyKind}
                    onChange={(e) => setNewCompanyKind(e.target.value)}
                    disabled={companiesLoading}
                  >
                    <option value="administracion">Administración de fincas</option>
                    <option value="prestacion_servicios">Prestación de servicios (super admin acotado)</option>
                  </select>
                </div>
                <div className="admin-new-company__field">
                  <label className="admin-label" htmlFor="new-company-name">
                    Nombre comercial
                  </label>
                  <div className="admin-new-company__row">
                    <input
                      id="new-company-name"
                      className="admin-input admin-new-company__input"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Ej. Mi empresa de gestión S.L."
                      disabled={companiesLoading}
                      autoComplete="organization"
                    />
                    <button
                      type="submit"
                      className="btn btn--primary admin-new-company__submit"
                      disabled={creatingCompany || companiesLoading}
                    >
                      {creatingCompany ? 'Creando…' : 'Crear empresa'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
            {companiesLoading ? (
              <p className="admin-empty-hint">Cargando empresas…</p>
            ) : companiesList.length === 0 ? (
              <p className="admin-empty-hint">No hay empresas. Crea la primera arriba.</p>
            ) : (
              <div className="admin-directory-grid">
                {companiesList.map((co) => (
                  <article key={co.id} className="admin-directory-card card">
                    <div className="admin-directory-card-head">
                      <span className="admin-directory-email">{co.name}</span>
                      <span className="admin-directory-count">
                        {co.kind === 'prestacion_servicios' ? 'Servicios' : 'Administración'} ·{' '}
                        {co.communityCount ?? 0} adm. · {co.serviceProviderCommunityCount ?? 0} serv. ·{' '}
                        {co.companyAdminCount ?? 0} usu.
                      </span>
                    </div>
                    <div className="admin-company-kind-row">
                      <label className="admin-label" htmlFor={`company-kind-${co.id}`}>
                        Tipo de empresa
                      </label>
                      <select
                        id={`company-kind-${co.id}`}
                        className="admin-input admin-select admin-company-kind-row__select"
                        value={co.kind === 'prestacion_servicios' ? 'prestacion_servicios' : 'administracion'}
                        disabled={companyKindBusyId === co.id || companiesLoading}
                        onChange={(e) => void patchCompanyKind(co, e.target.value)}
                      >
                        <option value="administracion">Administración de fincas</option>
                        <option value="prestacion_servicios">Prestación de servicios</option>
                      </select>
                      <p className="admin-field-hint admin-company-kind-row__hint">
                        Administración → panel empresa. Servicios → super admin acotado a sus comunidades.
                      </p>
                    </div>
                    <div className="admin-company-admins-block">
                      <span className="admin-company-admins-block__label">Correos con acceso</span>
                      {Array.isArray(co.companyAdmins) && co.companyAdmins.length > 0 ? (
                        <ul className="admin-company-admins-block__list">
                          {co.companyAdmins.map((a) => (
                            <li key={a.id} className="admin-company-admins-block__item">
                              <div className="admin-company-admins-block__item-main">
                                <span className="admin-company-admins-block__email">
                                  {a.email || `— (usuario id ${a.id})`}
                                </span>
                                {a.name ? (
                                  <span className="admin-company-admins-block__name">{a.name}</span>
                                ) : null}
                              </div>
                              <div className="admin-company-admins-block__actions">
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  disabled={
                                    companyAdminLoginBusyId === a.id ||
                                    companyAdminDeleteBusyId === a.id
                                  }
                                  title="Abrir el panel de administrador de empresa en una pestaña nueva (sesión aislada)"
                                  onClick={() => void impersonateCompanyAdmin(co.id, a.id, co.name)}
                                >
                                  {companyAdminLoginBusyId === a.id ? '…' : 'Entrar como…'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm admin-row-btn admin-row-btn--danger"
                                  disabled={
                                    companyAdminDeleteBusyId === a.id ||
                                    companyAdminLoginBusyId === a.id
                                  }
                                  title="Eliminar esta cuenta de administrador de empresa"
                                  onClick={() => void deleteCompanyAdmin(co.id, a, co.name)}
                                >
                                  {companyAdminDeleteBusyId === a.id ? '…' : 'Eliminar'}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="admin-company-admins-block__empty">
                          Ningún administrador todavía. Pulsa «Añadir administrador de empresa».
                        </p>
                      )}
                    </div>
                    <div className="admin-company-card-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm admin-company-card-actions__main"
                        onClick={() =>
                          setCompanyAdminForm({
                            open: true,
                            companyId: co.id,
                            email: '',
                            name: '',
                            password: '',
                          })
                        }
                      >
                        Añadir administrador de empresa
                      </button>
                      <div className="admin-company-card-actions__password">
                        <span className="admin-company-card-actions__password-label">Acceso administrador</span>
                        <div className="admin-company-card-actions__password-btns">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={
                              (co.companyAdminCount ?? 0) < 1 ||
                              companyPasswordBusy === `${co.id}-show`
                            }
                            title="No se puede leer la contraseña antigua (está cifrada). Se genera una nueva y se muestra aquí una sola vez; la anterior deja de valer."
                            onClick={() => void onCompanyPasswordAction(co, false)}
                          >
                            Ver contraseña
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={
                              (co.companyAdminCount ?? 0) < 1 ||
                              companyPasswordBusy === `${co.id}-email`
                            }
                            title="Genera una nueva contraseña temporal y la envía por correo al administrador (requiere SMTP en el servidor)."
                            onClick={() => void onCompanyPasswordAction(co, true)}
                          >
                            Enviar contraseña por correo
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {!loading && administratorsDirectory.length > 0 ? (
            <section className="admin-section">
              <div className="admin-section-head">
                <h2 className="admin-section-title">Administradores (por correo en ficha)</h2>
              </div>
              <p className="admin-directory-intro">
                Mismo criterio que la app: un correo puede administrar varias comunidades; aquí ves el
                reparto.
              </p>
              <div className="admin-directory-grid">
                {administratorsDirectory.map(({ email, communities: rows }) => (
                  <article key={email} className="admin-directory-card card">
                    <div className="admin-directory-card-head">
                      <span className="admin-directory-email">{email}</span>
                      <span className="admin-directory-count">
                        {rows.length} comunidad{rows.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <ul className="admin-directory-list">
                      {rows.map((row) => (
                        <li key={row.id} className="admin-directory-list-item">
                          <span className="admin-directory-comm-name">{row.name}</span>
                          <span
                            className={`admin-directory-status admin-directory-status--${row.status || 'active'}`}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="admin-section">
            <div className="admin-section-head">
              <h2 className="admin-section-title">Comunidades</h2>
            </div>
            {loading ? (
              <p className="admin-empty-hint">Cargando…</p>
            ) : communities.length === 0 ? (
              <div className="admin-empty card">
                <p className="admin-empty-title">No hay comunidades todavía</p>
                <p className="admin-empty-hint">
                  Pulsa «Añadir comunidad» para crear la primera en la base de datos.
                </p>
                <button type="button" className="btn btn--primary" onClick={openAdd}>
                  + Añadir comunidad
                </button>
              </div>
            ) : (
              <div className="admin-communities">
                {communities.map((community) => (
                  <article key={community.id} className="admin-community-row card">
                    <div className="admin-community-info">
                      <div className="admin-community-head">
                        <h3 className="admin-community-name">{community.name}</h3>
                        <span
                          className={`admin-community-status admin-community-status--${community.status || 'active'}`}
                        >
                          {statusLabel(community.status)}
                        </span>
                      </div>
                      <div className="admin-community-details">
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">ID</span>
                          {community.id}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Administración</span>
                          {community.companyId != null
                            ? companyNameById.get(Number(community.companyId)) || `id ${community.companyId}`
                            : '—'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Servicios</span>
                          {community.serviceProviderCompanyId != null
                            ? companyNameById.get(Number(community.serviceProviderCompanyId)) ||
                              `id ${community.serviceProviderCompanyId}`
                            : '—'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">NIF/CIF</span>
                          {community.nifCif || '—'}
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Dirección</span>
                          <span className="admin-address-preview">{community.address?.trim() || '—'}</span>
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Code</span>
                          <code>{community.accessCode || '—'}</code>
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Enlace acceso (vecinos)</span>
                          {(community.loginSlug || '').trim() ? (
                            <span className="admin-public-link-block">
                              <code className="admin-code-break">{buildCommunityLoginUrl(community.loginSlug)}</code>
                              <span className="admin-public-link-actions">
                                <button
                                  type="button"
                                  className="btn btn--secondary btn--sm"
                                  onClick={() => void copyCommunityLoginUrl(community.loginSlug)}
                                >
                                  Copiar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--secondary btn--sm"
                                  onClick={() =>
                                    setQrModal({
                                      url: buildCommunityLoginUrl(community.loginSlug),
                                      fileSafeName: community.loginSlug,
                                    })
                                  }
                                >
                                  QR
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--secondary btn--sm"
                                  disabled={posterPdfBusyId === community.id}
                                  onClick={() => void downloadCommunityPoster(community)}
                                >
                                  {posterPdfBusyId === community.id ? 'PDF…' : 'Cartel PDF'}
                                </button>
                              </span>
                            </span>
                          ) : (
                            <div className="admin-link-missing-wrap">
                              <p className="admin-field-hint admin-field-hint--block admin-link-missing">
                                Sin slug corto todavía. Rellena{' '}
                                <strong>«Slug enlace de acceso»</strong> en la ficha para ver el enlace, copiar y QR.
                              </p>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() => openEdit(community)}
                              >
                                Configurar slug
                              </button>
                            </div>
                          )}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Plan hasta</span>
                          {formatPlanExpiresForCard(community.planExpiresOn) || 'Sin fecha'}
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Emails</span>
                          <span className="admin-email-lines">
                            <span>Comunidad: {community.contactEmail || '—'}</span>
                            <span>Presidente: {formatPresidentOnCard(community)}</span>
                            <span>
                              Admin:{' '}
                              {community.communityAdminName?.trim()
                                ? `${community.communityAdminName.trim()} · `
                                : ''}
                              {community.communityAdminEmail?.trim() ||
                                (companyAdminEmailsForCommunity(community, companiesList).length
                                  ? `empresa — ${companyAdminEmailsForCommunity(community, companiesList).join(', ')}`
                                  : community.companyId != null
                                    ? '— (gestión por empresa)'
                                    : '—')}
                            </span>
                            <span>
                              Conserje:{' '}
                              {conciergeEmailsSummary(community) || '—'}
                            </span>
                            <span>Socorrista: {community.poolStaffEmail || '—'}</span>
                          </span>
                        </span>
                        <span className="admin-community-detail admin-community-detail--block">
                          <span className="admin-community-detail-label">Portales</span>
                          <span>
                            {community.portalCount ?? 1} —{' '}
                            <span className="admin-portals-preview" title={portalsAliasesPreview(community.portalCount, community.portalLabels)}>
                              {portalsAliasesPreview(community.portalCount, community.portalLabels)}
                            </span>
                          </span>
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Cupo vecinos</span>
                          {community.residentSlots != null ? community.residentSlots : '—'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Gimnasio</span>
                          {community.gymAccessEnabled ? 'Control activo' : 'No'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Piscina</span>
                          {community.poolAccessSystemEnabled
                            ? `Sí${community.poolSeasonActive ? ' · temporada activa' : ''}${
                                community.poolMaxOccupancy != null
                                  ? ` · aforo instalación ${community.poolMaxOccupancy}`
                                  : ''
                              }`
                            : 'No'}
                        </span>
                        <span className="admin-community-detail">
                          <span className="admin-community-detail-label">Pádel</span>
                          {Number(community.padelCourtCount) || 0} pista(s) · máx.{' '}
                          {formatPadelHoursDisplay(community.padelMaxHoursPerBooking, 2)} h/reserva ·{' '}
                          {formatPadelHoursDisplay(community.padelMaxHoursPerApartmentPerDay, 4)} h/vivienda/día · antelación{' '}
                          plazo {Math.min(14, Math.max(1, Math.ceil((community.padelMinAdvanceHours ?? 24) / 24)))}{' '}
                          día(s) ·{' '}
                          {community.padelOpenTime || '08:00'}–{community.padelCloseTime || '22:00'}
                        </span>
                      </div>
                      <p className="admin-community-spaces-preview" title={spacesPreview(community.customLocations)}>
                        <span className="admin-community-detail-label">Espacios</span>
                        {spacesPreview(community.customLocations)}
                      </p>
                      <div className="admin-community-detail admin-community-detail--block admin-community-nav-tabs">
                        <span className="admin-community-detail-label">Pestañas app vecinos</span>
                        <div className="admin-nav-tab-checks" role="group" aria-label="Pestañas visibles para vecinos">
                          <label className="admin-nav-tab-check">
                            <input
                              type="checkbox"
                              checked={community.appNavServicesEnabled !== false}
                              disabled={navTabSavingId === community.id}
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  appNavServicesEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Servicios</span>
                          </label>
                          <label className="admin-nav-tab-check">
                            <input
                              type="checkbox"
                              checked={community.appNavIncidentsEnabled !== false}
                              disabled={navTabSavingId === community.id}
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  appNavIncidentsEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Incidencias</span>
                          </label>
                          <label className="admin-nav-tab-check">
                            <input
                              type="checkbox"
                              checked={community.appNavBookingsEnabled !== false}
                              disabled={navTabSavingId === community.id}
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  appNavBookingsEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Reservas</span>
                          </label>
                          <label className="admin-nav-tab-check">
                            <input
                              type="checkbox"
                              checked={community.appNavPoolAccessEnabled === true}
                              disabled={navTabSavingId === community.id}
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  appNavPoolAccessEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Acceso piscina</span>
                          </label>
                          <label className="admin-nav-tab-check">
                            <input
                              type="checkbox"
                              checked={community.appNavPaqueteriaEnabled === true}
                              disabled={navTabSavingId === community.id}
                              onChange={(e) => {
                                const checked = e.target.checked
                                patchCommunityNavTabs(community, {
                                  appNavPaqueteriaEnabled: checked,
                                  ...(checked ? {} : { paqueteriaSpecialDeliveryEnabled: false, paqueteriaKeyLoansEnabled: false }),
                                })
                              }}
                            />
                            <span>Paquetería</span>
                          </label>
                          <label className="admin-nav-tab-check admin-nav-tab-check--sub">
                            <input
                              type="checkbox"
                              checked={community.paqueteriaSpecialDeliveryEnabled === true}
                              disabled={
                                navTabSavingId === community.id ||
                                community.appNavPaqueteriaEnabled !== true
                              }
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  paqueteriaSpecialDeliveryEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Entrega especial</span>
                          </label>
                          <label className="admin-nav-tab-check admin-nav-tab-check--sub">
                            <input
                              type="checkbox"
                              checked={community.paqueteriaKeyLoansEnabled === true}
                              disabled={
                                navTabSavingId === community.id ||
                                community.appNavPaqueteriaEnabled !== true
                              }
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  paqueteriaKeyLoansEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Registro de llaves</span>
                          </label>
                          <label className="admin-nav-tab-check">
                            <input
                              type="checkbox"
                              checked={community.appNavCuadernoDiarioEnabled === true}
                              disabled={navTabSavingId === community.id}
                              onChange={(e) =>
                                patchCommunityNavTabs(community, {
                                  appNavCuadernoDiarioEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>Cuaderno diario</span>
                          </label>
                        </div>
                        <p className="admin-field-hint admin-field-hint--block" style={{ marginTop: '0.35rem' }}>
                          Solo se muestran en la app las pestañas marcadas; el acceso directo por URL también se
                          bloquea.
                        </p>
                      </div>
                      {community.dashboardStats ? (
                        <CommunityDashboardStats
                          stats={community.dashboardStats}
                          residentSlots={community.residentSlots}
                        />
                      ) : null}
                    </div>
                    <div className="admin-community-row-actions">
                      <button
                        type="button"
                        className="btn btn--secondary admin-row-btn"
                        onClick={() => openCommunityUsers(community)}
                      >
                        Usuarios y acceso
                      </button>
                      <Link
                        to={`/admin/communities/${community.id}/vecinos`}
                        className="btn btn--primary admin-row-btn"
                      >
                        Alta de vecinos
                      </Link>
                      <button
                        type="button"
                        className="btn btn--secondary admin-row-btn"
                        onClick={() => openOnboardingMail(community)}
                      >
                        Enviar correos de alta
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary admin-row-btn"
                        disabled={
                          !(community.loginSlug || '').trim() || posterPdfBusyId === community.id
                        }
                        title={
                          (community.loginSlug || '').trim()
                            ? 'Cartel A4 para imprimir en conserjería (QR, VEC y privacidad)'
                            : 'Requiere slug de acceso en la ficha'
                        }
                        onClick={() => void downloadCommunityPoster(community)}
                      >
                        {posterPdfBusyId === community.id ? 'Generando PDF…' : 'Cartel PDF'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary admin-row-btn"
                        onClick={() => openPortalsModal(community)}
                      >
                        Editar portales
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost admin-row-btn"
                        onClick={() => openEdit(community)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost admin-row-btn admin-row-btn--danger"
                        onClick={() => removeCommunity(community)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">Acciones rápidas</h2>
            <div className="admin-quick-actions-grid">
              <button type="button" className="admin-quick-action-card card" onClick={openAdd}>
                <span className="admin-quick-action-icon-wrap">+</span>
                <span className="admin-quick-action-label">Añadir comunidad</span>
              </button>
            </div>
          </section>
        </div>
      </main>

      {usersModalCommunity && (
        <div className="admin-modal-overlay" role="presentation" onClick={closeCommunityUsers}>
          <div
            className="admin-modal card admin-modal--wide admin-modal--scroll"
            role="dialog"
            aria-labelledby="admin-users-modal-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-users-modal-title" className="admin-modal-title">
              Usuarios — {usersModalCommunity.name}
            </h2>
            <p className="admin-field-hint admin-field-hint--block">
              {usersModalData?.note ||
                'Carga la lista para ver cuentas vinculadas a esta comunidad (ficha, vecinos con community_id y vecinos con reservas).'}
            </p>
            {usersModalError && (
              <p className="admin-banner-error" role="alert">
                {usersModalError}
              </p>
            )}
            {usersTempPasswordFlash && (
              <p className="admin-banner-success" role="alert">
                {usersTempPasswordFlash}
              </p>
            )}
            {usersModalLoading ? (
              <p className="admin-empty-hint">Cargando…</p>
            ) : usersModalData ? (
              <>
                <div className="admin-users-toolbar">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => loadCommunityUsers(usersModalCommunity)}
                  >
                    Actualizar lista
                  </button>
                  <span className="admin-field-hint">
                    Código VEC: <code>{usersModalData.community?.accessCode || '—'}</code>
                  </span>
                </div>
                <div className="admin-users-section">
                  <h3 className="admin-users-section-title">Correos de la ficha</h3>
                  <div className="admin-users-table-wrap">
                    <table className="admin-users-table">
                      <thead>
                        <tr>
                          <th>Puesto</th>
                          <th>Email</th>
                          <th>Estado</th>
                          <th>Piso</th>
                          <th>Portal</th>
                          <th>Cuenta</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usersModalData.staff || []).map((row) => {
                          const staffBlockedHint = staffFichaRowBlockedReason(row)
                          const isConciergeFicha = row.conciergeFichaActive != null
                          const conciergeActive = row.conciergeFichaActive !== false
                          const statusBusy = usersConciergeStatusBusy === row.email
                          return (
                          <tr key={row.email}>
                            <td>
                              {row.labels.join(' + ')}
                              {row.roleMismatch && (
                                <span
                                  className="admin-users-warn"
                                  title="El rol de la cuenta (vecindario_users) no coincide con el puesto de la ficha (presidente / administrador / conserje). Ajusta el rol del usuario o el correo en el campo correcto de la comunidad."
                                >
                                  {' '}
                                  · revisar rol
                                </span>
                              )}
                            </td>
                            <td>
                              <code className="admin-users-email">{row.email}</code>
                            </td>
                            <td>
                              {isConciergeFicha ? (
                                <span
                                  className={`admin-users-status-pill ${
                                    conciergeActive
                                      ? 'admin-users-status-pill--active'
                                      : 'admin-users-status-pill--inactive'
                                  }`}
                                >
                                  {conciergeActive ? 'Activo' : 'Inactivo'}
                                </span>
                              ) : (
                                <span className="admin-users-muted">—</span>
                              )}
                            </td>
                            <td>
                              {!row.user ? (
                                <span className="admin-users-muted">—</span>
                              ) : row.user.piso ? (
                                <code className="admin-users-email">{row.user.piso}</code>
                              ) : (
                                <span className="admin-users-muted">—</span>
                              )}
                            </td>
                            <td>
                              {!row.user ? (
                                <span className="admin-users-muted">—</span>
                              ) : row.user.portal ? (
                                <code className="admin-users-email">{row.user.portal}</code>
                              ) : (
                                <span className="admin-users-muted">—</span>
                              )}
                            </td>
                            <td>
                              {!row.user ? (
                                <span className="admin-users-muted">Sin cuenta (envía correo de alta)</span>
                              ) : (
                                <>
                                  {row.user.name || '—'} ·{' '}
                                  <span className="admin-users-role">{roleLabelEs(row.user.role)}</span>
                                </>
                              )}
                            </td>
                            <td className="admin-users-actions">
                              {isConciergeFicha && (
                                <button
                                  type="button"
                                  className={`btn btn--sm ${
                                    conciergeActive ? 'btn--secondary' : 'btn--primary'
                                  }`}
                                  disabled={
                                    statusBusy ||
                                    usersActionBusyId != null ||
                                    usersBulkDeleteBusy
                                  }
                                  title={
                                    conciergeActive
                                      ? 'Desactivar acceso (vacaciones / relevo); el correo sigue en la ficha'
                                      : 'Reactivar acceso de conserje'
                                  }
                                  onClick={() =>
                                    void toggleConciergeFichaActive(
                                      row.email,
                                      conciergeActive,
                                      row.user?.name || row.email,
                                    )
                                  }
                                >
                                  {statusBusy
                                    ? '…'
                                    : conciergeActive
                                      ? 'Desactivar'
                                      : 'Activar'}
                                </button>
                              )}
                              {row.user && row.canImpersonate && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn--primary btn--sm"
                                    disabled={usersActionBusyId === row.user.id}
                                    onClick={() => impersonateUser(row.user.id)}
                                  >
                                    {usersActionBusyId === row.user.id ? '…' : 'Entrar como…'}
                                  </button>
                                  {row.user.role !== 'super_admin' && (
                                    <button
                                      type="button"
                                      className="btn btn--secondary btn--sm"
                                      disabled={usersActionBusyId === row.user.id}
                                      title="Genera una contraseña temporal nueva (la anterior deja de valer)"
                                      onClick={() =>
                                        void issueTemporaryPassword(
                                          row.user.id,
                                          row.user.email || row.user.name || 'este usuario',
                                        )
                                      }
                                    >
                                      {usersActionBusyId === row.user.id
                                        ? '…'
                                        : 'Contraseña temporal'}
                                    </button>
                                  )}
                                  {row.user.role !== 'super_admin' && (
                                    <button
                                      type="button"
                                      className="btn admin-row-btn--danger btn--sm"
                                      disabled={usersActionBusyId === row.user.id}
                                      title="Elimina la cuenta y quita el correo de la ficha si aplica"
                                      onClick={() =>
                                        void deleteCommunityUser(
                                          row.user.id,
                                          row.user.email || row.user.name || 'este usuario',
                                        )
                                      }
                                    >
                                      {usersActionBusyId === row.user.id ? '…' : 'Eliminar cuenta'}
                                    </button>
                                  )}
                                </>
                              )}
                              {row.user && !row.canImpersonate && (
                                <span
                                  className="admin-users-muted"
                                  title={staffBlockedHint?.title}
                                >
                                  {staffBlockedHint?.short ?? 'No vinculado a esta comunidad'}
                                </span>
                              )}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="admin-users-section">
                  <h3 className="admin-users-section-title">Vecinos de la comunidad</h3>
                  <p className="admin-field-hint admin-field-hint--block">
                    Cuentas con <code>community_id</code> en esta comunidad y/o con reservas guardadas aquí. La columna
                    Reservas es 0 si aún no tienen ninguna en el servidor.
                  </p>
                  {(usersModalData.residentsFromBookings || []).length > 0 ? (
                    <div className="admin-users-bulk-actions">
                      <button
                        type="button"
                        className="btn admin-row-btn--danger"
                        disabled={usersBulkDeleteBusy || usersActionBusyId != null}
                        onClick={() => void deleteAllCommunityResidents()}
                      >
                        {usersBulkDeleteBusy ? 'Borrando…' : 'Eliminar todas las cuentas de vecinos'}
                      </button>
                      <p className="admin-field-hint admin-users-bulk-actions-hint">
                        Útil si hubo un error al configurar portales o viviendas: borra solo usuarios con rol{' '}
                        <strong>residente</strong> vinculados aquí (misma lista que la tabla). Luego puedes dar de alta
                        de nuevo o usar el alta masiva.
                      </p>
                    </div>
                  ) : null}
                  {(usersModalData.residentsFromBookings || []).length === 0 ? (
                    <p className="admin-empty-hint">No hay vecinos vinculados (ni por alta ni por reservas).</p>
                  ) : (
                    <div className="admin-users-table-wrap">
                      <table className="admin-users-table">
                        <thead>
                          <tr>
                            <th>Usuario</th>
                            <th>Piso</th>
                            <th>Portal</th>
                            <th>Reservas</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(usersModalData.residentsFromBookings || []).map((row) => {
                            const pwLabel =
                              row.user.email ||
                              row.user.name ||
                              (row.user.portal && row.user.piso
                                ? `${row.user.portal} · ${row.user.piso}`
                                : `usuario ${row.user.id}`)
                            return (
                              <tr key={row.user.id}>
                                <td>
                                  {row.user.email ? (
                                    <code className="admin-users-email">{row.user.email}</code>
                                  ) : (
                                    <span className="admin-users-muted">— (sin correo)</span>
                                  )}
                                  <br />
                                  <span className="admin-users-muted">
                                    {row.user.name || '—'} · {roleLabelEs(row.user.role)}
                                  </span>
                                </td>
                                <td>
                                  {row.user.piso ? (
                                    <code className="admin-users-email">{row.user.piso}</code>
                                  ) : (
                                    <span className="admin-users-muted">—</span>
                                  )}
                                </td>
                                <td>
                                  {row.user.portal ? (
                                    <code className="admin-users-email">{row.user.portal}</code>
                                  ) : (
                                    <span className="admin-users-muted">—</span>
                                  )}
                                </td>
                                <td>{row.bookingCount}</td>
                                <td className="admin-users-actions">
                                  {row.canImpersonate && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn--primary btn--sm"
                                        disabled={usersActionBusyId === row.user.id}
                                        onClick={() => impersonateUser(row.user.id)}
                                      >
                                        {usersActionBusyId === row.user.id ? '…' : 'Entrar como…'}
                                      </button>
                                      {row.user.role !== 'super_admin' && (
                                        <button
                                          type="button"
                                          className="btn btn--secondary btn--sm"
                                          disabled={usersActionBusyId === row.user.id}
                                          title="Genera una contraseña temporal nueva (la anterior deja de valer)"
                                          onClick={() => void issueTemporaryPassword(row.user.id, pwLabel)}
                                        >
                                          {usersActionBusyId === row.user.id
                                            ? '…'
                                            : 'Contraseña temporal'}
                                        </button>
                                      )}
                                      {row.user.role !== 'super_admin' && (
                                        <button
                                          type="button"
                                          className="btn admin-row-btn--danger btn--sm"
                                          disabled={usersActionBusyId === row.user.id}
                                          title="Elimina la cuenta de vecino"
                                          onClick={() => void deleteCommunityUser(row.user.id, pwLabel)}
                                        >
                                          {usersActionBusyId === row.user.id ? '…' : 'Eliminar cuenta'}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : null}
            <div className="admin-modal-actions admin-modal-actions--footer">
              {usersModalCommunity ? (
                <Link
                  to={`/admin/communities/${usersModalCommunity.id}/vecinos`}
                  className="btn btn--primary"
                  onClick={closeCommunityUsers}
                >
                  Alta de vecinos (entrega)
                </Link>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={closeCommunityUsers}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {portalsModalCommunity && (
        <div className="admin-modal-overlay" role="presentation" onClick={closePortalsModal}>
          <div
            className="admin-modal card admin-modal--wide admin-modal--scroll"
            role="dialog"
            aria-labelledby="admin-portals-modal-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-portals-modal-title" className="admin-modal-title">
              Editar portales — {portalsModalCommunity.name}
            </h2>
            <p className="admin-field-hint admin-field-hint--block">
              <strong>{portalsDraft.length}</strong> portal(es) según la ficha. Pon un alias por acceso (ej.{' '}
              <em>34</em>, <em>36</em> o <em>P1</em>, <em>P2</em>). Opcionalmente, bajo cada portal define cuántas
              plantas hay, cuántas puertas por planta (y opcionalmente menos en la <strong>última planta</strong>, típico
              en áticos), y si las puertas van en <strong>letras</strong> (A, B, C…) o <strong>números</strong> (1, 2, 3…).
              Opcionalmente, <strong>locales en bajo</strong> con nombre propio (solo en los portales que los tengan).
              Eso genera listas en el alta de vecinos y en el login. Para cambiar
              el número total de portales, usa «Edit» en la comunidad.
            </p>
            {portalsError && (
              <p className="admin-banner-error" role="alert">
                {portalsError}
              </p>
            )}
            {portalsDraft.length > 1 ? (
              <div className="admin-portals-replicate">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={portalsSaving}
                  onClick={replicatePortalDwellingToAll}
                >
                  Misma estructura en todos los portales
                </button>
                <p className="admin-portals-replicate-hint">
                  Copia <strong>plantas</strong>, <strong>puertas por planta</strong>,{' '}
                  <strong>puertas por planta (detalle)</strong> si está activo,{' '}
                  <strong>puertas última planta</strong> (si aplica) y <strong>etiquetas</strong> desde el primer portal
                  que tenga alguno de esos datos. Los alias (32, 34…), la <strong>planta baja de viviendas</strong> y los{' '}
                  <strong>locales en bajo</strong> no cambian.
                </p>
              </div>
            ) : null}
            <div className="admin-portals-fields">
              {portalsDraft.map((val, i) => {
                const dwelling = portalsDwellingDraft[i] ?? {}
                const est = estimatePortalDwellingUnitsFromDraft(dwelling)
                const localeCount = streetLocalesFromDraft(dwelling).filter((s) => String(s ?? '').trim()).length
                const fNum = parseInt(String(dwelling.floors ?? '').trim(), 10)
                const dpNum = parseInt(String(dwelling.doorsPerFloor ?? '').trim(), 10)
                const variableFloorRowsList = variableFloorRows(dwelling)
                const bajoViviendas =
                  dwelling.useVariableDoorsPerFloor && dwelling.residentialGroundFloor
                    ? (() => {
                        const row = variableFloorRowsList.find((r) => r.mapKey === BAJO_PISO_KEY)
                        if (!row) return 0
                        const n = parseInt(String(dwelling.doorsPerFloorByPiso?.[row.draftIndex] ?? '').trim(), 10)
                        return Number.isFinite(n) && n >= 1 ? n : 0
                      })()
                    : dwelling.residentialGroundFloor && Number.isFinite(dpNum) && dpNum >= 1
                      ? dpNum
                      : 0
                const estSinBajo = est != null && bajoViviendas > 0 ? est - bajoViviendas : est
                const dtRaw = String(dwelling.doorsTopFloor ?? '').trim()
                const dtNum = parseInt(dtRaw, 10)
                const showAtticBreakdown =
                  est != null &&
                  !dwelling.useVariableDoorsPerFloor &&
                  dtRaw !== '' &&
                  Number.isFinite(fNum) &&
                  fNum >= 2 &&
                  Number.isFinite(dtNum) &&
                  Number.isFinite(dpNum) &&
                  dtNum < dpNum

                return (
                <div key={`portal-${portalsModalCommunity.id}-${i}`} className="admin-modal-field">
                  <label className="admin-label" htmlFor={`portal-alias-${portalsModalCommunity.id}-${i}`}>
                    Portal {i + 1} — alias
                  </label>
                  <input
                    id={`portal-alias-${portalsModalCommunity.id}-${i}`}
                    type="text"
                    className="admin-input"
                    maxLength={64}
                    value={val}
                    placeholder={`Ej. ${i + 1}`}
                    onChange={(e) => {
                      const v = e.target.value
                      setPortalsDraft((prev) => {
                        const next = [...prev]
                        next[i] = v
                        return next
                      })
                    }}
                  />
                  <div className="admin-portal-dwelling">
                    <p className="admin-portal-dwelling-hint">
                      Estructura (opcional): deja vacío plantas o puertas para solo texto libre en la app.
                    </p>
                    <label className="admin-label" htmlFor={`portal-floors-${portalsModalCommunity.id}-${i}`}>
                      Plantas (pisos)
                    </label>
                    <input
                      id={`portal-floors-${portalsModalCommunity.id}-${i}`}
                      type="number"
                      min={1}
                      max={50}
                      className="admin-input"
                      placeholder="Ej. 5"
                      value={portalsDwellingDraft[i]?.floors ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setPortalsDwellingDraft((prev) => {
                          const next = [...prev]
                          const cur = next[i] || {}
                          const floorsNum = parseInt(String(v).trim(), 10)
                          const validFloors = Number.isFinite(floorsNum) && floorsNum >= 1 ? Math.min(50, floorsNum) : 0
                          next[i] = {
                            ...(next[i] || {}),
                            floors: v,
                            doorsPerFloorByPiso:
                              cur.useVariableDoorsPerFloor && validFloors > 0
                                ? resizeDoorsPerFloorByPisoDraft(
                                    cur.doorsPerFloorByPiso,
                                    validFloors,
                                    cur.doorsPerFloor,
                                    cur.residentialGroundFloor,
                                  )
                                : cur.doorsPerFloorByPiso ?? [],
                          }
                          return next
                        })
                      }}
                    />
                    <label className="admin-label" htmlFor={`portal-doors-${portalsModalCommunity.id}-${i}`}>
                      Puertas por planta
                    </label>
                    <input
                      id={`portal-doors-${portalsModalCommunity.id}-${i}`}
                      type="number"
                      min={1}
                      max={26}
                      className="admin-input"
                      placeholder="Ej. 4"
                      value={portalsDwellingDraft[i]?.doorsPerFloor ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setPortalsDwellingDraft((prev) => {
                          const next = [...prev]
                          next[i] = { ...(next[i] || {}), doorsPerFloor: v }
                          return next
                        })
                      }}
                    />
                    <label className="admin-label" htmlFor={`portal-doors-top-${portalsModalCommunity.id}-${i}`}>
                      Puertas última planta (ático, opcional)
                    </label>
                    {!dwelling.useVariableDoorsPerFloor ? (
                    <input
                      id={`portal-doors-top-${portalsModalCommunity.id}-${i}`}
                      type="number"
                      min={1}
                      max={26}
                      className="admin-input"
                      placeholder="Vacío = igual que «por planta»"
                      value={portalsDwellingDraft[i]?.doorsTopFloor ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setPortalsDwellingDraft((prev) => {
                          const next = [...prev]
                          next[i] = { ...(next[i] || {}), doorsTopFloor: v }
                          return next
                        })
                      }}
                    />
                    ) : (
                    <p className="admin-portal-dwelling-hint" id={`portal-doors-top-${portalsModalCommunity.id}-${i}`}>
                      No aplica: usas puertas distintas por planta (tabla de abajo).
                    </p>
                    )}
                    {!dwelling.useVariableDoorsPerFloor ? (
                    <p className="admin-portal-dwelling-hint">
                      Si rellenas un número <strong>menor</strong> que «puertas por planta», la última planta (piso más
                      alto) tendrá solo esas puertas (mismas letras/números desde A o 1). Solo aplica con 2+ plantas.
                    </p>
                    ) : null}
                    <label className="admin-portal-ground-floor">
                      <input
                        type="checkbox"
                        checked={!!dwelling.useVariableDoorsPerFloor}
                        disabled={portalsSaving || !Number.isFinite(fNum) || fNum < 1}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setPortalsDwellingDraft((prev) => {
                            const next = [...prev]
                            const cur = next[i] || {}
                            const floorsNum = parseInt(String(cur.floors ?? '').trim(), 10)
                            const validFloors =
                              Number.isFinite(floorsNum) && floorsNum >= 1 ? Math.min(50, floorsNum) : 0
                            next[i] = {
                              ...cur,
                              useVariableDoorsPerFloor: checked,
                              doorsPerFloorByPiso:
                                checked && validFloors > 0
                                  ? resizeDoorsPerFloorByPisoDraft(
                                      cur.doorsPerFloorByPiso,
                                      validFloors,
                                      cur.doorsPerFloor,
                                      cur.residentialGroundFloor,
                                    )
                                  : cur.doorsPerFloorByPiso ?? [],
                            }
                            return next
                          })
                        }}
                      />
                      <span>Puertas distintas por planta</span>
                    </label>
                    <p className="admin-portal-dwelling-hint">
                      Para edificios irregulares (ej. bajo con 7, sin 1º, 2º con 4…). «Puertas por planta» sirve como
                      valor por defecto al añadir filas. <strong>0</strong> = esa planta no tiene viviendas (no aparece en
                      el selector).
                    </p>
                    <label className="admin-portal-ground-floor">
                      <input
                        type="checkbox"
                        checked={!!dwelling.residentialGroundFloor}
                        disabled={portalsSaving}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setPortalsDwellingDraft((prev) => {
                            const next = [...prev]
                            const cur = next[i] || {}
                            const floorsNum = parseInt(String(cur.floors ?? '').trim(), 10)
                            const validFloors =
                              Number.isFinite(floorsNum) && floorsNum >= 1 ? Math.min(50, floorsNum) : 0
                            next[i] = {
                              ...cur,
                              residentialGroundFloor: checked,
                              doorsPerFloorByPiso:
                                cur.useVariableDoorsPerFloor && validFloors > 0
                                  ? resizeDoorsPerFloorByPisoDraft(
                                      cur.doorsPerFloorByPiso,
                                      validFloors,
                                      cur.doorsPerFloor,
                                      checked,
                                    )
                                  : cur.doorsPerFloorByPiso ?? [],
                            }
                            return next
                          })
                        }}
                      />
                      <span>Viviendas en planta baja (Bajo / Bº)</span>
                    </label>
                    <p className="admin-portal-dwelling-hint">
                      Marca si hay viviendas en bajo (BºA, BºB… en el interfono). Con «puertas distintas por planta»,
                      aparece la fila <strong>Bajo</strong> en la tabla de abajo.
                    </p>
                    {variableFloorRowsList.length > 0 ? (
                      <div className="admin-portal-doors-by-floor">
                        <p className="admin-label">Puertas por planta (detalle)</p>
                        <div className="admin-portal-doors-by-floor-grid">
                          {variableFloorRowsList.map((row) => (
                            <div
                              key={`portal-floor-doors-${portalsModalCommunity.id}-${i}-${row.mapKey}`}
                              className="admin-portal-floor-doors-row"
                            >
                              <label
                                className="admin-portal-floor-doors-label"
                                htmlFor={`portal-floor-doors-${portalsModalCommunity.id}-${i}-${row.mapKey}`}
                              >
                                {row.label}
                              </label>
                              <input
                                id={`portal-floor-doors-${portalsModalCommunity.id}-${i}-${row.mapKey}`}
                                type="number"
                                min={0}
                                max={26}
                                className="admin-input admin-portal-floor-doors-input"
                                placeholder={String(dwelling.doorsPerFloor || '1')}
                                value={dwelling.doorsPerFloorByPiso?.[row.draftIndex] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setPortalsDwellingDraft((prev) => {
                                    const next = [...prev]
                                    const cur = next[i] || {}
                                    const arr = Array.isArray(cur.doorsPerFloorByPiso)
                                      ? [...cur.doorsPerFloorByPiso]
                                      : []
                                    while (arr.length < variableFloorRowsList.length) {
                                      arr.push(String(cur.doorsPerFloor ?? '').trim() || '1')
                                    }
                                    arr[row.draftIndex] = v
                                    next[i] = { ...cur, doorsPerFloorByPiso: arr }
                                    return next
                                  })
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <p className="admin-portal-dwelling-total" role="status">
                      {est != null ? (
                        <>
                          <strong>{est + localeCount}</strong> unidades teóricas en este portal
                          {localeCount > 0 || bajoViviendas > 0 ? (
                            <span className="admin-portal-dwelling-total-formula">
                              {' '}
                              (
                              {[
                                estSinBajo != null ? `${estSinBajo} viviendas (pisos 1+)` : null,
                                bajoViviendas > 0 ? `${bajoViviendas} en bajo` : null,
                                localeCount > 0
                                  ? `${localeCount} local${localeCount === 1 ? '' : 'es'}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' + ')}
                              )
                            </span>
                          ) : showAtticBreakdown ? (
                            <span className="admin-portal-dwelling-total-formula">
                              {' '}
                              ({fNum - 1}×{dpNum} + {dtNum})
                            </span>
                          ) : null}
                        </>
                      ) : localeCount > 0 ? (
                        <>
                          <strong>{localeCount}</strong> local{localeCount === 1 ? '' : 'es'} en bajo
                          <span className="admin-users-muted">
                            {' '}
                            (completa plantas y puertas para el cupo total del portal)
                          </span>
                        </>
                      ) : (
                        <span className="admin-users-muted">
                          Total viviendas: completa plantas y puertas por planta (revisa también «última planta» si la
                          rellenaste).
                        </span>
                      )}
                    </p>
                    <div className="admin-portal-street-locales">
                      <p className="admin-portal-dwelling-hint">
                        Locales en planta baja (opcional): aparecen como piso <strong>Bajo</strong> en login y alta de
                        vecinos. Solo en este portal si los necesitas.
                      </p>
                      {(streetLocalesFromDraft(dwelling).length > 0
                        ? streetLocalesFromDraft(dwelling)
                        : []
                      ).map((locName, li) => (
                        <div key={`portal-locale-${portalsModalCommunity.id}-${i}-${li}`} className="admin-portal-locale-row">
                          <label className="admin-label" htmlFor={`portal-locale-${portalsModalCommunity.id}-${i}-${li}`}>
                            Nombre del local {li + 1}
                          </label>
                          <div className="admin-portal-locale-row-inputs">
                            <input
                              id={`portal-locale-${portalsModalCommunity.id}-${i}-${li}`}
                              type="text"
                              className="admin-input"
                              maxLength={MAX_LOCALE_NAME_LEN}
                              placeholder="Ej. Farmacia"
                              value={locName}
                              onChange={(e) => {
                                const v = e.target.value
                                setPortalsDwellingDraft((prev) => {
                                  const next = [...prev]
                                  const cur = streetLocalesFromDraft(next[i])
                                  const locales = [...cur]
                                  locales[li] = v
                                  next[i] = { ...(next[i] || {}), streetLocales: locales }
                                  return next
                                })
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn--ghost admin-portal-locale-remove"
                              disabled={portalsSaving}
                              aria-label={`Quitar local ${li + 1}`}
                              onClick={() => {
                                setPortalsDwellingDraft((prev) => {
                                  const next = [...prev]
                                  const locales = streetLocalesFromDraft(next[i]).filter((_, j) => j !== li)
                                  next[i] = { ...(next[i] || {}), streetLocales: locales }
                                  return next
                                })
                              }}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn--ghost admin-portal-locale-add"
                        disabled={portalsSaving || streetLocalesFromDraft(dwelling).length >= MAX_STREET_LOCALES}
                        onClick={() => {
                          setPortalsDwellingDraft((prev) => {
                            const next = [...prev]
                            const locales = [...streetLocalesFromDraft(next[i]), '']
                            next[i] = { ...(next[i] || {}), streetLocales: locales }
                            return next
                          })
                        }}
                      >
                        Añadir local
                      </button>
                    </div>
                    <label className="admin-label" htmlFor={`portal-scheme-${portalsModalCommunity.id}-${i}`}>
                      Etiquetas de puerta
                    </label>
                    <select
                      id={`portal-scheme-${portalsModalCommunity.id}-${i}`}
                      className="admin-input"
                      value={portalsDwellingDraft[i]?.doorScheme ?? 'letters'}
                      onChange={(e) => {
                        const v = e.target.value === 'numbers' ? 'numbers' : 'letters'
                        setPortalsDwellingDraft((prev) => {
                          const next = [...prev]
                          next[i] = { ...(next[i] || {}), doorScheme: v }
                          return next
                        })
                      }}
                    >
                      <option value="letters">Letras (A, B, C…)</option>
                      <option value="numbers">Números (1, 2, 3…)</option>
                    </select>
                  </div>
                </div>
                )
              })}
            </div>
            <div className="admin-modal-actions admin-modal-actions--footer">
              <button type="button" className="btn btn--ghost" onClick={closePortalsModal}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={portalsSaving}
                onClick={() => void savePortalsModal()}
              >
                {portalsSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {onboardingMailOpen && onboardingMailCommunity && (
        <div className="admin-modal-overlay" role="presentation" onClick={closeOnboardingMail}>
          <div
            className="admin-modal card"
            role="dialog"
            aria-labelledby="admin-onboarding-mail-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-onboarding-mail-title" className="admin-modal-title">
              Correos de alta — {onboardingMailCommunity.name}
            </h2>
            <p className="admin-field-hint admin-field-hint--block">
              Elige a quién enviar el correo con código VEC y acceso (y contraseña provisional si la cuenta es
              nueva). Configura SMTP en el servidor para que lleguen los mensajes.
            </p>
            <form className="admin-modal-form" onSubmit={submitOnboardingMail}>
              <div className="admin-onboarding-checkboxes">
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onboardingMailSel.invitePresident}
                    onChange={(e) =>
                      setOnboardingMailSel((s) => ({ ...s, invitePresident: e.target.checked }))
                    }
                    disabled={!onboardingMailCommunity.presidentEmail?.trim()}
                  />
                  <span>
                    Presidente (solo si hay email legado en ficha){' '}
                    <span className="admin-onboarding-mail-addr">
                      ({onboardingMailCommunity.presidentEmail?.trim() || 'sin email — usa vivienda en edición'})
                    </span>
                  </span>
                </label>
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onboardingMailSel.inviteAdmin}
                    onChange={(e) =>
                      setOnboardingMailSel((s) => ({ ...s, inviteAdmin: e.target.checked }))
                    }
                    disabled={
                      !hasAdminOnboardingMailTarget(onboardingMailCommunity, companiesList)
                    }
                  />
                  <span>
                    {onboardingMailCommunity.companyId != null &&
                    !onboardingMailCommunity.communityAdminEmail?.trim()
                      ? 'Administrador de empresa'
                      : 'Administrador de comunidad'}{' '}
                    <span className="admin-onboarding-mail-addr">
                      (
                      {adminOnboardingMailSummary(
                        onboardingMailCommunity,
                        companiesList,
                        companyNameById,
                      )}
                      )
                    </span>
                  </span>
                </label>
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onboardingMailSel.inviteConcierge}
                    onChange={(e) =>
                      setOnboardingMailSel((s) => ({ ...s, inviteConcierge: e.target.checked }))
                    }
                    disabled={!hasAnyConciergeEmail(onboardingMailCommunity)}
                  />
                  <span>
                    Conserje(s){' '}
                    <span className="admin-onboarding-mail-addr">
                      ({conciergeEmailsSummary(onboardingMailCommunity) || 'sin emails'})
                    </span>
                  </span>
                </label>
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onboardingMailSel.invitePoolStaff}
                    onChange={(e) =>
                      setOnboardingMailSel((s) => ({ ...s, invitePoolStaff: e.target.checked }))
                    }
                    disabled={!onboardingMailCommunity.poolStaffEmail?.trim()}
                  />
                  <span>
                    Socorrista (piscina){' '}
                    <span className="admin-onboarding-mail-addr">
                      ({onboardingMailCommunity.poolStaffEmail?.trim() || 'sin email'})
                    </span>
                  </span>
                </label>
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onboardingMailSel.contactSummary}
                    onChange={(e) =>
                      setOnboardingMailSel((s) => ({ ...s, contactSummary: e.target.checked }))
                    }
                    disabled={!onboardingMailCommunity.contactEmail?.trim()}
                  />
                  <span>
                    Resumen al email de contacto de la comunidad{' '}
                    <span className="admin-onboarding-mail-addr">
                      ({onboardingMailCommunity.contactEmail?.trim() || 'sin email'})
                    </span>
                  </span>
                </label>
              </div>
              <div className="admin-modal-actions">
                <button type="button" className="btn btn--ghost" onClick={closeOnboardingMail}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn--primary ${onboardingMailSending ? 'btn--loading' : ''}`}
                  disabled={
                    onboardingMailSending ||
                    !(
                      onboardingMailSel.invitePresident ||
                      onboardingMailSel.inviteAdmin ||
                      onboardingMailSel.inviteConcierge ||
                      onboardingMailSel.invitePoolStaff ||
                      onboardingMailSel.contactSummary
                    )
                  }
                >
                  {onboardingMailSending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="admin-modal-overlay" role="presentation" onClick={closeModal}>
          <div
            className="admin-modal card admin-modal--wide admin-modal--scroll"
            role="dialog"
            aria-labelledby="admin-modal-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-modal-title" className="admin-modal-title">
              {editingId ? 'Editar comunidad' : 'Nueva comunidad'}
            </h2>
            <form className="admin-modal-form" onSubmit={submitForm}>
              <div className="admin-modal-row">
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-name">Nombre</label>
                  <input
                    id="comm-name"
                    className="admin-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Opcional — si está vacío se guarda «Sin nombre»"
                    autoFocus
                  />
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-code">Código de acceso</label>
                  <input
                    id="comm-code"
                    className="admin-input"
                    value={form.accessCode}
                    onChange={(e) => setForm((f) => ({ ...f, accessCode: e.target.value }))}
                    placeholder={
                      editingId ? 'Vacío = generar uno nuevo' : 'Se rellena solo — cámbialo solo si quieres'
                    }
                    autoComplete="off"
                  />
                  <p className="admin-field-hint">
                    {editingId
                      ? 'Si borras el código y guardas, el sistema generará uno nuevo.'
                      : 'Propuesto automáticamente al abrir (único). Puedes cambiarlo o borrarlo: si está vacío al guardar, se genera otro.'}
                  </p>
                </div>
              </div>

              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-login-slug">
                  Slug enlace de acceso (opcional)
                </label>
                <input
                  id="comm-login-slug"
                  className="admin-input"
                  value={form.loginSlug}
                  onChange={(e) => setForm((f) => ({ ...f, loginSlug: e.target.value }))}
                  placeholder="ej. alsacia — solo letras minúsculas, números y guiones"
                  maxLength={64}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="admin-field-hint">
                  URL pública aproximada:{' '}
                  <code className="admin-code-break">
                    …/c/
                    <strong>{form.loginSlug.trim() || 'tu-slug'}</strong>
                    /login
                  </code>
                  . En producción usa <code>VITE_PUBLIC_APP_ORIGIN</code> en el front para el dominio
                  correcto al copiar/QR. Vacío = solo acceso manual con código VEC.
                </p>
              </div>

              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-nif">NIF/CIF</label>
                <input
                  id="comm-nif"
                  className="admin-input"
                  value={form.nifCif}
                  onChange={(e) => setForm((f) => ({ ...f, nifCif: e.target.value }))}
                  placeholder="Opcional — ej. B12345678"
                  maxLength={32}
                  autoComplete="off"
                />
                <p className="admin-field-hint">
                  Opcional. Puedes completarlo más adelante al editar la comunidad.
                </p>
              </div>

              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-address">
                  Dirección (finca / comunidad)
                </label>
                <textarea
                  id="comm-address"
                  className="admin-input admin-textarea"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Calle, número, CP, ciudad…"
                  maxLength={512}
                  rows={3}
                  autoComplete="street-address"
                />
                <p className="admin-field-hint">
                  Opcional. Referencia en ficha, facturación o comunicaciones internas (máx. 512 caracteres).
                </p>
              </div>

              <div className="admin-modal-row admin-modal-row--stats">
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-portals">Número de portales</label>
                  <input
                    id="comm-portals"
                    type="number"
                    min={1}
                    max={999}
                    className="admin-input"
                    value={form.portalCount}
                    onChange={(e) => setForm((f) => ({ ...f, portalCount: e.target.value }))}
                  />
                  <p className="admin-field-hint">
                    Cuántos accesos tiene el edificio. Los alias por portal: «Editar portales».
                  </p>
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-slots">Nº vecinos (cupo previsto)</label>
                  <input
                    id="comm-slots"
                    type="number"
                    min={0}
                    max={999999}
                    className="admin-input"
                    value={form.residentSlots}
                    onChange={(e) => setForm((f) => ({ ...f, residentSlots: e.target.value }))}
                    placeholder="Opcional"
                  />
                  <p className="admin-field-hint">
                    Se guarda el valor que indiques aquí. Solo «Editar portales» puede recalcular cupo (plantas ×
                    puertas).
                  </p>
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-padel">Pistas de pádel</label>
                  <input
                    id="comm-padel"
                    type="number"
                    min={0}
                    max={50}
                    className="admin-input"
                    value={form.padelCourtCount}
                    onChange={(e) => setForm((f) => ({ ...f, padelCourtCount: e.target.value }))}
                  />
                  <p className="admin-field-hint">0 si no hay pistas</p>
                </div>
                <div className="admin-modal-row">
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-padel-h-booking">
                      Pádel: máx. horas por reserva
                    </label>
                    <input
                      id="comm-padel-h-booking"
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      className="admin-input"
                      value={form.padelMaxHoursPerBooking}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          padelMaxHoursPerBooking: sanitizePadelHoursInput(e.target.value),
                        }))
                      }
                    />
                    <p className="admin-field-hint">
                      Una reserva cuenta como esta duración en la cuota diaria. Pasos de 0,5 h (0,5 · 1 · 1,5 · 2 …).
                    </p>
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-padel-h-day">
                      Pádel: máx. horas por vivienda y día
                    </label>
                    <input
                      id="comm-padel-h-day"
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      className="admin-input"
                      value={form.padelMaxHoursApartmentDay}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          padelMaxHoursApartmentDay: sanitizePadelHoursInput(e.target.value),
                        }))
                      }
                    />
                    <p className="admin-field-hint">
                      Por piso (o por email si no hay piso). No puede ser menor que horas/reserva. Pasos de 0,5 h.
                    </p>
                  </div>
                </div>
                <div className="admin-modal-row">
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-padel-advance">
                      Pádel: plazo de reserva (valor en horas)
                    </label>
                    <input
                      id="comm-padel-advance"
                      type="number"
                      min={1}
                      max={168}
                      className="admin-input"
                      value={form.padelMinAdvanceHours}
                      onChange={(e) => setForm((f) => ({ ...f, padelMinAdvanceHours: e.target.value }))}
                    />
                    <p className="admin-field-hint">
                      Se traduce a días naturales desde hoy para elegir fecha (24 → 1 día, 48 → 2). No exige reservar
                      con X horas de antelación respecto al tramo.
                    </p>
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-padel-open">Pádel: apertura</label>
                    <input
                      id="comm-padel-open"
                      type="time"
                      className="admin-input"
                      value={form.padelOpenTime}
                      onChange={(e) => setForm((f) => ({ ...f, padelOpenTime: e.target.value }))}
                    />
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-padel-close">Pádel: cierre</label>
                    <input
                      id="comm-padel-close"
                      type="time"
                      className="admin-input"
                      value={form.padelCloseTime}
                      onChange={(e) => setForm((f) => ({ ...f, padelCloseTime: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="admin-modal-field admin-modal-field--checkbox">
                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.gymAccessEnabled}
                      onChange={(e) => setForm((f) => ({ ...f, gymAccessEnabled: e.target.checked }))}
                    />
                    <span>Control acceso gimnasio activo</span>
                  </label>
                  <p className="admin-field-hint">Puedes cambiarlo después al editar la comunidad.</p>
                </div>
                <fieldset className="admin-modal-fieldset">
                  <legend className="admin-fieldset-legend">Piscina — acceso vecinos (MVP)</legend>
                  <p className="admin-field-hint admin-field-hint--block">
                    Activa el sistema de códigos/QR y la temporada. Los vecinos ven «Acceso piscina»; el socorrista
                    valida con su rol.
                  </p>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.poolAccessSystemEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, poolAccessSystemEnabled: e.target.checked }))
                        }
                      />
                      <span>Sistema de acceso piscina activo</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.poolSeasonActive}
                        onChange={(e) => setForm((f) => ({ ...f, poolSeasonActive: e.target.checked }))}
                      />
                      <span>Temporada de piscina activa</span>
                    </label>
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-pool-start">
                      Inicio temporada (opcional, YYYY-MM-DD)
                    </label>
                    <input
                      id="comm-pool-start"
                      type="date"
                      className="admin-input"
                      value={form.poolSeasonStart}
                      onChange={(e) => setForm((f) => ({ ...f, poolSeasonStart: e.target.value }))}
                    />
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-pool-end">
                      Fin temporada (opcional)
                    </label>
                    <input
                      id="comm-pool-end"
                      type="date"
                      className="admin-input"
                      value={form.poolSeasonEnd}
                      onChange={(e) => setForm((f) => ({ ...f, poolSeasonEnd: e.target.value }))}
                    />
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-pool-hours">
                      Horario (texto libre, ej. 10:00–20:00)
                    </label>
                    <input
                      id="comm-pool-hours"
                      type="text"
                      className="admin-input"
                      maxLength={255}
                      value={form.poolHoursNote}
                      onChange={(e) => setForm((f) => ({ ...f, poolHoursNote: e.target.value }))}
                      placeholder="Ej. L–D 10:00–20:00"
                    />
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-pool-max-occ">
                      Aforo máximo en instalación (opcional)
                    </label>
                    <input
                      id="comm-pool-max-occ"
                      type="number"
                      className="admin-input"
                      min={1}
                      max={5000}
                      inputMode="numeric"
                      value={form.poolMaxOccupancy}
                      onChange={(e) => setForm((f) => ({ ...f, poolMaxOccupancy: e.target.value }))}
                      placeholder="Vacío = sin límite"
                    />
                    <p className="admin-field-hint">
                      Tope de personas en piscina a la vez (el socorrista no podrá superarlo al registrar entradas).
                    </p>
                  </div>
                </fieldset>
                <fieldset className="admin-modal-fieldset">
                  <legend className="admin-fieldset-legend">Pestañas en la app vecinos</legend>
                  <p className="admin-field-hint admin-field-hint--block">
                    Activa o desactiva las pestañas visibles en la app vecinos (despliegue progresivo). «Acceso
                    piscina» solo muestra el enlace; el sistema de códigos se configura aparte.
                  </p>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.appNavServicesEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, appNavServicesEnabled: e.target.checked }))
                        }
                      />
                      <span>Pestaña Servicios</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.appNavIncidentsEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, appNavIncidentsEnabled: e.target.checked }))
                        }
                      />
                      <span>Pestaña Incidencias</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.appNavBookingsEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, appNavBookingsEnabled: e.target.checked }))
                        }
                      />
                      <span>Pestaña Reservas</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.appNavPoolAccessEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, appNavPoolAccessEnabled: e.target.checked }))
                        }
                      />
                      <span>Pestaña Acceso piscina</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.appNavPaqueteriaEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setForm((f) => ({
                            ...f,
                            appNavPaqueteriaEnabled: checked,
                            ...(checked ? {} : { paqueteriaSpecialDeliveryEnabled: false, paqueteriaKeyLoansEnabled: false }),
                          }))
                        }}
                      />
                      <span>Pestaña Paquetería</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox admin-modal-field--indent">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.paqueteriaSpecialDeliveryEnabled}
                        disabled={!form.appNavPaqueteriaEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, paqueteriaSpecialDeliveryEnabled: e.target.checked }))
                        }
                      />
                      <span>Entrega especial (llaves, sobres…)</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox admin-modal-field--indent">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.paqueteriaKeyLoansEnabled}
                        disabled={!form.appNavPaqueteriaEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, paqueteriaKeyLoansEnabled: e.target.checked }))
                        }
                      />
                      <span>Registro de llaves (préstamo y devolución)</span>
                    </label>
                  </div>
                  <div className="admin-modal-field admin-modal-field--checkbox">
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.appNavCuadernoDiarioEnabled}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, appNavCuadernoDiarioEnabled: e.target.checked }))
                        }
                      />
                      <span>Pestaña Cuaderno diario</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset className="admin-modal-fieldset">
                  <legend className="admin-fieldset-legend">Tipos de servicio (solicitud vecinos)</legend>
                  <p className="admin-field-hint admin-field-hint--block">
                    Solo aplica si la pestaña «Servicios» está activa. «Disponible» permite enviar la solicitud;
                    «Pronto» muestra la tarjeta con la etiqueta Pronto y no se puede elegir.
                  </p>
                  <ul className="admin-service-category-modes">
                    {SERVICE_CATEGORIES.map((cat) => (
                      <li key={cat.id} className="admin-service-category-modes__row">
                        <span className="admin-service-category-modes__name">
                          {cat.icon ? <span aria-hidden="true">{cat.icon} </span> : null}
                          {cat.name}
                        </span>
                        <span className="admin-service-category-modes__radios" role="group" aria-label={cat.name}>
                          <label className="admin-radio-inline">
                            <input
                              type="radio"
                              name={`admin-svc-mode-${cat.id}`}
                              checked={form.serviceCategoryModes[cat.id] === 'active'}
                              onChange={() =>
                                setForm((f) => ({
                                  ...f,
                                  serviceCategoryModes: { ...f.serviceCategoryModes, [cat.id]: 'active' },
                                }))
                              }
                            />
                            <span>Disponible</span>
                          </label>
                          <label className="admin-radio-inline">
                            <input
                              type="radio"
                              name={`admin-svc-mode-${cat.id}`}
                              checked={form.serviceCategoryModes[cat.id] === 'soon'}
                              onChange={() =>
                                setForm((f) => ({
                                  ...f,
                                  serviceCategoryModes: { ...f.serviceCategoryModes, [cat.id]: 'soon' },
                                }))
                              }
                            />
                            <span>Pronto</span>
                          </label>
                        </span>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-salon-mode">
                    Modo de reserva de salones
                  </label>
                  <select
                    id="comm-salon-mode"
                    className="admin-input admin-select"
                    value={form.salonBookingMode}
                    onChange={(e) => setForm((f) => ({ ...f, salonBookingMode: e.target.value }))}
                  >
                    <option value="slots">Por franjas (mañana / tarde / noche)</option>
                    <option value="day">Por día completo (una reserva cubre el día)</option>
                  </select>
                  <p className="admin-field-hint">
                    Afecta a cada espacio listado abajo (franjas o día completo). No aplica al pádel ni al gimnasio.
                    Si configuras <strong>franjas horarias personalizadas</strong> en un espacio, ese salón usará
                    franjas aunque el modo global sea día completo.
                  </p>
                </div>
              </div>

              <div className="admin-modal-field">
                <div className="admin-spaces-head">
                  <span className="admin-label">Espacios / salones (ID estable + nombre visible)</span>
                  <button type="button" className="btn btn--ghost admin-spaces-add" onClick={addCustomSpaceRow}>
                    + Añadir espacio
                  </button>
                </div>
                <p className="admin-field-hint admin-field-hint--block">
                  El <strong>ID interno</strong> no cambia al renombrar: sirve para reservas e historial. El{' '}
                  <strong>nombre</strong> es lo que ven los vecinos. Filas nuevas reciben un ID automático (puedes
                  copiarlo si integras con otros sistemas). Sin espacios aquí, no aparece ningún salón en Reservas (sí
                  pueden aparecer pádel o gimnasio si están activos en la ficha).
                </p>
                {form.customSpaces.length === 0 ? (
                  <p className="admin-empty-hint admin-spaces-empty">
                    Ninguno — pulsa «Añadir espacio» para que los vecinos puedan reservar salones.
                  </p>
                ) : (
                  <ul className="admin-spaces-list">
                    {form.customSpaces.map((row) => (
                      <li key={row.key} className="admin-space-card">
                        <div className="admin-space-row">
                          <input
                            type="text"
                            className="admin-input admin-space-id-input"
                            value={row.id}
                            readOnly
                            title="Identificador estable; no se modifica al cambiar el nombre visible"
                            aria-label="ID interno del espacio"
                          />
                          <input
                            type="text"
                            className="admin-input admin-space-input"
                            value={row.name}
                            onChange={(e) => updateCustomSpace(row.key, e.target.value)}
                            placeholder="Nombre visible (ej. Salón social)"
                            aria-label="Nombre visible del espacio"
                          />
                          <button
                            type="button"
                            className="btn btn--ghost admin-space-remove"
                            onClick={() => removeCustomSpaceRow(row.key)}
                            aria-label="Quitar espacio"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="admin-space-advance-row">
                          <label className="admin-space-advance-toggle">
                            <input
                              type="checkbox"
                              checked={row.minAdvanceEnabled === true}
                              onChange={(e) =>
                                patchCustomSpace(row.key, { minAdvanceEnabled: e.target.checked })
                              }
                            />
                            <span>Mín. antelación</span>
                          </label>
                          {row.minAdvanceEnabled ? (
                            <div className="admin-space-advance-days">
                              <input
                                type="number"
                                className="admin-input admin-space-advance-input"
                                min={1}
                                max={365}
                                value={row.minDaysInAdvance ?? '7'}
                                onChange={(e) =>
                                  patchCustomSpace(row.key, {
                                    minDaysInAdvance: e.target.value.replace(/\D/g, '').slice(0, 3),
                                  })
                                }
                                aria-label="Días mínimos de antelación"
                              />
                              <span className="admin-space-advance-suffix">días</span>
                            </div>
                          ) : null}
                          <label className="admin-space-advance-toggle">
                            <input
                              type="checkbox"
                              checked={row.advanceLimitEnabled !== false}
                              onChange={(e) => updateCustomSpaceAdvanceLimit(row.key, e.target.checked)}
                            />
                            <span>Máx. antelación</span>
                          </label>
                          {row.advanceLimitEnabled !== false ? (
                            <div className="admin-space-advance-days">
                              <input
                                type="number"
                                className="admin-input admin-space-advance-input"
                                min={1}
                                max={365}
                                value={row.maxDaysInAdvance ?? '14'}
                                onChange={(e) => updateCustomSpaceMaxDays(row.key, e.target.value)}
                                aria-label="Días de antelación máxima"
                              />
                              <span className="admin-space-advance-suffix">días</span>
                            </div>
                          ) : (
                            <span className="admin-space-advance-open">Sin límite máx.</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost admin-space-regs-toggle"
                          onClick={() =>
                            patchCustomSpace(row.key, { regulationsOpen: !row.regulationsOpen })
                          }
                        >
                          {row.regulationsOpen ? '▾' : '▸'} Normas y tarifas (opcional)
                        </button>
                        {row.regulationsOpen ? (
                          <div className="admin-space-regs-panel">
                            <label className="admin-label">Texto del regulamento</label>
                            <textarea
                              className="admin-input admin-space-rules-text"
                              rows={6}
                              value={row.rulesText ?? ''}
                              onChange={(e) => patchCustomSpace(row.key, { rulesText: e.target.value })}
                              placeholder="Pega aquí las normas de uso del salón…"
                            />
                            <div className="admin-space-fees-row">
                              <label className="admin-label">
                                Tasa uso (€)
                                <input
                                  type="text"
                                  className="admin-input"
                                  inputMode="decimal"
                                  value={row.usageFeeEur ?? ''}
                                  onChange={(e) =>
                                    patchCustomSpace(row.key, { usageFeeEur: e.target.value })
                                  }
                                  placeholder="15"
                                />
                              </label>
                              <label className="admin-label">
                                Fianza (€)
                                <input
                                  type="text"
                                  className="admin-input"
                                  inputMode="decimal"
                                  value={row.depositEur ?? ''}
                                  onChange={(e) =>
                                    patchCustomSpace(row.key, { depositEur: e.target.value })
                                  }
                                  placeholder="60"
                                />
                              </label>
                            </div>
                            <label className="admin-space-advance-toggle">
                              <input
                                type="checkbox"
                                checked={row.customSlotsEnabled === true}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  if (checked && (!row.timeSlots || row.timeSlots.length === 0)) {
                                    patchCustomSpace(row.key, {
                                      customSlotsEnabled: true,
                                      timeSlots: [
                                        {
                                          key: `ts-${Date.now()}-1`,
                                          id: 'manana',
                                          label: 'Mañana',
                                          start: '12:00',
                                          end: '17:00',
                                        },
                                        {
                                          key: `ts-${Date.now()}-2`,
                                          id: 'tarde',
                                          label: 'Tarde',
                                          start: '18:00',
                                          end: '22:00',
                                        },
                                      ],
                                    })
                                  } else {
                                    patchCustomSpace(row.key, {
                                      customSlotsEnabled: checked,
                                      timeSlots: checked ? row.timeSlots : [],
                                    })
                                  }
                                }}
                              />
                              <span>Franjas horarias personalizadas</span>
                            </label>
                            <p className="admin-field-hint">
                              Si no marcas esto, se usan mañana 08–12, tarde 12–18 y noche 18–22. La Joya: 12–17 y
                              18–22.
                            </p>
                            {row.customSlotsEnabled && row.timeSlots?.length > 0 ? (
                              <ul className="admin-space-slots-list">
                                {row.timeSlots.map((slot) => (
                                  <li key={slot.key} className="admin-space-slot-row">
                                    <input
                                      type="text"
                                      className="admin-input"
                                      value={slot.label}
                                      onChange={(e) =>
                                        updateCustomSpaceTimeSlot(row.key, slot.key, 'label', e.target.value)
                                      }
                                      placeholder="Etiqueta"
                                      aria-label="Etiqueta franja"
                                    />
                                    <input
                                      type="time"
                                      className="admin-input admin-space-slot-time"
                                      value={slot.start}
                                      onChange={(e) =>
                                        updateCustomSpaceTimeSlot(row.key, slot.key, 'start', e.target.value)
                                      }
                                      aria-label="Hora inicio"
                                    />
                                    <span aria-hidden="true">–</span>
                                    <input
                                      type="time"
                                      className="admin-input admin-space-slot-time"
                                      value={slot.end}
                                      onChange={(e) =>
                                        updateCustomSpaceTimeSlot(row.key, slot.key, 'end', e.target.value)
                                      }
                                      aria-label="Hora fin"
                                    />
                                    <button
                                      type="button"
                                      className="btn btn--ghost"
                                      onClick={() => removeCustomSpaceTimeSlot(row.key, slot.key)}
                                      aria-label="Quitar franja"
                                    >
                                      ✕
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {row.customSlotsEnabled ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => addCustomSpaceTimeSlot(row.key)}
                              >
                                + Añadir franja
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <fieldset className="admin-modal-fieldset">
                <legend className="admin-fieldset-legend">Emails para instrucciones de alta</legend>
                <p className="admin-field-hint admin-field-hint--block">
                  Solo el <strong>email de contacto</strong> es obligatorio (avisos generales). El{' '}
                  <strong>presidente de la junta</strong> (portal + piso) se asigna después en la app, desde{' '}
                  <strong>Lista de vecinos</strong> (conserje o administrador). El{' '}
                  <strong>administrador</strong> y el <strong>conserje</strong> se definen aquí por correo
                  (VEC + email en el login).
                </p>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-email">
                    Email contacto comunidad *
                  </label>
                  <input
                    id="comm-email"
                    type="email"
                    className="admin-input"
                    value={form.contactEmail}
                    onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                    placeholder="comunidad@ejemplo.es"
                    required
                    autoComplete="email"
                  />
                  <p className="admin-field-hint">
                    Comunicación general y envío de instrucciones orientadas a vecinos.
                  </p>
                </div>
                {communityUsesCompanyAdmin ? (
                  <div className="admin-modal-field">
                    <p className="admin-field-hint">
                      Esta comunidad está vinculada a una <strong>empresa de administración</strong>. La gestión la
                      hacen los administradores de empresa (sección Empresas), no un administrador en la ficha.
                    </p>
                  </div>
                ) : (
                  <div className="admin-modal-field admin-concierge-slot">
                    <p className="admin-label admin-concierge-slot-title">Administrador de comunidad</p>
                    <div className="admin-modal-row">
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="comm-admin-name">
                          Nombre o empresa (opcional)
                        </label>
                        <input
                          id="comm-admin-name"
                          type="text"
                          className="admin-input"
                          value={form.communityAdminName}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, communityAdminName: e.target.value }))
                          }
                          placeholder="Ej. Gestoría Mandataria S.L."
                          autoComplete="organization"
                        />
                        <p className="admin-field-hint">
                          Aparece en correos de alta y en la cuenta creada para el administrador.
                        </p>
                      </div>
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="comm-admin-email">
                          Email (opcional)
                        </label>
                        <input
                          id="comm-admin-email"
                          type="email"
                          className="admin-input"
                          value={form.communityAdminEmail}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, communityAdminEmail: e.target.value }))
                          }
                          placeholder="admin@gestoria.es"
                          autoComplete="email"
                        />
                        <p className="admin-field-hint">
                          Gestión (incidencias, reservas). «Enviar correos de alta» cuando quieras.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <ConciergeStaffEditor
                  title="Conserjes titulares (portería)"
                  hint="Cada correo crea cuenta Conserje (VEC + email). Mismos permisos en la app. Desactiva en lugar de borrar si está de vacaciones."
                  list={form.conciergeStaff}
                  onChange={(conciergeStaff) => setForm((f) => ({ ...f, conciergeStaff }))}
                  idPrefix="comm-concierge"
                  addLabel="+ Añadir conserje titular"
                  rowLabel={(n) => `Conserje ${n}`}
                />
                <ConciergeStaffEditor
                  title="Conserjes suplentes (opcional)"
                  hint="Refuerzo o relevo: misma app y permisos; cada persona entra con su correo y el VEC."
                  list={form.conciergeSubstitutes}
                  onChange={(conciergeSubstitutes) =>
                    setForm((f) => ({ ...f, conciergeSubstitutes }))
                  }
                  idPrefix="comm-concierge-sub"
                  addLabel="+ Añadir conserje suplente"
                  rowLabel={(n) => `Suplente ${n}`}
                />
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-pool-staff-email">
                    Email socorrista / piscina (opcional)
                  </label>
                  <input
                    id="comm-pool-staff-email"
                    type="email"
                    className="admin-input"
                    value={form.poolStaffEmail}
                    onChange={(e) => setForm((f) => ({ ...f, poolStaffEmail: e.target.value }))}
                    placeholder="socorrista@ejemplo.es"
                    autoComplete="email"
                  />
                  <p className="admin-field-hint">
                    Opcional. Mismo criterio que el conserje: rol <strong>Piscina</strong>, VEC y este correo en
                    la ficha. Alta automática al guardar (sin correo hasta que uses «Enviar correos de alta»).
                  </p>
                </div>
              </fieldset>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-plan-expires">
                  Caducidad del plan (último día incluido)
                </label>
                <input
                  id="comm-plan-expires"
                  type="date"
                  className="admin-input"
                  value={form.planExpiresOn}
                  onChange={(e) => setForm((f) => ({ ...f, planExpiresOn: e.target.value }))}
                />
                <p className="admin-field-hint">
                  Opcional. El día indicado sigue siendo válido; al día siguiente (cron diario a las 03:00, hora del
                  servidor) las comunidades en <strong>Active</strong> con plan vencido pasan a{' '}
                  <strong>Inactive</strong>. Deja vacío para sin caducidad automática.
                </p>
              </div>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-status">Estado</label>
                <select
                  id="comm-status"
                  className="admin-input admin-select"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="demo">Demo</option>
                  <option value="pending_approval">Pendiente de aprobación</option>
                </select>
              </div>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-company-id">
                  Empresa de administración (opcional)
                </label>
                <select
                  id="comm-company-id"
                  className="admin-input admin-select"
                  value={form.companyId}
                  onChange={(e) => {
                    const next = e.target.value
                    setForm((f) => ({
                      ...f,
                      companyId: next,
                      ...(next.trim() !== ''
                        ? { communityAdminEmail: '', communityAdminName: '' }
                        : {}),
                    }))
                  }}
                >
                  <option value="">— Sin empresa de administración —</option>
                  {companyOptions.administration.map((co) => (
                    <option key={co.id} value={String(co.id)}>
                      {co.name} (id {co.id})
                    </option>
                  ))}
                </select>
                <p className="admin-field-hint">
                  Administrador de fincas (p. ej. MANDATARIA). Sus administradores de empresa gestionan
                  la comunidad desde el panel de empresa.
                </p>
              </div>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="comm-service-company-id">
                  Empresa de servicios (opcional)
                </label>
                <select
                  id="comm-service-company-id"
                  className="admin-input admin-select"
                  value={form.serviceProviderCompanyId}
                  disabled={isScopedServiceAdmin}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, serviceProviderCompanyId: e.target.value }))
                  }
                >
                  <option value="">— Sin empresa de servicios —</option>
                  {companyOptions.service.map((co) => (
                    <option key={co.id} value={String(co.id)}>
                      {co.name} (id {co.id})
                    </option>
                  ))}
                </select>
                <p className="admin-field-hint">
                  Prestador (p. ej. DE CAMINO): super administrador acotado solo a las comunidades donde
                  figure esta empresa.
                  {isScopedServiceAdmin ? ' Tu empresa se asigna automáticamente.' : ''}
                </p>
              </div>
              <div className="admin-modal-actions">
                <button type="button" className="btn btn--ghost" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {companyAdminForm.open && companyAdminForm.companyId != null ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ca-admin-title">
          <div className="admin-modal card">
            <div className="admin-modal-head">
              <h2 id="ca-admin-title" className="admin-modal-title">
                Nuevo administrador de empresa
              </h2>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Cerrar"
                onClick={() =>
                  setCompanyAdminForm({
                    open: false,
                    companyId: null,
                    email: '',
                    name: '',
                    password: '',
                  })
                }
              >
                ×
              </button>
            </div>
            <form className="admin-modal-body" onSubmit={submitCompanyAdmin}>
              <p className="admin-field-hint">
                Empresa id {companyAdminForm.companyId}. Si no indicas contraseña, se generará una temporal en
                la respuesta.
              </p>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="ca-adm-email">Email *</label>
                <input
                  id="ca-adm-email"
                  type="email"
                  className="admin-input"
                  value={companyAdminForm.email}
                  onChange={(e) =>
                    setCompanyAdminForm((f) => ({ ...f, email: e.target.value }))
                  }
                  required
                  autoComplete="email"
                />
              </div>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="ca-adm-name">Nombre (opcional)</label>
                <input
                  id="ca-adm-name"
                  type="text"
                  className="admin-input"
                  value={companyAdminForm.name}
                  onChange={(e) =>
                    setCompanyAdminForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="ca-adm-pw">Contraseña (opcional, mín. 8 caracteres)</label>
                <input
                  id="ca-adm-pw"
                  type="password"
                  className="admin-input"
                  value={companyAdminForm.password}
                  onChange={(e) =>
                    setCompanyAdminForm((f) => ({ ...f, password: e.target.value }))
                  }
                  autoComplete="new-password"
                />
              </div>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    setCompanyAdminForm({
                      open: false,
                      companyId: null,
                      email: '',
                      name: '',
                      password: '',
                    })
                  }
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={companyAdminBusy}>
                  {companyAdminBusy ? 'Creando…' : 'Crear administrador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {passwordPickModal.open && passwordPickModal.companyId != null ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pw-pick-title">
          <div className="admin-modal card">
            <div className="admin-modal-head">
              <h2 id="pw-pick-title" className="admin-modal-title">
                {passwordPickModal.sendEmail
                  ? 'Enviar contraseña por correo'
                  : 'Ver contraseña nueva'}
              </h2>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Cerrar"
                onClick={() =>
                  setPasswordPickModal({
                    open: false,
                    companyId: null,
                    companyName: '',
                    sendEmail: false,
                    admins: [],
                    loading: false,
                    error: '',
                  })
                }
              >
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-field-hint">
                Empresa: <strong>{passwordPickModal.companyName}</strong>. Elige el administrador de empresa.
              </p>
              {passwordPickModal.loading ? (
                <p className="admin-empty-hint">Cargando…</p>
              ) : passwordPickModal.error ? (
                <p className="admin-banner-error" role="alert">
                  {passwordPickModal.error}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {passwordPickModal.admins.map((a) => (
                    <li key={a.id} style={{ marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => {
                          const cid = passwordPickModal.companyId
                          const send = passwordPickModal.sendEmail
                          setPasswordPickModal({
                            open: false,
                            companyId: null,
                            companyName: '',
                            sendEmail: false,
                            admins: [],
                            loading: false,
                            error: '',
                          })
                          void runCompanyAdminPasswordReset(cid, a.id, send)
                        }}
                      >
                        {a.email || `Usuario ${a.id}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {qrModal?.url ? (
        <CommunityLoginQrModal
          url={qrModal.url}
          fileSafeName={qrModal.fileSafeName}
          onClose={() => setQrModal(null)}
        />
      ) : null}
    </div>
  )
}
