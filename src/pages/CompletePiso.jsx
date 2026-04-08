import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom'
import { useAuth, roleRequiresPiso, hasResidentHomeComplete } from '../context/AuthContext'
import { useCommunityPortalOptions } from '../hooks/useCommunityPortalOptions.js'
import DeveloperCredit from '../components/DeveloperCredit'
import MobileAppDownloadBanner from '../components/MobileAppDownloadBanner'
import { getSignInPath } from '../utils/signInWebPath'
import './AuthPages.css'

export default function CompletePiso() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    authReady,
    userRole,
    user,
    accessToken,
    communityId,
    communityAccessCode,
    saveResidentHomePatch,
    logout,
  } = useAuth()
  const [piso, setPiso] = useState('')
  const [portal, setPortal] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const from =
    (location.state && typeof location.state.from === 'string' && location.state.from) || '/'

  const fetchPortals = communityId != null && Boolean(communityAccessCode?.trim())
  const { loading: portalOptionsLoading, portals: portalChoicesRaw } = useCommunityPortalOptions(
    fetchPortals ? communityId : null,
    fetchPortals ? communityAccessCode : null,
  )
  const portalSelectOptions = useMemo(() => {
    if (!portalChoicesRaw?.length) return null
    const u = (portal || user?.portal || '').trim()
    if (u && !portalChoicesRaw.includes(u)) return [u, ...portalChoicesRaw]
    return portalChoicesRaw
  }, [portalChoicesRaw, portal, user?.portal])

  useEffect(() => {
    if (!user) return
    if (user.piso) setPiso(String(user.piso))
    if (user.portal) setPortal(String(user.portal))
  }, [user])

  if (!authReady) return null

  if (!accessToken) {
    return <Navigate to={getSignInPath()} replace />
  }
  if (!roleRequiresPiso(userRole)) {
    return <Navigate to="/" replace />
  }

  if (hasResidentHomeComplete(user)) {
    return <Navigate to={from === '/completar-piso' ? '/' : from} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const finalPiso = (piso.trim() || user?.piso?.trim() || '')
    const finalPortal = (portal.trim() || user?.portal?.trim() || '')
    if (!finalPiso) {
      setError('Indica tu piso o puerta del apartamento.')
      return
    }
    if (!finalPortal) {
      setError('Indica tu portal de acceso (ej. 34, P1). Es un dato distinto del piso.')
      return
    }
    setSubmitting(true)
    try {
      await saveResidentHomePatch({ piso: finalPiso, portal: finalPortal })
      navigate(from === '/completar-piso' ? '/' : from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <MobileAppDownloadBanner />
      <div className="auth-card card">
        <h1 className="auth-title">Piso y portal</h1>
        <p className="auth-subtitle">
          Como {userRole === 'president' ? 'presidente' : 'vecino'} necesitas dos datos separados en tu cuenta:
          el <strong>piso/puerta</strong> del apartamento y el <strong>portal</strong> de acceso a la finca.
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="complete-piso">
              Piso / puerta <span className="auth-required">(apartamento)</span>
            </label>
            <input
              id="complete-piso"
              type="text"
              className="auth-input"
              placeholder="Ej. 3º B"
              value={piso}
              onChange={(e) => setPiso(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="complete-portal">
              Portal <span className="auth-required">(acceso)</span>
            </label>
            {fetchPortals && portalOptionsLoading ? (
              <select
                id="complete-portal"
                className="auth-input auth-select"
                disabled
                aria-busy="true"
                value=""
              >
                <option value="">Cargando portales…</option>
              </select>
            ) : portalSelectOptions ? (
              <select
                id="complete-portal"
                className="auth-input auth-select"
                value={portal}
                onChange={(e) => setPortal(e.target.value)}
                required
              >
                <option value="">Selecciona portal</option>
                {portalSelectOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="complete-portal"
                type="text"
                className="auth-input"
                placeholder="Ej. 34, P1"
                value={portal}
                onChange={(e) => setPortal(e.target.value)}
                autoComplete="off"
                required
              />
            )}
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="auth-submit btn btn--primary btn--block"
            disabled={submitting}
          >
            {submitting ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>
        <p className="auth-footer">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => logout()}>
            Cerrar sesión
          </button>
          {' · '}
          <Link to={getSignInPath()} className="auth-link">
            Volver al login
          </Link>
        </p>
      </div>
      <DeveloperCredit />
    </div>
  )
}
