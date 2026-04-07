import { VEC_IMPERSONATE_CHILD_READY, VEC_IMPERSONATE_PAYLOAD } from '../context/AuthContext.jsx'

/**
 * Nueva pestaña con sesión aislada (sessionStorage): el hijo pide el JWT al opener vía postMessage.
 * @param {{ accessToken: string, user: object, community: object, accessCodeFallback?: string, relativePath?: string }} params
 */
export function openVecindarioImpersonationTab(params) {
  const {
    accessToken: token,
    user,
    community,
    accessCodeFallback = '',
    relativePath = 'community-admin',
  } = params
  if (!token || !user || !community?.name) {
    throw new Error('Respuesta incompleta del servidor')
  }
  const code = String(community.accessCode || accessCodeFallback || '').trim()
  const nonce = crypto.randomUUID()
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const seg = String(relativePath || 'community-admin').replace(/^\//, '')
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

  const win = window.open(targetUrl.toString(), '_blank')
  if (!win) {
    cleanup()
    throw new Error(
      'El navegador bloqueó la ventana nueva. Permite ventanas emergentes para este sitio e inténtalo de nuevo.',
    )
  }
}
