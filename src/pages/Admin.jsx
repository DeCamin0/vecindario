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
import './Admin.css'

function statusLabel(status) {
  if (status === 'demo') return 'Demo'
  if (status === 'inactive') return 'Inactive'
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
      'Ejemplo: este correo está en Conserje/contacto pero la cuenta es Administrador — entonces debe coincidir con «Email administrador de comunidad», o cambia el rol del usuario a Conserje. Presidente/Administrador/Conserje exigen rol en BD igual al puesto y el mismo correo en el campo correspondiente de la ficha.',
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
  status: 'active',
  portalCount: '1',
  residentSlots: '',
  gymAccessEnabled: false,
  appNavServicesEnabled: true,
  appNavIncidentsEnabled: true,
  appNavBookingsEnabled: true,
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
  const [portalsSaving, setPortalsSaving] = useState(false)
  const [portalsError, setPortalsError] = useState('')
  const [qrModal, setQrModal] = useState(null)
  const [navTabSavingId, setNavTabSavingId] = useState(null)

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

  const plannedResidentsTotal = useMemo(
    () => communities.reduce((sum, c) => sum + (Number(c.residentSlots) > 0 ? Number(c.residentSlots) : 0), 0),
    [communities],
  )

  const loadCommunities = useCallback(async () => {
    if (!accessToken) {
      setCommunities([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/admin/communities'), {
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
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las comunidades')
      setCommunities([])
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
      status: c.status || 'active',
      portalCount: String(c.portalCount ?? 1),
      residentSlots: c.residentSlots != null ? String(c.residentSlots) : '',
      gymAccessEnabled: Boolean(c.gymAccessEnabled),
      appNavServicesEnabled: c.appNavServicesEnabled !== false,
      appNavIncidentsEnabled: c.appNavIncidentsEnabled !== false,
      appNavBookingsEnabled: c.appNavBookingsEnabled !== false,
      padelCourtCount: String(c.padelCourtCount ?? 0),
      padelMaxHoursPerBooking: String(c.padelMaxHoursPerBooking ?? 2),
      padelMaxHoursApartmentDay: String(c.padelMaxHoursPerApartmentPerDay ?? 4),
      padelMinAdvanceHours: String(c.padelMinAdvanceHours ?? 24),
      padelOpenTime: padWallClockForInput(c.padelOpenTime, '08:00'),
      padelCloseTime: padWallClockForInput(c.padelCloseTime, '22:00'),
      salonBookingMode: c.salonBookingMode === 'day' ? 'day' : 'slots',
      customSpaces: normalizeCustomSpacesFromApi(c.customLocations),
      planExpiresOn: planExpiresOnForInput(c.planExpiresOn),
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
  }

  const closePortalsModal = () => {
    setPortalsModalCommunity(null)
    setPortalsDraft([])
    setPortalsError('')
  }

  const savePortalsModal = async () => {
    if (!accessToken || !portalsModalCommunity) return
    setPortalsSaving(true)
    setPortalsError('')
    try {
      const res = await fetch(apiUrl(`/api/admin/communities/${portalsModalCommunity.id}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalLabels: portalsDraft }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setSuccessFlash('Nombres de portales guardados.')
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
        status: form.status,
        portalCount,
        residentSlots,
        gymAccessEnabled: form.gymAccessEnabled,
        appNavServicesEnabled: form.appNavServicesEnabled,
        appNavIncidentsEnabled: form.appNavIncidentsEnabled,
        appNavBookingsEnabled: form.appNavBookingsEnabled,
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
            ' Emails de presidente / administrador / conserje sincronizados con cuentas (sin enviar correos automáticos).'
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
          }
          msg += ` · Cuentas que ya no figuran en la ficha: pasadas a vecino — ${d.staffDemoted.map((x) => `${x.email} (era ${roleEs[x.previousRole] || x.previousRole})`).join('; ')}`
        }
        msg += ` · Guardado en servidor: presidente ${formatPresidentOnCard(d)}, admin ${d.communityAdminEmail?.trim() || '—'}, conserje ${d.conciergeEmail?.trim() || '—'}.`
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
      value: communities.length,
      label: 'Total comunidades',
      trend: null,
      icon: '🏘️',
    },
    {
      key: 'residents',
      value: plannedResidentsTotal > 0 ? plannedResidentsTotal : '—',
      label: 'Cupo vecinos (planificado)',
      trend: plannedResidentsTotal > 0 ? 'Suma por comunidad' : 'Indica «Nº vecinos» al crear',
      icon: '👤',
    },
    {
      key: 'incidents',
      value: '—',
      label: 'Incidencias abiertas',
      trend: 'Próximamente',
      icon: '⚠️',
      accent: true,
    },
    {
      key: 'bookings',
      value: '—',
      label: 'Reservas activas',
      trend: 'Próximamente',
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
                        </div>
                        <p className="admin-field-hint admin-field-hint--block" style={{ marginTop: '0.35rem' }}>
                          Solo se muestran en la app las pestañas marcadas; el acceso directo por URL también se
                          bloquea.
                        </p>
                      </div>
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
              <em>34</em>, <em>36</em> o <em>P1</em>, <em>P2</em>). Para cambiar el número total, usa «Edit» en la
              comunidad y vuelve a abrir esta ventana.
            </p>
            {portalsError && (
              <p className="admin-banner-error" role="alert">
                {portalsError}
              </p>
            )}
            <div className="admin-portals-fields">
              {portalsDraft.map((val, i) => (
                <div key={`portal-${portalsModalCommunity.id}-${i}`} className="admin-modal-field">
                  <label className="admin-label" htmlFor={`portal-alias-${portalsModalCommunity.id}-${i}`}>
                    Portal {i + 1}
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
                    …/vecindario/c/
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
                  <legend className="admin-fieldset-legend">Pestañas en la app vecinos</legend>
                  <p className="admin-field-hint admin-field-hint--block">
                    Activa o desactiva Servicios, Incidencias y Reservas por comunidad (despliegue progresivo).
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
                </select>
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
