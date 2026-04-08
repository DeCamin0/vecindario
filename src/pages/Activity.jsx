import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { SERVICE_STATUS_LABELS } from '../constants/serviceRequests.js'
import { formatBookingMeta, mapActivityApiItem } from '../utils/bookingDisplay'
import { getSignInPath } from '../utils/signInWebPath'
import './Activity.css'

const STATUS_LABELS = {
  Pending: 'Pendiente',
  'In progress': 'En curso',
  Completed: 'Completado',
  Reported: 'Reportado',
  Resolved: 'Resuelta',
  pendiente: 'Pendiente',
  resuelta: 'Resuelta',
}

const URGENCY_LABELS = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

function formatDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function shortDescription(text, maxLen = 60) {
  if (!text || !text.trim()) return '—'
  const t = text.trim()
  return t.length <= maxLen ? t : t.slice(0, maxLen) + '…'
}

const NAV_FALLBACK = { services: true, incidents: true, bookings: true, poolAccess: false }

function activitySubtitle(flags, ready) {
  if (!ready) return 'Historial de solicitudes, incidencias y reservas.'
  const labels = []
  if (flags.services) labels.push('solicitudes de servicio')
  if (flags.incidents) labels.push('incidencias')
  if (flags.bookings) labels.push('reservas')
  if (labels.length === 0) {
    return 'Ningún módulo de actividad está activo para tu comunidad.'
  }
  if (labels.length === 1) return `Historial de ${labels[0]}.`
  if (labels.length === 2) return `Historial de ${labels[0]} y ${labels[1]}.`
  return `Historial de ${labels[0]}, ${labels[1]} y ${labels[2]}.`
}

export default function Activity() {
  const { accessToken, communityId, appNavFlags, appNavFlagsReady } = useAuth()
  const navFlags = appNavFlagsReady ? appNavFlags : NAV_FALLBACK
  const anyActivityModule = navFlags.services || navFlags.incidents || navFlags.bookings
  const [serviceRows, setServiceRows] = useState([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState('')
  const [bookingRows, setBookingRows] = useState([])
  const [bookingsScope, setBookingsScope] = useState('personal')
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [incidentRows, setIncidentRows] = useState([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [incidentsError, setIncidentsError] = useState('')

  const loadBookingActivity = useCallback(async () => {
    if (!navFlags.bookings) {
      setBookingRows([])
      setBookingsScope('personal')
      setBookingsError('')
      setBookingsLoading(false)
      return
    }
    if (!accessToken || communityId == null) {
      setBookingRows([])
      setBookingsScope('personal')
      setBookingsError('')
      return
    }
    setBookingsLoading(true)
    setBookingsError('')
    try {
      const res = await fetch(apiUrl(`/api/bookings/activity?communityId=${communityId}`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBookingsError(data.error || 'No se pudo cargar las reservas')
        setBookingRows([])
        setBookingsScope('personal')
        return
      }
      const items = Array.isArray(data.items) ? data.items : []
      setBookingsScope(data.scope === 'community' ? 'community' : 'personal')
      setBookingRows(items.map(mapActivityApiItem))
    } catch {
      setBookingsError('Error de red')
      setBookingRows([])
      setBookingsScope('personal')
    } finally {
      setBookingsLoading(false)
    }
  }, [accessToken, communityId, navFlags.bookings])

  useEffect(() => {
    void loadBookingActivity()
  }, [loadBookingActivity])

  const loadIncidents = useCallback(async () => {
    if (!navFlags.incidents) {
      setIncidentRows([])
      setIncidentsError('')
      setIncidentsLoading(false)
      return
    }
    if (!accessToken || communityId == null) {
      setIncidentRows([])
      setIncidentsError('')
      return
    }
    setIncidentsLoading(true)
    setIncidentsError('')
    try {
      const res = await fetch(apiUrl(`/api/incidents?communityId=${communityId}`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setIncidentsError(typeof data.error === 'string' ? data.error : 'No se pudieron cargar las incidencias')
        setIncidentRows([])
        return
      }
      setIncidentRows(Array.isArray(data) ? data : [])
    } catch {
      setIncidentsError('Error de red')
      setIncidentRows([])
    } finally {
      setIncidentsLoading(false)
    }
  }, [accessToken, communityId, navFlags.incidents])

  useEffect(() => {
    void loadIncidents()
  }, [loadIncidents])

  const loadServices = useCallback(async () => {
    if (!navFlags.services) {
      setServiceRows([])
      setServicesError('')
      setServicesLoading(false)
      return
    }
    if (!accessToken || communityId == null) {
      setServiceRows([])
      setServicesError('')
      return
    }
    setServicesLoading(true)
    setServicesError('')
    try {
      const res = await fetch(apiUrl(`/api/services/my?communityId=${communityId}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServicesError(typeof data.error === 'string' ? data.error : 'No se pudieron cargar los servicios')
        setServiceRows([])
        return
      }
      setServiceRows(Array.isArray(data) ? data : [])
    } catch {
      setServicesError('Error de red')
      setServiceRows([])
    } finally {
      setServicesLoading(false)
    }
  }, [accessToken, communityId, navFlags.services])

  useEffect(() => {
    void loadServices()
  }, [loadServices])

  return (
    <div className="page-container activity-page">
      <header className="page-header">
        <h1 className="page-title">Mi actividad</h1>
        <p className="page-subtitle">{activitySubtitle(navFlags, appNavFlagsReady)}</p>
      </header>

      {appNavFlagsReady && !anyActivityModule ? (
        <p className="activity-section-intro" style={{ marginTop: '1rem' }}>
          Activa al menos un módulo (Servicios, Incidencias o Reservas) en el panel de super administrador para esta
          comunidad.
        </p>
      ) : null}

      {navFlags.services ? (
        <section className="activity-section">
          <h2 className="activity-section-title">Solicitudes de servicio</h2>
          <p className="activity-section-intro">Datos del servidor (presupuesto y estado).</p>
          <div className="activity-card-list">
            {!accessToken || communityId == null ? (
              <div className="activity-empty card">
                <p className="activity-empty-text">Inicia sesión para ver tus solicitudes.</p>
                <Link to={getSignInPath()} className="activity-empty-cta btn btn--primary">
                  Ir a iniciar sesión
                </Link>
              </div>
            ) : servicesLoading ? (
              <p className="activity-section-intro">Cargando…</p>
            ) : servicesError ? (
              <p className="auth-error" role="alert">
                {servicesError}
              </p>
            ) : serviceRows.length === 0 ? (
              <div className="activity-empty card">
                <div className="activity-empty-icon-wrap" aria-hidden="true">
                  <span className="activity-empty-icon">📋</span>
                </div>
                <p className="activity-empty-text">Aún no tienes solicitudes de servicio.</p>
                <p className="activity-empty-hint">
                  Cuando pidas fontanería, electricidad u otro servicio, aparecerá aquí.
                </p>
                <Link to="/services/new" className="activity-empty-cta btn btn--primary">
                  Crear mi primera solicitud
                </Link>
              </div>
            ) : (
              serviceRows.map((item) => (
                <Link key={item.id} to={`/services/${item.id}`} className="activity-item card activity-item--link">
                  <div className="activity-item-header">
                    <span className="activity-item-category">{item.categoryLabel}</span>
                    <span className="activity-item-status">
                      {SERVICE_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>
                  {item.serviceSubtypeLabel ? (
                    <p className="activity-item-subtype">{item.serviceSubtypeLabel}</p>
                  ) : null}
                  <p className="activity-item-desc">{shortDescription(item.description)}</p>
                  <p className="activity-item-date">{formatDate(item.createdAt)}</p>
                </Link>
              ))
            )}
          </div>
        </section>
      ) : null}

      {navFlags.incidents ? (
        <section className="activity-section">
          <h2 className="activity-section-title">Incidencias</h2>
          <p className="activity-section-intro">
            Datos del servidor: según tu rol verás solo tus reportes o todas las de la comunidad.
          </p>
          <div className="activity-card-list">
            {!accessToken || communityId == null ? (
              <div className="activity-empty card">
                <div className="activity-empty-icon-wrap" aria-hidden="true">
                  <span className="activity-empty-icon">⚠️</span>
                </div>
                <p className="activity-empty-text">Inicia sesión para ver tus incidencias.</p>
                <Link to={getSignInPath()} className="activity-empty-cta btn btn--primary">
                  Ir a iniciar sesión
                </Link>
              </div>
            ) : incidentsLoading ? (
              <p className="activity-section-intro">Cargando incidencias…</p>
            ) : incidentsError ? (
              <p className="auth-error" role="alert">
                {incidentsError}
              </p>
            ) : incidentRows.length === 0 ? (
              <div className="activity-empty card">
                <div className="activity-empty-icon-wrap" aria-hidden="true">
                  <span className="activity-empty-icon">⚠️</span>
                </div>
                <p className="activity-empty-text">No hay incidencias que mostrar.</p>
                <p className="activity-empty-hint">
                  Si detectas un problema en zonas comunes, repórtalo desde Incidencias.
                </p>
                <Link to="/incidents" className="activity-empty-cta btn btn--primary">
                  Reportar incidencia
                </Link>
              </div>
            ) : (
              incidentRows.map((item) => (
                <div key={item.id} className="activity-item card">
                  <div className="activity-item-header">
                    <span className="activity-item-category">{item.categoryLabel || item.categoryId}</span>
                    <span
                      className={`activity-item-status activity-item-status--${String(item.status || '').replace(/\s/g, '-')}`}
                    >
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>
                  <p className="activity-item-desc">{shortDescription(item.description)}</p>
                  <p className="activity-item-meta">
                    {item.locationText ? `${shortDescription(item.locationText, 48)} · ` : ''}
                    Urgencia: {URGENCY_LABELS[item.urgency] ?? item.urgency} · {formatDate(item.createdAt)}
                    {item.hasPhoto ? ' · 📷' : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {navFlags.bookings ? (
        <section className="activity-section">
          <h2 className="activity-section-title">Reservas</h2>
          <p className="activity-section-intro activity-bookings-intro">
            {bookingsScope === 'community'
              ? 'Actividad de toda la comunidad en el servidor: reservas confirmadas y entradas/salidas del gimnasio registradas desde la app.'
              : 'Solo datos del servidor: tus reservas confirmadas y registros de gimnasio en esta comunidad.'}
          </p>
          <div className="activity-card-list">
            {!accessToken || communityId == null ? (
              <div className="activity-empty card">
                <div className="activity-empty-icon-wrap" aria-hidden="true">
                  <span className="activity-empty-icon">📅</span>
                </div>
                <p className="activity-empty-text">Inicia sesión con tu comunidad para ver tu historial de reservas.</p>
                <Link to={getSignInPath()} className="activity-empty-cta btn btn--primary">
                  Ir a iniciar sesión
                </Link>
              </div>
            ) : bookingsLoading ? (
              <p className="activity-section-intro">Cargando reservas…</p>
            ) : bookingRows.length === 0 ? (
              <>
                {bookingsError ? (
                  <p className="auth-error" role="alert">
                    {bookingsError}
                  </p>
                ) : null}
                <div className="activity-empty card">
                  <div className="activity-empty-icon-wrap" aria-hidden="true">
                    <span className="activity-empty-icon">📅</span>
                  </div>
                  <p className="activity-empty-text">
                    {bookingsScope === 'community'
                      ? 'Aún no hay reservas ni registros de gimnasio en esta comunidad.'
                      : 'Aún no hay reservas ni registros de gimnasio en tu cuenta (servidor).'}
                  </p>
                  <p className="activity-empty-hint">
                    {bookingsScope === 'community'
                      ? 'Cuando los vecinos confirmen reservas o registren Entrada/Salida del gimnasio, aparecerán aquí.'
                      : 'Confirma una reserva en Reservas con sesión o usa Entrada/Salida del gimnasio.'}
                  </p>
                  <Link to="/bookings" className="activity-empty-cta btn btn--primary">
                    Ir a reservas
                  </Link>
                </div>
              </>
            ) : (
              <>
                {bookingsError ? (
                  <p className="auth-error" role="alert">
                    {bookingsError}
                  </p>
                ) : null}
                {bookingRows.map((item) => (
                  <div key={item.id} className="activity-item card">
                    <div className="activity-item-header">
                      <span className="activity-item-category">{item.facility}</span>
                    </div>
                    <p className="activity-item-meta">{formatBookingMeta(item)}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
