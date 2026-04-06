import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import { SERVICE_CATEGORIES, SERVICE_STATUS_LABELS } from '../../constants/serviceRequests.js'
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
  const { accessToken, communityId } = useAuth()
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
