import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import {
  SERVICE_CATEGORIES,
  SERVICE_STATUS_LABELS,
  isServiceCategoryActiveForCommunity,
} from '../../constants/serviceRequests.js'
import '../Services.css'
import './serviceRequestsPages.css'

function categoryLabel(id) {
  return SERVICE_CATEGORIES.find((c) => c.id === id)?.name ?? id
}

function statusClass(status) {
  if (status === 'completed') return 'sr-badge--done'
  if (status === 'rejected') return 'sr-badge--bad'
  if (status === 'price_sent') return 'sr-badge--price'
  if (status === 'in_progress') return 'sr-badge--progress'
  if (status === 'accepted') return 'sr-badge--ok'
  return 'sr-badge--muted'
}

export default function ServicesListPage() {
  const { accessToken, communityId, appNavFlagsReady, serviceRequestCategoryModes } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!accessToken || !communityId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/my?communityId=${communityId}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'No se pudieron cargar las solicitudes')
        setItems([])
        return
      }
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setErr('Error de red')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="page-container services-page sr-list-page">
      <header className="page-header sr-list-header">
        <div>
          <h1 className="page-title">Servicios</h1>
          <p className="page-subtitle">
            Solicita un presupuesto orientativo. La administración te enviará una propuesta de precio.
          </p>
        </div>
        <Link to="/services/new" className="btn btn--primary sr-list-cta">
          Solicitar servicio
        </Link>
      </header>

      <section className="sr-quick-cats" aria-label="Empezar por tipo de servicio">
        <h2 className="section-label">Empezar por categoría</h2>
        {communityId && !appNavFlagsReady ? (
          <p className="sr-muted">Cargando opciones…</p>
        ) : (
          <div className="category-grid sr-quick-cats__grid">
            {SERVICE_CATEGORIES.map(({ id, name, icon }) => {
              const available = isServiceCategoryActiveForCommunity(serviceRequestCategoryModes, id)
              if (!available) {
                return (
                  <span
                    key={id}
                    className="category-card card category-card--soon sr-quick-cats__item"
                    aria-disabled="true"
                  >
                    <span className="category-icon" aria-hidden="true">
                      {icon}
                    </span>
                    <span className="category-name">{name}</span>
                    <span className="category-card-badge-soon">Pronto</span>
                  </span>
                )
              }
              return (
                <Link
                  key={id}
                  to={`/services/new?category=${encodeURIComponent(id)}`}
                  state={{ categoryId: id }}
                  className="category-card card sr-quick-cats__item"
                >
                  <span className="category-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="category-name">{name}</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {err ? (
        <p className="sr-inline-error" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="sr-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="card sr-empty">
          <p className="sr-empty-title">Aún no tienes solicitudes</p>
          <p className="sr-empty-text">Cuando pidas fontanería, limpieza u otro servicio, aparecerán aquí.</p>
          <Link to="/services/new" className="btn btn--primary">
            Crear solicitud
          </Link>
        </div>
      ) : (
        <ul className="sr-card-list">
          {items.map((row) => (
            <li key={row.id}>
              <Link to={`/services/${row.id}`} className="sr-card card">
                <div className="sr-card-top">
                  <span className="sr-card-cat">{categoryLabel(row.categoryId)}</span>
                  <span className={`sr-badge ${statusClass(row.status)}`}>
                    {SERVICE_STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </div>
                <p className="sr-card-desc">
                  {row.description.length > 120 ? `${row.description.slice(0, 120)}…` : row.description}
                </p>
                {row.serviceSubtypeLabel ? (
                  <span className="sr-card-subtype">{row.serviceSubtypeLabel}</span>
                ) : null}
                <div className="sr-card-meta">
                  <span>{new Date(row.createdAt).toLocaleDateString('es-ES')}</span>
                  {row.photoCount > 0 ? <span>{row.photoCount} foto(s)</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
