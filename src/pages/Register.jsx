import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DeveloperCredit from '../components/DeveloperCredit'
import MobileAppDownloadBanner from '../components/MobileAppDownloadBanner'
import { BRAND_LOGO_PNG } from '../syncBrandFavicon.js'
import './AuthPages.css'

export default function Register() {
  const navigate = useNavigate()
  const { register, community, communityId } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [piso, setPiso] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Introduce tu nombre')
      return
    }
    if (!email.trim()) {
      setError('Introduce tu email')
      return
    }
    if (!password) {
      setError('Introduce una contraseña')
      return
    }
    if (communityId == null) {
      setError('Primero valida el código VEC en Iniciar sesión (rol Residente).')
      return
    }
    const success = register(name, email, password, piso)
    if (success) {
      navigate('/', { replace: true })
    } else {
      setError('Completa todos los campos')
    }
  }

  return (
    <div className="auth-screen">
      <MobileAppDownloadBanner />
      <div className="auth-card card">
        <img src={BRAND_LOGO_PNG} alt="Vecindario" className="auth-logo" />
        <h1 className="auth-title">Crear cuenta</h1>
        <p className="auth-subtitle">
          Regístrate para acceder a tu comunidad. Si tu presidente te dio de alta con portal y piso, entra desde{' '}
          <Link to="/login" className="auth-link">Iniciar sesión</Link> sin correo.
        </p>
        {communityId != null && community ? (
          <p className="auth-vec-ok auth-vec-ok--register" role="status">
            Comunidad: <strong>{community}</strong>
          </p>
        ) : (
          <p className="auth-warning">
            Necesitas el código VEC de tu comunidad.{' '}
            <Link to="/login" className="auth-link">Iniciar sesión</Link>, elige <strong>Residente</strong> y pulsa
            «Comprobar» con el código.
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="name">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              className="auth-input"
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-email">
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              className="auth-input"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-password">
              Contraseña
            </label>
            <input
              id="reg-password"
              type="password"
              className="auth-input"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-piso">
              Piso / puerta <span className="auth-optional">(opcional)</span>
            </label>
            <input
              id="reg-piso"
              type="text"
              className="auth-input"
              placeholder="Ej. 3º B, portal 2"
              value={piso}
              onChange={(e) => setPiso(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit btn btn--primary btn--block">
            Crear cuenta
          </button>
        </form>

        <p className="auth-footer">
          ¿Ya tienes cuenta? <Link to="/login" className="auth-link">Iniciar sesión</Link>
        </p>
      </div>
      <DeveloperCredit />
    </div>
  )
}
