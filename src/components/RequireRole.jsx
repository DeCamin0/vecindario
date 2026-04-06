import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Renders children only if the current user has one of the required roles.
 * role: string or string[] (e.g. role="super_admin" or role={['community_admin', 'president']}).
 */
export default function RequireRole({ role, children }) {
  const { userRole, authReady, accessToken } = useAuth()
  if (!authReady) return null

  const allowed = Array.isArray(role) ? role.includes(userRole) : userRole === role

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  const needsJwt =
    role === 'super_admin' || (Array.isArray(role) && role.includes('super_admin'))
  if (needsJwt && !accessToken) {
    return <Navigate to="/login" replace />
  }

  return children
}
