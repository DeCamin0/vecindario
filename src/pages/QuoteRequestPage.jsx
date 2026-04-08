import { useState } from 'react'
import { Link } from 'react-router-dom'
import DeveloperCredit from '../components/DeveloperCredit'
import MobileAppDownloadBanner from '../components/MobileAppDownloadBanner'
import { apiUrl } from '../config/api.js'
import { BRAND_LOGO_PNG } from '../syncBrandFavicon.js'
import { getSignInPath } from '../utils/signInWebPath'
import './AuthPages.css'

const initial = {
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  communityName: '',
  communityAddress: '',
  dwellingApprox: '',
  message: '',
  wantServices: true,
  wantIncidents: true,
  wantBookings: true,
  wantPoolAccess: false,
}

export default function QuoteRequestPage() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.contactName.trim()) {
      setError('Indica tu nombre')
      return
    }
    if (!form.contactEmail.trim()) {
      setError('Indica tu email')
      return
    }
    if (!form.communityName.trim()) {
      setError('Indica el nombre de la comunidad / finca')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/public/quote-request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim() || null,
          communityName: form.communityName.trim(),
          communityAddress: form.communityAddress.trim() || null,
          dwellingApprox: form.dwellingApprox.trim() || null,
          message: form.message.trim() || null,
          wantServices: form.wantServices,
          wantIncidents: form.wantIncidents,
          wantBookings: form.wantBookings,
          wantPoolAccess: form.wantPoolAccess,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'No se pudo enviar')
        return
      }
      setDone(true)
      setForm(initial)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <MobileAppDownloadBanner />
      <div className="auth-card auth-card--quote-request card">
        <img src={BRAND_LOGO_PNG} alt="Vecindario" className="auth-logo" />
        <h1 className="auth-title">Solicitar oferta</h1>
        <p className="auth-subtitle">
          Cuéntanos tu comunidad y qué módulos necesitáis en la app para vecinos. Te contactaremos. ¿Ya tienes
          acceso?{' '}
          <Link to={getSignInPath()} className="auth-link">
            Iniciar sesión
          </Link>
        </p>

        {done ? (
          <p className="auth-vec-ok" role="status">
            <strong>Gracias.</strong> Hemos recibido tu solicitud. Nos pondremos en contacto contigo pronto.
          </p>
        ) : null}

        {!done ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <h2 className="auth-section-title">Contacto</h2>
            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-name">
                Nombre y apellidos
              </label>
              <input
                id="qr-name"
                type="text"
                className="auth-input"
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-email">
                Email
              </label>
              <input
                id="qr-email"
                type="email"
                className="auth-input"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-phone">
                Teléfono (opcional)
              </label>
              <input
                id="qr-phone"
                type="tel"
                className="auth-input"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                autoComplete="tel"
              />
            </div>

            <h2 className="auth-section-title">Comunidad</h2>
            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-comm">
                Nombre de la comunidad / finca
              </label>
              <input
                id="qr-comm"
                type="text"
                className="auth-input"
                value={form.communityName}
                onChange={(e) => set('communityName', e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-addr">
                Dirección (opcional)
              </label>
              <input
                id="qr-addr"
                type="text"
                className="auth-input"
                value={form.communityAddress}
                onChange={(e) => set('communityAddress', e.target.value)}
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-dw">
                Aprox. viviendas / puertas (opcional)
              </label>
              <input
                id="qr-dw"
                type="text"
                className="auth-input"
                placeholder="Ej. 48 viviendas"
                value={form.dwellingApprox}
                onChange={(e) => set('dwellingApprox', e.target.value)}
              />
            </div>

            <h2 className="auth-section-title">Pestañas app vecinos</h2>
            <p className="auth-hint auth-hint--tight">
              Indica qué secciones queréis que vean los vecinos en la app (podemos ajustar después).
            </p>
            <div className="auth-check-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={form.wantServices}
                  onChange={(e) => set('wantServices', e.target.checked)}
                />
                Servicios
              </label>
            </div>
            <div className="auth-check-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={form.wantIncidents}
                  onChange={(e) => set('wantIncidents', e.target.checked)}
                />
                Incidencias
              </label>
            </div>
            <div className="auth-check-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={form.wantBookings}
                  onChange={(e) => set('wantBookings', e.target.checked)}
                />
                Reservas (salón, gimnasio, etc.)
              </label>
            </div>
            <div className="auth-check-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={form.wantPoolAccess}
                  onChange={(e) => set('wantPoolAccess', e.target.checked)}
                />
                Acceso piscina (QR / control)
              </label>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="qr-msg">
                Comentarios (opcional)
              </label>
              <textarea
                id="qr-msg"
                className="auth-input auth-textarea"
                rows={4}
                value={form.message}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Horarios de portería, necesidades especiales…"
              />
            </div>

            {error ? <p className="auth-error">{error}</p> : null}

            <button type="submit" className="btn btn--primary auth-submit" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </form>
        ) : (
          <Link to={getSignInPath()} className="btn btn--secondary auth-submit">
            Volver al inicio de sesión
          </Link>
        )}
      </div>
      <DeveloperCredit />
    </div>
  )
}
