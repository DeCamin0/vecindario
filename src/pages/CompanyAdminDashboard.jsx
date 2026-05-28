import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { conciergeEmailsFromCommunity } from '../utils/conciergeEmailsForm.js'
import { getSignInPath } from '../utils/signInWebPath.js'
import './Admin.css'
import './CompanyAdminDashboard.css'

/** Alta desde panel de empresa: desactivado de momento (solo super admin o más adelante). */
const COMPANY_CREATE_COMMUNITY_ENABLED = false

function statusMeta(status) {
  if (status === 'pending_approval')
    return { label: 'Pendiente de aprobación', tone: 'pending_approval' }
  if (status === 'inactive') return { label: 'Inactiva', tone: 'inactive' }
  if (status === 'demo') return { label: 'Demo', tone: 'demo' }
  return { label: 'Activa', tone: 'active' }
}

function FeaturePill({ on, children }) {
  return (
    <span className={`ca-feature-pill ${on ? 'ca-feature-pill--on' : 'ca-feature-pill--off'}`}>
      {children}
    </span>
  )
}

function CompanyCommunityCard({ community: c, enterBusy, onEnter }) {
  const st = statusMeta(c.status)
  const loginUrl = (c.loginSlug || '').trim() ? buildCommunityLoginUrl(c.loginSlug) : ''
  const canOpenManagement = c.status === 'active' || c.status === 'demo'
  let enterDisabledTitle = ''
  if (c.status === 'pending_approval') {
    enterDisabledTitle =
      'La comunidad debe ser activada por un super administrador antes de abrir el panel de gestión.'
  } else if (c.status === 'inactive') {
    enterDisabledTitle = 'Comunidad inactiva: no se puede abrir el panel de gestión.'
  }

  const cf = conciergeEmailsFromCommunity(c)
  const conciergeItems = cf.conciergeStaff
    .map((s) => {
      const em = (s.email || '').trim()
      if (!em) return null
      return { name: (s.name || '').trim(), email: em }
    })
    .filter(Boolean)
  if (cf.conciergeSubstituteEmail) {
    conciergeItems.push({
      name: (cf.conciergeSubstituteName || '').trim() || 'Suplente',
      email: cf.conciergeSubstituteEmail,
      substitute: true,
    })
  }

  const copyLoginUrl = async () => {
    if (!loginUrl) return
    try {
      await navigator.clipboard.writeText(loginUrl)
    } catch {
      /* ignore */
    }
  }

  return (
    <article className={`ca-comm-card ca-comm-card--${st.tone}`}>
      <div className="ca-comm-card__stripe" aria-hidden />
      <div className="ca-comm-card__top">
        <div className="ca-comm-card__identity">
          <h3 className="ca-comm-card__name">{c.name}</h3>
          {c.address?.trim() ? (
            <p className="ca-comm-card__address">{c.address.trim()}</p>
          ) : (
            <p className="ca-comm-card__address">Sin dirección en ficha</p>
          )}
        </div>
        <span className={`ca-comm-card__status ca-comm-card__status--${st.tone}`}>{st.label}</span>
      </div>

      <div className="ca-comm-card__metrics">
        <span className="ca-metric-chip ca-metric-chip--vec" title="Código VEC">
          {c.accessCode || '—'}
        </span>
        <span className="ca-metric-chip">
          <span className="ca-metric-chip__icon" aria-hidden>
            🏢
          </span>
          {c.portalCount ?? 1} portal{(c.portalCount ?? 1) === 1 ? '' : 'es'}
        </span>
        <span className="ca-metric-chip">
          <span className="ca-metric-chip__icon" aria-hidden>
            👥
          </span>
          {c.residentSlots != null ? `${c.residentSlots} cupo` : 'Cupo —'}
        </span>
        <span className="ca-metric-chip">
          <span className="ca-metric-chip__icon" aria-hidden>
            📅
          </span>
          Plan: {formatPlanExpiresForCard(c.planExpiresOn) || 'sin fecha'}
        </span>
        {Number(c.padelCourtCount) > 0 ? (
          <span className="ca-metric-chip">
            <span className="ca-metric-chip__icon" aria-hidden>
              🎾
            </span>
            {c.padelCourtCount} pádel
          </span>
        ) : null}
      </div>

      <div className="ca-comm-card__panels">
        <div className="ca-info-panel">
          <h4 className="ca-info-panel__title">Acceso vecinos</h4>
          {loginUrl ? (
            <div className="ca-info-panel__row">
              <span className="ca-info-panel__label">Enlace de login</span>
              <div className="ca-login-row">
                <code className="ca-login-link">{loginUrl}</code>
                <button type="button" className="ca-copy-btn" onClick={() => void copyLoginUrl()}>
                  Copiar
                </button>
              </div>
            </div>
          ) : (
            <p className="ca-info-panel__value">Sin slug — el super administrador puede configurarlo</p>
          )}
          <div className="ca-info-panel__row">
            <span className="ca-info-panel__label">Contacto comunidad</span>
            <span className="ca-info-panel__value">{c.contactEmail || '—'}</span>
          </div>
        </div>

        <div className="ca-info-panel">
          <h4 className="ca-info-panel__title">App vecinos</h4>
          <div className="ca-feature-pills">
            <FeaturePill on={c.appNavServicesEnabled !== false}>Servicios</FeaturePill>
            <FeaturePill on={c.appNavIncidentsEnabled !== false}>Incidencias</FeaturePill>
            <FeaturePill on={c.appNavBookingsEnabled !== false}>Reservas</FeaturePill>
            <FeaturePill on={c.appNavPoolAccessEnabled === true}>Piscina</FeaturePill>
            <FeaturePill on={c.appNavPaqueteriaEnabled === true}>Paquetería</FeaturePill>
            <FeaturePill on={c.gymAccessEnabled === true}>Gimnasio</FeaturePill>
          </div>
          <div className="ca-info-panel__row" style={{ marginTop: 'var(--space-3)' }}>
            <span className="ca-info-panel__label">Espacios</span>
            <span className="ca-info-panel__value">{spacesPreview(c.customLocations)}</span>
          </div>
        </div>
      </div>

      {conciergeItems.length > 0 ? (
        <div className="ca-info-panel">
          <h4 className="ca-info-panel__title">Conserjería ({conciergeItems.length})</h4>
          <ul className="ca-concierge-list">
            {conciergeItems.map((item) => (
              <li key={`${item.email}-${item.substitute ? 'sub' : 'main'}`}>
                <span className="ca-concierge-list__name">
                  {item.name}
                  {item.substitute ? ' (suplente)' : ''}
                </span>
                <span className="ca-concierge-list__email">{item.email}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="ca-comm-card__details">
        <summary>Más detalles de ficha</summary>
        <div className="ca-comm-card__details-body">
          <div className="ca-comm-card__details-grid">
            <div>
              <span className="ca-info-panel__label">ID</span>
              <p className="ca-info-panel__value">{c.id}</p>
            </div>
            <div>
              <span className="ca-info-panel__label">NIF/CIF</span>
              <p className="ca-info-panel__value">{c.nifCif || '—'}</p>
            </div>
            <div>
              <span className="ca-info-panel__label">Presidente</span>
              <p className="ca-info-panel__value">{formatPresidentOnCard(c)}</p>
            </div>
            <div>
              <span className="ca-info-panel__label">Socorrista</span>
              <p className="ca-info-panel__value">{c.poolStaffEmail || '—'}</p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span className="ca-info-panel__label">Portales</span>
              <p className="ca-info-panel__value">
                {portalsAliasesPreview(c.portalCount, c.portalLabels)}
              </p>
            </div>
            {Number(c.padelCourtCount) > 0 ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="ca-info-panel__label">Pádel</span>
                <p className="ca-info-panel__value">
                  {c.padelCourtCount} pista(s) · {c.padelOpenTime || '08:00'}–{c.padelCloseTime || '22:00'}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </details>

      {c.dashboardStats ? (
        <CommunityDashboardStats stats={c.dashboardStats} residentSlots={c.residentSlots} />
      ) : null}

      <footer className="ca-comm-card__footer">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canOpenManagement || enterBusy}
          title={canOpenManagement ? 'Abrir panel de gestión de la comunidad' : enterDisabledTitle}
          onClick={() => void onEnter(c)}
        >
          {enterBusy ? 'Abriendo…' : 'Entrar en comunidad →'}
        </button>
        <p className="ca-comm-card__footer-hint">
          Abre el panel de gestión de esta comunidad con tu cuenta de administrador de empresa. La lista de
          comunidades sigue abierta aquí.
        </p>
      </footer>
    </article>
  )
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
    communityAdminName: '',
    conciergeCount: 1,
    conciergeStaff: Array.from({ length: 5 }, () => ({ email: '', name: '' })),
    conciergeSubstituteEmail: '',
    conciergeSubstituteName: '',
    poolStaffEmail: '',
    portalCount: '1',
    planExpiresOn: '',
    residentSlots: '',
    gymAccessEnabled: false,
    appNavServicesEnabled: true,
    appNavIncidentsEnabled: true,
    appNavBookingsEnabled: true,
    appNavPoolAccessEnabled: false,
    appNavPaqueteriaEnabled: false,
    appNavCuadernoDiarioEnabled: false,
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
        `Panel de gestión abierto para «${c.name}» (sesión de administrador de empresa). Esta pestaña sigue en el listado de comunidades.`,
      )
    } catch (e) {
      setError(e.message || 'No se pudo abrir el panel de la comunidad')
    } finally {
      setEnterBusyId(null)
    }
  }

  const companyName = user?.company?.name || 'Tu empresa'

  const summary = useMemo(() => {
    let active = 0
    let pending = 0
    let inactive = 0
    for (const c of communities) {
      if (c.status === 'active' || c.status === 'demo') active += 1
      else if (c.status === 'pending_approval') pending += 1
      else if (c.status === 'inactive') inactive += 1
    }
    return { total: communities.length, active, pending, inactive }
  }, [communities])

  return (
    <div className="admin-dashboard ca-page">
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
            {!loading && communities.length > 0 ? (
              <div className="ca-summary" aria-label="Resumen de comunidades">
                <div className="ca-summary__tile ca-summary__tile--accent">
                  <span className="ca-summary__value">{summary.total}</span>
                  <span className="ca-summary__label">Comunidades</span>
                </div>
                <div className="ca-summary__tile">
                  <span className="ca-summary__value">{summary.active}</span>
                  <span className="ca-summary__label">Activas</span>
                </div>
                <div className="ca-summary__tile">
                  <span className="ca-summary__value">{summary.pending}</span>
                  <span className="ca-summary__label">Pendientes</span>
                </div>
                <div className="ca-summary__tile">
                  <span className="ca-summary__value">{summary.inactive}</span>
                  <span className="ca-summary__label">Inactivas</span>
                </div>
              </div>
            ) : null}

            <div className="ca-section-toolbar">
              <div>
                <h2 className="ca-section-toolbar__title">Comunidades de tu empresa</h2>
                <p className="ca-section-toolbar__hint">
                  Gestiona el alta y entra al panel de cada comunidad cuando esté activa.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!COMPANY_CREATE_COMMUNITY_ENABLED}
                title={
                  COMPANY_CREATE_COMMUNITY_ENABLED
                    ? 'Dar de alta una nueva comunidad (pendiente de aprobación)'
                    : 'El alta de comunidades desde aquí estará disponible próximamente. El super administrador puede crearlas desde su panel.'
                }
                onClick={() => {
                  if (!COMPANY_CREATE_COMMUNITY_ENABLED) return
                  setFormOpen((v) => !v)
                  setError('')
                }}
              >
                {COMPANY_CREATE_COMMUNITY_ENABLED
                  ? formOpen
                    ? 'Cerrar formulario'
                    : '+ Crear comunidad'
                  : 'Próximamente'}
              </button>
            </div>

            {COMPANY_CREATE_COMMUNITY_ENABLED && formOpen && (
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
                    <p className="admin-field-hint">
                      La gestión de esta comunidad la realizan los administradores de tu empresa (arriba en esta
                      pantalla), no hace falta un administrador adicional en la ficha.
                    </p>
                    <div className="admin-modal-field">
                      <label className="admin-label" htmlFor="ca-concierge-count">
                        Número de conserjes
                      </label>
                      <select
                        id="ca-concierge-count"
                        className="admin-input auth-select"
                        value={String(form.conciergeCount)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            conciergeCount: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                          }))
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    {Array.from({ length: form.conciergeCount }, (_, i) => i + 1).map((n) => (
                      <div key={n} className="admin-modal-field admin-concierge-slot">
                        <p className="admin-label admin-concierge-slot-title">Conserje {n}</p>
                        <label className="admin-label" htmlFor={`ca-conc-name-${n}`}>
                          Nombre (opcional)
                        </label>
                        <input
                          id={`ca-conc-name-${n}`}
                          type="text"
                          className="admin-input"
                          value={form.conciergeStaff?.[n - 1]?.name ?? ''}
                          onChange={(e) =>
                            setForm((f) => {
                              const next = [
                                ...(f.conciergeStaff ||
                                  Array.from({ length: 5 }, () => ({ email: '', name: '' }))),
                              ]
                              next[n - 1] = { ...next[n - 1], name: e.target.value }
                              return { ...f, conciergeStaff: next }
                            })
                          }
                          autoComplete="name"
                        />
                        <label className="admin-label" htmlFor={`ca-conc-${n}`}>
                          Email
                        </label>
                        <input
                          id={`ca-conc-${n}`}
                          type="email"
                          className="admin-input"
                          value={form.conciergeStaff?.[n - 1]?.email ?? ''}
                          onChange={(e) =>
                            setForm((f) => {
                              const next = [
                                ...(f.conciergeStaff ||
                                  Array.from({ length: 5 }, () => ({ email: '', name: '' }))),
                              ]
                              next[n - 1] = { ...next[n - 1], email: e.target.value }
                              return { ...f, conciergeStaff: next }
                            })
                          }
                          autoComplete="email"
                        />
                      </div>
                    ))}
                    <div className="admin-modal-field admin-concierge-slot">
                      <p className="admin-label admin-concierge-slot-title">
                        Conserje suplente (opcional)
                      </p>
                      <label className="admin-label" htmlFor="ca-conc-sub-name">
                        Nombre (opcional)
                      </label>
                      <input
                        id="ca-conc-sub-name"
                        type="text"
                        className="admin-input"
                        value={form.conciergeSubstituteName}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, conciergeSubstituteName: e.target.value }))
                        }
                        autoComplete="name"
                      />
                      <label className="admin-label" htmlFor="ca-conc-sub">
                        Email
                      </label>
                      <input
                        id="ca-conc-sub"
                        type="email"
                        className="admin-input"
                        value={form.conciergeSubstituteEmail}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, conciergeSubstituteEmail: e.target.value }))
                        }
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
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.appNavPaqueteriaEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, appNavPaqueteriaEnabled: e.target.checked }))
                          }
                        />{' '}
                        App: pestaña Paquetería
                      </label>
                    </div>
                    <div className="admin-modal-field admin-modal-field--checkbox">
                      <label className="admin-label admin-label--inline">
                        <input
                          type="checkbox"
                          checked={form.appNavCuadernoDiarioEnabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, appNavCuadernoDiarioEnabled: e.target.checked }))
                          }
                        />{' '}
                        App: pestaña Cuaderno diario
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
                        placeholder='[{ "floors": 5, "doorsPerFloor": 4, "doorScheme": "letters", "doorsTopFloor": 2 }]'
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
              <div className="ca-loading" role="status">
                <span className="ca-loading__dot" />
                <span className="ca-loading__dot" />
                <span className="ca-loading__dot" />
                Cargando comunidades…
              </div>
            ) : communities.length === 0 ? (
              <div className="ca-empty">
                <div className="ca-empty__icon" aria-hidden>
                  🏘️
                </div>
                <p className="ca-empty__title">Aún no hay comunidades</p>
                <p className="ca-empty__hint">
                  {COMPANY_CREATE_COMMUNITY_ENABLED
                    ? 'Crea la primera comunidad de tu empresa. Quedará pendiente hasta que un super administrador la active.'
                    : 'El alta de comunidades desde el panel de empresa estará disponible próximamente. Contacta con el super administrador para dar de alta una comunidad.'}
                </p>
                {COMPANY_CREATE_COMMUNITY_ENABLED ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      setFormOpen(true)
                      setError('')
                    }}
                  >
                    + Crear comunidad
                  </button>
                ) : (
                  <button type="button" className="btn btn--primary" disabled>
                    Próximamente
                  </button>
                )}
              </div>
            ) : (
              <div className="ca-comm-grid">
                {communities.map((c) => (
                  <CompanyCommunityCard
                    key={c.id}
                    community={c}
                    enterBusy={enterBusyId === c.id}
                    onEnter={enterCommunityManagement}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
