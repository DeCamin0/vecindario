/**
 * Restablecer contraseña con token del email (?token=).
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiUrl } from '../config/api.js'
import './AuthPages.css'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => (params.get('token') || '').trim(), [params])

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('Enlace no válido o caducado.')
      return
    }
    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('La contraseña y la confirmación no coinciden.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || data.message || 'No se pudo restablecer la contraseña.')
        return
      }
      navigate('/login?reset=ok', { replace: true })
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-screen auth-screen--login">
        <div className="auth-login-shell">
          <div className="auth-card auth-card--login">
            <h1 className="auth-title">Enlace no válido</h1>
            <p className="auth-lead">
              Este enlace de recuperación no es válido o ha caducado. Solicita uno nuevo desde el
              inicio de sesión.
            </p>
            <p className="auth-footer">
              <Link to="/olvidar-contrasena" className="auth-link">
                Solicitar nuevo enlace
              </Link>
              {' · '}
              <Link to="/login" className="auth-link">
                Volver al login
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen auth-screen--login">
      <div className="auth-login-shell">
        <div className="auth-card auth-card--login">
          <h1 className="auth-title">Nueva contraseña</h1>
          <p className="auth-lead">Elige una contraseña nueva y confírmala. El enlace es de un solo uso.</p>

          <form onSubmit={onSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-new">
                Nueva contraseña
              </label>
              <input
                id="reset-new"
                name="newPassword"
                type="password"
                className="auth-input"
                autoComplete="new-password"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-confirm">
                Confirmar contraseña
              </label>
              <input
                id="reset-confirm"
                name="confirmPassword"
                type="password"
                className="auth-input"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(ev) => setConfirmPassword(ev.target.value)}
                minLength={6}
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
              {submitting ? 'Guardando…' : 'Guardar contraseña'}
            </button>
            <p className="auth-footer" style={{ marginTop: '1rem' }}>
              <Link to="/login" className="auth-link">
                Volver al inicio de sesión
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
