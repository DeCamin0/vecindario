import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Bloquea la ruta si la comunidad no tiene activada la entrega especial en paquetería. */
export default function RequirePaqueteriaSpecialDelivery({ children }) {
  const { appNavFlagsReady, paqueteriaSpecialDeliveryEnabled } = useAuth()
  if (!appNavFlagsReady) {
    return (
      <div className="page-container">
        <p className="welcome-intro" style={{ marginTop: '2rem' }}>
          Cargando…
        </p>
      </div>
    )
  }
  if (!paqueteriaSpecialDeliveryEnabled) {
    return <Navigate to="/paqueteria" replace />
  }
  return children
}
