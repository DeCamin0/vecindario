/**
 * Perfil → Soporte: lista de mis tickets.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import {
  formatSupportWhen,
  supportAreaLabel,
  supportStatusLabel,
} from '../lib/supportLabels.js'
import './SupportPages.css'

export default function ProfileSupport() {
  const { accessToken } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(apiUrl('/api/support/tickets'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setErr(e.message || 'Error')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="support-page">
      <header className="support-page__head">
        <div>
          <p className="support-page__crumb">
            <Link to="/profile">Perfil</Link> · Soporte
          </p>
          <h1 className="page-title">Soporte</h1>
          <p className="support-page__lead">Tickets con el equipo de Vecindario.</p>
        </div>
        <Link to="/profile/soporte/nuevo" className="btn btn--primary btn--sm">
          Nuevo ticket
        </Link>
      </header>

      {err ? <p className="admin-banner-error">{err}</p> : null}
      {loading ? <p className="support-muted">Cargando…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="support-empty">
          Aún no tienes tickets.{' '}
          <Link to="/profile/soporte/nuevo">Abrir el primero</Link>.
        </p>
      ) : null}

      <ul className="support-list">
        {items.map((t) => (
          <li key={t.id}>
            <Link
              to={`/profile/soporte/${t.id}`}
              className={`support-row${t.unread ? ' is-unread' : ''}`}
            >
              <div className="support-row__main">
                <strong>
                  #{t.id} · {t.subject}
                </strong>
                <span className="support-row__meta">
                  {supportAreaLabel(t.area)} · {supportStatusLabel(t.status)} ·{' '}
                  {formatSupportWhen(t.lastMessageAt)}
                </span>
              </div>
              {t.unread ? <span className="support-badge">Nuevo</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
