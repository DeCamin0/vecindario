import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import './Admin.css'

const STATUS_OPTS = [
  { value: 'new', label: 'Nueva' },
  { value: 'reviewed', label: 'Revisada' },
  { value: 'contacted', label: 'Contactada' },
  { value: 'closed', label: 'Cerrada' },
]

function tabsLabel(row) {
  const parts = []
  if (row.wantServices) parts.push('Servicios')
  if (row.wantIncidents) parts.push('Incidencias')
  if (row.wantBookings) parts.push('Reservas')
  if (row.wantPoolAccess) parts.push('Piscina')
  return parts.length ? parts.join(' · ') : '—'
}

export default function AdminQuoteRequests() {
  const { accessToken } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/admin/quote-requests'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'No se pudo cargar')
        setRows([])
        return
      }
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setError('Error de red')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const patchStatus = async (id, status) => {
    if (!accessToken) return
    try {
      const res = await fetch(apiUrl(`/api/admin/quote-requests/${id}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) return
      const updated = await res.json().catch(() => null)
      if (updated?.id) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)))
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-header-inner">
          <div className="admin-dashboard-brand">
            <h1 className="admin-dashboard-title">Solicitudes de oferta</h1>
            <p className="admin-dashboard-subtitle">
              Formularios enviados desde la web y la app (mismo flujo). Estados para seguimiento interno.
            </p>
          </div>
          <div className="admin-dashboard-header-actions">
            <button type="button" className="btn btn--ghost" onClick={() => void load()} disabled={loading}>
              Actualizar
            </button>
            <Link to="/admin" className="btn btn--ghost">
              ← Comunidades
            </Link>
          </div>
        </div>
      </header>
      <main className="admin-dashboard-main">
        <div className="admin-dashboard-inner">
          {error ? <p className="admin-banner-error" role="alert">{error}</p> : null}
          {loading ? <p className="admin-directory-intro">Cargando…</p> : null}
          {!loading && rows.length === 0 && !error ? (
            <p className="admin-directory-intro">Aún no hay solicitudes.</p>
          ) : null}
          {!loading && rows.length > 0 ? (
            <section className="admin-section">
              <div className="admin-communities">
                {rows.map((r) => (
                  <article key={r.id} className="admin-community-row card">
                    <div className="admin-community-info">
                      <div className="admin-community-head">
                        <h3 className="admin-community-name">{r.communityName}</h3>
                        <span className="admin-directory-intro" style={{ fontSize: '0.8rem' }}>
                          {new Date(r.createdAt).toLocaleString('es-ES')} · #{r.id}
                        </span>
                      </div>
                      <p className="admin-directory-intro">
                        <strong>Contacto:</strong> {r.contactName} · {r.contactEmail}
                        {r.contactPhone ? ` · ${r.contactPhone}` : ''}
                      </p>
                      {r.communityAddress ? (
                        <p className="admin-directory-intro">
                          <strong>Dirección:</strong> {r.communityAddress}
                        </p>
                      ) : null}
                      {r.dwellingApprox ? (
                        <p className="admin-directory-intro">
                          <strong>Viviendas:</strong> {r.dwellingApprox}
                        </p>
                      ) : null}
                      <p className="admin-directory-intro">
                        <strong>Pestañas app:</strong> {tabsLabel(r)}
                      </p>
                      {r.message ? (
                        <p className="admin-directory-intro" style={{ whiteSpace: 'pre-wrap' }}>
                          <strong>Notas:</strong> {r.message}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <label className="admin-directory-intro" htmlFor={`qr-st-${r.id}`} style={{ display: 'block', marginBottom: 4 }}>
                        Estado
                      </label>
                      <select
                        id={`qr-st-${r.id}`}
                        className="auth-input"
                        style={{ minWidth: '10rem', padding: '0.4rem' }}
                        value={r.status}
                        onChange={(e) => void patchStatus(r.id, e.target.value)}
                      >
                        {STATUS_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  )
}
