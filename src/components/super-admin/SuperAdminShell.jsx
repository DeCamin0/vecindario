/**
 * Super Admin — shell visual (V1) + navegación sidebar (V2).
 * No contiene fetch/state de negocio.
 */
import { Link } from 'react-router-dom'
import { BRAND_LOGO_PNG } from '../../syncBrandFavicon.js'
import { SA_SECTION_TITLES } from './superAdminNav.js'
import './SuperAdminShell.css'

/**
 * @param {{
 *   title?: string
 *   subtitle?: string
 *   badgeLabel: string
 *   isCompanyScoped?: boolean
 *   headerActions?: import('react').ReactNode
 *   navItems?: import('./superAdminNav.js').SaNavItem[]
 *   activeNavId?: string
 *   onSectionSelect?: (sectionId: string) => void
 *   children: import('react').ReactNode
 * }} props
 */
export default function SuperAdminShell({
  title,
  subtitle,
  badgeLabel,
  isCompanyScoped = false,
  headerActions = null,
  navItems = [],
  activeNavId = 'inicio',
  onSectionSelect,
  children,
}) {
  const meta = SA_SECTION_TITLES[activeNavId]
  const resolvedTitle = title || meta?.title || 'Panel'
  const resolvedSubtitle = subtitle ?? meta?.subtitle ?? ''

  return (
    <div className="sa-shell admin-dashboard">
      <div className="sa-shell__layout">
        <aside className="sa-shell__sidebar" aria-label="Navegación Super Admin">
          <div className="sa-shell__sidebar-inner">
            <div className="sa-shell__brand-mark" title="Vecindario">
              <img
                src={BRAND_LOGO_PNG}
                alt=""
                className="sa-shell__brand-logo"
                width={28}
                height={28}
              />
              <span className="sa-shell__brand-text">Vecindario</span>
            </div>

            <nav className="sa-shell__nav" aria-label="Secciones">
              <ul className="sa-shell__nav-list">
                {navItems.map((item) => {
                  const isActive = item.id === activeNavId
                  const className = `sa-shell__nav-item${isActive ? ' is-active' : ''}`
                  const useInPageSection = item.kind === 'section' && typeof onSectionSelect === 'function'
                  if (!useInPageSection && item.to) {
                    return (
                      <li key={item.id}>
                        <Link to={item.to} className={className} aria-current={isActive ? 'page' : undefined}>
                          <span className="sa-shell__nav-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="sa-shell__nav-label">{item.label}</span>
                        </Link>
                      </li>
                    )
                  }
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={className}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onSectionSelect?.(item.id)}
                      >
                        <span className="sa-shell__nav-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="sa-shell__nav-label">{item.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="sa-shell__sidebar-footer">
              <Link to="/" className="sa-shell__sidebar-link">
                Volver a la app vecinos
              </Link>
            </div>
          </div>
        </aside>

        <div className="sa-shell__column">
          <header className="sa-shell__header admin-dashboard-header">
            <div className="admin-dashboard-header-inner sa-shell__header-inner">
              <div className="admin-dashboard-brand">
                <h1 className="admin-dashboard-title">{resolvedTitle}</h1>
                {resolvedSubtitle ? (
                  <p className="admin-dashboard-subtitle">{resolvedSubtitle}</p>
                ) : null}
              </div>
              <div className="admin-dashboard-header-actions">
                <span
                  className={`admin-badge${isCompanyScoped ? ' admin-badge--company' : ''}`}
                  aria-label={isCompanyScoped ? 'Empresa prestadora' : 'Super administrador'}
                >
                  {badgeLabel}
                </span>
                {headerActions}
              </div>
            </div>
          </header>

          {navItems.length > 0 ? (
            <div className="sa-shell__mobile-nav-wrap">
              <div className="sa-shell__mobile-nav" aria-label="Secciones">
                {navItems.map((item) => {
                  const isActive = item.id === activeNavId
                  const className = `sa-shell__nav-item${isActive ? ' is-active' : ''}`
                  const useInPageSection = item.kind === 'section' && typeof onSectionSelect === 'function'
                  if (!useInPageSection && item.to) {
                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        className={className}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className="sa-shell__nav-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="sa-shell__nav-label">{item.label}</span>
                      </Link>
                    )
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={className}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onSectionSelect?.(item.id)}
                    >
                      <span className="sa-shell__nav-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="sa-shell__nav-label">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </div>
  )
}
