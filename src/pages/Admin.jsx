import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAuth,
  VEC_IMPERSONATE_CHILD_READY,
  VEC_IMPERSONATE_PAYLOAD,
} from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { buildCommunityLoginUrl } from '../utils/communityLoginUrl.js'
import CommunityLoginQrModal from '../components/CommunityLoginQrModal.jsx'
import CommunityDashboardStats from '../components/CommunityDashboardStats.jsx'
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
    return {
      key: `row-${uniqueId}-${idx}`,
      id: uniqueId,
      name,
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
function normalizePortalDwellingDraftFromApi(raw, portalCount) {
  const n = Math.min(999, Math.max(1, Number(portalCount) || 1))
  const arr = Array.isArray(raw) ? raw : []
  return Array.from({ length: n }, (_, i) => {
    const o = arr[i]
    if (!o || typeof o !== 'object') return { floors: '', doorsPerFloor: '', doorScheme: 'letters' }
    const floors = typeof o.floors === 'number' && o.floors >= 1 ? String(o.floors) : ''
    const doorsPerFloor =
      typeof o.doorsPerFloor === 'number' && o.doorsPerFloor >= 1 ? String(o.doorsPerFloor) : ''
    const doorScheme = o.doorScheme === 'numbers' ? 'numbers' : 'letters'
    return { floors, doorsPerFloor, doorScheme }
  })
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
  conciergeEmail: '',
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
}

export default function Admin() {
  const { accessToken } = useAuth()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successFlash, setSuccessFlash] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
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
  const [tempPasswordBanner, setTempPasswordBanner] = useState('')
  const [portalsModalCommunity, setPortalsModalCommunity] = useState(null)
  const [portalsDraft, setPortalsDraft] = useState([])
  const [portalsDwellingDraft, setPortalsDwellingDraft] = useState([])
  const [portalsSaving, setPortalsSaving] = useState(false)
  const [portalsError, setPortalsError] = useState('')
  const [qrModal, setQrModal] = useState(null)
  const [navTabSavingId, setNavTabSavingId] = useState(null)
  const [companiesList, setCompaniesList] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
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
    return m
  }, [companiesList])

  const loadCompaniesList = useCallback(async () => {
    if (!accessToken) {
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
  }, [accessToken])

  useEffect(() => {
    loadCompaniesList()
  }, [loadCompaniesList])

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
        body: JSON.stringify({ name: n }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setNewCompanyName('')
      setSuccessFlash(`Empresa creada: ${d.name || n}`)
      await loadCompaniesList()
    } catch (err) {
      setError(err.message || 'No se pudo crear la empresa')
    } finally {
      setCreatingCompany(false)
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
          ? `Usuario creado. Contraseña temporal: ${d.temporaryPassword} (cópiala ahora).`
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

  useEffect(() => {
    if (!tempPasswordBanner) return
    const t = setTimeout(() => setTempPasswordBanner(''), 120_000)
    return () => clearTimeout(t)
  }, [tempPasswordBanner])

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
    setForm(emptyForm)
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
      conciergeEmail: c.conciergeEmail || '',
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
      padelCourtCount: String(c.padelCourtCount ?? 0),
      padelMaxHoursPerBooking: String(c.padelMaxHoursPerBooking ?? 2),
      padelMaxHoursApartmentDay: String(c.padelMaxHoursPerApartmentPerDay ?? 4),
      padelMinAdvanceHours: String(c.padelMinAdvanceHours ?? 24),
      padelOpenTime: padWallClockForInput(c.padelOpenTime, '08:00'),
      padelCloseTime: padWallClockForInput(c.padelCloseTime, '22:00'),
      salonBookingMode: c.salonBookingMode === 'day' ? 'day' : 'slots',
      customSpaces: normalizeCustomSpacesFromApi(c.customLocations),
      planExpiresOn: planExpiresOnForInput(c.planExpiresOn),
      companyId: c.companyId != null ? String(c.companyId) : '',
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
      const scheme = d.doorScheme === 'numbers' ? 'numbers' : 'letters'
      if (hasFloors || hasDoors || scheme === 'numbers') {
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
    const doorScheme = t.doorScheme === 'numbers' ? 'numbers' : 'letters'
    setPortalsDwellingDraft((prev) => prev.map(() => ({ floors, doorsPerFloor, doorScheme })))
  }

  const savePortalsModal = async () => {
    if (!accessToken || !portalsModalCommunity) return
    setPortalsSaving(true)
    setPortalsError('')
    try {
      const portalDwellingConfig = portalsDwellingDraft.map((d) => {
        const f = parseInt(String(d.floors ?? '').trim(), 10)
        const dp = parseInt(String(d.doorsPerFloor ?? '').trim(), 10)
        if (!Number.isFinite(f) || !Number.isFinite(dp) || f < 1 || f > 50 || dp < 1 || dp > 26) {
          return {}
        }
        const scheme = d.doorScheme === 'numbers' ? 'numbers' : 'letters'
        if (scheme === 'letters' && dp > 26) return {}
        return { floors: f, doorsPerFloor: dp, doorScheme: scheme }
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
          ? `Portales guardados. «Nº vecinos» (cupo) actualizado automáticamente a ${d.residentSlots} (igual que en alta masiva: suma plantas × puertas por portal).`
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
        { key: `k-${Date.now()}`, id: newUniqueSpaceId(), name: '' },
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
      let padelMaxHoursPerBooking = Math.min(24, Math.max(1, Number.parseInt(form.padelMaxHoursPerBooking, 10) || 2))
      let padelMaxHoursPerApartmentPerDay = Math.min(
        24,
        Math.max(1, Number.parseInt(form.padelMaxHoursApartmentDay, 10) || 4),
      )
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
          return { id, name }
        })

      const url = editingId
        ? apiUrl(`/api/admin/communities/${editingId}`)
        : apiUrl('/api/admin/communities')

      const rawCo = String(form.companyId ?? '').trim()
      let companyIdPayload = null
      if (rawCo !== '') {
        const n = Number.parseInt(rawCo, 10)
        if (!Number.isInteger(n) || n < 1) {
          setError('ID de empresa inválido (o déjalo vacío).')
          setSaving(false)
          return
        }
        companyIdPayload = n
      }

      const common = {
        name,
        nifCif: nifCif || null,
        address: address || null,
        contactEmail: contact,
        presidentEmail: null,
        loginSlug: form.loginSlug.trim(),
        presidentPortal: form.presidentPortal.trim() || null,
        presidentPiso: form.presidentPiso.trim() || null,
        communityAdminEmail: form.communityAdminEmail.trim(),
        conciergeEmail: form.conciergeEmail.trim(),
        poolStaffEmail: form.poolStaffEmail.trim(),
        status: form.status,
        companyId: companyIdPayload,
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
        let msg = 'Cambios guardados.'
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
        msg += ` · Guardado en servidor: presidente ${formatPresidentOnCard(d)}, admin ${d.communityAdminEmail?.trim() || '—'}, conserje ${d.conciergeEmail?.trim() || '—'}, socorrista ${d.poolStaffEmail?.trim() || '—'}.`
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
    setTempPasswordBanner('')
    loadCommunityUsers(c)
  }

  const closeCommunityUsers = () => {
    setUsersModalCommunity(null)
    setUsersModalData(null)
    setUsersModalError('')
    setTempPasswordBanner('')
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

  const issueTemporaryPassword = async (userId, email) => {
    if (!accessToken || !usersModalCommunity) return
    const okConfirm = window.confirm(
      `¿Generar una contraseña nueva para ${email}? La anterior dejará de valer.`,
    )
    if (!okConfirm) return
    setUsersActionBusyId(userId)
    setUsersModalError('')
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
      setTempPasswordBanner(`${email} → ${d.temporaryPassword}`)
    } catch (err) {
      setUsersModalError(err.message || 'No se pudo generar la contraseña')
    } finally {
      setUsersActionBusyId(null)
    }
  }

  const removeCommunity = async (c) => {
    if (!accessToken) return
    const ok = window.confirm(`¿Eliminar la comunidad «${c.name}»? Esta acción no se puede deshacer.`)
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
            <h1 className="admin-dashboard-title">Panel super administrador</h1>
            <p className="admin-dashboard-subtitle">
              Gestión de comunidades, ajustes, incidencias y reservas
            </p>
          </div>
          <div className="admin-dashboard-header-actions">
            <span className="admin-badge" aria-label="Super administrador">Super administrador</span>
            <Link to="/admin/services" className="btn btn--ghost">
              Solicitudes de servicio
            </Link>
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
                          <span className="admin-community-detail-label">Empresa</span>
                          {c.companyId != null
                            ? companyNameById.get(Number(c.companyId)) || `id ${c.companyId}`
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
                        {co.communityCount ?? 0} com. · {co.companyAdminCount ?? 0} adm.
                      </span>
                    </div>
                    <div className="admin-company-admins-block">
                      <span className="admin-company-admins-block__label">Correos con acceso</span>
                      {Array.isArray(co.companyAdmins) && co.companyAdmins.length > 0 ? (
                        <ul className="admin-company-admins-block__list">
                          {co.companyAdmins.map((a) => (
                            <li key={a.id} className="admin-company-admins-block__item">
                              <span className="admin-company-admins-block__email">
                                {a.email || `— (usuario id ${a.id})`}
                              </span>
                              {a.name ? (
                                <span className="admin-company-admins-block__name">{a.name}</span>
                              ) : null}
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
                          <span className="admin-community-detail-label">Empresa</span>
                          {community.companyId != null
                            ? companyNameById.get(Number(community.companyId)) || `id ${community.companyId}`
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
                            <span>Admin: {community.communityAdminEmail || '—'}</span>
                            <span>Conserje: {community.conciergeEmail || '—'}</span>
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
                          {community.padelMaxHoursPerBooking ?? 2} h/reserva ·{' '}
                          {community.padelMaxHoursPerApartmentPerDay ?? 4} h/vivienda/día · antelación{' '}
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
            {tempPasswordBanner && (
              <p className="admin-banner-success admin-users-temp-pw" role="status">
                Contraseña temporal (cópiala ahora): <code>{tempPasswordBanner}</code>
              </p>
            )}
            {usersModalError && (
              <p className="admin-banner-error" role="alert">
                {usersModalError}
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
                          <th>Piso</th>
                          <th>Portal</th>
                          <th>Cuenta</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usersModalData.staff || []).map((row) => {
                          const staffBlockedHint = staffFichaRowBlockedReason(row)
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
                                      className="btn btn--ghost btn--sm"
                                      disabled={usersActionBusyId === row.user.id}
                                      onClick={() =>
                                        issueTemporaryPassword(row.user.id, row.user.email)
                                      }
                                    >
                                      Contraseña temporal
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
                                          className="btn btn--ghost btn--sm"
                                          disabled={usersActionBusyId === row.user.id}
                                          onClick={() =>
                                            issueTemporaryPassword(row.user.id, pwLabel)
                                          }
                                        >
                                          Contraseña temporal
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
              plantas hay, cuántas puertas por planta y si las puertas van en <strong>letras</strong> (A, B, C…) o{' '}
              <strong>números</strong> (1, 2, 3…). Eso genera listas en el alta de vecinos y en el login. Para cambiar
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
                  Copia <strong>plantas</strong>, <strong>puertas por planta</strong> y <strong>etiquetas</strong> desde el
                  primer portal que tenga alguno de esos datos. Los alias (32, 34…) no cambian.
                </p>
              </div>
            ) : null}
            <div className="admin-portals-fields">
              {portalsDraft.map((val, i) => (
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
                          next[i] = { ...(next[i] || {}), floors: v }
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
              ))}
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
                    disabled={!onboardingMailCommunity.communityAdminEmail?.trim()}
                  />
                  <span>
                    Administrador de comunidad{' '}
                    <span className="admin-onboarding-mail-addr">
                      ({onboardingMailCommunity.communityAdminEmail?.trim() || 'sin email'})
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
                    disabled={!onboardingMailCommunity.conciergeEmail?.trim()}
                  />
                  <span>
                    Conserje{' '}
                    <span className="admin-onboarding-mail-addr">
                      ({onboardingMailCommunity.conciergeEmail?.trim() || 'sin email'})
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
                      min={1}
                      max={24}
                      className="admin-input"
                      value={form.padelMaxHoursPerBooking}
                      onChange={(e) => setForm((f) => ({ ...f, padelMaxHoursPerBooking: e.target.value }))}
                    />
                    <p className="admin-field-hint">Una reserva cuenta como esta duración en la cuota diaria.</p>
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-padel-h-day">
                      Pádel: máx. horas por vivienda y día
                    </label>
                    <input
                      id="comm-padel-h-day"
                      type="number"
                      min={1}
                      max={24}
                      className="admin-input"
                      value={form.padelMaxHoursApartmentDay}
                      onChange={(e) => setForm((f) => ({ ...f, padelMaxHoursApartmentDay: e.target.value }))}
                    />
                    <p className="admin-field-hint">
                      Por piso (o por email si no hay piso). No puede ser menor que horas/reserva.
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
                </fieldset>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-salon-mode">
                    Salas / salones (reuniones, social, espacios propios)
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
                    Afecta a la sala de reuniones, salón social y a cada espacio listado abajo. No aplica al pádel ni
                    al gimnasio.
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
                  copiarlo si integras con otros sistemas).
                </p>
                {form.customSpaces.length === 0 ? (
                  <p className="admin-empty-hint admin-spaces-empty">Ninguno — pulsa «Añadir espacio».</p>
                ) : (
                  <ul className="admin-spaces-list">
                    {form.customSpaces.map((row) => (
                      <li key={row.key} className="admin-space-row">
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
                          placeholder="Nombre visible (ej. Salón Cumpleaños)"
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <fieldset className="admin-modal-fieldset">
                <legend className="admin-fieldset-legend">Emails para instrucciones de alta</legend>
                <p className="admin-field-hint admin-field-hint--block">
                  Solo el <strong>email de contacto</strong> es obligatorio (avisos generales). Indica la{' '}
                  <strong>vivienda del presidente</strong> (portal + piso): ese vecino entra como siempre
                  con VEC + portal + piso y obtiene permisos de presidente (p. ej. rotación anual). El{' '}
                  <strong>administrador</strong> se puede añadir después y enviarle acceso por correo. El{' '}
                  <strong>conserje</strong> puede usar el mismo correo que el contacto de la comunidad.
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
                <div className="admin-modal-row">
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-president-portal">
                      Portal del presidente (vivienda actual)
                    </label>
                    <input
                      id="comm-president-portal"
                      type="text"
                      className="admin-input"
                      value={form.presidentPortal}
                      onChange={(e) => setForm((f) => ({ ...f, presidentPortal: e.target.value }))}
                      placeholder="Ej. 34, P1 (mismo valor que en el alta del vecino)"
                      maxLength={64}
                      autoComplete="off"
                    />
                  </div>
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-president-piso">
                      Piso / puerta del presidente
                    </label>
                    <input
                      id="comm-president-piso"
                      type="text"
                      className="admin-input"
                      value={form.presidentPiso}
                      onChange={(e) => setForm((f) => ({ ...f, presidentPiso: e.target.value }))}
                      placeholder="Ej. 3º B"
                      maxLength={64}
                      autoComplete="off"
                    />
                    <p className="admin-field-hint">
                      Deben coincidir con la cuenta de vecino. Vacíos = sin presidente por vivienda (solo
                      admin/conserje por correo si aplica).
                    </p>
                  </div>
                </div>
                <div className="admin-modal-row">
                  <div className="admin-modal-field">
                    <label className="admin-label" htmlFor="comm-admin-email">
                      Email administrador de comunidad (opcional)
                    </label>
                    <input
                      id="comm-admin-email"
                      type="email"
                      className="admin-input"
                      value={form.communityAdminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, communityAdminEmail: e.target.value }))}
                      placeholder="admin@gestoria.es"
                      autoComplete="email"
                    />
                    <p className="admin-field-hint">
                      Gestión (incidencias, reservas). Puedes añadirlo más tarde y usar «Enviar correos de
                      alta». El presidente por vivienda no necesita correo; con admin basta para gestión
                      por email.
                    </p>
                  </div>
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="comm-concierge-email">
                    Email conserje / portería (opcional)
                  </label>
                  <input
                    id="comm-concierge-email"
                    type="email"
                    className="admin-input"
                    value={form.conciergeEmail}
                    onChange={(e) => setForm((f) => ({ ...f, conciergeEmail: e.target.value }))}
                    placeholder="conserje@ejemplo.es"
                    autoComplete="email"
                  />
                  <p className="admin-field-hint">
                    Opcional. Crea usuario <strong>Conserje</strong> (VEC + este correo). Puede ser el mismo
                    email que el contacto de la comunidad.
                  </p>
                </div>
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
                <label className="admin-label" htmlFor="comm-company-id">Empresa (opcional)</label>
                <select
                  id="comm-company-id"
                  className="admin-input admin-select"
                  value={form.companyId}
                  onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                >
                  <option value="">— Sin empresa —</option>
                  {companiesList.map((co) => (
                    <option key={co.id} value={String(co.id)}>
                      {co.name} (id {co.id})
                    </option>
                  ))}
                </select>
                <p className="admin-field-hint">
                  Vincula la comunidad a una empresa para que sus administradores de empresa la gestionen.
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
