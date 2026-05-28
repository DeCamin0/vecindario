import { Link } from 'react-router-dom'
import ManagementStatsTiles from '../components/ManagementStatsTiles.jsx'
import {
  COMMUNITY_MGMT_NAV_DEFAULT,
  useCommunityManagementStats,
} from '../hooks/useCommunityManagementStats.js'
import { useAuth, canManageResidentsAlta, canViewCommunityResidents } from '../context/AuthContext'
import ManagedCommunitySwitcher from '../components/ManagedCommunitySwitcher.jsx'
import { shouldShowManagedCommunitySwitcher } from '../utils/managedCommunitySwitcherUtils.js'
import CommunityPoolSettingsSection from '../components/CommunityPoolSettingsSection.jsx'
import CommunityManagementFichaSection from '../components/CommunityManagementFichaSection.jsx'
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
    communityName,
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
              {userRole === 'company_admin' && communityName ? (
                <>
                  <strong>{communityName}</strong>
                  {' · '}
                  Gestión como administrador de empresa (incidencias, reservas, vecinos…)
                </>
              ) : (
                'Gestiona incidencias, reservas y actividad de tu comunidad'
              )}
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
              Gestiona incidencias, consulta reservas y revisa qué servicios piden los vecinos a De Camino.
            </p>
            <div className="community-admin-actions">
              {nav.services ? (
                <Link to="/community-admin/servicios" className="community-admin-action card">
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">🔧</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Servicios (vecinos)</span>
                    <span className="community-admin-action-hint">
                      Solo consulta — presupuestos los gestiona De Camino
                    </span>
                  </div>
                  <span className="community-admin-action-arrow" aria-hidden="true">→</span>
                </Link>
              ) : (
                <div
                  className="community-admin-action card community-admin-action--disabled"
                  aria-disabled="true"
                >
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">🔧</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Servicios (vecinos)</span>
                    <span className="community-admin-action-hint">
                      Desactivado para esta comunidad (Super Admin)
                    </span>
                  </div>
                </div>
              )}
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
              {nav.cuadernoDiario ? (
                <Link to="/cuaderno-diario" className="community-admin-action card">
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">📔</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Cuaderno diario</span>
                    <span className="community-admin-action-hint">
                      {userRole === 'concierge'
                        ? 'Anotaciones del día en conserjería'
                        : 'Consulta lo registrado por el conserje (junta y administración)'}
                    </span>
                  </div>
                  <span className="community-admin-action-arrow" aria-hidden="true">→</span>
                </Link>
              ) : (
                <div
                  className="community-admin-action card community-admin-action--disabled"
                  aria-disabled="true"
                >
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">📔</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Cuaderno diario</span>
                    <span className="community-admin-action-hint">
                      Desactivado para esta comunidad (Super Admin)
                    </span>
                  </div>
                </div>
              )}
              {nav.paqueteria ? (
                <Link to="/paqueteria" className="community-admin-action card">
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">📦</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Paquetería</span>
                    <span className="community-admin-action-hint">
                      {userRole === 'community_admin'
                        ? 'Solo consulta — registra y entrega el conserje'
                        : 'Paquetes en conserjería y recogidas'}
                    </span>
                  </div>
                  <span className="community-admin-action-arrow" aria-hidden="true">→</span>
                </Link>
              ) : (
                <div
                  className="community-admin-action card community-admin-action--disabled"
                  aria-disabled="true"
                >
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">📦</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Paquetería</span>
                    <span className="community-admin-action-hint">
                      Desactivado para esta comunidad (Super Admin)
                    </span>
                  </div>
                </div>
              )}
              {canViewCommunityResidents(userRole) ? (
                <Link to="/community-admin/vecinos" className="community-admin-action card">
                  <span className="community-admin-action-icon-wrap" aria-hidden="true">👥</span>
                  <div className="community-admin-action-body">
                    <span className="community-admin-action-label">Vecinos</span>
                    <span className="community-admin-action-hint">
                      {canManageResidentsAlta(userRole)
                        ? 'Dar de alta accesos (portal, piso, contraseña)'
                        : userRole === 'community_admin'
                          ? 'Solo consulta — las cuentas se crean en Super Admin'
                          : userRole === 'president'
                            ? 'Lista, junta y piscina — sin crear cuentas nuevas'
                            : 'Consultar vecinos (portal, piso, puerta)'}
                    </span>
                  </div>
                  <span className="community-admin-action-arrow" aria-hidden="true">→</span>
                </Link>
              ) : null}
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

          {nav.poolAccess ? (
            <CommunityPoolSettingsSection />
          ) : (
            <CommunityManagementFichaSection />
          )}
        </div>
      </main>
    </div>
  )
}
