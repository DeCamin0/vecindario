import { Link } from 'react-router-dom'
import { getManagementStatTo, OVERVIEW_DEFS } from '../hooks/useCommunityManagementStats.js'

function rawForStat(statKey, overviewStats) {
  if (statKey === 'incidents') {
    const p = overviewStats.incidentsPendiente
    const r = overviewStats.incidentsResuelta
    if (p === null || r === null) return null
    return p + r
  }
  if (statKey === 'pendingActions') {
    return overviewStats.incidentsPendiente
  }
  if (statKey === 'bookings') return overviewStats.bookingsToday
  if (statKey === 'incidentsResolved') return overviewStats.incidentsResuelta
  return null
}

export default function ManagementStatsTiles({
  overviewStats,
  overviewLoading,
  statDisplay,
  nav,
  statsClassName = 'community-admin-stats',
  interactive = true,
}) {
  return (
    <div className={statsClassName} aria-busy={overviewLoading}>
      {OVERVIEW_DEFS.map((stat) => {
        const raw = rawForStat(stat.key, overviewStats)
        const value = statDisplay(stat.navKey, raw)
        const to = interactive ? getManagementStatTo(stat.key, nav) : null
        const className = `community-admin-stat card ${stat.accent ? 'community-admin-stat--accent' : ''}${
          to ? ' community-admin-stat--link' : ''
        }`

        const body = (
          <>
            <div className="community-admin-stat-top">
              <span className="community-admin-stat-icon" aria-hidden="true">
                {stat.icon}
              </span>
              <span className="community-admin-stat-label">{stat.label}</span>
            </div>
            <span className="community-admin-stat-value">{value}</span>
          </>
        )

        if (to) {
          return (
            <Link key={stat.key} to={to} className={className}>
              {body}
            </Link>
          )
        }

        return (
          <div key={stat.key} className={className}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
