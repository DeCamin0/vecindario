import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP_VERSION } from '../config/version'
import './Profile.css'

const menuItems = [
  { to: '/', label: 'Mis datos', icon: '👤' },
  { to: '/', label: 'Notificaciones', icon: '🔔' },
  { to: '/', label: 'Ayuda', icon: '❓' },
  { to: '/', label: 'Privacidad y términos', icon: '📄' },
]

export default function Profile() {
  const navigate = useNavigate()
  const { user, community, logout, userRole, communityId } = useAuth()
  const displayName = user?.name ?? 'Vecino'
  const displayEmail = user?.email?.trim()
    ? user.email.trim()
    : user?.portal && user?.piso
      ? `Acceso: portal ${user.portal.trim()} · ${user.piso.trim()}`
      : 'Sin correo en la cuenta'
  const initial = (displayName || 'V').charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-container profile-page">
      <header className="page-header">
        <h1 className="page-title">Perfil</h1>
        <p className="page-subtitle">Tu cuenta y preferencias en Vecindario{community ? ` · ${community}` : ''}.</p>
      </header>

      <section className="user-card card">
        <div className="user-avatar" aria-hidden="true">
          <span className="user-avatar-inner">{initial}</span>
        </div>
        <div className="user-info">
          <h2 className="user-name">{displayName}</h2>
          <p className="user-email">{displayEmail}</p>
          {user?.portal?.trim() ? (
            <p className="user-email">Portal: {user.portal.trim()}</p>
          ) : null}
          {user?.piso?.trim() ? (
            <p className="user-email">Piso / puerta: {user.piso.trim()}</p>
          ) : null}
        </div>
      </section>

      <section className="profile-menu">
        <h3 className="section-label">Cuenta</h3>
        <div className="card menu-list">
          {userRole === 'concierge' && communityId != null ? (
            <Link to="/community-admin/vecinos" className="menu-item menu-item--accent">
              <span className="menu-icon" aria-hidden="true">👥</span>
              <span className="menu-label">Añadir vecinos</span>
              <span className="menu-chevron" aria-hidden="true">›</span>
            </Link>
          ) : null}
          {menuItems.map(({ to, label, icon }) => (
            <Link key={label} to={to} className="menu-item">
              <span className="menu-icon" aria-hidden="true">{icon}</span>
              <span className="menu-label">{label}</span>
              <span className="menu-chevron" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="profile-logout">
        <button type="button" className="btn btn--ghost btn--block" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      <p className="profile-version">Versión {APP_VERSION}</p>
    </div>
  )
}
