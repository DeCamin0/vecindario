import { Navigate } from 'react-router-dom'
import { useAuth, canAccessAdminPanel } from '../context/AuthContext'
import { getSignInPath } from '../utils/signInWebPath'

/** Super admin global o administrador de empresa prestador de servicios. */
export default function RequireAdminPanel({ children }) {
  const { userRole, user, authReady, accessToken } = useAuth()
  if (!authReady) return null

  if (!canAccessAdminPanel(userRole, user)) {
    return <Navigate to="/" replace />
  }

  if (!accessToken) {
    return <Navigate to={getSignInPath({ forceGeneric: true })} replace />
  }

  return children
}
