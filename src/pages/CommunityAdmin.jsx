import { Link } from 'react-router-dom'
import ManagementStatsTiles from '../components/ManagementStatsTiles.jsx'
import {
  COMMUNITY_MGMT_NAV_DEFAULT,
  useCommunityManagementStats,
} from '../hooks/useCommunityManagementStats.js'
import { useAuth } from '../context/AuthContext'
import ManagedCommunitySwitcher from '../components/ManagedCommunitySwitcher.jsx'
import { shouldShowManagedCommunitySwitcher } from '../utils/managedCommunitySwitcherUtils.js'
import CommunityPoolSettingsSection from '../components/CommunityPoolSettingsSection.jsx'
import './Admin.css'
import './CommunityAdmin.css'

export default function CommunityAdmin() {
  const {
    appNavFlags,
    appNavFlagsReady,
    userRole,
    managedCommunities,
    accessToken,
    communityId,
  } = useAuth()
  const nav = appNavFlagsReady ? appNavFlags : COMMUNITY_MGMT_NAV_DEFAULT
  const showCommunitySwitcher = shouldShowManagedCommunitySwitcher(userRole, managedCommunities)

  const { overviewStats, overviewLoading, statDisplay } = useCommunityManagementStats(
    accessToken,
    communityId,
    nav,
  )

  return (
    <div className="community-admin-page">
      <header className="community-admin-header admin-header">
        <div className="admin-header-inner">
          <div className="community-admin-header-brand">
            <h1 className="community-admin-title">Panel de gestión</h1>
            <p className="community-admin-subtitle">
              Gestiona incidencias, reservas y actividad de tu comunidad
            </p>
            {showCommunitySwitcher ? (
              <div className="community-admin-community-switch">
                <span className="community-admin-community-switch-label">Comunidad activa</span>
                <ManagedCommunitySwitcher className="community-admin-community-select" />
              </div>
            ) : null}
          </div>
          <Link to="/" className="admin-back-link">
            Volver a la app
          </Link>
        </div>
      </header>

      <main className="community-admin-main admin-main page-container">
        <div className="community-admin-inner">
          <section className="community-admin-overview">
            <h2 className="community-admin-visually-hidden">Resumen</h2>
            <ManagementStatsTiles
              overviewStats={overviewStats}
              overviewLoading={overviewLoading}
              statDisplay={statDisplay}
              nav={nav}
            />
          </section>

          <section className="community-admin-section">
            <h2 className="community-admin-section-title">Accesos rápidos</h2>
            <p className="community-admin-section-intro">
              Gestiona incidencias, consulta reservas y aprueba solicitudes desde un solo lugar.
            </p>
            <div className="community-admin-actions">
              {nav.incidents ? (
                <Link to="/incidents" className="community-admin-action card">
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">⚠</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Incidencias</span>
                    <span className="community-admin-action-hint">Ver y cambiar estado</span>
                  </div>
                  <span className="community-admin-action-arrow" aria-hidden="true">→</span>
                </Link>
              ) : (
                <div
                  className="community-admin-action card community-admin-action--disabled"
                  aria-disabled="true"
                >
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">⚠</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Incidencias</span>
                    <span className="community-admin-action-hint">
                      Desactivado para esta comunidad (Super Admin)
                    </span>
                  </div>
                </div>
              )}
              {nav.bookings ? (
                <Link to="/bookings" className="community-admin-action card">
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">📅</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Reservas</span>
                    <span className="community-admin-action-hint">Ver reservas de la comunidad</span>
                  </div>
                  <span className="community-admin-action-arrow" aria-hidden="true">→</span>
                </Link>
              ) : (
                <div
                  className="community-admin-action card community-admin-action--disabled"
                  aria-disabled="true"
                >
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">📅</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Reservas</span>
                    <span className="community-admin-action-hint">
                      Desactivado para esta comunidad (Super Admin)
                    </span>
                  </div>
                </div>
              )}
              <Link to="/community-admin/vecinos" className="community-admin-action card">
                <span className="community-admin-action-icon-wrap" aria-hidden="true">👥</span>
                <div className="community-admin-action-body">
                  <span className="community-admin-action-label">Vecinos</span>
                  <span className="community-admin-action-hint">Dar de alta accesos (portal, piso, contraseña)</span>
                </div>
                <span className="community-admin-action-arrow" aria-hidden="true">→</span>
              </Link>
              <div
                className="community-admin-action card community-admin-action--disabled"
                aria-disabled="true"
              >
                <span className="community-admin-action-icon-wrap" aria-hidden="true">✓</span>
                <div className="community-admin-action-body">
                  <span className="community-admin-action-label">Aprobaciones</span>
                  <span className="community-admin-action-hint">Próximamente (presidente)</span>
                </div>
                <span className="community-admin-action-badge">Próximamente</span>
              </div>
            </div>
          </section>

          <CommunityPoolSettingsSection />
        </div>
      </main>
    </div>
  )
}
