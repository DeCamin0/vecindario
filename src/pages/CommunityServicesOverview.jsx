import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import {
  SERVICE_STATUS_LABELS,
  formatServicePriceDisplay,
} from '../constants/serviceRequests.js'
import { serviceRequestStatusBadgeClass } from './services/serviceRequestUiShared.js'
import './CommunityAdmin.css'
import './services/serviceRequestsPages.css'

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.entries(SERVICE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

function formatShortDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function requesterLine(item) {
  return [
    item.requesterName,
    item.requesterEmail,
    item.requesterPortal ? `Portal ${item.requesterPortal}` : null,
    item.requesterPiso ? `Piso ${item.requesterPiso}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function CommunityServicesOverview() {
  const { accessToken, communityId, userRole } = useAuth()
  const [items, setItems] = useState([])
  const [hint, setHint] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (statusFilter) q.set('status', statusFilter)
      const res = await fetch(apiUrl(`/api/services/community-overview?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'No se pudieron cargar las solicitudes')
        setItems([])
        return
      }
      setItems(Array.isArray(data.items) ? data.items : [])
      setHint(typeof data.hint === 'string' ? data.hint : '')
    } catch {
      setErr('Error de red')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const pendingCount = useMemo(
    () => items.filter((i) => i.status === 'pending_review').length,
    [items],
  )

  return (
    <div className="community-admin-page">
      <header className="community-admin-header admin-header">
        <div className="admin-header-inner">
          <div className="community-admin-header-brand">
            <h1 className="community-admin-title">Solicitudes de servicio</h1>
            <p className="community-admin-subtitle">
              Consulta qué han pedido los vecinos a De Camino. Solo lectura: presupuestos y proveedor
              los gestiona el super administrador.
            </p>
          </div>
          <Link to="/community-admin" className="admin-back-link">
            Volver a gestión
          </Link>
        </div>
      </header>

      <main className="community-admin-main admin-main page-container">
        <div className="community-admin-inner community-services-overview">
          {hint ? (
            <p className="community-admin-section-intro community-services-overview-hint" role="note">
              {hint}
            </p>
          ) : null}

          <div className="community-services-overview-toolbar card">
            <label className="form-label" htmlFor="cs-overview-status">
              Filtrar por estado
            </label>
            <select
              id="cs-overview-status"
              className="form-input form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {!loading && statusFilter === '' && pendingCount > 0 ? (
              <p className="community-services-overview-pending" role="status">
                {pendingCount} en revisión por De Camino
              </p>
            ) : null}
          </div>

          {err ? (
            <p className="auth-error" role="alert">
              {err}
            </p>
          ) : null}
          {loading ? <p className="community-admin-section-intro">Cargando…</p> : null}

          {!loading && !err && items.length === 0 ? (
            <div className="card community-services-overview-empty">
              <p className="community-services-overview-empty-title">No hay solicitudes</p>
              <p className="community-admin-section-intro">
                Cuando un vecino pida fontanería, limpieza u otro servicio, aparecerá aquí.
              </p>
            </div>
          ) : null}

          {!loading && !err && items.length > 0 ? (
            <ul className="community-services-overview-list">
              {items.map((item) => {
                const priceLabel =
                  item.price?.min != null
                    ? formatServicePriceDisplay(item.price.min, item.price.max)
                    : null
                return (
                  <li key={item.id} className="card community-services-overview-item">
                    <div className="community-services-overview-item-head">
                      <span className="community-services-overview-id">#{item.id}</span>
                      <span className="community-services-overview-category">
                        {item.categoryLabel || item.categoryId}
                        {item.serviceSubtypeLabel ? ` · ${item.serviceSubtypeLabel}` : ''}
                      </span>
                      <span className={`sr-badge ${serviceRequestStatusBadgeClass(item.status)}`}>
                        {SERVICE_STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </div>
                    <p className="community-services-overview-desc">
                      {item.description?.trim() || '—'}
                    </p>
                    <p className="community-services-overview-meta">
                      <strong>Solicitado por:</strong> {requesterLine(item) || '—'}
                    </p>
                    <p className="community-services-overview-meta">
                      {formatShortDate(item.createdAt)}
                      {item.preferredDate ? ` · Fecha preferida: ${formatShortDate(item.preferredDate)}` : ''}
                      {priceLabel ? ` · Presupuesto: ${priceLabel}` : ''}
                      {item.providerName ? ` · Proveedor: ${item.providerName}` : ''}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {userRole === 'community_admin' ? (
            <p className="community-admin-section-intro community-services-overview-foot">
              Para solicitar un servicio como vecino usa una cuenta de residente. Como administrador de
              comunidad solo consultas el listado de la finca.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
