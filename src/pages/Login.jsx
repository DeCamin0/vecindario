import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl } from '../config/api.js'
import { useCommunityPortalOptions } from '../hooks/useCommunityPortalOptions.js'
import { pisoPuertaChoicesForPortal } from '../utils/dwellingPortalChoices.js'
import DeveloperCredit from '../components/DeveloperCredit'
import MobileAppDownloadBanner from '../components/MobileAppDownloadBanner'
import { BRAND_LOGO_PNG } from '../syncBrandFavicon.js'
import './AuthPages.css'

/** Roles con código VEC (sin super admin — va aparte). */
const ROLE_OPTIONS = [
  {
    value: 'resident',
    label: 'Residente / vecino',
    short: 'Vecino',
    sub: 'Portal, piso y puerta',
    icon: '🏠',
  },
  {
    value: 'concierge',
    label: 'Conserje / portería',
    short: 'Conserje',
    sub: 'Correo + VEC',
    icon: '🛎️',
  },
  {
    value: 'pool_staff',
    label: 'Socorrista / piscina',
    short: 'Piscina',
    sub: 'Correo + VEC',
    icon: '🏊',
  },
  {
    value: 'community_admin',
    label: 'Administrador de comunidad',
    short: 'Administrador',
    sub: 'Correo y contraseña',
    icon: '📋',
  },
]

/** Solo vecinos (y presidente por vivienda): VEC + portal + piso + contraseña. Conserje: email + contraseña + VEC. Administrador: solo email + contraseña (nunca accessCode; como super admin a nivel de comunidad). */
function showPortalPisoFields(role) {
  return role === 'resident'
}

/** Código VEC manual: vecino y conserje. Administrador ya no lo necesita (varias comunidades por correo). */
function showVecCodeField(role) {
  return role === 'resident' || role === 'concierge' || role === 'pool_staff'
}

function Login() {
  const navigate = useNavigate()
  const { loginSlug: loginSlugParam } = useParams()
  const loginSlugFromRoute = loginSlugParam ? String(loginSlugParam).trim().toLowerCase() : ''
  const fromSlugRoute = Boolean(loginSlugFromRoute)
  /** Tras login desde /c/{slug}/login, mantener el slug visible en la URL (query ?c=). */
  const postLoginSlugQuery = loginSlugFromRoute
    ? `?c=${encodeURIComponent(loginSlugFromRoute)}`
    : ''

  const {
    applyServerSession,
    community,
    communityId,
    communityAccessCode,
    setCommunity,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [piso, setPiso] = useState('')
  const [portal, setPortal] = useState('')
  const [puerta, setPuerta] = useState('')
  const [role, setRole] = useState('resident')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [vecCode, setVecCode] = useState('')
  const [vecChecking, setVecChecking] = useState(false)
  const [vecError, setVecError] = useState('')
  const [slugRouteBusy, setSlugRouteBusy] = useState(false)
  const [slugRouteError, setSlugRouteError] = useState('')
  /** Super admin / admin de empresa: flujos aparte (solo email + contraseña, sin VEC). */
  const [loginMode, setLoginMode] = useState('community')

  const codeForPortals = (communityAccessCode?.trim() || vecCode.trim() || '').toUpperCase() || ''
  const fetchPortals =
    loginMode === 'community' &&
    showPortalPisoFields(role) &&
    communityId != null &&
    Boolean(codeForPortals.trim())
  const { loading: portalOptionsLoading, portals: portalChoicesRaw, dwellingByPortalIndex } =
    useCommunityPortalOptions(
      fetchPortals ? communityId : null,
      fetchPortals ? codeForPortals : null,
    )
  const portalSelectOptions = useMemo(() => {
    if (!portalChoicesRaw?.length) return null
    const u = portal.trim()
    if (u && !portalChoicesRaw.includes(u)) return [u, ...portalChoicesRaw]
    return portalChoicesRaw
  }, [portalChoicesRaw, portal])

  const { pisoOptions: pisoChoicesRaw, puertaOptions: puertaChoicesRaw } = useMemo(
    () =>
      pisoPuertaChoicesForPortal(portal, portalChoicesRaw, dwellingByPortalIndex),
    [portal, portalChoicesRaw, dwellingByPortalIndex],
  )

  const pisoSelectOptions = useMemo(() => {
    if (!pisoChoicesRaw?.length) return null
    const u = piso.trim()
    if (u && !pisoChoicesRaw.includes(u)) return [...pisoChoicesRaw, u]
    return pisoChoicesRaw
  }, [pisoChoicesRaw, piso])

  const puertaSelectOptions = useMemo(() => {
    if (!puertaChoicesRaw?.length) return null
    const u = puerta.trim()
    if (u && !puertaChoicesRaw.includes(u)) return [...puertaChoicesRaw, u]
    return puertaChoicesRaw
  }, [puertaChoicesRaw, puerta])

  const slugCommunityReady =
    fromSlugRoute && !slugRouteBusy && !slugRouteError && communityId != null && Boolean(community)

  useEffect(() => {
    if (!loginSlugFromRoute) {
      setSlugRouteBusy(false)
      setSlugRouteError('')
      return
    }
    let cancelled = false
    setSlugRouteBusy(true)
    setSlugRouteError('')
    const q = new URLSearchParams({ slug: loginSlugFromRoute })
    fetch(apiUrl(`/api/public/community-by-slug?${q}`))
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return
        if (!data?.id || !data?.accessCode) {
          setSlugRouteError(data?.error || 'Enlace no válido o comunidad inactiva')
          return
        }
        const code = String(data.accessCode).trim().toUpperCase()
        setCommunity(data.name, { id: data.id, accessCode: code })
        setVecCode(code)
        setVecError('')
      })
      .catch(() => {
        if (!cancelled) setSlugRouteError('No se pudo validar el enlace')
      })
      .finally(() => {
        if (!cancelled) setSlugRouteBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [loginSlugFromRoute, setCommunity])

  const taglineCommunity = useMemo(() => {
    if (slugCommunityReady && role === 'resident') {
      return 'Acceso directo: comunidad por enlace. Portal, piso y contraseña (el VEC ya está vinculado).'
    }
    if (slugCommunityReady && role === 'concierge') {
      return 'Comunidad por enlace: correo de conserje y contraseña (el VEC ya está vinculado al enlace).'
    }
    if (slugCommunityReady && role === 'pool_staff') {
      return 'Comunidad por enlace: correo de socorrista y contraseña (el VEC ya está vinculado al enlace).'
    }
    if (slugCommunityReady && role === 'community_admin') {
      return 'Administrador: solo correo y contraseña de la ficha — sin código VEC.'
    }
    if (role === 'resident') {
      return 'Valida el VEC y entra con portal, piso y contraseña.'
    }
    if (role === 'concierge') {
      return 'Código VEC de la comunidad + correo de conserje (el de la ficha) + contraseña.'
    }
    if (role === 'pool_staff') {
      return 'Código VEC + correo de socorrista (el de la ficha) + contraseña.'
    }
    if (role === 'community_admin') {
      return 'Correo y contraseña del administrador de comunidad. Si gestionas varias, elige la activa después en el menú.'
    }
    return 'Correo y contraseña del administrador de comunidad.'
  }, [role, slugCommunityReady])

  const showEmailFieldCommunity =
    loginMode === 'community' &&
    (role === 'community_admin' || role === 'concierge' || role === 'pool_staff')

  const verifyVecCode = async () => {
    setVecError('')
    const raw = vecCode.trim()
    if (!raw) {
      setVecError('Introduce el código VEC (ej. VEC-A1B2C3D4)')
      return
    }
    setVecChecking(true)
    try {
      const q = new URLSearchParams({ code: raw })
      const res = await fetch(apiUrl(`/api/public/community-by-code?${q}`))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setVecError(data.error || 'Código no válido')
        return
      }
      if (!data.name || data.id == null) {
        setVecError('Respuesta inválida del servidor')
        return
      }
      setCommunity(data.name, { id: data.id, accessCode: raw.trim().toUpperCase() })
      setVecError('')
    } catch {
      setVecError('No se pudo comprobar el código')
    } finally {
      setVecChecking(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (loginMode === 'super_admin') {
      if (!email.trim()) {
        setError('Introduce el email de super administrador')
        return
      }
      if (!password) {
        setError('Introduce tu contraseña')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch(apiUrl('/api/auth/super-admin/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.message || data.error || 'Credenciales incorrectas')
          return
        }
        if (!data.accessToken || !data.user) {
          setError('Respuesta inválida del servidor')
          return
        }
        applyServerSession(data.accessToken, data.user)
        navigate('/admin', { replace: true })
      } catch {
        setError('No se pudo conectar con el servidor')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (loginMode === 'company_admin') {
      if (!email.trim()) {
        setError('Introduce el email de administrador de empresa')
        return
      }
      if (!password) {
        setError('Introduce tu contraseña')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.message || data.error || 'Credenciales incorrectas')
          return
        }
        if (!data.accessToken || !data.user) {
          setError('Respuesta inválida del servidor')
          return
        }
        if (data.user.role !== 'company_admin') {
          setError('Esta cuenta no es administrador de empresa. Elige otro acceso o contacta con soporte.')
          return
        }
        applyServerSession(data.accessToken, data.user, {
          company: data.company,
        })
        navigate('/company-admin', { replace: true })
      } catch {
        setError('No se pudo conectar con el servidor')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if ((role === 'community_admin' || role === 'concierge' || role === 'pool_staff') && !email.trim()) {
      setError('Introduce tu email')
      return
    }
    if (!password) {
      setError('Introduce tu contraseña')
      return
    }

    if (role === 'resident') {
      if (fromSlugRoute && slugRouteBusy) {
        setError('Espera a que se valide el enlace de la comunidad.')
        return
      }
      if (communityId == null) {
        setError('Primero comprueba el código VEC de tu comunidad (arriba).')
        return
      }
      if (!piso.trim() || !portal.trim()) {
        setError('Indica portal y piso. Añade puerta si tu cuenta se dio de alta con los tres datos.')
        return
      }
      const vecForLogin = (communityAccessCode || vecCode).trim().toUpperCase()
      if (!vecForLogin) {
        setError('Indica o comprueba el código VEC de la comunidad.')
        return
      }
      setSubmitting(true)
      try {
        const payload = {
          accessCode: vecForLogin,
          password,
          piso: piso.trim().slice(0, 64),
          portal: portal.trim().slice(0, 64),
          ...(puerta.trim() ? { puerta: puerta.trim().slice(0, 64) } : {}),
        }
        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.message || data.error || 'Credenciales incorrectas')
          return
        }
        if (!data.accessToken || !data.user) {
          setError('Respuesta inválida del servidor')
          return
        }
        if (data.community?.name != null && data.community?.id != null) {
          const acFromServer =
            data.community.accessCode != null && String(data.community.accessCode).trim()
              ? String(data.community.accessCode).trim().toUpperCase()
              : ''
          setCommunity(data.community.name, {
            id: data.community.id,
            accessCode: acFromServer || vecForLogin || communityAccessCode?.trim().toUpperCase() || '',
          })
        }
        applyServerSession(data.accessToken, data.user, { company: data.company })
        const serverRole = data.user.role
        if (serverRole === 'president' || serverRole === 'community_admin') {
          navigate(postLoginSlugQuery ? `/community-admin${postLoginSlugQuery}` : '/community-admin', {
            replace: true,
          })
        } else if (serverRole === 'concierge') {
          navigate(postLoginSlugQuery ? `/${postLoginSlugQuery}` : '/', { replace: true })
        } else if (serverRole === 'pool_staff') {
          navigate(postLoginSlugQuery ? `/pool-validate${postLoginSlugQuery}` : '/pool-validate', {
            replace: true,
          })
        } else {
          navigate(postLoginSlugQuery ? `/${postLoginSlugQuery}` : '/', { replace: true })
        }
      } catch {
        setError('No se pudo conectar con el servidor')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (role === 'concierge' || role === 'pool_staff') {
      const vecOk = vecCode.trim() || communityAccessCode?.trim()
      if (!vecOk) {
        setError('Introduce el código VEC de la comunidad o usa el enlace de acceso de tu comunidad.')
        return
      }
    }

    setSubmitting(true)
    try {
      const vecForStaff = (vecCode.trim() || communityAccessCode?.trim() || '').toUpperCase()
      const payload =
        role === 'community_admin'
          ? { email: email.trim().toLowerCase(), password }
          : {
              email: email.trim().toLowerCase(),
              password,
              accessCode: vecForStaff,
            }
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'Credenciales incorrectas')
        return
      }
      if (!data.accessToken || !data.user) {
        setError('Respuesta inválida del servidor')
        return
      }
      applyServerSession(data.accessToken, data.user, { company: data.company })
      if (data.community?.name != null && data.community?.id != null) {
        const acFromServer =
          data.community.accessCode != null && String(data.community.accessCode).trim()
            ? String(data.community.accessCode).trim().toUpperCase()
            : ''
        setCommunity(data.community.name, {
          id: data.community.id,
          accessCode: acFromServer || vecForStaff,
        })
      }
      const serverRole = data.user.role
      if (serverRole === 'super_admin') {
        navigate('/admin', { replace: true })
      } else if (serverRole === 'company_admin') {
        navigate('/company-admin', { replace: true })
      } else if (serverRole === 'community_admin' || serverRole === 'president') {
        navigate(postLoginSlugQuery ? `/community-admin${postLoginSlugQuery}` : '/community-admin', {
          replace: true,
        })
      } else if (serverRole === 'concierge') {
        navigate(postLoginSlugQuery ? `/${postLoginSlugQuery}` : '/', { replace: true })
      } else if (serverRole === 'pool_staff') {
        navigate(postLoginSlugQuery ? `/pool-validate${postLoginSlugQuery}` : '/pool-validate', {
          replace: true,
        })
      } else {
        setError(
          'Tu cuenta no coincide con el rol elegido (administrador, conserje o piscina); elige «Residente» si eres vecino.',
        )
      }
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen auth-screen--login">
      <div className="auth-login-bg" aria-hidden="true">
        <span className="auth-login-bg__orb auth-login-bg__orb--1" />
        <span className="auth-login-bg__orb auth-login-bg__orb--2" />
        <span className="auth-login-bg__orb auth-login-bg__orb--3" />
        <span className="auth-login-bg__grid" />
      </div>

      <div className="auth-login-shell">
        <aside className="auth-login-hero" aria-hidden="true">
          <div className="auth-login-hero__inner">
            <p className="auth-login-hero__eyebrow">Bienvenido</p>
            <h2 className="auth-login-hero__headline">
              Tu comunidad,
              <br />
              <span className="auth-login-hero__accent">conectada y segura</span>
            </h2>
            <p className="auth-login-hero__lead">
              Reservas, comunicación y convivencia en un espacio pensado para vecinos, presidentes y equipo de gestión.
            </p>
            <ul className="auth-login-hero__ticks">
              <li>Enlace por comunidad (slug) o código VEC manual</li>
              <li>Vecinos: portal, piso, puerta (apartamento) y contraseña</li>
              <li>Administrador: correo y contraseña de la ficha (varias comunidades; elige la activa en la app)</li>
              <li>Conserje: correo + contraseña + código VEC (o enlace de comunidad)</li>
              <li>Socorrista (piscina): correo + contraseña + VEC — solo validación de acceso</li>
            </ul>
          </div>
        </aside>

        <div className="auth-login-panel">
          <MobileAppDownloadBanner />
          <div className="auth-card card auth-card--login">
            <div className="auth-login-brand">
              <div className="auth-login-brand__halo">
                <img
                  src={BRAND_LOGO_PNG}
                  alt="Vecindario"
                  className="auth-logo auth-logo--login"
                />
              </div>
              <h1 className="auth-title auth-title--login">
                {loginMode === 'super_admin'
                  ? 'Super administrador'
                  : loginMode === 'company_admin'
                    ? 'Administrador de empresa'
                    : 'Iniciar sesión'}
              </h1>
              <p className="auth-login-tagline">
                {loginMode === 'super_admin'
                  ? 'Panel global de la plataforma. Solo email y contraseña — sin código VEC.'
                  : loginMode === 'company_admin'
                    ? 'Gestiona las comunidades de tu empresa. Las nuevas quedan pendientes hasta que un super administrador las active.'
                  : taglineCommunity}
              </p>
            </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {(loginMode === 'super_admin' || loginMode === 'company_admin') && (
            <div className="auth-field">
              <button
                type="button"
                className="btn btn--ghost btn--sm auth-login-back-community"
                onClick={() => {
                  setLoginMode('community')
                  setError('')
                }}
              >
                ← Volver al acceso de comunidades y vecinos
              </button>
            </div>
          )}

          {loginMode === 'community' && (
            <div className="auth-field auth-field--role-picker">
              <span className="auth-label" id="login-role-label">
                ¿Cómo entras?
              </span>
              <div
                className="auth-role-picker"
                role="radiogroup"
                aria-labelledby="login-role-label"
              >
                {ROLE_OPTIONS.map(({ value, label, short, sub, icon }) => {
                  const selected = role === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={label}
                      className={`auth-role-btn${selected ? ' auth-role-btn--active' : ''}`}
                      onClick={() => {
                        setRole(value)
                        if (value === 'resident') {
                          setEmail('')
                        }
                        if (value === 'community_admin' || value === 'concierge' || value === 'pool_staff') {
                          setPiso('')
                          setPortal('')
                          setPuerta('')
                        }
                        setError('')
                      }}
                    >
                      <span className="auth-role-btn__icon" aria-hidden>
                        {icon}
                      </span>
                      <span className="auth-role-btn__text">{short}</span>
                      <span className="auth-role-btn__sub">{sub}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {loginMode === 'community' && fromSlugRoute && slugRouteBusy && (
            <p className="auth-vec-ok" role="status">
              Comprobando enlace de la comunidad…
            </p>
          )}

          {loginMode === 'community' && fromSlugRoute && slugRouteError && (
            <div className="auth-field">
              <p className="auth-error" role="alert">
                {slugRouteError}. Puedes comprobar el código VEC abajo o{' '}
                <Link
                  to="/login"
                  className="auth-link"
                  onClick={() => {
                    setCommunity(null)
                    setVecCode('')
                    setVecError('')
                    setSlugRouteError('')
                  }}
                >
                  ir al acceso general
                </Link>
                .
              </p>
            </div>
          )}

          {loginMode === 'community' && slugCommunityReady && (
            <div className="auth-field auth-field--slug-ok">
              <p className="auth-vec-ok" role="status">
                Comunidad por enlace: <strong>{community}</strong>
                <span className="auth-vec-ok-hint auth-vec-ok-hint--block">
                  {' '}
                  <Link
                    to="/login"
                    className="auth-link"
                    onClick={() => {
                      setCommunity(null)
                      setVecCode('')
                      setVecError('')
                      setSlugRouteError('')
                    }}
                  >
                    Usar otra comunidad o código VEC
                  </Link>
                </span>
              </p>
            </div>
          )}

          {loginMode === 'community' && showVecCodeField(role) && (!fromSlugRoute || slugRouteError) && (
            <div className="auth-field auth-field--vec">
              <label className="auth-label" htmlFor="vec-code">
                Código de comunidad (VEC)
                <span className="auth-required"> (obligatorio)</span>
              </label>
              <div className="auth-code-row">
                <input
                  id="vec-code"
                  type="text"
                  className="auth-input auth-input--code"
                  placeholder="VEC-XXXXXXXX"
                  value={vecCode}
                  onChange={(e) => setVecCode(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn--secondary auth-code-btn"
                  onClick={() => void verifyVecCode()}
                  disabled={vecChecking}
                >
                  {vecChecking ? '…' : 'Comprobar'}
                </button>
              </div>
              {vecError && <p className="auth-error auth-error--inline" role="alert">{vecError}</p>}
              {communityId != null && community && !slugCommunityReady && (
                <p className="auth-vec-ok" role="status">
                  {role === 'community_admin'
                    ? 'Comunidad seleccionada: '
                    : role === 'concierge'
                      ? 'Comunidad (conserje): '
                      : role === 'pool_staff'
                        ? 'Comunidad (piscina): '
                        : 'Comunidad vinculada: '}
                  <strong>{community}</strong>
                  {role === 'community_admin' && (
                    <span className="auth-vec-ok-hint"> — debe coincidir con el correo de administrador de esa comunidad.</span>
                  )}
                  {role === 'concierge' && (
                    <span className="auth-vec-ok-hint">
                      {' '}
                      — debe coincidir con el correo de conserje dado de alta en esa comunidad.
                    </span>
                  )}
                  {role === 'pool_staff' && (
                    <span className="auth-vec-ok-hint">
                      {' '}
                      — debe coincidir con el correo de socorrista en esa comunidad.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {(showEmailFieldCommunity ||
            loginMode === 'super_admin' ||
            loginMode === 'company_admin') && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                {loginMode === 'super_admin'
                  ? 'Email de super administrador'
                  : loginMode === 'company_admin'
                    ? 'Email de administrador de empresa'
                    : 'Email'}
              </label>
              <input
                id="email"
                type="email"
                className="auth-input"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus={loginMode === 'super_admin' || loginMode === 'company_admin'}
              />
            </div>
          )}

          {loginMode === 'community' && showPortalPisoFields(role) && (
            <div className="auth-login-double">
              <div className="auth-field">
                <label className="auth-label" htmlFor="login-portal">
                  Portal <span className="auth-required">(acceso)</span>
                </label>
                {fetchPortals && portalOptionsLoading ? (
                  <select
                    id="login-portal"
                    name="vecindario_portal"
                    className="auth-input auth-select"
                    disabled
                    aria-busy="true"
                    value=""
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
                  >
                    <option value="">Cargando portales…</option>
                  </select>
                ) : portalSelectOptions ? (
                  <select
                    id="login-portal"
                    name="vecindario_portal"
                    className="auth-input auth-select"
                    value={portal}
                    onChange={(e) => {
                      setPortal(e.target.value)
                      setPiso('')
                      setPuerta('')
                    }}
                    required
                    aria-required
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
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
                    id="login-portal"
                    name="vecindario_portal"
                    type="text"
                    className="auth-input"
                    placeholder="Ej. 34, P1"
                    value={portal}
                    onChange={(e) => setPortal(e.target.value)}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
                    required
                    aria-required
                  />
                )}
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="login-piso">
                  Piso <span className="auth-required">(planta / bloque)</span>
                </label>
                {pisoSelectOptions ? (
                  <select
                    id="login-piso"
                    name="vecindario_piso"
                    className="auth-input auth-select"
                    value={piso}
                    onChange={(e) => setPiso(e.target.value)}
                    required
                    aria-required
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
                  >
                    <option value="">Selecciona planta</option>
                    {pisoSelectOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="login-piso"
                    name="vecindario_piso"
                    type="text"
                    className="auth-input"
                    placeholder="Ej. 3º, Bajo A, Ático"
                    value={piso}
                    onChange={(e) => setPiso(e.target.value)}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    aria-required
                  />
                )}
              </div>
              <div className="auth-field auth-login-double-full">
                <label className="auth-label" htmlFor="login-puerta">
                  Puerta <span className="auth-required">(apartamento)</span>
                </label>
                <p className="auth-field-hint">
                  Mismo dato que en el alta. Déjalo vacío solo si tu cuenta es antigua y aún no tiene puerta en el
                  sistema.
                </p>
                {puertaSelectOptions ? (
                  <select
                    id="login-puerta"
                    name="vecindario_puerta"
                    className="auth-input auth-select"
                    value={puerta}
                    onChange={(e) => setPuerta(e.target.value)}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
                  >
                    <option value="">— (cuenta antigua sin puerta)</option>
                    {puertaSelectOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="login-puerta"
                    name="vecindario_puerta"
                    type="text"
                    className="auth-input"
                    placeholder="Ej. B, 2 (obligatorio si consta en tu alta)"
                    value={puerta}
                    onChange={(e) => setPuerta(e.target.value)}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                )}
              </div>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}
          <button
            type="submit"
            className="auth-submit auth-submit--login btn btn--primary btn--block"
            disabled={
              submitting ||
              (loginMode === 'community' && fromSlugRoute && slugRouteBusy)
            }
          >
            {submitting
              ? 'Entrando…'
              : loginMode === 'super_admin'
                ? 'Entrar al panel de control'
                : loginMode === 'company_admin'
                  ? 'Entrar al panel de empresa'
                : 'Iniciar sesión'}
          </button>
        </form>

            {loginMode === 'community' && (
              <div className="auth-login-super-wrap">
                <button
                  type="button"
                  className="btn btn--secondary auth-login-super-btn"
                  onClick={() => {
                    navigate('/login')
                    setLoginMode('super_admin')
                    setVecCode('')
                    setVecError('')
                    setSlugRouteError('')
                    setCommunity(null)
                    setError('')
                    setPiso('')
                    setPortal('')
                    setPuerta('')
                  }}
                >
                  Acceso super administrador
                </button>
                <p className="auth-login-super-hint">
                  Uso interno: gestión de comunidades y plataforma. No necesitas código VEC.
                </p>
                <button
                  type="button"
                  className="btn btn--secondary auth-login-super-btn"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => {
                    navigate('/login')
                    setLoginMode('company_admin')
                    setVecCode('')
                    setVecError('')
                    setSlugRouteError('')
                    setCommunity(null)
                    setError('')
                    setPiso('')
                    setPortal('')
                    setPuerta('')
                  }}
                >
                  Acceso administrador de empresa
                </button>
                <p className="auth-login-super-hint">
                  Gestiona comunidades de tu empresa (alta pendiente de aprobación del super administrador).
                </p>
              </div>
            )}

            {loginMode === 'community' && (
              <p className="auth-footer auth-footer--login">
                ¿No tienes cuenta? <Link to="/register" className="auth-link">Crear cuenta</Link>
              </p>
            )}
          </div>
          <div className="auth-login-credit-wrap">
            <DeveloperCredit />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
