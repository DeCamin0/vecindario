/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiUrl } from '../config/api.js'

const COMMUNITY_STORAGE_KEY = 'vecindario-community'
const COMMUNITY_ID_KEY = 'vecindario-community-id'
const COMMUNITY_ACCESS_CODE_KEY = 'vecindario-community-access-code'
const USER_ROLE_KEY = 'userRole'
const ACCESS_TOKEN_KEY = 'vecindario-access-token'

/** Sesión solo en esta pestaña (impersonación): no tocar localStorage del admin. */
const TAB_SESSION_ISOLATED = 'vecindario_tab_isolated'

/** Handoff impersonación: pestaña hija ↔ panel admin (mismo origen). */
export const VEC_IMPERSONATE_CHILD_READY = 'VEC_IMPERSONATE_CHILD_READY'
export const VEC_IMPERSONATE_PAYLOAD = 'VEC_IMPERSONATE_PAYLOAD'

const VALID_ROLES = ['resident', 'community_admin', 'president', 'super_admin', 'concierge']

const DEFAULT_APP_NAV_FLAGS = { services: true, incidents: true, bookings: true }

function shouldDeferStorageReads() {
  try {
    return /^#impersonate=[0-9a-f-]{36}$/i.test(window.location.hash || '')
  } catch {
    return false
  }
}

function useSessionStore() {
  try {
    return sessionStorage.getItem(TAB_SESSION_ISOLATED) === '1'
  } catch {
    return false
  }
}

function authGet(key) {
  try {
    return useSessionStore() ? sessionStorage.getItem(key) : localStorage.getItem(key)
  } catch {
    return null
  }
}

function saveAccessToken(token) {
  try {
    if (useSessionStore()) {
      if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
      else sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    } else if (token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
    }
  } catch { /* ignore */ }
}

const AUTH_PERSISTENCE_KEYS = [
  COMMUNITY_STORAGE_KEY,
  COMMUNITY_ID_KEY,
  COMMUNITY_ACCESS_CODE_KEY,
  USER_ROLE_KEY,
  ACCESS_TOKEN_KEY,
]

function clearIsolatedTabSession() {
  try {
    sessionStorage.removeItem(TAB_SESSION_ISOLATED)
    for (const k of AUTH_PERSISTENCE_KEYS) {
      sessionStorage.removeItem(k)
    }
  } catch { /* ignore */ }
}

/** True if role can access Management panel and manage community (incidents, bookings). */
export function canManageCommunity(role) {
  return role === 'community_admin' || role === 'president'
}

/** Incidencias: marcar pendiente / resuelta (incluye conserje y super admin). */
export function canResolveIncidents(role) {
  return (
    role === 'community_admin' ||
    role === 'president' ||
    role === 'concierge' ||
    role === 'super_admin'
  )
}

/** Solo conserje / super admin: cerrar u abrir comentarios en una incidencia. */
export function canLockIncidentComments(role) {
  return role === 'concierge' || role === 'super_admin'
}

/**
 * Vecino en la app: reservas, incidencias, servicios como cualquier residente.
 * Presidente incluido (además tiene Gestión). Super admin incluido para demo/soporte.
 * Administrador de comunidad no: solo panel de gestión.
 */
export function canActAsResident(role) {
  return (
    role === 'resident' ||
    role === 'president' ||
    role === 'super_admin' ||
    role === 'concierge'
  )
}

/** Presidente y vecino deben completar piso y portal (campos separados). */
export function roleRequiresPiso(role) {
  return role === 'resident' || role === 'president'
}

export function hasPisoSet(user) {
  if (!user) return false
  const p = user.piso
  return p != null && String(p).trim().length > 0
}

export function hasPortalSet(user) {
  if (!user) return false
  const p = user.portal
  return p != null && String(p).trim().length > 0
}

export function hasResidentHomeComplete(user) {
  return hasPisoSet(user) && hasPortalSet(user)
}

function loadCommunity() {
  try {
    if (shouldDeferStorageReads()) return null
    const name = authGet(COMMUNITY_STORAGE_KEY)
    return name && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

function loadCommunityId() {
  try {
    if (shouldDeferStorageReads()) return null
    const raw = authGet(COMMUNITY_ID_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function saveCommunity(name) {
  try {
    if (useSessionStore()) {
      if (name && name.trim()) {
        sessionStorage.setItem(COMMUNITY_STORAGE_KEY, name.trim())
      } else {
        sessionStorage.removeItem(COMMUNITY_STORAGE_KEY)
      }
    } else if (name && name.trim()) {
      localStorage.setItem(COMMUNITY_STORAGE_KEY, name.trim())
    } else {
      localStorage.removeItem(COMMUNITY_STORAGE_KEY)
    }
  } catch { /* ignore storage errors */ }
}

function saveCommunityId(id) {
  try {
    if (useSessionStore()) {
      if (id != null && Number.isFinite(Number(id))) {
        sessionStorage.setItem(COMMUNITY_ID_KEY, String(id))
      } else {
        sessionStorage.removeItem(COMMUNITY_ID_KEY)
      }
    } else if (id != null && Number.isFinite(Number(id))) {
      localStorage.setItem(COMMUNITY_ID_KEY, String(id))
    } else {
      localStorage.removeItem(COMMUNITY_ID_KEY)
    }
  } catch { /* ignore storage errors */ }
}

function loadCommunityAccessCode() {
  try {
    if (shouldDeferStorageReads()) return null
    const c = authGet(COMMUNITY_ACCESS_CODE_KEY)
    return c && c.trim() ? c.trim().toUpperCase() : null
  } catch {
    return null
  }
}

function saveCommunityAccessCode(code) {
  try {
    if (useSessionStore()) {
      if (code && String(code).trim()) {
        sessionStorage.setItem(
          COMMUNITY_ACCESS_CODE_KEY,
          String(code).trim().toUpperCase(),
        )
      } else {
        sessionStorage.removeItem(COMMUNITY_ACCESS_CODE_KEY)
      }
    } else if (code && String(code).trim()) {
      localStorage.setItem(COMMUNITY_ACCESS_CODE_KEY, String(code).trim().toUpperCase())
    } else {
      localStorage.removeItem(COMMUNITY_ACCESS_CODE_KEY)
    }
  } catch { /* ignore storage errors */ }
}

function loadUserRole() {
  try {
    if (shouldDeferStorageReads()) return 'resident'
    const role = authGet(USER_ROLE_KEY)
    return VALID_ROLES.includes(role) ? role : 'resident'
  } catch {
    return 'resident'
  }
}

function saveUserRole(role) {
  try {
    if (useSessionStore()) {
      if (role && VALID_ROLES.includes(role)) {
        sessionStorage.setItem(USER_ROLE_KEY, role)
      } else {
        sessionStorage.removeItem(USER_ROLE_KEY)
      }
    } else if (role && VALID_ROLES.includes(role)) {
      localStorage.setItem(USER_ROLE_KEY, role)
    } else {
      localStorage.removeItem(USER_ROLE_KEY)
    }
  } catch { /* ignore storage errors */ }
}

function loadStoredToken() {
  try {
    if (shouldDeferStorageReads()) return null
    return authGet(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [community, setCommunityState] = useState(loadCommunity)
  const [communityId, setCommunityIdState] = useState(loadCommunityId)
  const [communityAccessCode, setCommunityAccessCodeState] = useState(loadCommunityAccessCode)
  const [user, setUser] = useState(null)
  const [userRole, setUserRoleState] = useState(loadUserRole)
  const [accessToken, setAccessTokenState] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [appNavFlags, setAppNavFlags] = useState(DEFAULT_APP_NAV_FLAGS)
  const [appNavFlagsReady, setAppNavFlagsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = communityId
    if (id == null || !Number.isFinite(Number(id)) || Number(id) < 1) {
      setAppNavFlags(DEFAULT_APP_NAV_FLAGS)
      setAppNavFlagsReady(true)
      return () => {
        cancelled = true
      }
    }
    setAppNavFlagsReady(false)
    fetch(apiUrl(`/api/public/community-config?communityId=${id}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data || typeof data !== 'object') {
          setAppNavFlags(DEFAULT_APP_NAV_FLAGS)
          setAppNavFlagsReady(true)
          return
        }
        setAppNavFlags({
          services: data.appNavServicesEnabled !== false,
          incidents: data.appNavIncidentsEnabled !== false,
          bookings: data.appNavBookingsEnabled !== false,
        })
        setAppNavFlagsReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setAppNavFlags(DEFAULT_APP_NAV_FLAGS)
          setAppNavFlagsReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [communityId])

  useEffect(() => {
    let cancelled = false

    const hydrateFromToken = (token) =>
      fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error('me')
          return r.json()
        })
        .then((data) => {
          if (!VALID_ROLES.includes(data.role)) throw new Error('role')
          if (cancelled) return
          setAccessTokenState(token)
          const pisoMe =
            data.piso != null && String(data.piso).trim() ? String(data.piso).trim() : ''
          const portalMe =
            data.portal != null && String(data.portal).trim() ? String(data.portal).trim() : ''
          const emailMe =
            data.email != null && String(data.email).trim() ? String(data.email).trim() : ''
          const nameMe =
            data.name?.trim() ||
            (emailMe ? emailMe.split('@')[0] : portalMe && pisoMe ? `${portalMe} · ${pisoMe}` : 'Vecino')
          setUser({
            id: data.id,
            ...(emailMe ? { email: emailMe } : {}),
            name: nameMe,
            ...(pisoMe ? { piso: pisoMe } : {}),
            ...(portalMe ? { portal: portalMe } : {}),
          })
          setUserRoleState(data.role)
          saveUserRole(data.role)
        })

    /**
     * Nueva pestaña con #impersonate=<uuid>: pide el JWT al opener por postMessage.
     * La sesión del usuario objetivo va a sessionStorage (aislada), no pisa el localStorage del admin.
     */
    const tryConsumeImpersonateBridge = () =>
      new Promise((resolve) => {
        let hash = ''
        try {
          hash = window.location.hash || ''
        } catch {
          resolve(false)
          return
        }
        const m = /^#impersonate=([0-9a-f-]{36})$/i.exec(hash)
        if (!m) {
          resolve(false)
          return
        }
        const opener = window.opener
        if (!opener || opener.closed) {
          resolve(false)
          return
        }
        const nonce = m[1]
        const origin = window.location.origin

        const t = window.setTimeout(() => {
          window.removeEventListener('message', onReply)
          resolve(false)
        }, 90_000)

        const onReply = (ev) => {
          if (ev.origin !== origin) return
          if (
            !ev.data ||
            ev.data.type !== VEC_IMPERSONATE_PAYLOAD ||
            ev.data.nonce !== nonce
          ) {
            return
          }
          window.clearTimeout(t)
          window.removeEventListener('message', onReply)

          const p = ev.data.payload
          if (!p?.accessToken || !p.user || !VALID_ROLES.includes(p.user.role)) {
            resolve(false)
            return
          }

          const comm = p.community && typeof p.community === 'object' ? p.community : {}
          const name = typeof comm.name === 'string' ? comm.name.trim() : ''
          const idNum = comm.id != null ? Number(comm.id) : NaN
          const acRaw = comm.accessCode != null ? String(comm.accessCode).trim() : ''

          try {
            sessionStorage.setItem(TAB_SESSION_ISOLATED, '1')
          } catch { /* ignore */ }
          saveAccessToken(p.accessToken)
          saveUserRole(p.user.role)
          if (name) {
            saveCommunity(name)
            if (!cancelled) setCommunityState(name)
          }
          if (Number.isFinite(idNum) && idNum >= 1) {
            saveCommunityId(idNum)
            if (!cancelled) setCommunityIdState(idNum)
          }
          if (acRaw) {
            const u = acRaw.toUpperCase()
            saveCommunityAccessCode(u)
            if (!cancelled) setCommunityAccessCodeState(u)
          }

          try {
            window.history.replaceState(
              {},
              '',
              `${window.location.pathname}${window.location.search}`,
            )
          } catch { /* ignore */ }

          hydrateFromToken(p.accessToken)
            .then(() => resolve(true))
            .catch(() => resolve(false))
        }

        window.addEventListener('message', onReply)
        try {
          opener.postMessage({ type: VEC_IMPERSONATE_CHILD_READY, nonce }, origin)
        } catch {
          window.clearTimeout(t)
          window.removeEventListener('message', onReply)
          resolve(false)
        }
      })

    const run = async () => {
      const viaBridge = await tryConsumeImpersonateBridge()
      if (viaBridge) {
        if (!cancelled) setAuthReady(true)
        return
      }

      const token = loadStoredToken()
      if (!token) {
        if (!cancelled) {
          // Sin JWT: no forzar rol super_admin desde storage (evita 403 en /admin).
          setUserRoleState('resident')
          saveUserRole('resident')
        }
        if (!cancelled) setAuthReady(true)
        return
      }

      try {
        await hydrateFromToken(token)
      } catch {
        if (!cancelled) {
          saveAccessToken(null)
          setAccessTokenState(null)
          setUser(null)
          setUserRoleState('resident')
          saveUserRole('resident')
        }
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * @param {string | null | undefined} name
   * @param {{ id?: number | null, accessCode?: string | null }} [opts] — API VEC / login con código
   */
  const setCommunity = useCallback((name, opts) => {
    const value = name?.trim() || null
    setCommunityState(value)
    saveCommunity(value)
    if (!value) {
      setCommunityIdState(null)
      saveCommunityId(null)
      setCommunityAccessCodeState(null)
      saveCommunityAccessCode(null)
      return
    }
    if (opts && opts.id != null) {
      const idNum = Number(opts.id)
      if (Number.isFinite(idNum)) {
        setCommunityIdState(idNum)
        saveCommunityId(idNum)
      }
    }
    if (opts && 'accessCode' in opts) {
      const ac = opts.accessCode
      if (ac != null && String(ac).trim()) {
        const u = String(ac).trim().toUpperCase()
        setCommunityAccessCodeState(u)
        saveCommunityAccessCode(u)
      } else {
        setCommunityAccessCodeState(null)
        saveCommunityAccessCode(null)
      }
    }
  }, [])

  /**
   * @param {string} token
   * @param {{ id: number, email: string, name?: string | null, role: string, piso?: string | null, portal?: string | null }} userPayload
   * @param {{ piso?: string, portal?: string }} [opts]
   */
  const applyServerSession = useCallback((token, userPayload, opts) => {
    if (!VALID_ROLES.includes(userPayload.role)) return
    saveAccessToken(token)
    setAccessTokenState(token)
    const p = opts?.piso?.trim() || (userPayload.piso != null && String(userPayload.piso).trim()
      ? String(userPayload.piso).trim()
      : '')
    const po = opts?.portal?.trim() || (userPayload.portal != null && String(userPayload.portal).trim()
      ? String(userPayload.portal).trim()
      : '')
    const emailVal =
      userPayload.email != null && String(userPayload.email).trim()
        ? String(userPayload.email).trim()
        : ''
    const nameVal =
      userPayload.name?.trim() ||
      (emailVal ? emailVal.split('@')[0] : po && p ? `${po} · ${p}` : 'Vecino')
    setUser({
      id: userPayload.id,
      ...(emailVal ? { email: emailVal } : {}),
      name: nameVal,
      ...(p ? { piso: p } : {}),
      ...(po ? { portal: po } : {}),
    })
    setUserRoleState(userPayload.role)
    saveUserRole(userPayload.role)
  }, [])

  /** PATCH /me: envía solo las claves que quieras actualizar (piso y/o portal, no vacíos). */
  const saveResidentHomePatch = useCallback(async (fields) => {
    const token = accessToken
    if (!token) throw new Error('No hay sesión')
    const body = {}
    if (fields.piso != null) {
      const t = String(fields.piso).trim().slice(0, 64)
      if (t) body.piso = t
    }
    if (fields.portal != null) {
      const t = String(fields.portal).trim().slice(0, 64)
      if (t) body.portal = t
    }
    if (Object.keys(body).length === 0) {
      throw new Error('Indica piso o portal')
    }
    const res = await fetch(apiUrl('/api/auth/me'), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        [data.message, data.error].filter(Boolean).join(' ') || 'No se pudo guardar',
      )
    }
    const pisoVal =
      data.piso != null && String(data.piso).trim() ? String(data.piso).trim() : ''
    const portalVal =
      data.portal != null && String(data.portal).trim() ? String(data.portal).trim() : ''
    setUser((prev) =>
      prev
        ? {
            ...prev,
            ...(pisoVal ? { piso: pisoVal } : {}),
            ...(portalVal ? { portal: portalVal } : {}),
          }
        : {
            id: data.id,
            ...(data.email != null && String(data.email).trim()
              ? { email: String(data.email).trim() }
              : {}),
            name:
              data.name?.trim() ||
              (data.email != null && String(data.email).trim()
                ? String(data.email).split('@')[0]
                : portalVal && pisoVal
                  ? `${portalVal} · ${pisoVal}`
                  : 'Vecino'),
            ...(pisoVal ? { piso: pisoVal } : {}),
            ...(portalVal ? { portal: portalVal } : {}),
          },
    )
    return data
  }, [accessToken])

  const login = useCallback((email, password, role = 'resident', piso = '') => {
    if (!email?.trim() || !password) return false
    const r = VALID_ROLES.includes(role) ? role : 'resident'
    const p = piso?.trim() || null
    setUser({
      email: email.trim(),
      name: email.trim().split('@')[0],
      ...(p ? { piso: p } : {}),
    })
    setUserRoleState(r)
    saveUserRole(r)
    setAccessTokenState(null)
    saveAccessToken(null)
    return true
  }, [])

  const register = (name, email, password, piso = '') => {
    if (!name?.trim() || !email?.trim() || !password) return false
    const p = piso?.trim() || null
    setUser({
      name: name.trim(),
      email: email.trim(),
      ...(p ? { piso: p } : {}),
    })
    setUserRoleState('resident')
    saveUserRole('resident')
    setAccessTokenState(null)
    saveAccessToken(null)
    return true
  }

  const logout = useCallback(() => {
    setUser(null)
    setAccessTokenState(null)
    if (useSessionStore()) {
      clearIsolatedTabSession()
      setUserRoleState('resident')
      return
    }
    setUserRoleState('resident')
    saveUserRole('resident')
    saveAccessToken(null)
  }, [])

  const value = {
    community,
    communityId,
    communityAccessCode,
    setCommunity,
    user,
    userRole,
    accessToken,
    authReady,
    appNavFlags,
    appNavFlagsReady,
    login,
    applyServerSession,
    saveResidentHomePatch,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
