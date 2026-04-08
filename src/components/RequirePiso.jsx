import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, roleRequiresPiso, hasResidentHomeComplete } from '../context/AuthContext'
import { getSignInPath } from '../utils/signInWebPath'

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
    return (
      <Navigate
        to={getSignInPath()}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  if (!hasResidentHomeComplete(user)) {
    return <Navigate to="/completar-piso" replace state={{ from: location.pathname }} />
  }

  return children
}
