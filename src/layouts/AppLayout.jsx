import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ManagedCommunitySwitcher from '../components/ManagedCommunitySwitcher.jsx'
import { shouldShowManagedCommunitySwitcher } from '../utils/managedCommunitySwitcherUtils.js'
import AppNav from '../components/AppNav'
import NotificationsBell from '../components/NotificationsBell'
import DeveloperCredit from '../components/DeveloperCredit'
import { BRAND_LOGO_PNG } from '../syncBrandFavicon.js'
import './AppLayout.css'

export default function AppLayout() {
  const { community, userRole, managedCommunities } = useAuth()
  const showCommunitySwitcher = shouldShowManagedCommunitySwitcher(userRole, managedCommunities)

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="app-brand-link" aria-label="Vecindario - Inicio">
          <img src={BRAND_LOGO_PNG} alt="" className="app-brand-logo" />
          <span className="app-brand-name">Vecindario</span>
        </Link>
        <div className="app-header-right">
          <NotificationsBell />
          {showCommunitySwitcher ? (
            <ManagedCommunitySwitcher className="app-header-community app-header-community-select" />
          ) : (
            <span className="app-header-community" title={community || 'Comunidad no seleccionada'}>
              {community || 'Comunidad no seleccionada'}
            </span>
          )}
          <div className="app-nav-slot app-nav-slot--desktop">
            <AppNav id="main-nav-desktop" ariaLabel="Navegación principal" />
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <div className="app-nav-slot app-nav-slot--mobile">
        <AppNav id="main-nav-mobile" ariaLabel="Navegación principal" />
      </div>
      <footer className="app-footer">
        <DeveloperCredit />
      </footer>
    </div>
  )
}
