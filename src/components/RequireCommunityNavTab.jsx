import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Redirige a inicio si la comunidad tiene desactivada la pestaña (todos los roles).
 */
export default function RequireCommunityNavTab({ tab, children }) {
  const { appNavFlags, appNavFlagsReady, userRole, cuadernoDiarioAccess, cuadernoDiarioAccessReady } =
    useAuth()
  const location = useLocation()
  if (!appNavFlagsReady) {
    return (
      <div className="page-container">
        <p className="welcome-intro" style={{ marginTop: '2rem' }}>
          Cargando…
        </p>
      </div>
    )
  }
  if (tab === 'cuadernoDiario') {
    if (!appNavFlagsReady || !appNavFlags.cuadernoDiario || !cuadernoDiarioAccessReady) {
      return (
        <div className="page-container">
          <p className="welcome-intro" style={{ marginTop: '2rem' }}>
            Cargando…
          </p>
        </div>
      )
    }
    if (cuadernoDiarioAccess === 'none') {
      return <Navigate to="/" replace />
    }
    return children
  }
  if (!appNavFlags[tab]) {
    return <Navigate to="/" replace />
  }
  if (tab === 'services' && userRole === 'community_admin') {
    const onCommunityServicesOverview = location.pathname.startsWith('/community-admin/servicios')
    if (!onCommunityServicesOverview) {
      return <Navigate to="/community-admin/servicios" replace />
    }
  }
  return children
}
