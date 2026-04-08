import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { useCommunityPortalOptions } from '../hooks/useCommunityPortalOptions.js'
import {
  normDwellPart,
  occupiedPuertasForUnit,
  pisoPuertaChoicesForPortal,
} from '../utils/dwellingPortalChoices.js'
import './Admin.css'
import './CommunityAdmin.css'
import { getSignInPath } from '../utils/signInWebPath.js'

const JUNTA_OPTIONS = [
  { value: 'none', label: 'Sin cargo' },
  { value: 'president', label: 'Presidente' },
  { value: 'vice_president', label: 'Vicepresidente' },
  { value: 'vocal', label: 'Vocal' },
]

const HABITACIONES_CHOICES = ['1', '2', '3', '4', '5']
const POOL_ACCESS_CHOICES = Array.from({ length: 10 }, (_, i) => String(i + 1))

function dwellingSelectValue(choices, raw) {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  if (choices.includes(v)) return v
  return v
}

function choicesWithLegacy(choices, raw) {
  if (!choices?.length) return null
  const u = String(raw ?? '').trim()
  if (u && !choices.includes(u)) return [...choices, u]
  return choices
}

const emptyCreateForm = () => ({
  name: '',
  email: '',
  phone: '',
  portal: '',
  piso: '',
  puerta: '',
  habitaciones: '',
  plazaGaraje: '',
  poolAccessOwner: '',
  poolAccessGuest: '',
  password: '',
})

export default function CommunityResidents() {
  const navigate = useNavigate()
  const { accessToken, communityId, communityAccessCode, community } = useAuth()
  const [list, setList] = useState([])
  const [listError, setListError] = useState('')
  const [loadingList, setLoadingList] = useState(true)

  const [form, setForm] = useState(emptyCreateForm)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [juntaSavingId, setJuntaSavingId] = useState(null)
  const [passwordResetForId, setPasswordResetForId] = useState(null)
  const [passwordResetValue, setPasswordResetValue] = useState('')
  const [passwordResetBusy, setPasswordResetBusy] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState('')
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('')

  const [editResident, setEditResident] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')

  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkPreview, setBulkPreview] = useState(null)
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false)
  const [bulkPassword, setBulkPassword] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [bulkDone, setBulkDone] = useState(null)

  const code = communityAccessCode?.trim().toUpperCase() || ''
  const { loading: portalLoading, portals: portalChoicesRaw, dwellingByPortalIndex } =
    useCommunityPortalOptions(
      communityId != null ? communityId : null,
      code || null,
      { staffBearerToken: accessToken },
    )

  const createDwelling = useMemo(
    () => pisoPuertaChoicesForPortal(form.portal, portalChoicesRaw, dwellingByPortalIndex),
    [form.portal, portalChoicesRaw, dwellingByPortalIndex],
  )

  const editDwelling = useMemo(() => {
    if (!editForm) return { pisoOptions: null, puertaOptions: null }
    return pisoPuertaChoicesForPortal(editForm.portal, portalChoicesRaw, dwellingByPortalIndex)
  }, [editForm, portalChoicesRaw, dwellingByPortalIndex])

  const createPisoSelect = choicesWithLegacy(createDwelling.pisoOptions, form.piso)
  const createPuertaSelect = useMemo(() => {
    const base = choicesWithLegacy(createDwelling.puertaOptions, form.puerta)
    if (!base) return null
    const occ = occupiedPuertasForUnit(list, form.portal, form.piso, null)
    return base.filter((c) => !occ.has(normDwellPart(c)))
  }, [createDwelling.puertaOptions, form.puerta, form.portal, form.piso, list])

  const editPisoSelect =
    editForm && choicesWithLegacy(editDwelling.pisoOptions, editForm.piso)
  const editPuertaSelect = useMemo(() => {
    if (!editForm) return null
    const base = choicesWithLegacy(editDwelling.puertaOptions, editForm.puerta)
    if (!base) return null
    const occ = occupiedPuertasForUnit(
      list,
      editForm.portal,
      editForm.piso,
      editResident?.id ?? null,
    )
    return base.filter((c) => !occ.has(normDwellPart(c)))
  }, [editForm, editDwelling.puertaOptions, list, editResident])

  const editPortalSelectOptions = useMemo(() => {
    if (!portalChoicesRaw?.length || !editForm) return null
    const u = editForm.portal.trim()
    if (u && !portalChoicesRaw.includes(u)) return [u, ...portalChoicesRaw]
    return portalChoicesRaw
  }, [portalChoicesRaw, editForm])

  const loadList = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoadingList(false)
      return
    }
    setListError('')
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (code) q.set('accessCode', code)
      const res = await fetch(apiUrl(`/api/community/residents?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(data.error || data.message || 'No se pudo cargar la lista')
        setList([])
        return
      }
      setList(Array.isArray(data.residents) ? data.residents : [])
    } catch {
      setListError('Error de red')
      setList([])
    } finally {
      setLoadingList(false)
    }
  }, [accessToken, communityId, code])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const fetchBulkPreview = useCallback(async () => {
    if (!accessToken || communityId == null) return
    setBulkPreviewLoading(true)
    setBulkError('')
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (code) q.set('accessCode', code)
      const res = await fetch(apiUrl(`/api/community/residents/missing-dwellings-preview?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setBulkPreview(data)
    } catch (e) {
      setBulkError(e.message || 'Error')
      setBulkPreview(null)
    } finally {
      setBulkPreviewLoading(false)
    }
  }, [accessToken, communityId, code])

  const openBulkModal = () => {
    setBulkModalOpen(true)
    setBulkPassword('')
    setBulkDone(null)
    setBulkError('')
    void fetchBulkPreview()
  }

  const closeBulkModal = () => {
    setBulkModalOpen(false)
    setBulkPreview(null)
    setBulkDone(null)
    setBulkError('')
    setBulkPassword('')
  }

  const submitBulkCreate = async () => {
    setBulkError('')
    if (bulkPassword.length < 6) {
      setBulkError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (!accessToken || communityId == null) return
    setBulkBusy(true)
    try {
      const res = await fetch(apiUrl('/api/community/residents/create-missing-dwellings'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          ...(code ? { accessCode: code } : {}),
          password: bulkPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkError(data.error || data.message || `Error ${res.status}`)
        return
      }
      setBulkDone(data)
      void loadList()
    } catch (e) {
      setBulkError(e.message || 'Error de red')
    } finally {
      setBulkBusy(false)
    }
  }

  useEffect(() => {
    if (createPuertaSelect == null) return
    const u = normDwellPart(form.puerta)
    if (!u) return
    if (!createPuertaSelect.includes(u)) {
      setForm((f) => ({ ...f, puerta: '' }))
    }
  }, [createPuertaSelect, form.puerta])

  useEffect(() => {
    if (!editForm || editPuertaSelect == null) return
    const u = normDwellPart(editForm.puerta)
    if (!u) return
    if (!editPuertaSelect.includes(u)) {
      setEditForm((f) => (f ? { ...f, puerta: '' } : f))
    }
  }, [editPuertaSelect, editForm])

  const openEdit = (r) => {
    setEditError('')
    setEditResident(r)
    setEditForm({
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      portal: r.portal || '',
      piso: r.piso || '',
      puerta: r.puerta || '',
      habitaciones: r.habitaciones || '',
      plazaGaraje: r.plazaGaraje || '',
      poolAccessOwner: r.poolAccessOwner || '',
      poolAccessGuest: r.poolAccessGuest || '',
    })
  }

  const closeEdit = () => {
    setEditResident(null)
    setEditForm(null)
    setEditError('')
    setEditBusy(false)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    setEditError('')
    if (!accessToken || communityId == null || !editResident || !editForm) return
    if (!editForm.portal.trim() || !editForm.piso.trim() || !editForm.puerta.trim()) {
      setEditError('Portal, piso y puerta son obligatorios (identifican la vivienda).')
      return
    }
    setEditBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/community/residents/${editResident.id}`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          communityId,
          ...(code ? { accessCode: code } : {}),
          name: editForm.name.trim().slice(0, 255) || null,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim().slice(0, 40) || null,
          portal: editForm.portal.trim().slice(0, 64),
          piso: editForm.piso.trim().slice(0, 64),
          puerta: editForm.puerta.trim().slice(0, 64),
          habitaciones: editForm.habitaciones.trim().slice(0, 64) || null,
          plazaGaraje: editForm.plazaGaraje.trim().slice(0, 64) || null,
          poolAccessOwner: editForm.poolAccessOwner.trim().slice(0, 64) || null,
          poolAccessGuest: editForm.poolAccessGuest.trim().slice(0, 64) || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(data.error || data.message || 'No se pudo guardar')
        return
      }
      closeEdit()
      void loadList()
    } catch {
      setEditError('Error de red')
    } finally {
      setEditBusy(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccess('')
    if (!accessToken || communityId == null) {
      setFormError('Falta sesión. Vuelve al login.')
      return
    }
    if (!form.piso.trim() || !form.portal.trim() || !form.puerta.trim()) {
      setFormError('Indica portal, piso y puerta (los tres identifican el apartamento).')
      return
    }
    if (form.password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        communityId,
        ...(code ? { accessCode: code } : {}),
        piso: form.piso.trim().slice(0, 64),
        portal: form.portal.trim().slice(0, 64),
        puerta: form.puerta.trim().slice(0, 64),
        password: form.password,
        ...(form.name.trim() ? { name: form.name.trim().slice(0, 255) } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim().slice(0, 40) } : {}),
        ...(form.habitaciones.trim() ? { habitaciones: form.habitaciones.trim().slice(0, 64) } : {}),
        ...(form.plazaGaraje.trim() ? { plazaGaraje: form.plazaGaraje.trim().slice(0, 64) } : {}),
        ...(form.poolAccessOwner.trim()
          ? { poolAccessOwner: form.poolAccessOwner.trim().slice(0, 64) }
          : {}),
        ...(form.poolAccessGuest.trim()
          ? { poolAccessGuest: form.poolAccessGuest.trim().slice(0, 64) }
          : {}),
      }
      const res = await fetch(apiUrl('/api/community/residents'), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error || data.message || 'No se pudo crear el usuario')
        return
      }
      setSuccess(
        `Cuenta creada: portal ${data.portal}, piso ${data.piso}, puerta ${data.puerta}. El vecino entra con VEC + esos tres datos + contraseña.`,
      )
      setForm(emptyCreateForm())
      void loadList()
    } catch {
      setFormError('No se pudo conectar con el servidor')
    } finally {
      setSubmitting(false)
    }
  }

  const openPasswordReset = (residentId) => {
    setPasswordResetForId(residentId)
    setPasswordResetValue('')
    setPasswordResetError('')
    setPasswordResetSuccess('')
  }

  const closePasswordReset = () => {
    setPasswordResetForId(null)
    setPasswordResetValue('')
    setPasswordResetError('')
    setPasswordResetSuccess('')
    setPasswordResetBusy(false)
  }

  const handlePasswordResetSubmit = async (e) => {
    e.preventDefault()
    setPasswordResetError('')
    setPasswordResetSuccess('')
    if (!accessToken || communityId == null || passwordResetForId == null) return
    if (passwordResetValue.length < 6) {
      setPasswordResetError('Mínimo 6 caracteres.')
      return
    }
    setPasswordResetBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/community/residents/${passwordResetForId}/password`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          communityId,
          ...(code ? { accessCode: code } : {}),
          newPassword: passwordResetValue,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPasswordResetError(data.error || data.message || 'No se pudo actualizar la contraseña')
        return
      }
      setPasswordResetSuccess('Contraseña actualizada. Comunícale al vecino la nueva clave.')
      setPasswordResetValue('')
    } catch {
      setPasswordResetError('Error de red')
    } finally {
      setPasswordResetBusy(false)
    }
  }

  const handleJuntaChange = async (residentId, boardRole) => {
    if (!accessToken || communityId == null) return
    setJuntaSavingId(residentId)
    setListError('')
    try {
      const res = await fetch(apiUrl(`/api/community/residents/${residentId}/junta`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          communityId,
          ...(code ? { accessCode: code } : {}),
          boardRole,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(data.error || data.message || 'No se pudo actualizar el cargo de junta')
        return
      }
      setList((prev) =>
        prev.map((row) =>
          row.id === residentId ? { ...row, boardRole: data.boardRole ?? null } : row,
        ),
      )
    } catch {
      setListError('Error de red')
    } finally {
      setJuntaSavingId(null)
    }
  }

  const unitSummary = (r) => {
    const parts = [r.portal, r.piso, r.puerta].map((x) => (x && String(x).trim()) || '').filter(Boolean)
    return parts.length ? parts.join(' · ') : '—'
  }

  const extrasSummary = (r) => {
    const bits = []
    if (r.phone?.trim()) bits.push(`Tel. ${r.phone.trim()}`)
    if (r.habitaciones?.trim()) bits.push(`Hab. ${r.habitaciones.trim()}`)
    if (r.plazaGaraje?.trim()) bits.push(`Garaje ${r.plazaGaraje.trim()}`)
    if (r.poolAccessOwner?.trim()) bits.push(`Pisc. tit. ${r.poolAccessOwner.trim()}`)
    if (r.poolAccessGuest?.trim()) bits.push(`Pisc. inv. ${r.poolAccessGuest.trim()}`)
    return bits.length ? bits.join(' · ') : null
  }

  if (!accessToken) {
    navigate(getSignInPath(), { replace: true })
    return null
  }

  return (
    <div className="community-admin-page">
      <header className="community-admin-header admin-header">
        <div className="admin-header-inner">
          <div className="community-admin-header-brand">
            <h1 className="community-admin-title">Alta de vecinos</h1>
            <p className="community-admin-subtitle">
              Ficha completa: vivienda (portal, piso, puerta) y datos opcionales
              {community ? ` · ${community}` : ''}
            </p>
          </div>
          <Link to="/community-admin" className="admin-back-link">
            Volver al panel
          </Link>
        </div>
      </header>

      <main className="community-admin-main admin-main page-container">
        <div className="community-admin-inner">
          <section className="community-admin-section">
            <h2 className="community-admin-section-title">Nuevo vecino</h2>
            <p className="community-admin-section-intro">
              Portal, piso y puerta identifican el apartamento (acceso, planta y puerta). El vecino entra con código VEC,
              esos tres datos y la contraseña. El correo es opcional; si lo pones, también podrá entrar por email. Si en
              Super Admin configuraste portales y la estructura (plantas y puertas por planta), aquí verás desplegables al
              elegir portal; si falta «puertas por planta» o no guardaste la ficha, podrás usar texto libre en piso/puerta.
            </p>
            <form onSubmit={(ev) => void handleCreate(ev)} className="card community-residents-form">
              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Datos personales</h3>
                <div className="community-residents-form-grid community-residents-form-grid--2">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-name">
                      Nombre completo <span className="auth-optional">(opcional)</span>
                    </label>
                    <input
                      id="cr-name"
                      className="auth-input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      autoComplete="name"
                      placeholder="Ej. Familia García"
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-email">
                      Email <span className="auth-optional">(opcional)</span>
                    </label>
                    <input
                      id="cr-email"
                      type="email"
                      className="auth-input"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      autoComplete="off"
                      placeholder="vecino@ejemplo.com"
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-phone">
                      Teléfono <span className="auth-optional">(opcional)</span>
                    </label>
                    <input
                      id="cr-phone"
                      className="auth-input"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      autoComplete="tel"
                      placeholder="Ej. 600 000 000"
                    />
                  </div>
                </div>
              </div>

              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Vivienda</h3>
                <p className="community-admin-section-intro community-residents-vivienda-hint">
                  Misma configuración que en el login del vecino: si en Super Admin definiste plantas y puertas por portal,
                  al elegir portal aparecerán listas; si no, usa texto libre. Las puertas ya dadas de alta en esa planta no
                  aparecen en el desplegable.
                </p>
                <div className="community-residents-form-grid community-residents-form-grid--2">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-portal">
                      Portal <span className="auth-required">(acceso)</span>
                    </label>
                    {portalLoading ? (
                      <select id="cr-portal" className="auth-input auth-select" disabled value="">
                        <option value="">Cargando portales…</option>
                      </select>
                    ) : portalChoicesRaw?.length ? (
                      <select
                        id="cr-portal"
                        className="auth-input auth-select"
                        value={form.portal}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, portal: e.target.value, piso: '', puerta: '' }))
                        }
                        required
                      >
                        <option value="">Selecciona portal</option>
                        {portalChoicesRaw.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="cr-portal"
                        className="auth-input"
                        value={form.portal}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            portal: e.target.value,
                            piso: '',
                            puerta: '',
                          }))
                        }
                        required
                        autoComplete="off"
                        placeholder="Ej. A, 34, P1"
                      />
                    )}
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-piso">
                      Piso <span className="auth-required">(planta / bloque)</span>
                    </label>
                    {createPisoSelect ? (
                      <select
                        id="cr-piso"
                        className="auth-input auth-select"
                        value={form.piso}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, piso: e.target.value, puerta: '' }))
                        }
                        required
                      >
                        <option value="">Selecciona planta</option>
                        {createPisoSelect.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="cr-piso"
                        className="auth-input"
                        value={form.piso}
                        onChange={(e) => setForm((f) => ({ ...f, piso: e.target.value, puerta: '' }))}
                        required
                        autoComplete="off"
                        placeholder="Ej. 3º, Bajo A, Ático"
                      />
                    )}
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-puerta">
                      Puerta <span className="auth-required">(apartamento)</span>
                    </label>
                    {createPuertaSelect ? (
                      <select
                        id="cr-puerta"
                        className="auth-input auth-select"
                        value={form.puerta}
                        onChange={(e) => setForm((f) => ({ ...f, puerta: e.target.value }))}
                        required
                      >
                        <option value="">Selecciona puerta</option>
                        {createPuertaSelect.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="cr-puerta"
                        className="auth-input"
                        value={form.puerta}
                        onChange={(e) => setForm((f) => ({ ...f, puerta: e.target.value }))}
                        autoComplete="off"
                        required
                        placeholder="Ej. B, 2, Izq."
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Datos adicionales</h3>
                <div className="community-residents-form-grid community-residents-form-grid--2">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-hab">
                      Habitaciones <span className="auth-optional">(opcional, 1–5)</span>
                    </label>
                    <select
                      id="cr-hab"
                      className="auth-input auth-select"
                      value={form.habitaciones}
                      onChange={(e) => setForm((f) => ({ ...f, habitaciones: e.target.value }))}
                    >
                      <option value="">Sin indicar</option>
                      {HABITACIONES_CHOICES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-garaje">
                      Plaza de garaje <span className="auth-optional">(opcional)</span>
                    </label>
                    <input
                      id="cr-garaje"
                      className="auth-input"
                      value={form.plazaGaraje}
                      onChange={(e) => setForm((f) => ({ ...f, plazaGaraje: e.target.value }))}
                      placeholder="Texto libre"
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-pool-o">
                      Accesos piscina titular <span className="auth-optional">(opcional, 1–10)</span>
                    </label>
                    <select
                      id="cr-pool-o"
                      className="auth-input auth-select"
                      value={form.poolAccessOwner}
                      onChange={(e) => setForm((f) => ({ ...f, poolAccessOwner: e.target.value }))}
                    >
                      <option value="">Sin indicar</option>
                      {POOL_ACCESS_CHOICES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-pool-g">
                      Accesos piscina invitado <span className="auth-optional">(opcional, 1–10)</span>
                    </label>
                    <select
                      id="cr-pool-g"
                      className="auth-input auth-select"
                      value={form.poolAccessGuest}
                      onChange={(e) => setForm((f) => ({ ...f, poolAccessGuest: e.target.value }))}
                    >
                      <option value="">Sin indicar</option>
                      {POOL_ACCESS_CHOICES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Acceso</h3>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="cr-password">
                    Contraseña inicial
                  </label>
                  <input
                    id="cr-password"
                    type="password"
                    className="auth-input"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              {formError && (
                <p className="auth-error" role="alert">
                  {formError}
                </p>
              )}
              {success && (
                <p className="auth-vec-ok" role="status">
                  {success}
                </p>
              )}
              <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                {submitting ? 'Creando…' : 'Crear cuenta de vecino'}
              </button>
            </form>
          </section>

          <section className="community-admin-section">
            <h2 className="community-admin-section-title">Vecinos dados de alta</h2>
            <p className="community-admin-section-intro community-residents-junta-intro">
              Cargo en la junta por vivienda: el <strong>presidente</strong> inicia sesión como vecino y obtiene el
              panel de gestión; vice y vocal quedan registrados en la comunidad (sin permisos extra en la app por
              ahora).
            </p>
            <p className="community-residents-bulk-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={openBulkModal}>
                Crear cuentas en viviendas sin vecino…
              </button>
              <span className="community-residents-bulk-actions-hint">
                Usa la misma estructura de portales/plantas/puertas que en Super Admin; contraseña inicial común para
                todas las cuentas creadas en un solo paso.
              </span>
            </p>
            {loadingList ? (
              <p className="community-admin-section-intro">Cargando…</p>
            ) : listError ? (
              <p className="auth-error" role="alert">
                {listError}
              </p>
            ) : list.length === 0 ? (
              <p className="community-admin-section-intro">Aún no hay cuentas con portal/piso en esta comunidad.</p>
            ) : (
              <ul className="community-residents-list card">
                {list.map((r) => (
                  <li key={r.id} className="community-residents-list-item">
                    <div className="community-residents-list-row">
                      <div className="community-residents-list-unit">
                        <strong>{unitSummary(r)}</strong>
                        {r.name ? (
                          <>
                            <span aria-hidden="true"> — </span>
                            <span>{r.name}</span>
                          </>
                        ) : null}
                        {r.hasEmail ? (
                          <span className="community-residents-badge">también con correo</span>
                        ) : null}
                        {extrasSummary(r) ? (
                          <span className="community-residents-unit-line">{extrasSummary(r)}</span>
                        ) : null}
                      </div>
                      <div className="community-residents-list-junta">
                        <label className="community-residents-junta-label" htmlFor={`junta-${r.id}`}>
                          Junta
                        </label>
                        <select
                          id={`junta-${r.id}`}
                          className="auth-input auth-select community-residents-junta-select"
                          value={r.boardRole ?? 'none'}
                          disabled={juntaSavingId === r.id}
                          onChange={(e) => void handleJuntaChange(r.id, e.target.value)}
                        >
                          {JUNTA_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {juntaSavingId === r.id ? (
                          <span className="community-residents-junta-saving">Guardando…</span>
                        ) : null}
                      </div>
                      <div className="community-residents-list-actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small community-residents-password-btn"
                          onClick={() => openEdit(r)}
                        >
                          Editar ficha
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small community-residents-password-btn"
                          onClick={() => openPasswordReset(r.id)}
                        >
                          Nueva contraseña
                        </button>
                      </div>
                    </div>
                    {passwordResetForId === r.id ? (
                      <form
                        className="community-residents-password-panel"
                        onSubmit={(ev) => void handlePasswordResetSubmit(ev)}
                      >
                        <p className="community-residents-password-panel-intro">
                          Si el vecino olvidó su clave, define una nueva (mín. 6 caracteres) y entrégasela por un canal
                          seguro.
                        </p>
                        <div className="auth-field community-residents-password-field">
                          <label className="auth-label" htmlFor={`pwd-reset-${r.id}`}>
                            Nueva contraseña
                          </label>
                          <input
                            id={`pwd-reset-${r.id}`}
                            type="password"
                            className="auth-input"
                            value={passwordResetValue}
                            onChange={(e) => setPasswordResetValue(e.target.value)}
                            autoComplete="new-password"
                            minLength={6}
                            placeholder="Mínimo 6 caracteres"
                            disabled={passwordResetBusy}
                          />
                        </div>
                        {passwordResetError ? (
                          <p className="auth-error" role="alert">
                            {passwordResetError}
                          </p>
                        ) : null}
                        {passwordResetSuccess ? (
                          <p className="auth-vec-ok" role="status">
                            {passwordResetSuccess}
                          </p>
                        ) : null}
                        <div className="community-residents-password-actions">
                          <button
                            type="submit"
                            className="btn btn--primary btn--small"
                            disabled={passwordResetBusy}
                          >
                            {passwordResetBusy ? 'Guardando…' : 'Guardar contraseña'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={passwordResetBusy}
                            onClick={() => closePasswordReset()}
                          >
                            Cerrar
                          </button>
                        </div>
                      </form>
                    ) : null}
                    {(r.boardRole ?? 'none') === 'president' ? (
                      <p className="community-residents-junta-hint">
                        Al entrar con portal, piso y puerta tendrá el mismo acceso que el presidente de la ficha (panel
                        de gestión).
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {editResident && editForm ? (
        <div className="community-residents-edit-overlay" role="dialog" aria-modal="true" aria-labelledby="cr-edit-title">
          <div className="community-residents-edit-dialog">
            <div className="community-residents-edit-head">
              <h2 id="cr-edit-title" className="community-residents-edit-title">
                Editar vecino
              </h2>
              <button type="button" className="community-residents-edit-close" onClick={() => closeEdit()}>
                Cerrar
              </button>
            </div>
            <form onSubmit={(ev) => void handleSaveEdit(ev)}>
              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Datos personales</h3>
                <div className="community-residents-form-grid community-residents-form-grid--2">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-name">
                      Nombre completo
                    </label>
                    <input
                      id="ed-name"
                      className="auth-input"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-email">
                      Email
                    </label>
                    <input
                      id="ed-email"
                      type="email"
                      className="auth-input"
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Vacío = sin correo"
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-phone">
                      Teléfono
                    </label>
                    <input
                      id="ed-phone"
                      className="auth-input"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Vivienda</h3>
                <p className="community-admin-section-intro community-residents-vivienda-hint">
                  Misma configuración que en el login del vecino: listas si la ficha tiene estructura completa por portal.
                  No se ofrecen puertas ya ocupadas por otro vecino en el mismo portal y planta (la de este vecino sí).
                </p>
                <div className="community-residents-form-grid community-residents-form-grid--2">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-portal">
                      Portal
                    </label>
                    {editPortalSelectOptions ? (
                      <select
                        id="ed-portal"
                        className="auth-input auth-select"
                        value={editForm.portal}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, portal: e.target.value, piso: '', puerta: '' } : f,
                          )
                        }
                        required
                      >
                        <option value="">Selecciona portal</option>
                        {editPortalSelectOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="ed-portal"
                        className="auth-input"
                        value={editForm.portal}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, portal: e.target.value, piso: '', puerta: '' } : f,
                          )
                        }
                        required
                      />
                    )}
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-piso">
                      Piso
                    </label>
                    {editPisoSelect ? (
                      <select
                        id="ed-piso"
                        className="auth-input auth-select"
                        value={editForm.piso}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, piso: e.target.value, puerta: '' } : f))
                        }
                        required
                      >
                        <option value="">Selecciona planta</option>
                        {editPisoSelect.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="ed-piso"
                        className="auth-input"
                        value={editForm.piso}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, piso: e.target.value, puerta: '' } : f))
                        }
                        required
                      />
                    )}
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-puerta">
                      Puerta <span className="auth-required">(apartamento)</span>
                    </label>
                    {editPuertaSelect ? (
                      <select
                        id="ed-puerta"
                        className="auth-input auth-select"
                        value={editForm.puerta}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, puerta: e.target.value } : f))}
                        required
                      >
                        <option value="">Selecciona puerta</option>
                        {editPuertaSelect.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="ed-puerta"
                        className="auth-input"
                        value={editForm.puerta}
                        onChange={(e) => setEditForm((f) => ({ ...f, puerta: e.target.value }))}
                        required
                        placeholder="Ej. B, 2, Izq."
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="community-residents-form-section">
                <h3 className="community-residents-form-section-title">Datos adicionales</h3>
                <div className="community-residents-form-grid community-residents-form-grid--2">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-hab">
                      Habitaciones <span className="auth-optional">(1–5)</span>
                    </label>
                    <select
                      id="ed-hab"
                      className="auth-input auth-select"
                      value={dwellingSelectValue(HABITACIONES_CHOICES, editForm.habitaciones)}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, habitaciones: e.target.value } : f))}
                    >
                      <option value="">Sin indicar</option>
                      {HABITACIONES_CHOICES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      {(() => {
                        const v = editForm.habitaciones?.trim() || ''
                        if (v && !HABITACIONES_CHOICES.includes(v)) {
                          return (
                            <option value={v}>
                              {v} (texto guardado)
                            </option>
                          )
                        }
                        return null
                      })()}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-garaje">
                      Plaza de garaje
                    </label>
                    <input
                      id="ed-garaje"
                      className="auth-input"
                      value={editForm.plazaGaraje}
                      onChange={(e) => setEditForm((f) => ({ ...f, plazaGaraje: e.target.value }))}
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-pool-o">
                      Accesos piscina titular <span className="auth-optional">(1–10)</span>
                    </label>
                    <select
                      id="ed-pool-o"
                      className="auth-input auth-select"
                      value={dwellingSelectValue(POOL_ACCESS_CHOICES, editForm.poolAccessOwner)}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, poolAccessOwner: e.target.value } : f))}
                    >
                      <option value="">Sin indicar</option>
                      {POOL_ACCESS_CHOICES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      {(() => {
                        const v = editForm.poolAccessOwner?.trim() || ''
                        if (v && !POOL_ACCESS_CHOICES.includes(v)) {
                          return (
                            <option value={v}>
                              {v} (texto guardado)
                            </option>
                          )
                        }
                        return null
                      })()}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="ed-pool-g">
                      Accesos piscina invitado <span className="auth-optional">(1–10)</span>
                    </label>
                    <select
                      id="ed-pool-g"
                      className="auth-input auth-select"
                      value={dwellingSelectValue(POOL_ACCESS_CHOICES, editForm.poolAccessGuest)}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, poolAccessGuest: e.target.value } : f))}
                    >
                      <option value="">Sin indicar</option>
                      {POOL_ACCESS_CHOICES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      {(() => {
                        const v = editForm.poolAccessGuest?.trim() || ''
                        if (v && !POOL_ACCESS_CHOICES.includes(v)) {
                          return (
                            <option value={v}>
                              {v} (texto guardado)
                            </option>
                          )
                        }
                        return null
                      })()}
                    </select>
                  </div>
                </div>
              </div>
              {editError ? (
                <p className="auth-error" role="alert">
                  {editError}
                </p>
              ) : null}
              <div className="community-residents-password-actions">
                <button type="submit" className="btn btn--primary btn--small" disabled={editBusy}>
                  {editBusy ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button type="button" className="btn btn--ghost btn--small" disabled={editBusy} onClick={() => closeEdit()}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {bulkModalOpen ? (
        <div
          className="community-residents-edit-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cr-bulk-title"
        >
          <div className="community-residents-edit-dialog community-residents-bulk-dialog">
            <div className="community-residents-edit-head">
              <h2 id="cr-bulk-title" className="community-residents-edit-title">
                Alta masiva de vecinos
              </h2>
              <button type="button" className="community-residents-edit-close" onClick={() => closeBulkModal()}>
                Cerrar
              </button>
            </div>
            <div className="community-residents-bulk-body">
              {bulkPreviewLoading ? (
                <p className="community-admin-section-intro">Cargando vista previa…</p>
              ) : bulkPreview ? (
                <>
                  {bulkPreview.structuredTotal === 0 ? (
                    <p className="auth-error" role="alert">
                      {bulkPreview.hint ||
                        'No hay viviendas enumerables con la ficha actual. Configura portales y estructura en Super Admin.'}
                    </p>
                  ) : (
                    <>
                      <p className="community-admin-section-intro">
                        Viviendas según ficha: <strong>{bulkPreview.structuredTotal}</strong> · Con cuenta:{' '}
                        <strong>{bulkPreview.accountsCoveringStructured}</strong> · Sin cuenta:{' '}
                        <strong>{bulkPreview.missingTotal}</strong>
                      </p>
                      {bulkPreview.previewCapped ? (
                        <p className="community-residents-vivienda-hint">
                          Lista previa: primeras filas solamente (el total «sin cuenta» es el correcto).
                        </p>
                      ) : null}
                      {bulkPreview.missingTotal > 0 ? (
                        <ul className="community-residents-bulk-preview-list">
                          {(Array.isArray(bulkPreview.missing) ? bulkPreview.missing : []).map((u, idx) => (
                            <li key={`${u.portal}-${u.piso}-${u.puerta}-${idx}`}>
                              {u.portal} · {u.piso} · {u.puerta}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="auth-vec-ok" role="status">
                          Todas las viviendas definidas en la ficha ya tienen cuenta de vecino.
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : null}
              {bulkError ? (
                <p className="auth-error" role="alert">
                  {bulkError}
                </p>
              ) : null}
              {bulkDone ? (
                <div className="community-residents-bulk-done" role="status">
                  <p className="auth-vec-ok">
                    {bulkDone.message ||
                      `Listo: ${bulkDone.createdCount} cuenta(s) creada(s).${
                        bulkDone.skippedDueToCap
                          ? ` ${bulkDone.skippedDueToCap} no creada(s) por cupo de vecinos.`
                          : ''
                      }${bulkDone.failures?.length ? ` ${bulkDone.failures.length} error(es).` : ''}`}
                  </p>
                  <div className="community-residents-password-actions">
                    <button type="button" className="btn btn--primary btn--small" onClick={() => closeBulkModal()}>
                      Entendido
                    </button>
                  </div>
                </div>
              ) : null}
              {!bulkDone &&
              bulkPreview?.structuredTotal > 0 &&
              bulkPreview?.missingTotal === 0 ? (
                <div className="community-residents-password-actions">
                  <button type="button" className="btn btn--primary btn--small" onClick={() => closeBulkModal()}>
                    Cerrar
                  </button>
                </div>
              ) : null}
              {!bulkDone &&
              bulkPreview?.canBulkCreate &&
              bulkPreview?.missingTotal > 0 &&
              bulkPreview.structuredTotal > 0 ? (
                <>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="cr-bulk-pwd">
                      Contraseña inicial (todas las cuentas nuevas)
                    </label>
                    <input
                      id="cr-bulk-pwd"
                      type="password"
                      className="auth-input"
                      autoComplete="new-password"
                      minLength={6}
                      value={bulkPassword}
                      onChange={(e) => setBulkPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="community-residents-password-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      disabled={bulkBusy || bulkPassword.length < 6}
                      onClick={() => void submitBulkCreate()}
                    >
                      {bulkBusy ? 'Creando…' : `Crear ${bulkPreview.missingTotal} cuenta(s)`}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => closeBulkModal()}
                      disabled={bulkBusy}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
