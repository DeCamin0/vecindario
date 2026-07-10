import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequirePaqueteriaKeyLoans({ children }) {
  const { appNavFlagsReady, paqueteriaKeyLoansEnabled } = useAuth()
  if (!appNavFlagsReady) {
    return (
      <div className="page-container">
        <p className="welcome-intro" style={{ marginTop: '2rem' }}>
          Cargando…
        </p>
      </div>
    )
  }
  if (!paqueteriaKeyLoansEnabled) {
    return <Navigate to="/paqueteria" replace />
  }
  return children
}
