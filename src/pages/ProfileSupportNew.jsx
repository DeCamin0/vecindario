/**
 * Nuevo ticket de soporte.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { SUPPORT_AREA_LABELS } from '../lib/supportLabels.js'
import './SupportPages.css'

export default function ProfileSupportNew() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const [areas, setAreas] = useState(
    Object.entries(SUPPORT_AREA_LABELS).map(([code, label]) => ({ code, label })),
  )
  const [area, setArea] = useState('other')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!accessToken) return
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/support/areas'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(data.areas) && data.areas.length) {
          setAreas(data.areas)
        }
      } catch {
        /* keep local labels */
      }
    })()
  }, [accessToken])

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/api/support/tickets'), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ area, subject, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo crear')
      navigate(`/profile/soporte/${data.id}`, { replace: true })
    } catch (ex) {
      setErr(ex.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="support-page">
      <p className="support-page__crumb">
        <Link to="/profile/soporte">Soporte</Link> · Nuevo
      </p>
      <h1 className="page-title">Nuevo ticket</h1>

      <form className="support-form" onSubmit={onSubmit}>
        <label className="support-field">
          <span>Área</span>
          <select value={area} onChange={(e) => setArea(e.target.value)} required>
            {areas.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="support-field">
          <span>Asunto</span>
          <input
            type="text"
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </label>
        <label className="support-field">
          <span>Descripción</span>
          <textarea
            rows={6}
            maxLength={8000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
        {err ? <p className="admin-banner-error">{err}</p> : null}
        <div className="support-form__actions">
          <Link to="/profile/soporte" className="btn btn--ghost btn--sm">
            Cancelar
          </Link>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? 'Enviando…' : 'Crear ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
