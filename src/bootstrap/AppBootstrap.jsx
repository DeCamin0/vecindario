import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { readLaunchContext } from './readLaunchContext'
import { resolveInitialRoute } from './resolveInitialRoute'
import { setLastLoginSlug } from '../utils/lastLoginSlug.js'

/**
 * Punto único de entrada PWA (start_url /app). Solo rutación web; no abre app nativa.
 */
export default function AppBootstrap() {
  const navigate = useNavigate()
  const { authReady, accessToken } = useAuth()
  const ranRef = useRef(false)

  useEffect(() => {
    if (!authReady) return
    if (ranRef.current) return
    ranRef.current = true

    const launch = readLaunchContext(typeof window !== 'undefined' ? window : null)
    const hasToken = Boolean(accessToken)

    if (launch.slugFromQuery) {
      setLastLoginSlug(launch.slugFromQuery)
    }

    const { to, replace } = resolveInitialRoute(launch, hasToken)
    navigate(to, { replace })
  }, [authReady, accessToken, navigate])

  if (!authReady) {
    return (
      <div className="app-bootstrap-loading" aria-busy="true" aria-live="polite">
        <p className="app-bootstrap-loading__text">Cargando…</p>
      </div>
    )
  }

  return null
}
