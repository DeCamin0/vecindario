import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import './paqueteria.css'
import '../Admin.css'
import { parcelStaffMetaLine } from './parcelStaffMeta.js'
import {
  PAQUETERIA_STAFF_LIST_ROLES,
  canRegisterPaquete,
} from './paqueteriaRoles.js'

export default function PaqueteriaListPage() {
  const { accessToken, communityId, communityAccessCode, userRole } = useAuth()
  const [parcels, setParcels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isStaff = PAQUETERIA_STAFF_LIST_ROLES.has(userRole)
  const canRegister = canRegisterPaquete(userRole)
  const isAdminReadOnly = userRole === 'community_admin'
  const isNeighbor = userRole === 'resident' || userRole === 'president'

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (isStaff && communityAccessCode?.trim()) {
        q.set('accessCode', communityAccessCode.trim().toUpperCase())
      }
      const res = await fetch(apiUrl(`/api/community/parcels?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setParcels(Array.isArray(data.parcels) ? data.parcels : [])
    } catch (e) {
      setError(e.message || 'Error')
      setParcels([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, communityAccessCode, isStaff])

  useEffect(() => {
    void load()
  }, [load])

  const bultosLabel = (n) => {
    const c = typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1
    return c === 1 ? '1 bulto' : `${c} bultos`
  }

  return (
    <div className="page-container">
      <header className="page-header pq-page-header">
        <h1 className="page-title">Paquetería</h1>
        <p className="page-subtitle">
          {isNeighbor
            ? 'Paquetes en conserjería: aquí ves el estado. La firma de recogida la registra conserjería cuando pases a recogerlos.'
            : isAdminReadOnly
              ? 'Consulta los paquetes de la comunidad. El registro y la entrega con firma las realiza el conserje en conserjería.'
              : 'Paquetes en conserjería: registro y recogida con firma del vecino en conserjería. Solo visible si la comunidad tiene activada la pestaña.'}
        </p>
      </header>
      {canRegister ? (
        <p className="pq-list-actions">
          <Link to="/paqueteria/nuevo" className="btn btn--primary">
            Registrar paquete
          </Link>
        </p>
      ) : null}
      <div className="pq-list-shell">
        {loading ? (
          <p className="pq-list-muted" aria-live="polite">
            Cargando…
          </p>
        ) : null}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && parcels.length === 0 ? (
          <div className="pq-list-empty card">
            <p className="pq-list-empty-title">No hay paquetes</p>
            <p className="pq-list-muted">
              Cuando la conserjería registre un envío para tu vivienda, aparecerá aquí.
            </p>
          </div>
        ) : null}
        {!loading && !error && parcels.length > 0 ? (
          <ul className="pq-parcel-list">
            {parcels.map((p) => {
              const pending = p.status !== 'picked_up'
              const staffMeta = isStaff ? parcelStaffMetaLine(p) : null
              const pkg =
                typeof p.packageCount === 'number' && Number.isFinite(p.packageCount)
                  ? Math.max(1, Math.trunc(p.packageCount))
                  : 1
              return (
                <li key={p.id}>
                  <Link to={`/paqueteria/${p.id}`} className="pq-parcel-card">
                    <div className="pq-parcel-card__body">
                      <div className="pq-parcel-card__row pq-parcel-card__row--top">
                        <span className="pq-parcel-id">#{p.id}</span>
                        <div className="pq-parcel-dwelling" aria-label={`Vivienda ${p.portal}, ${p.piso}, ${p.puerta}`}>
                          <span className="pq-parcel-chip pq-parcel-chip--readonly">{p.portal}</span>
                          <span className="pq-parcel-sep" aria-hidden>
                            ·
                          </span>
                          <span className="pq-parcel-chip pq-parcel-chip--readonly">{p.piso}</span>
                          <span className="pq-parcel-sep" aria-hidden>
                            ·
                          </span>
                          <span className="pq-parcel-chip pq-parcel-chip--readonly">{p.puerta}</span>
                        </div>
                        <span className={`pq-parcel-bultos${pkg > 1 ? ' pq-parcel-bultos--many' : ''}`}>
                          {bultosLabel(pkg)}
                        </span>
                      </div>
                      <div className="pq-parcel-card__row pq-parcel-card__row--meta">
                        <span className={pending ? 'pq-parcel-status pq-parcel-status--pending' : 'pq-parcel-status pq-parcel-status--done'}>
                          {pending ? 'Pendiente de recogida' : 'Recogido'}
                        </span>
                        {p.createdAt ? (
                          <time className="pq-parcel-date" dateTime={p.createdAt}>
                            {new Date(p.createdAt).toLocaleString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        ) : null}
                      </div>
                      {staffMeta ? (
                        <p className="pq-parcel-staff-meta">{staffMeta}</p>
                      ) : null}
                    </div>
                    <span className="pq-parcel-card__chev" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
