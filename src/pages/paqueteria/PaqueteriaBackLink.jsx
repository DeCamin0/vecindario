import { Link } from 'react-router-dom'
import './paqueteria.css'

/**
 * Enlace «atrás» con estilo de chip (no enlace azul subrayado por defecto).
 */
export default function PaqueteriaBackLink({ to = '/paqueteria', label = 'Volver a la lista' }) {
  return (
    <div className="pq-back-row">
      <Link to={to} className="pq-back-link">
        <svg
          className="pq-back-chevron"
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{label}</span>
      </Link>
    </div>
  )
}
