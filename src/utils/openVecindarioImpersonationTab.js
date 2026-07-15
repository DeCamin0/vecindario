import { VEC_IMPERSONATE_CHILD_READY, VEC_IMPERSONATE_PAYLOAD } from '../context/AuthContext.jsx'

/**
 * Nueva pestaña con sesión aislada (sessionStorage): el hijo pide el JWT al opener vía postMessage.
 * @param {{ accessToken: string, user: object, community?: object, company?: object, accessCodeFallback?: string, relativePath?: string }} params
 */
export function openVecindarioImpersonationTab(params) {
  const {
    accessToken: token,
    user,
    community,
    company,
    accessCodeFallback = '',
    relativePath,
  } = params
  if (!token || !user) {
    throw new Error('Respuesta incompleta del servidor')
  }
  const isCompanyAdmin = user.role === 'company_admin'
  const isServiceProviderAdmin =
    isCompanyAdmin &&
    (company?.scopedSuperAdmin === true || company?.kind === 'prestacion_servicios')
  const manageCommunity =
    Boolean(community?.name) &&
    (relativePath === 'community-admin' || String(relativePath || '').includes('community-admin'))
  const rel =
    relativePath ||
    (isCompanyAdmin && !manageCommunity
      ? isServiceProviderAdmin
        ? 'admin'
        : 'company-admin'
      : 'community-admin')
  if (isCompanyAdmin && !manageCommunity) {
    if (!company?.name) {
      throw new Error('Respuesta incompleta del servidor')
    }
  } else if (!community?.name) {
    throw new Error('Respuesta incompleta del servidor')
  }
  const code = String(community?.accessCode || accessCodeFallback || '').trim()
  const nonce = crypto.randomUUID()
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const seg = String(rel).replace(/^\//, '')
  const path = `${base}/${seg}`.replace(/\/+/g, '/')
  const pathname = path.startsWith('/') ? path : `/${path}`
  const targetUrl = new URL(pathname, window.location.origin)
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
    if (!ev.data || ev.data.type !== VEC_IMPERSONATE_CHILD_READY || ev.data.nonce !== nonce) {
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
            ...(isCompanyAdmin && !manageCommunity
              ? {
                  company: {
                    id: company.id,
                    name: company.name,
                    ...(company.kind ? { kind: company.kind } : {}),
                    ...(company.scopedSuperAdmin === true ||
                    company.kind === 'prestacion_servicios'
                      ? { scopedSuperAdmin: true }
                      : {}),
                  },
                }
              : {
                  community: {
                    id: community.id,
                    name: community.name,
                    accessCode: code,
                  },
                }),
          },
        },
        origin,
      )
    }
  }

  window.addEventListener('message', onMessage)
  const timer = setTimeout(cleanup, 180_000)

  const win = window.open(targetUrl.toString(), '_blank')
  if (!win) {
    cleanup()
    throw new Error(
      'El navegador bloqueó la ventana nueva. Permite ventanas emergentes para este sitio e inténtalo de nuevo.',
    )
  }
}
