import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  canEditMyProfileData,
  PROFILE_ROLE_LABELS,
} from '../utils/userFromMeResponse.js'
import './AuthPages.css'
import './ProfileMyData.css'

export default function ProfileMyData() {
  const navigate = useNavigate()
  const { user, userRole, community, saveResidentHomePatch } = useAuth()

  const editable = canEditMyProfileData(userRole)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [habitaciones, setHabitaciones] = useState('')
  const [plazaGaraje, setPlazaGaraje] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    setName(user.name?.trim() || '')
    setEmail(user.email?.trim() || '')
    setPhone(user.phone?.trim() || '')
    setHabitaciones(user.habitaciones?.trim() || '')
    setPlazaGaraje(user.plazaGaraje?.trim() || '')
  }, [user])

  const roleLabel = PROFILE_ROLE_LABELS[userRole] || userRole
  const dwellingLabel = [user?.portal?.trim(), user?.piso?.trim(), user?.puerta?.trim()]
    .filter(Boolean)
    .join(' · ')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!editable) return

    const emailTrim = email.trim()
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setError('El correo no tiene un formato válido.')
      return
    }

    setSubmitting(true)
    try {
      await saveResidentHomePatch({
        name: name.trim() || null,
        email: emailTrim,
        phone: phone.trim() || null,
        habitaciones: habitaciones.trim() || null,
        plazaGaraje: plazaGaraje.trim() || null,
      })
      navigate('/profile')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-container profile-my-data-page">
      <header className="page-header">
        <Link to="/profile" className="profile-my-data-back">
          ‹ Perfil
        </Link>
        <h1 className="page-title">Mis datos</h1>
        <p className="page-subtitle">
          {editable
            ? 'Puedes actualizar tu nombre y datos de contacto. Portal, piso y puerta se asignan al dar de alta la cuenta.'
            : 'Consulta los datos de tu cuenta. Para cambiar la vivienda, contacta con la administración.'}
          {community ? ` · ${community}` : ''}
        </p>
      </header>

      <div className="card profile-my-data-card">
        <dl className="profile-my-data-readonly">
          <div>
            <dt>Rol</dt>
            <dd>{roleLabel}</dd>
          </div>
          {editable && (user?.portal?.trim() || user?.piso?.trim() || user?.puerta?.trim()) ? (
            <>
              <div>
                <dt>Vivienda</dt>
                <dd>{dwellingLabel || '—'}</dd>
              </div>
              <p className="profile-my-data-hint">
                Portal, piso y puerta no se pueden modificar aquí. Si hay un error, contacta con la
                administración o el conserje de la comunidad.
              </p>
            </>
          ) : null}
        </dl>

        {editable ? (
          <form className="auth-form profile-my-data-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="mydata-name">
                Nombre para mostrar
              </label>
              <input
                id="mydata-name"
                type="text"
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="mydata-email">
                Correo electrónico
              </label>
              <input
                id="mydata-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Opcional — avisos y acceso con email"
              />
              <p className="profile-my-data-field-hint">
                Si no tienes correo en la cuenta, puedes añadirlo aquí. Déjalo vacío para seguir
                entrando solo con VEC, portal, piso y contraseña.
              </p>
            </div>

            <p className="profile-my-data-section">Contacto y otros</p>

            <div className="auth-field">
              <label className="auth-label" htmlFor="mydata-phone">
                Teléfono
              </label>
              <input
                id="mydata-phone"
                type="tel"
                className="auth-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="mydata-habitaciones">
                Habitaciones
              </label>
              <input
                id="mydata-habitaciones"
                type="text"
                className="auth-input"
                value={habitaciones}
                onChange={(e) => setHabitaciones(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="mydata-garaje">
                Plaza de garaje
              </label>
              <input
                id="mydata-garaje"
                type="text"
                className="auth-input"
                value={plazaGaraje}
                onChange={(e) => setPlazaGaraje(e.target.value)}
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
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
        ) : (
          <div className="profile-my-data-readonly profile-my-data-readonly--staff">
            <p>
              <strong>Nombre:</strong> {user?.name?.trim() || '—'}
            </p>
            <p>
              <strong>Correo:</strong> {user?.email?.trim() || '—'}
            </p>
            {user?.portal?.trim() ? (
              <p>
                <strong>Portal:</strong> {user.portal.trim()}
              </p>
            ) : null}
            {user?.piso?.trim() ? (
              <p>
                <strong>Piso:</strong> {user.piso.trim()}
              </p>
            ) : null}
            {user?.puerta?.trim() ? (
              <p>
                <strong>Puerta:</strong> {user.puerta.trim()}
              </p>
            ) : null}
            {user?.phone?.trim() ? (
              <p>
                <strong>Teléfono:</strong> {user.phone.trim()}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
