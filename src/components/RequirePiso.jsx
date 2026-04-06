import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, roleRequiresPiso, hasResidentHomeComplete } from '../context/AuthContext'

/**
 * Bloquea acceso a la app (vecino / presidente) sin JWT o sin piso + portal en cuenta (campos separados).
 */
export default function RequirePiso({ children }) {
  const { authReady, userRole, user, accessToken } = useAuth()
  const location = useLocation()

  if (!authReady) return null

  if (!roleRequiresPiso(userRole)) {
    return children
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!hasResidentHomeComplete(user)) {
    return <Navigate to="/completar-piso" replace state={{ from: location.pathname }} />
  }

  return children
}
