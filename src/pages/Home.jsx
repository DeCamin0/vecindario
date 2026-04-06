import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { SERVICE_STATUS_LABELS } from '../constants/serviceRequests.js'
import { formatBookingMeta, mapActivityApiItem } from '../utils/bookingDisplay'
import './Home.css'

const ROLE_LABEL_ES = {
  resident: 'Residente',
  community_admin: 'Administrador',
  president: 'Presidente',
  super_admin: 'Super administrador',
  concierge: 'Conserje',
}

function firstQuickLink(flags) {
  if (flags.services) return '/services'
  if (flags.incidents) return '/incidents'
  if (flags.bookings) return '/bookings'
  return '/'
}

function hasActivityPage(flags) {
  return flags.services || flags.incidents || flags.bookings
}

function shortLine(text, max = 96) {
  if (!text || !String(text).trim()) return '—'
  const t = String(text).trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function formatRecentTime(isoDate) {
  const date = new Date(isoDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today - date) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays > 0 && diffDays <= 7) return `Hace ${diffDays} días`
  if (diffDays > 7 && diffDays <= 14) return 'Hace 1 semana'
  const future = date > today
  const futureDays = Math.round((date - today) / (1000 * 60 * 60 * 24))
  if (future && futureDays === 1) return 'Mañana'
  if (future && futureDays <= 7) return `En ${futureDays} días`
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const HOME_NAV_DEFAULT = { services: true, incidents: true, bookings: true }

const STATUS_LABELS_ES = {
  Pending: 'Pendiente',
  'In progress': 'En curso',
  Completed: 'Completado',
  Reported: 'Reportado',
  Resolved: 'Resuelta',
  pendiente: 'Pendiente',
  resuelta: 'Resuelta',
}

export default function Home() {
  const { community, user, userRole, appNavFlags, appNavFlagsReady, accessToken, communityId } =
    useAuth()
  const [serverActivityItems, setServerActivityItems] = useState([])
  const [serverIncidents, setServerIncidents] = useState([])
  const [serverServices, setServerServices] = useState([])
  const roleLabel = ROLE_LABEL_ES[userRole] ?? userRole
  const pisoLabel = user?.piso?.trim() || null
  const portalLabel = user?.portal?.trim() || null
  const navFlags = appNavFlagsReady ? appNavFlags : HOME_NAV_DEFAULT
  const showActivityLinks = !appNavFlagsReady || hasActivityPage(navFlags)

  const allActions = [
    {
      to: '/services',
      title: 'Solicitar servicio',
      description: 'Fontanería, limpieza, electricidad y más',
      icon: 'services',
      color: 'primary',
      navKey: 'services',
    },
    {
      to: '/incidents',
      title: 'Reportar incidencia',
      description: 'Averías, desperfectos o problemas en zonas comunes',
      icon: 'incidents',
      color: 'accent',
      navKey: 'incidents',
    },
    {
      to: '/bookings',
      title: 'Reservar espacio',
      description: 'Pistas, salón de actos, trasteros',
      icon: 'bookings',
      color: 'bookings',
      navKey: 'bookings',
    },
  ]
  const actions = allActions.filter((a) => navFlags[a.navKey])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!accessToken || communityId == null || !navFlags.bookings) {
        await Promise.resolve()
        if (!cancelled) setServerActivityItems([])
        return
      }
      try {
        const res = await fetch(apiUrl(`/api/bookings/activity?communityId=${communityId}`), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled) {
          if (!res.ok || !Array.isArray(data.items)) setServerActivityItems([])
          else setServerActivityItems(data.items.slice(0, 40))
        }
      } catch {
        if (!cancelled) setServerActivityItems([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [accessToken, communityId, navFlags.bookings])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!accessToken || communityId == null || !navFlags.incidents) {
        if (!cancelled) setServerIncidents([])
        return
      }
      try {
        const res = await fetch(apiUrl(`/api/incidents?communityId=${communityId}`), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json().catch(() => [])
        if (!cancelled) {
          setServerIncidents(res.ok && Array.isArray(data) ? data.slice(0, 30) : [])
        }
      } catch {
        if (!cancelled) setServerIncidents([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [accessToken, communityId, navFlags.incidents])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!accessToken || communityId == null || !navFlags.services) {
        if (!cancelled) setServerServices([])
        return
      }
      try {
        const res = await fetch(apiUrl(`/api/services/my?communityId=${communityId}`), {
          headers: jsonAuthHeaders(accessToken),
        })
        const data = await res.json().catch(() => [])
        if (!cancelled) {
          setServerServices(res.ok && Array.isArray(data) ? data.slice(0, 20) : [])
        }
      } catch {
        if (!cancelled) setServerServices([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [accessToken, communityId, navFlags.services])

  const recentActivity = useMemo(() => {
    const fromLocal = [
      ...(navFlags.services
        ? serverServices.map((s) => ({
            id: `svc-${s.id}`,
            text: `${s.categoryLabel} — ${SERVICE_STATUS_LABELS[s.status] ?? s.status}`,
            time: formatRecentTime(s.createdAt),
            type: 'service',
            sortDate: s.createdAt,
          }))
        : []),
      ...(navFlags.incidents
        ? serverIncidents.map((i) => ({
            id: `in-api-${i.id}`,
            text: `${i.categoryLabel ?? i.categoryId} — ${STATUS_LABELS_ES[i.status] ?? i.status}`,
            time: formatRecentTime(i.createdAt),
            type: 'incident',
            sortDate: i.createdAt,
          }))
        : []),
    ]
    const fromServer =
      navFlags.bookings && serverActivityItems.length > 0
        ? serverActivityItems.map((row) => {
            const mapped = mapActivityApiItem(row)
            const sortDate = mapped.recordedAt || `${mapped.date}T12:00:00`
            return {
              id: mapped.id,
              text: shortLine(formatBookingMeta(mapped)),
              time: formatRecentTime(sortDate),
              type: row.kind === 'gym_access' ? 'gym' : 'booking',
              sortDate,
            }
          })
        : []
    return [...fromLocal, ...fromServer]
      .sort((a, b) => Date.parse(b.sortDate) - Date.parse(a.sortDate))
      .slice(0, 5)
  }, [
    navFlags.services,
    navFlags.incidents,
    navFlags.bookings,
    serverServices,
    serverIncidents,
    serverActivityItems,
  ])

  return (
    <div className="page-container home-page">
      <section className="welcome-section">
        <h1 className="welcome-title">Bienvenido a Vecindario</h1>
        <p className="welcome-community">
          {community ? (
            <>
              Estás en:{' '}
              <span className="welcome-community-pill">
                <span className="welcome-community-name">{community}</span>
              </span>
            </>
          ) : (
            <span className="welcome-community-fallback">Comunidad no seleccionada</span>
          )}
        </p>
        <ul className="welcome-session-meta" aria-label="Tu sesión">
          <li className="welcome-meta-chip">
            <span className="welcome-meta-key">Rol</span>
            <span className="welcome-meta-value">{roleLabel}</span>
          </li>
          {portalLabel ? (
            <li className="welcome-meta-chip">
              <span className="welcome-meta-key">Portal</span>
              <span className="welcome-meta-value">{portalLabel}</span>
            </li>
          ) : null}
          {pisoLabel ? (
            <li className="welcome-meta-chip">
              <span className="welcome-meta-key">Piso / puerta</span>
              <span className="welcome-meta-value">{pisoLabel}</span>
            </li>
          ) : null}
        </ul>
        <p className="welcome-intro">
          {navFlags.services && navFlags.incidents && navFlags.bookings
            ? 'Gestiona servicios, reporta incidencias y reserva espacios en tu comunidad.'
            : 'Accede a las funciones activadas para tu comunidad desde el menú o las acciones de abajo.'}
        </p>
        <p className="welcome-subtitle">¿Qué necesitas hacer hoy?</p>
      </section>

      <section className="actions-section home-actions-section" aria-labelledby="home-actions-heading">
        <h3 id="home-actions-heading" className="section-label home-actions-heading">
          Acciones rápidas
        </h3>
        <div className="action-cards">
          {actions.length === 0 ? (
            <p className="welcome-intro" style={{ gridColumn: '1 / -1' }}>
              No hay acciones rápidas activas para esta comunidad.
              {showActivityLinks ? ' Usa «Mi actividad» o el menú inferior.' : ' Consulta con la administración.'}
            </p>
          ) : (
            actions.map(({ to, title, description, icon, color }) => (
              <Link key={to} to={to} className={`action-card action-card--${color}`}>
                <span className="action-card-glow" aria-hidden="true" />
                <span className={`action-card-icon action-card-icon--${icon}`} aria-hidden="true">
                  {icon === 'services' && '🔧'}
                  {icon === 'incidents' && '⚠️'}
                  {icon === 'bookings' && '📅'}
                </span>
                <div className="action-card-content">
                  <span className="action-card-title">{title}</span>
                  <span className="action-card-desc">{description}</span>
                </div>
                <span className="action-card-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-header">
          <h3 className="section-label">Actividad reciente</h3>
          {showActivityLinks ? (
            <Link to="/activity" className="section-link">
              Ver todo
            </Link>
          ) : null}
        </div>
        <div className="card recent-list">
          {recentActivity.length === 0 ? (
            <div className="recent-empty">
              <p className="recent-empty-text">Aún no hay actividad reciente.</p>
              <p className="recent-empty-hint home-recent-hint">
                Reservas, gimnasio e incidencias (con sesión iniciada) se sincronizan con el servidor.
                Las solicitudes de servicio siguen siendo locales en este dispositivo.
              </p>
              <Link to={firstQuickLink(navFlags)} className="section-link">
                {hasActivityPage(navFlags) || !appNavFlagsReady
                  ? 'Ir a la primera opción disponible'
                  : 'Volver al inicio'}
              </Link>
            </div>
          ) : recentActivity.map(({ id, text, time, type }) => (
            <div key={id} className="recent-item">
              <span className={`recent-badge recent-badge--${type}`}>
                {type === 'booking'
                  ? 'Reserva'
                  : type === 'gym'
                    ? 'Gimnasio'
                    : type === 'incident'
                      ? 'Incidencia'
                      : 'Servicio'}
              </span>
              <span className="recent-text">{text}</span>
              <span className="recent-time">{time}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="shortcuts-section home-shortcuts-section" aria-labelledby="home-shortcuts-heading">
        <h3 id="home-shortcuts-heading" className="section-label home-shortcuts-heading">
          Accesos directos
        </h3>
        <div className="shortcuts-grid">
          {navFlags.services ? (
            <Link to="/services" className="shortcut-card shortcut-card--primary">
              <span className="shortcut-card-glow" aria-hidden="true" />
              <span className="shortcut-icon shortcut-icon--services" aria-hidden="true">
                🔧
              </span>
              <span className="shortcut-label">Servicios</span>
            </Link>
          ) : null}
          {navFlags.incidents ? (
            <Link to="/incidents" className="shortcut-card shortcut-card--accent">
              <span className="shortcut-card-glow" aria-hidden="true" />
              <span className="shortcut-icon shortcut-icon--incidents" aria-hidden="true">
                ⚠️
              </span>
              <span className="shortcut-label">Incidencias</span>
            </Link>
          ) : null}
          {navFlags.bookings ? (
            <Link to="/bookings" className="shortcut-card shortcut-card--bookings">
              <span className="shortcut-card-glow" aria-hidden="true" />
              <span className="shortcut-icon shortcut-icon--bookings" aria-hidden="true">
                📅
              </span>
              <span className="shortcut-label">Reservas</span>
            </Link>
          ) : null}
          {showActivityLinks ? (
            <Link to="/activity" className="shortcut-card shortcut-card--activity">
              <span className="shortcut-card-glow" aria-hidden="true" />
              <span className="shortcut-icon shortcut-icon--activity" aria-hidden="true">
                📋
              </span>
              <span className="shortcut-label">Mi actividad</span>
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  )
}
