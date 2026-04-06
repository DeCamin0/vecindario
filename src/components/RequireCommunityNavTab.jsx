import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Redirige a inicio si la comunidad tiene desactivada la pestaña (todos los roles).
 */
export default function RequireCommunityNavTab({ tab, children }) {
  const { appNavFlags, appNavFlagsReady } = useAuth()
  if (!appNavFlagsReady) {
    return (
      <div className="page-container">
        <p className="welcome-intro" style={{ marginTop: '2rem' }}>
          Cargando…
        </p>
      </div>
    )
  }
  if (!appNavFlags[tab]) {
    return <Navigate to="/" replace />
  }
  return children
}
