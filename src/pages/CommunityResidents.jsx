import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { useCommunityPortalOptions } from '../hooks/useCommunityPortalOptions.js'
import './Admin.css'
import './CommunityAdmin.css'

const JUNTA_OPTIONS = [
  { value: 'none', label: 'Sin cargo' },
  { value: 'president', label: 'Presidente' },
  { value: 'vice_president', label: 'Vicepresidente' },
  { value: 'vocal', label: 'Vocal' },
]

export default function CommunityResidents() {
  const navigate = useNavigate()
  const { accessToken, communityId, communityAccessCode, community } = useAuth()
  const [list, setList] = useState([])
  const [listError, setListError] = useState('')
  const [loadingList, setLoadingList] = useState(true)

  const [piso, setPiso] = useState('')
  const [portal, setPortal] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [juntaSavingId, setJuntaSavingId] = useState(null)
  const [passwordResetForId, setPasswordResetForId] = useState(null)
  const [passwordResetValue, setPasswordResetValue] = useState('')
  const [passwordResetBusy, setPasswordResetBusy] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState('')
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('')

  const code = communityAccessCode?.trim().toUpperCase() || ''
  const { loading: portalLoading, portals: portalChoicesRaw } = useCommunityPortalOptions(
    communityId != null && code ? communityId : null,
    communityId != null && code ? code : null,
  )

  const loadList = useCallback(async () => {
    if (!accessToken || communityId == null || !code) {
      setLoadingList(false)
      return
    }
    setListError('')
    try {
      const q = new URLSearchParams({ communityId: String(communityId), accessCode: code })
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

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccess('')
    if (!accessToken || communityId == null || !code) {
      setFormError('Falta sesión o código VEC. Vuelve al login o a la app.')
      return
    }
    if (!piso.trim() || !portal.trim()) {
      setFormError('Indica piso/puerta y portal.')
      return
    }
    if (password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/community/residents'), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          communityId,
          accessCode: code,
          piso: piso.trim().slice(0, 64),
          portal: portal.trim().slice(0, 64),
          password,
          ...(name.trim() ? { name: name.trim().slice(0, 255) } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error || data.message || 'No se pudo crear el usuario')
        return
      }
      setSuccess(`Cuenta creada: portal ${data.portal}, piso ${data.piso}. El vecino puede entrar sin email.`)
      setPiso('')
      setPortal('')
      setPassword('')
      setName('')
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
    if (!accessToken || communityId == null || !code || passwordResetForId == null) return
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
          accessCode: code,
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
    if (!accessToken || communityId == null || !code) return
    setJuntaSavingId(residentId)
    setListError('')
    try {
      const res = await fetch(apiUrl(`/api/community/residents/${residentId}/junta`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          communityId,
          accessCode: code,
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

  if (!accessToken) {
    navigate('/login', { replace: true })
    return null
  }

  return (
    <div className="community-admin-page">
      <header className="community-admin-header admin-header">
        <div className="admin-header-inner">
          <div className="community-admin-header-brand">
            <h1 className="community-admin-title">Alta de vecinos</h1>
            <p className="community-admin-subtitle">
              Crea accesos con portal, piso y contraseña
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
              No se guarda correo: el vecino inicia sesión en «Residente» con el mismo código VEC, portal,
              piso y la contraseña que definas aquí.
            </p>
            <form onSubmit={(ev) => void handleCreate(ev)} className="card community-residents-form">
              <div className="auth-field">
                <label className="auth-label" htmlFor="cr-name">
                  Nombre <span className="auth-optional">(opcional)</span>
                </label>
                <input
                  id="cr-name"
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Ej. Familia García"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="cr-piso">
                  Piso / puerta <span className="auth-required">(apartamento)</span>
                </label>
                <input
                  id="cr-piso"
                  className="auth-input"
                  value={piso}
                  onChange={(e) => setPiso(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="Ej. 3º B"
                />
              </div>
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
                    value={portal}
                    onChange={(e) => setPortal(e.target.value)}
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
                    value={portal}
                    onChange={(e) => setPortal(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="Ej. 34, P1"
                  />
                )}
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="cr-password">
                  Contraseña inicial
                </label>
                <input
                  id="cr-password"
                  type="password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
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
                        <strong>{r.portal || '—'}</strong>
                        <span aria-hidden="true"> · </span>
                        <span>{r.piso || '—'}</span>
                        {r.name ? (
                          <>
                            <span aria-hidden="true"> — </span>
                            <span>{r.name}</span>
                          </>
                        ) : null}
                        {r.hasEmail ? (
                          <span className="community-residents-badge">también con correo</span>
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
                        Al entrar con portal y piso tendrá el mismo acceso que el presidente de la ficha (panel de
                        gestión).
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
