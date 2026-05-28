import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import './AuthPages.css'
import './ProfileMyData.css'
import './ProfileChangePassword.css'

export default function ProfileChangePassword() {
  const navigate = useNavigate()
  const { accessToken, community, user } = useAuth()
  const hasEmail = Boolean(user?.email?.trim())

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!accessToken) {
      setError('No hay sesión activa.')
      return
    }
    if (!currentPassword || !newPassword) {
      setError('Completa la contraseña actual y la nueva.')
      return
    }
    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    if (currentPassword === newPassword) {
      setError('La nueva contraseña debe ser distinta de la actual.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/auth/me/password'), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          [data.message, data.error].filter(Boolean).join(' ') || `Error ${res.status}`,
        )
      }
      setSuccess('Contraseña actualizada correctamente.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => navigate('/profile'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-container profile-my-data-page profile-change-password-page">
      <header className="page-header">
        <Link to="/profile" className="profile-my-data-back">
          ‹ Perfil
        </Link>
        <h1 className="page-title">Cambiar contraseña</h1>
        <p className="page-subtitle">
          Mínimo 6 caracteres{community ? ` · ${community}` : ''}.
        </p>
      </header>

      <div className="profile-change-password-layout">
        <form className="card profile-change-password-card" onSubmit={handleSubmit}>
          <h2 className="profile-change-password-section-title">Tu nueva clave</h2>
          <p className="profile-change-password-lead">
            Primero confirma la contraseña con la que entras ahora; después elige la nueva.
          </p>

          <div className="auth-field">
            <label htmlFor="current-password">Contraseña actual</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="profile-change-password-new-row">
            <div className="auth-field">
              <label htmlFor="new-password">Nueva contraseña</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                minLength={6}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm-password">Confirmar nueva contraseña</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                minLength={6}
                required
              />
            </div>
          </div>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="profile-change-password-success" role="status">
              {success}
            </p>
          ) : null}

          <button type="submit" className="btn btn--primary auth-submit" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>

        <aside className="card profile-change-password-forgot">
          <h3 className="profile-change-password-forgot-title">¿No recuerdas la actual?</h3>
          <p>
            En Vecindario la recuperación la hace <strong>conserjería o administración</strong> de tu
            comunidad (contraseña temporal en mano).
            {hasEmail
              ? ' Si tienes correo en la ficha, también pueden ayudarte desde el panel de gestión.'
              : ' Muchos vecinos entran sin correo (VEC + portal + piso); por eso no pedimos solo un email aquí.'}
          </p>
          <Link to="/profile/ayuda" className="profile-change-password-forgot-link">
            Ir a Ayuda →
          </Link>
        </aside>
      </div>
    </div>
  )
}
