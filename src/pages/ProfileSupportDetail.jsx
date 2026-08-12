/**
 * Detalle / hilo de ticket (usuario).
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import {
  formatSupportWhen,
  supportAreaLabel,
  supportPriorityLabel,
  supportStatusLabel,
} from '../lib/supportLabels.js'
import './SupportPages.css'

export default function ProfileSupportDetail() {
  const { ticketId } = useParams()
  const { accessToken } = useAuth()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken || !ticketId) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/support/tickets/${ticketId}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error')
      setDetail(data)
    } catch (e) {
      setErr(e.message || 'Error')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken, ticketId])

  useEffect(() => {
    void load()
  }, [load])

  async function sendReply(e) {
    e.preventDefault()
    if (!draft.trim()) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/support/tickets/${ticketId}/messages`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ body: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar')
      setDetail(data)
      setDraft('')
    } catch (ex) {
      setErr(ex.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="support-page support-muted">Cargando…</p>
  if (!detail) {
    return (
      <div className="support-page">
        <p className="admin-banner-error">{err || 'Ticket no encontrado'}</p>
        <Link to="/profile/soporte">Volver</Link>
      </div>
    )
  }

  return (
    <div className="support-page">
      <p className="support-page__crumb">
        <Link to="/profile/soporte">Soporte</Link> · #{detail.id}
      </p>
      <h1 className="page-title">{detail.subject}</h1>
      <p className="support-page__meta">
        {supportAreaLabel(detail.area)} · {supportStatusLabel(detail.status)} ·{' '}
        {supportPriorityLabel(detail.priority)} · {formatSupportWhen(detail.createdAt)}
      </p>

      <div className="support-thread">
        {(detail.messages || []).map((m) => (
          <article
            key={m.id}
            className={`support-msg${m.fromCreator ? ' is-mine' : ' is-staff'}`}
          >
            <header>
              <strong>{m.author?.name || m.author?.email || 'Usuario'}</strong>
              <span>
                {m.author?.role || ''} · {formatSupportWhen(m.createdAt)}
              </span>
            </header>
            <p>{m.body}</p>
          </article>
        ))}
      </div>

      {err ? <p className="admin-banner-error">{err}</p> : null}

      {detail.canReply ? (
        <form className="support-composer" onSubmit={sendReply}>
          <textarea
            rows={3}
            maxLength={8000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe tu respuesta…"
            required
          />
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      ) : (
        <p className="support-muted">Este ticket está cerrado. No se pueden enviar más mensajes.</p>
      )}
    </div>
  )
}
