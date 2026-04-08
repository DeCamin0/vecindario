import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { buildCommunityLoginUrl } from '../utils/communityLoginUrl.js'
import {
  formatPlanExpiresForCard,
  formatPresidentOnCard,
  portalsAliasesPreview,
  spacesPreview,
} from '../utils/communityCardHelpers.js'
import CommunityDashboardStats from '../components/CommunityDashboardStats.jsx'
import { openVecindarioImpersonationTab } from '../utils/openVecindarioImpersonationTab.js'
import { buildCompanyCommunityCreateBody } from '../utils/companyCommunityCreateBody.js'
import { getSignInPath } from '../utils/signInWebPath.js'
import './Admin.css'

function statusBadge(status) {
  if (status === 'pending_approval')
    return { label: 'Pendiente de aprobación', cls: 'admin-community-status--pending_approval' }
  if (status === 'inactive') return { label: 'Inactiva', cls: 'admin-community-status--inactive' }
  if (status === 'demo') return { label: 'Demo', cls: 'admin-community-status--demo' }
  return { label: 'Activa', cls: 'admin-community-status--active' }
}

export default function CompanyAdminDashboard() {
  const navigate = useNavigate()
  const { accessToken, user, logout } = useAuth()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successFlash, setSuccessFlash] = useState('')
  const [creating, setCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const emptyCreateForm = () => ({
    name: '',
    contactEmail: '',
    nifCif: '',
    address: '',
    accessCode: '',
    loginSlug: '',
    presidentEmail: '',
    presidentPortal: '',
    presidentPiso: '',
    boardVicePortal: '',
    boardVicePiso: '',
    communityAdminEmail: '',
    conciergeEmail: '',
    poolStaffEmail: '',
    portalCount: '1',
    planExpiresOn: '',
    residentSlots: '',
    gymAccessEnabled: false,
    appNavServicesEnabled: true,
    appNavIncidentsEnabled: true,
    appNavBookingsEnabled: true,
    appNavPoolAccessEnabled: false,
    padelCourtCount: '0',
    padelMaxHoursPerBooking: '2',
    padelMaxHoursPerApartmentPerDay: '4',
    padelMinAdvanceHours: '24',
    padelOpenTime: '08:00',
    padelCloseTime: '22:00',
    salonBookingMode: 'slots',
    portalLabelsJson: '',
    portalDwellingConfigJson: '',
    boardVocalsJson: '',
    customLocationsJson: '',
  })
  const [form, setForm] = useState(emptyCreateForm)
  const [enterBusyId, setEnterBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!accessToken) {
      setCommunities([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/company/communities?includeStats=1'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`)
      setCommunities(Array.isArray(d) ? d : [])
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las comunidades')
      setCommunities([])
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!successFlash) return
    const t = setTimeout(() => setSuccessFlash(''), 10000)
    return () => clearTimeout(t)
  }, [successFlash])

  const submitCreate = async (e) => {
    e.preventDefault()
    if (!accessToken) return
    const built = buildCompanyCommunityCreateBody(form)
    if (built.error) {
      setError(built.error)
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/company/communities'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(built.body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`)
      setSuccessFlash('La comunidad ha sido creada y está pendiente de aprobación.')
      setForm(emptyCreateForm())
      setAdvancedOpen(false)
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo crear')
    } finally {
      setCreating(false)
    }
  }

  const enterCommunityManagement = async (c) => {
    if (!accessToken) return
    setEnterBusyId(c.id)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/company/communities/${c.id}/staff-session`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`)
      openVecindarioImpersonationTab({
        accessToken: d.accessToken,
        user: d.user,
        community: d.community,
        accessCodeFallback: c.accessCode || '',
        relativePath: 'community-admin',
      })
      setSuccessFlash(
        'Se abrió el panel de gestión de la comunidad en una pestaña nueva. Aquí sigues como administrador de empresa.',
      )
    } catch (e) {
      setError(e.message || 'No se pudo abrir el panel de la comunidad')
    } finally {
      setEnterBusyId(null)
    }
  }

  const companyName = user?.company?.name || 'Tu empresa'

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-header-inner">
          <div className="admin-dashboard-brand">
            <h1 className="admin-dashboard-title">Administrador de empresa</h1>
            <p className="admin-dashboard-subtitle">{companyName}</p>
          </div>
          <div className="admin-dashboard-header-actions">
            <span className="admin-badge" aria-label="Administrador de empresa">
              Administrador de empresa
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                logout()
                navigate(getSignInPath({ forceGeneric: true }), { replace: true })
              }}
            >
              Cerrar sesión
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

          <section className="admin-section">
            <div className="admin-section-head">
              <h2 className="admin-section-title">Comunidades de tu empresa</h2>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setFormOpen((v) => !v)
                  setError('')
                }}
              >
                {formOpen ? 'Cerrar formulario' : 'Crear comunidad'}
              </button>
            </div>

            {formOpen && (
              <form
                className="card company-admin-create-form"
                onSubmit={submitCreate}
                style={{ marginBottom: '1.25rem' }}
              >
                <p className="admin-field-hint admin-field-hint--block" style={{ marginBottom: '1rem' }}>
                  La comunidad quedará en estado <strong>pendiente de aprobación</strong> hasta que un super
                  administrador la active.
                </p>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="ca-name">
                    Nombre de la comunidad
                  </label>
                  <input
                    id="ca-name"
                    className="admin-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Finca Los Pinos"
                    required
                  />
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="ca-email">
                    Email de contacto <span className="admin-required">*</span>
                  </label>
                  <input
                    id="ca-email"
                    type="email"
                    className="admin-input"
                    value={form.contactEmail}
                    onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                    placeholder="contacto@comunidad.es"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="ca-nif">
                    NIF / CIF (opcional)
                  </label>
                  <input
                    id="ca-nif"
                    className="admin-input"
                    value={form.nifCif}
                    onChange={(e) => setForm((f) => ({ ...f, nifCif: e.target.value }))}
                    maxLength={32}
                  />
                </div>
                <div className="admin-modal-field">
                  <label className="admin-label" htmlFor="ca-addr">
                    Dirección (opcional)
                  </label>
                  <textarea
                    id="ca-addr"
                    className="admin-input"
                    rows={3}
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    maxLength={512}
                  />
                </div>

                <button
                  type="button"
                  className="company-admin-advanced-toggle"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                >
                  {advancedOpen
                    ? 'Ocultar campos avanzados'
                    : 'Mostrar campos avanzados (VEC, slug, ficha, portales)'}
                </button>

                {advancedOpen ? (
                  <fieldset className="admin-modal-fieldset" style={{ marginBottom: 'var(--space-4)' }}>
                    <legend className="admin-fieldset-legend">Opcional — mismo cuerpo que acepta el API</legend>
                    <p className="admin-field-hint" style={{ marginTop: 0 }}>
                      Mismos campos que el alta de super admin (excepto estado: siempre pendiente de
                      aprobación). JSON opcional: déjalo vacío para que el servidor use listas vacías o
                      valores por defecto.
                    </p>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-vec">
                        Código de acceso VEC (opcional)
                      </label>
                      <input
                        id="ca-vec"
                        className="admin-input"
                        value={form.accessCode}
                        onChange={(e) => setForm((f) => ({ ...f, accessCode: e.target.value }))}
                        placeholder="Se genera solo si lo dejas vacío"
                        autoComplete="off"
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-slug">
                        Slug URL de login (opcional)
                      </label>
                      <input
                        id="ca-slug"
                        className="admin-input"
                        value={form.loginSlug}
                        onChange={(e) => setForm((f) => ({ ...f, loginSlug: e.target.value }))}
                        placeholder="ej: salmeron-30"
                        autoComplete="off"
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-pres">
                        Email presidente (opcional)
                      </label>
                      <input
                        id="ca-pres"
                        type="email"
                        className="admin-input"
                        value={form.presidentEmail}
                        onChange={(e) => setForm((f) => ({ ...f, presidentEmail: e.target.value }))}
                        autoComplete="email"
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-adm">
                        Email administrador de comunidad (opcional)
                      </label>
                      <input
                        id="ca-adm"
                        type="email"
                        className="admin-input"
                        value={form.communityAdminEmail}
                        onChange={(e) => setForm((f) => ({ ...f, communityAdminEmail: e.target.value }))}
                        autoComplete="email"
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-conc">
                        Email conserje (opcional)
                      </label>
                      <input
                        id="ca-conc"
                        type="email"
                        className="admin-input"
                        value={form.conciergeEmail}
                        onChange={(e) => setForm((f) => ({ ...f, conciergeEmail: e.target.value }))}
                        autoComplete="email"
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-pool">
                        Email socorrista / piscina (opcional)
                      </label>
                      <input
                        id="ca-pool"
                        type="email"
                        className="admin-input"
                        value={form.poolStaffEmail}
                        onChange={(e) => setForm((f) => ({ ...f, poolStaffEmail: e.target.value }))}
                        autoComplete="email"
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-portals">
                        Número de portales
                      </label>
                      <input
                        id="ca-portals"
                        type="text"
                        inputMode="numeric"
                        className="admin-input"
                        value={form.portalCount}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            portalCount: e.target.value.replace(/\D/g, '').slice(0, 3),
                          }))
                        }
                        placeholder="1"
                        autoComplete="off"
                      />
                    </div>
                    <div className="admin-modal-row">
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-pres-portal">
                          Presidente — portal (vivienda)
                        </label>
                        <input
                          id="ca-pres-portal"
                          className="admin-input"
                          value={form.presidentPortal}
                          onChange={(e) => setForm((f) => ({ ...f, presidentPortal: e.target.value }))}
                          maxLength={64}
                        />
                      </div>
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-pres-piso">
                          Presidente — piso
                        </label>
                        <input
                          id="ca-pres-piso"
                          className="admin-input"
                          value={form.presidentPiso}
                          onChange={(e) => setForm((f) => ({ ...f, presidentPiso: e.target.value }))}
                          maxLength={64}
                        />
                      </div>
                    </div>
                    <div className="admin-modal-row">
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-vice-portal">
                          Vicepresidente junta — portal
                        </label>
                        <input
                          id="ca-vice-portal"
                          className="admin-input"
                          value={form.boardVicePortal}
                          onChange={(e) => setForm((f) => ({ ...f, boardVicePortal: e.target.value }))}
                          maxLength={64}
                        />
                      </div>
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-vice-piso">
                          Vicepresidente junta — piso
                        </label>
                        <input
                          id="ca-vice-piso"
                          className="admin-input"
                          value={form.boardVicePiso}
                          onChange={(e) => setForm((f) => ({ ...f, boardVicePiso: e.target.value }))}
                          maxLength={64}
                        />
                      </div>
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-plan">
                        Plan hasta (YYYY-MM-DD, opcional)
                      </label>
                      <input
                        id="ca-plan"
                        type="date"
                        className="admin-input"
                        value={form.planExpiresOn}
                        onChange={(e) => setForm((f) => ({ ...f, planExpiresOn: e.target.value }))}
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-slots">
                        Cupo vecinos (número, opcional)
                      </label>
                      <input
                        id="ca-slots"
                        type="text"
                        inputMode="numeric"
                        className="admin-input"
                        value={form.residentSlots}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            residentSlots: e.target.value.replace(/\D/g, '').slice(0, 6),
                          }))
                        }
                        placeholder="Ej. 120"
                      />
                    </div>
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.gymAccessEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, gymAccessEnabled: e.target.checked }))
                          }
                        />{' '}
                        Gimnasio habilitado
                      </label>
                    </div>
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.appNavServicesEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, appNavServicesEnabled: e.target.checked }))
                          }
                        />{' '}
                        App: pestaña Servicios
                      </label>
                    </div>
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.appNavIncidentsEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, appNavIncidentsEnabled: e.target.checked }))
                          }
                        />{' '}
                        App: pestaña Incidencias
                      </label>
                    </div>
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.appNavBookingsEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, appNavBookingsEnabled: e.target.checked }))
                          }
                        />{' '}
                        App: pestaña Reservas
                      </label>
                    </div>
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.appNavPoolAccessEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, appNavPoolAccessEnabled: e.target.checked }))
                          }
                        />{' '}
                        App: pestaña Acceso piscina
                      </label>
                    </div>
                    <div className="admin-modal-row">
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-padel-n">
                          Pistas de pádel (0–50)
                        </label>
                        <input
                          id="ca-padel-n"
                          type="text"
                          inputMode="numeric"
                          className="admin-input"
                          value={form.padelCourtCount}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              padelCourtCount: e.target.value.replace(/\D/g, '').slice(0, 2),
                            }))
                          }
                        />
                      </div>
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-salon-mode">
                          Reserva salón
                        </label>
                        <select
                          id="ca-salon-mode"
                          className="admin-input admin-select"
                          value={form.salonBookingMode}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, salonBookingMode: e.target.value }))
                          }
                        >
                          <option value="slots">Franjas (slots)</option>
                          <option value="day">Día completo</option>
                        </select>
                      </div>
                    </div>
                    <div className="admin-modal-row">
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-padel-mxb">
                          Pádel: máx. h / reserva
                        </label>
                        <input
                          id="ca-padel-mxb"
                          type="text"
                          inputMode="numeric"
                          className="admin-input"
                          value={form.padelMaxHoursPerBooking}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              padelMaxHoursPerBooking: e.target.value.replace(/\D/g, '').slice(0, 2),
                            }))
                          }
                        />
                      </div>
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-padel-mxd">
                          Pádel: máx. h / vivienda / día
                        </label>
                        <input
                          id="ca-padel-mxd"
                          type="text"
                          inputMode="numeric"
                          className="admin-input"
                          value={form.padelMaxHoursPerApartmentPerDay}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              padelMaxHoursPerApartmentPerDay: e.target.value
                                .replace(/\D/g, '')
                                .slice(0, 2),
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-padel-adv">
                        Pádel: antelación mínima (horas, 1–168)
                      </label>
                      <input
                        id="ca-padel-adv"
                        type="text"
                        inputMode="numeric"
                        className="admin-input"
                        value={form.padelMinAdvanceHours}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            padelMinAdvanceHours: e.target.value.replace(/\D/g, '').slice(0, 3),
                          }))
                        }
                      />
                    </div>
                    <div className="admin-modal-row">
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-padel-open">
                          Pádel: apertura (HH:mm)
                        </label>
                        <input
                          id="ca-padel-open"
                          className="admin-input"
                          value={form.padelOpenTime}
                          onChange={(e) => setForm((f) => ({ ...f, padelOpenTime: e.target.value }))}
                          placeholder="08:00"
                          maxLength={5}
                        />
                      </div>
                      <div className="admin-modal-field">
                        <label className="admin-label" htmlFor="ca-padel-close">
                          Pádel: cierre (HH:mm)
                        </label>
                        <input
                          id="ca-padel-close"
                          className="admin-input"
                          value={form.padelCloseTime}
                          onChange={(e) => setForm((f) => ({ ...f, padelCloseTime: e.target.value }))}
                          placeholder="22:00"
                          maxLength={5}
                        />
                      </div>
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-plabels">
                        Etiquetas de portales (JSON array, opcional)
                      </label>
                      <textarea
                        id="ca-plabels"
                        className="admin-input"
                        rows={2}
                        value={form.portalLabelsJson}
                        onChange={(e) => setForm((f) => ({ ...f, portalLabelsJson: e.target.value }))}
                        placeholder='Ej. ["Portal A","Portal B"]'
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-pdwell">
                        Config. viviendas por portal (JSON, opcional)
                      </label>
                      <textarea
                        id="ca-pdwell"
                        className="admin-input"
                        rows={3}
                        value={form.portalDwellingConfigJson}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, portalDwellingConfigJson: e.target.value }))
                        }
                        placeholder='[{ "floors": 5, "doorsPerFloor": 4, "doorScheme": "letters" }]'
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-vocals">
                        Vocales junta (JSON array, opcional)
                      </label>
                      <textarea
                        id="ca-vocals"
                        className="admin-input"
                        rows={2}
                        value={form.boardVocalsJson}
                        onChange={(e) => setForm((f) => ({ ...f, boardVocalsJson: e.target.value }))}
                        placeholder='[{"portal":"1","piso":"2"}]'
                      />
                    </div>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-locs">
                        Espacios / salones (JSON array, opcional)
                      </label>
                      <textarea
                        id="ca-locs"
                        className="admin-input"
                        rows={3}
                        value={form.customLocationsJson}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, customLocationsJson: e.target.value }))
                        }
                        placeholder='[{"name":"Salón social"}]'
                      />
                    </div>
                  </fieldset>
                ) : null}

                <div className="admin-modal-actions">
                  <button type="submit" className="btn btn--primary" disabled={creating}>
                    {creating ? 'Creando…' : 'Enviar solicitud'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="admin-empty-hint">Cargando…</p>
            ) : communities.length === 0 ? (
              <div className="admin-empty card">
                <p className="admin-empty-title">Aún no hay comunidades</p>
                <p className="admin-empty-hint">Pulsa «Crear comunidad» para dar de alta la primera.</p>
              </div>
            ) : (
              <div className="admin-communities">
                {communities.map((c) => {
                  const st = statusBadge(c.status)
                  const loginUrl = (c.loginSlug || '').trim() ? buildCommunityLoginUrl(c.loginSlug) : ''
                  const canOpenManagement = c.status === 'active' || c.status === 'demo'
                  let enterDisabledTitle = ''
                  if (c.status === 'pending_approval') {
                    enterDisabledTitle =
                      'La comunidad debe ser activada por un super administrador antes de abrir el panel de gestión.'
                  } else if (c.status === 'inactive') {
                    enterDisabledTitle = 'Comunidad inactiva: no se puede abrir el panel de gestión.'
                  }
                  return (
                    <article key={c.id} className="admin-community-row card">
                      <div className="admin-community-info">
                        <div className="admin-community-head">
                          <h3 className="admin-community-name">{c.name}</h3>
                          <span className={`admin-community-status ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="admin-community-details">
                          <span className="admin-community-detail">
                            <span className="admin-community-detail-label">ID</span>
                            {c.id}
                          </span>
                          <span className="admin-community-detail">
                            <span className="admin-community-detail-label">VEC</span>
                            <code>{c.accessCode || '—'}</code>
                          </span>
                          <span className="admin-community-detail">
                            <span className="admin-community-detail-label">NIF/CIF</span>
                            {c.nifCif || '—'}
                          </span>
                          <span className="admin-community-detail admin-community-detail--block">
                            <span className="admin-community-detail-label">Dirección</span>
                            <span className="admin-address-preview">{c.address?.trim() || '—'}</span>
                          </span>
                          <span className="admin-community-detail admin-community-detail--block">
                            <span className="admin-community-detail-label">Enlace acceso (vecinos)</span>
                            {loginUrl ? (
                              <code className="admin-code-break">{loginUrl}</code>
                            ) : (
                              <span className="admin-field-hint">Sin slug — el super admin puede configurarlo</span>
                            )}
                          </span>
                          <span className="admin-community-detail">
                            <span className="admin-community-detail-label">Plan hasta</span>
                            {formatPlanExpiresForCard(c.planExpiresOn) || 'Sin fecha'}
                          </span>
                          <span className="admin-community-detail admin-community-detail--block">
                            <span className="admin-community-detail-label">Emails</span>
                            <span className="admin-email-lines">
                              <span>Comunidad: {c.contactEmail || '—'}</span>
                              <span>Presidente: {formatPresidentOnCard(c)}</span>
                              <span>Admin: {c.communityAdminEmail || '—'}</span>
                              <span>Conserje: {c.conciergeEmail || '—'}</span>
                              <span>Socorrista: {c.poolStaffEmail || '—'}</span>
                            </span>
                          </span>
                          <span className="admin-community-detail admin-community-detail--block">
                            <span className="admin-community-detail-label">Portales</span>
                            <span>
                              {c.portalCount ?? 1} —{' '}
                              <span
                                className="admin-portals-preview"
                                title={portalsAliasesPreview(c.portalCount, c.portalLabels)}
                              >
                                {portalsAliasesPreview(c.portalCount, c.portalLabels)}
                              </span>
                            </span>
                          </span>
                          <span className="admin-community-detail">
                            <span className="admin-community-detail-label">Cupo vecinos</span>
                            {c.residentSlots != null ? c.residentSlots : '—'}
                          </span>
                          <span className="admin-community-detail">
                            <span className="admin-community-detail-label">Gimnasio</span>
                            {c.gymAccessEnabled ? 'Sí' : 'No'}
                          </span>
                          <span className="admin-community-detail admin-community-detail--block">
                            <span className="admin-community-detail-label">Pádel</span>
                            {Number(c.padelCourtCount) || 0} pista(s) · {c.padelOpenTime || '08:00'}–
                            {c.padelCloseTime || '22:00'}
                          </span>
                          <p className="admin-community-spaces-preview" title={spacesPreview(c.customLocations)}>
                            <span className="admin-community-detail-label">Espacios</span>
                            {spacesPreview(c.customLocations)}
                          </p>
                          <div className="admin-community-detail admin-community-detail--block admin-community-nav-tabs">
                            <span className="admin-community-detail-label">Pestañas app vecinos</span>
                            <span className="admin-email-lines">
                              <span>Servicios: {c.appNavServicesEnabled !== false ? 'Sí' : 'No'}</span>
                              <span>Incidencias: {c.appNavIncidentsEnabled !== false ? 'Sí' : 'No'}</span>
                              <span>Reservas: {c.appNavBookingsEnabled !== false ? 'Sí' : 'No'}</span>
                              <span>Piscina: {c.appNavPoolAccessEnabled === true ? 'Sí' : 'No'}</span>
                            </span>
                          </div>
                        </div>
                        <div className="admin-company-enter-bar">
                          <div className="admin-company-enter-bar__actions">
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={!canOpenManagement || enterBusyId === c.id}
                              title={
                                canOpenManagement
                                  ? 'Abre el mismo panel que el administrador de comunidad (incidencias, reservas, vecinos…). Requiere cuenta vinculada en la ficha.'
                                  : enterDisabledTitle
                              }
                              onClick={() => void enterCommunityManagement(c)}
                            >
                              {enterBusyId === c.id ? 'Abriendo…' : 'Entrar en comunidad'}
                            </button>
                          </div>
                          <p className="admin-field-hint admin-company-enter-bar__hint">
                            «Entrar en comunidad» abre una pestaña con la sesión del administrador de comunidad,
                            presidente o conserje definidos en la ficha (en ese orden), para ver y gestionar
                            igual que ellos. Tu sesión de empresa no se cierra aquí.
                          </p>
                        </div>
                        {c.dashboardStats ? (
                          <CommunityDashboardStats
                            stats={c.dashboardStats}
                            residentSlots={c.residentSlots}
                          />
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
