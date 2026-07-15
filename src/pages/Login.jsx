import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl } from '../config/api.js'
import { useCommunityPortalOptions } from '../hooks/useCommunityPortalOptions.js'
import { pisoPuertaChoicesForPortal } from '../utils/dwellingPortalChoices.js'
import DeveloperCredit from '../components/DeveloperCredit'
import MobileAppDownloadBanner from '../components/MobileAppDownloadBanner'
import LoginPlayStoreNotice from '../components/LoginPlayStoreNotice.jsx'
import { BRAND_LOGO_PNG } from '../syncBrandFavicon.js'
import { getSignInPath } from '../utils/signInWebPath'
import './AuthPages.css'

/** Pantalla inicial: solo estos cuatro accesos. */
const HOME_ACCESS_OPTIONS = [
  {
    id: 'resident',
    label: 'Vecino',
    sub: 'Portal, piso y puerta',
    icon: '🏠',
  },
  {
    id: 'concierge',
    label: 'Conserje',
    sub: 'Correo + VEC',
    icon: '🛎️',
  },
  {
    id: 'pool_staff',
    label: 'Piscina',
    sub: 'Correo + VEC',
    icon: '🏊',
  },
  {
    id: 'admin_hub',
    label: 'Administración',
    sub: 'Comunidad, empresa o super admin',
    icon: '📋',
  },
]

/** Tras «Administración»: admin de ficha, admin de empresa o super admin. */
const ADMIN_TYPE_OPTIONS = [
  {
    loginMode: 'community',
    role: 'community_admin',
    label: 'Administrador de comunidad',
    short: 'Admin comunidad',
    sub: 'Correo y contraseña (ficha)',
    icon: '🏢',
  },
  {
    loginMode: 'company_admin',
    role: null,
    label: 'Administrador de empresa',
    short: 'Admin empresa',
    sub: 'Gestiona comunidades de la firma',
    icon: '🏛️',
  },
  {
    loginMode: 'super_admin',
    role: null,
    label: 'Super administrador',
    short: 'Super admin',
    sub: 'Panel De Camino / plataforma',
    icon: '⚙️',
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
  const [role, setRole] = useState(null)
  /** home → solo botones | admin_pick → tipo de administración | form → credenciales */
  const [loginStep, setLoginStep] = useState('home')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [vecCode, setVecCode] = useState('')
  const [vecChecking, setVecChecking] = useState(false)
  const [vecError, setVecError] = useState('')
  const [slugRouteBusy, setSlugRouteBusy] = useState(false)
  const [slugRouteError, setSlugRouteError] = useState('')
  /** Super admin / admin de empresa: flujos aparte (solo email + contraseña, sin VEC). */
  const [loginMode, setLoginMode] = useState('community')
  const [demoMeta, setDemoMeta] = useState(null)
  const [demoPickerOpen, setDemoPickerOpen] = useState(false)
  const [demoPreset, setDemoPreset] = useState('')
  const [demoBusy, setDemoBusy] = useState(false)

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
      pisoPuertaChoicesForPortal(portal, portalChoicesRaw, dwellingByPortalIndex, piso),
    [portal, portalChoicesRaw, dwellingByPortalIndex, piso],
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

  const goLoginHome = () => {
    setLoginStep('home')
    setLoginMode('community')
    setRole(null)
    setError('')
  }

  const pickCommunityRole = (roleId) => {
    setLoginMode('community')
    setRole(roleId)
    setError('')
    setLoginStep('form')
  }

  const pickAdminType = (opt) => {
    setLoginMode(opt.loginMode)
    setRole(opt.role)
    setError('')
    setLoginStep('form')
  }

  const goBackFromForm = () => {
    if (
      loginMode === 'super_admin' ||
      loginMode === 'company_admin' ||
      role === 'community_admin'
    ) {
      setLoginMode('community')
      setRole(null)
      setLoginStep('admin_pick')
      setError('')
      return
    }
    goLoginHome()
  }

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
        setCommunity(data.name, {
          id: data.id,
          accessCode: code,
          loginSlug: data.loginSlug ?? loginSlugFromRoute,
        })
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

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl('/api/auth/demo-explore-meta'))
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return
        if (data?.enabled && Array.isArray(data.presets)) {
          setDemoMeta({ enabled: true, slug: data.slug, presets: data.presets })
        } else {
          setDemoMeta({ enabled: false })
        }
      })
      .catch(() => {
        if (!cancelled) setDemoMeta({ enabled: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

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
      return 'Con correo en tu cuenta: email y contraseña. Sin correo: código VEC + portal + piso + contraseña.'
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
    (role === 'resident' ||
      role === 'community_admin' ||
      role === 'concierge' ||
      role === 'pool_staff')

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
      setCommunity(data.name, {
        id: data.id,
        accessCode: raw.trim().toUpperCase(),
        loginSlug: data.loginSlug,
      })
      setVecError('')
    } catch {
      setVecError('No se pudo comprobar el código')
    } finally {
      setVecChecking(false)
    }
  }

  const runDemoExplore = async () => {
    if (!demoPreset) {
      setError('Elige un perfil de demostración')
      return
    }
    setDemoBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/auth/demo-explore'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: demoPreset }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'No se pudo entrar en la demo')
        return
      }
      if (!data.accessToken || !data.user) {
        setError('Respuesta inválida del servidor')
        return
      }
      const slugQ =
        data.community?.loginSlug != null && String(data.community.loginSlug).trim()
          ? `?c=${encodeURIComponent(String(data.community.loginSlug).trim().toLowerCase())}`
          : fromSlugRoute && loginSlugFromRoute
            ? postLoginSlugQuery
            : ''
      if (data.community?.name != null && data.community?.id != null) {
        const ac =
          data.community.accessCode != null && String(data.community.accessCode).trim()
            ? String(data.community.accessCode).trim().toUpperCase()
            : ''
        setCommunity(data.community.name, {
          id: data.community.id,
          accessCode: ac,
          loginSlug: data.community.loginSlug,
        })
      }
      if (data.user.role === 'company_admin') {
        applyServerSession(data.accessToken, data.user, { company: data.company })
        const serviceSuper =
          data.company?.scopedSuperAdmin === true ||
          data.company?.kind === 'prestacion_servicios'
        navigate(serviceSuper ? '/admin' : '/company-admin', { replace: true })
        setDemoPickerOpen(false)
        return
      }
      applyServerSession(data.accessToken, data.user, {
        company: data.company,
        communityFromLogin: data.community,
      })
      const serverRole = data.user.role
      if (serverRole === 'president' || serverRole === 'community_admin') {
        navigate(slugQ ? `/community-admin${slugQ}` : '/community-admin', { replace: true })
      } else if (serverRole === 'concierge') {
        navigate(slugQ ? `/${slugQ}` : '/', { replace: true })
      } else if (serverRole === 'pool_staff') {
        navigate(slugQ ? `/pool-validate${slugQ}` : '/pool-validate', { replace: true })
      } else {
        navigate(slugQ ? `/${slugQ}` : '/', { replace: true })
      }
      setDemoPickerOpen(false)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setDemoBusy(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (loginStep !== 'form') return
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
        const serviceSuper =
          data.company?.scopedSuperAdmin === true ||
          data.company?.kind === 'prestacion_servicios'
        navigate(serviceSuper ? '/admin' : '/company-admin', { replace: true })
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
      const emailTrim = email.trim().toLowerCase()
      if (emailTrim) {
        setSubmitting(true)
        try {
          const res = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailTrim, password }),
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
              accessCode: acFromServer,
              loginSlug: data.community.loginSlug,
            })
          }
          applyServerSession(data.accessToken, data.user, {
            company: data.company,
            communityFromLogin: data.community,
          })
          const serverRole = data.user.role
          if (serverRole === 'president' || serverRole === 'community_admin') {
            navigate(postLoginSlugQuery ? `/community-admin${postLoginSlugQuery}` : '/community-admin', {
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
            loginSlug: data.community.loginSlug,
          })
        }
        applyServerSession(data.accessToken, data.user, {
          company: data.company,
          communityFromLogin: data.community,
        })
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
      applyServerSession(data.accessToken, data.user, {
        company: data.company,
        communityFromLogin: data.community,
      })
      if (data.community?.name != null && data.community?.id != null) {
        const acFromServer =
          data.community.accessCode != null && String(data.community.accessCode).trim()
            ? String(data.community.accessCode).trim().toUpperCase()
            : ''
        setCommunity(data.community.name, {
          id: data.community.id,
          accessCode: acFromServer || vecForStaff,
          loginSlug: data.community.loginSlug,
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
                {loginStep === 'home'
                  ? 'Vecindario'
                  : loginStep === 'admin_pick'
                    ? 'Administración'
                    : loginMode === 'super_admin'
                      ? 'Super administrador'
                      : loginMode === 'company_admin'
                        ? 'Administrador de empresa'
                        : role === 'resident'
                          ? 'Acceso vecino'
                          : role === 'concierge'
                            ? 'Acceso conserje'
                            : role === 'pool_staff'
                              ? 'Acceso piscina'
                              : 'Administrador de comunidad'}
              </h1>
              <p className="auth-login-tagline">
                {loginStep === 'home'
                  ? 'Elige cómo quieres entrar'
                  : loginStep === 'admin_pick'
                    ? 'Comunidad con ficha propia, empresa gestora o panel interno De Camino'
                    : loginMode === 'super_admin'
                      ? 'Panel global. Solo email y contraseña — sin código VEC.'
                      : loginMode === 'company_admin'
                        ? 'Gestiona las comunidades de tu empresa (firma mandataria).'
                        : taglineCommunity}
              </p>
            </div>

            {loginStep === 'home' ? (
              <div className="auth-field auth-field--role-picker">
                <span className="auth-label auth-label--center" id="login-role-label">
                  ¿Cómo entras?
                </span>
                <div
                  className="auth-role-picker auth-role-picker--quad"
                  role="group"
                  aria-labelledby="login-role-label"
                >
                  {HOME_ACCESS_OPTIONS.map(({ id, label, sub, icon }) => (
                    <button
                      key={id}
                      type="button"
                      className="auth-role-btn auth-role-btn--pick"
                      aria-label={label}
                      onClick={() => {
                        if (id === 'admin_hub') {
                          setError('')
                          setLoginStep('admin_pick')
                          return
                        }
                        if (id === 'resident') setEmail('')
                        if (id !== 'resident') {
                          setPiso('')
                          setPortal('')
                          setPuerta('')
                        }
                        pickCommunityRole(id)
                      }}
                    >
                      <span className="auth-role-btn__icon" aria-hidden>
                        {icon}
                      </span>
                      <span className="auth-role-btn__text">{label}</span>
                      <span className="auth-role-btn__sub">{sub}</span>
                    </button>
                  ))}
                </div>
                {demoMeta?.enabled ? (
                  <p className="auth-login-home-demo">
                    <button
                      type="button"
                      className="auth-link auth-link--button"
                      onClick={() => {
                        setDemoPickerOpen(true)
                        setDemoPreset('')
                        setError('')
                      }}
                    >
                      Explorar demo
                    </button>
                  </p>
                ) : null}
                <LoginPlayStoreNotice />
              </div>
            ) : null}

            {loginStep === 'admin_pick' ? (
              <div className="auth-field auth-field--role-picker">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm auth-login-back-community"
                  onClick={goLoginHome}
                >
                  ← Volver
                </button>
                <div className="auth-role-picker auth-role-picker--admin" role="group" aria-label="Tipo de administración">
                  {ADMIN_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.loginMode}
                      type="button"
                      className="auth-role-btn auth-role-btn--pick"
                      aria-label={opt.label}
                      onClick={() => pickAdminType(opt)}
                    >
                      <span className="auth-role-btn__icon" aria-hidden>
                        {opt.icon}
                      </span>
                      <span className="auth-role-btn__text">{opt.short}</span>
                      <span className="auth-role-btn__sub">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

        {loginStep === 'form' ? (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <button
              type="button"
              className="btn btn--ghost btn--sm auth-login-back-community"
              onClick={goBackFromForm}
            >
              ← Volver
            </button>
          </div>

          {loginMode === 'community' && role && fromSlugRoute && slugRouteBusy && (
            <p className="auth-vec-ok" role="status">
              Comprobando enlace de la comunidad…
            </p>
          )}

          {loginMode === 'community' && role && fromSlugRoute && slugRouteError && (
            <div className="auth-field">
              <p className="auth-error" role="alert">
                {slugRouteError}. Puedes comprobar el código VEC abajo o{' '}
                <Link
                  to={getSignInPath({ forceGeneric: true })}
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

          {loginMode === 'community' && role && slugCommunityReady && (
            <div className="auth-field auth-field--slug-ok">
              <p className="auth-vec-ok" role="status">
                Comunidad por enlace: <strong>{community}</strong>
                <span className="auth-vec-ok-hint auth-vec-ok-hint--block">
                  {' '}
                  <Link
                    to={getSignInPath({ forceGeneric: true })}
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

          {loginMode === 'community' && role && showVecCodeField(role) && (!fromSlugRoute || slugRouteError) && (
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
              {role === 'resident' ? (
                <p className="auth-vec-ok-hint" style={{ marginTop: '0.5rem' }}>
                  Si tienes correo en tu cuenta, basta email y contraseña (abajo). Si no, deja el email vacío
                  y usa VEC + portal + piso.
                </p>
              ) : null}
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
                    onChange={(e) => {
                      setPiso(e.target.value)
                      setPuerta('')
                    }}
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
        ) : null}

            <p className="auth-footer auth-footer--login">
              <Link to="/privacy" className="auth-link">
                Política de privacidad
              </Link>
              {loginStep === 'home' ? (
                <>
                  <span className="auth-footer__sep" aria-hidden="true">
                    {' · '}
                  </span>
                  ¿Interesado en Vecindario?{' '}
                  <Link to="/solicitar-oferta" className="auth-link">
                    Solicitar oferta
                  </Link>
                </>
              ) : null}
            </p>

            {demoPickerOpen && demoMeta?.enabled ? (
              <div className="auth-demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-modal-title">
                <button
                  type="button"
                  className="auth-demo-modal__backdrop"
                  aria-label="Cerrar"
                  disabled={demoBusy}
                  onClick={() => {
                    if (!demoBusy) setDemoPickerOpen(false)
                  }}
                />
                <div className="auth-demo-modal__panel card">
                  <h2 id="demo-modal-title" className="auth-demo-modal__title">
                    Explorar la app (demo)
                  </h2>
                  <p className="auth-demo-modal__note">
                    Datos ficticios. No uses esta sesión para información real.
                  </p>
                  <label className="auth-label" htmlFor="demo-preset-select">
                    ¿Cómo quieres entrar?
                  </label>
                  <select
                    id="demo-preset-select"
                    className="auth-input"
                    value={demoPreset}
                    onChange={(e) => setDemoPreset(e.target.value)}
                    disabled={demoBusy}
                  >
                    <option value="">— Elige un perfil —</option>
                    {demoMeta.presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {demoPreset && demoMeta.presets.find((p) => p.id === demoPreset)?.hint ? (
                    <p className="auth-demo-modal__hint">
                      {demoMeta.presets.find((p) => p.id === demoPreset)?.hint}
                    </p>
                  ) : null}
                  <div className="auth-demo-modal__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={demoBusy}
                      onClick={() => setDemoPickerOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={demoBusy || !demoPreset}
                      onClick={() => void runDemoExplore()}
                    >
                      {demoBusy ? 'Entrando…' : 'Entrar'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
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
