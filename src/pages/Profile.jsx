import { Link, useNavigate } from 'react-router-dom'
import { useAuth, canManageResidentsAlta, canViewCommunityResidents } from '../context/AuthContext'
import ProfileAvatarEditor from '../components/ProfileAvatarEditor.jsx'
import { APP_VERSION } from '../config/version'
import { getSignInPath } from '../utils/signInWebPath'
import { PROFILE_ROLE_LABELS } from '../utils/userFromMeResponse.js'
import './Profile.css'

const menuItems = [
  { to: '/profile/mis-datos', label: 'Mis datos', icon: '👤' },
  { to: '/profile/cambiar-contrasena', label: 'Cambiar contraseña', icon: '🔒' },
  { to: '/profile/notificaciones', label: 'Notificaciones', icon: '🔔' },
  { to: '/profile/ayuda', label: 'Ayuda', icon: '❓' },
  { to: '/privacy', label: 'Privacidad y términos', icon: '📄' },
]

export default function Profile() {
  const navigate = useNavigate()
  const { user, community, logout, userRole, communityId, accessToken, setProfileImageUrl } =
    useAuth()
  const displayName = user?.name ?? 'Vecino'
  const roleLabel = PROFILE_ROLE_LABELS[userRole] || userRole

  const handleLogout = () => {
    logout()
    navigate(getSignInPath(), { replace: true })
  }

  return (
    <div className="page-container profile-page">
      <header className="page-header">
        <h1 className="page-title">Perfil</h1>
        <p className="page-subtitle">Tu cuenta y preferencias en Vecindario{community ? ` · ${community}` : ''}.</p>
      </header>

      <section className="user-card card">
        <ProfileAvatarEditor
          accessToken={accessToken}
          displayName={displayName}
          profileImageUrl={user?.profileImageUrl}
          onImageChange={setProfileImageUrl}
        >
          <h2 className="user-name">{displayName}</h2>
          <span className="user-role-badge">{roleLabel}</span>
        </ProfileAvatarEditor>
        <dl className="profile-user-fields">
          <div className="profile-field profile-field--wide">
            <dt>Correo</dt>
            <dd>{user?.email?.trim() || 'Sin correo en la cuenta'}</dd>
          </div>
          {user?.phone?.trim() ? (
            <div className="profile-field">
              <dt>Teléfono</dt>
              <dd>{user.phone.trim()}</dd>
            </div>
          ) : null}
          {user?.portal?.trim() || user?.piso?.trim() || user?.puerta?.trim() ? (
            <div className="profile-dwelling">
              {user?.portal?.trim() ? (
                <div className="profile-field profile-field--compact">
                  <dt>Portal</dt>
                  <dd>{user.portal.trim()}</dd>
                </div>
              ) : null}
              {user?.piso?.trim() ? (
                <div className="profile-field profile-field--compact">
                  <dt>Piso</dt>
                  <dd>{user.piso.trim()}</dd>
                </div>
              ) : null}
              {user?.puerta?.trim() ? (
                <div className="profile-field profile-field--compact">
                  <dt>Puerta</dt>
                  <dd>{user.puerta.trim()}</dd>
                </div>
              ) : null}
            </div>
          ) : null}
        </dl>
      </section>

      <section className="profile-menu">
        <h3 className="section-label">Cuenta</h3>
        <div className="card menu-list">
          {canViewCommunityResidents(userRole) && communityId != null ? (
            <Link to="/community-admin/vecinos" className="menu-item menu-item--accent">
              <span className="menu-icon" aria-hidden="true">👥</span>
              <span className="menu-label">
                {canManageResidentsAlta(userRole) ? 'Alta de vecinos' : 'Lista de vecinos'}
              </span>
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
