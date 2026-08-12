/**
 * Solicitud de recuperación de contraseña (solo email).
 * Nunca indica si el correo existe.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../config/api.js'
import './AuthPages.css'

const GENERIC_OK =
  'Si existe una cuenta con ese correo, te hemos enviado instrucciones para restablecer la contraseña. Revisa tu bandeja de entrada y el spam.'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        setError(data.message || data.error || 'Demasiadas solicitudes. Espera e inténtalo de nuevo.')
        return
      }
      // Cualquier otra respuesta → mensaje genérico (incl. 200 y errores raros).
      setDone(true)
    } catch {
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen auth-screen--login">
      <div className="auth-login-shell">
        <div className="auth-card auth-card--login">
          <h1 className="auth-title">¿Has olvidado tu contraseña?</h1>
          <p className="auth-lead">
            Introduce el correo de tu cuenta. Si está registrado, te enviaremos un enlace para elegir
            una nueva contraseña.
          </p>

          {done ? (
            <div className="auth-success" role="status">
              <p>{GENERIC_OK}</p>
              <p className="auth-footer" style={{ marginTop: '1rem' }}>
                <Link to="/login" className="auth-link">
                  Volver al inicio de sesión
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="forgot-email">
                  Correo electrónico
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  className="auth-input"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  required
                />
              </div>
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="auth-submit btn btn--primary btn--block"
                disabled={submitting}
              >
                {submitting ? 'Enviando…' : 'Enviar instrucciones'}
              </button>
              <p className="auth-footer" style={{ marginTop: '1rem' }}>
                <Link to="/login" className="auth-link">
                  Volver al inicio de sesión
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
