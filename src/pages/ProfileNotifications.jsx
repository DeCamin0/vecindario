import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { tryRegisterWebPush } from '../lib/webPushRegister.js'
import { tryUnregisterWebPush } from '../lib/webPushUnregister.js'
import { DISTRIBUTOR_CONTACT_EMAIL, distributorMailtoUrl } from '../config/distributorContact.js'
import './AuthPages.css'
import './ProfileNotifications.css'

function Toggle({ on, disabled, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`profile-notif-toggle${on ? ' profile-notif-toggle--on' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="profile-notif-toggle-knob" aria-hidden="true" />
    </button>
  )
}

export default function ProfileNotifications() {
  const { accessToken, user, community, setUserNotificationPrefs } = useAuth()

  const [webPush, setWebPush] = useState(user?.notifyWebPush !== false)
  const [mobilePush, setMobilePush] = useState(user?.notifyMobilePush !== false)
  const [emailNotify, setEmailNotify] = useState(user?.notifyEmail !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasEmail = Boolean(user?.email?.trim())
  const webPushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'

  useEffect(() => {
    setWebPush(user?.notifyWebPush !== false)
    setMobilePush(user?.notifyMobilePush !== false)
    setEmailNotify(user?.notifyEmail !== false)
  }, [user?.notifyWebPush, user?.notifyMobilePush, user?.notifyEmail])

  const patchPrefs = useCallback(
    async (patch) => {
      if (!accessToken) throw new Error('No hay sesión')
      const res = await fetch(apiUrl('/api/auth/notification-preferences'), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || data.message || `Error ${res.status}`)
      }
      setUserNotificationPrefs({
        notifyWebPush: data.notifyWebPush !== false,
        notifyMobilePush: data.notifyMobilePush !== false,
        notifyEmail: data.notifyEmail !== false,
      })
      return data
    },
    [accessToken, setUserNotificationPrefs],
  )

  const handleWebToggle = async () => {
    const next = !webPush
    setError('')
    setSaving(true)
    try {
      if (next && webPushSupported) {
        let perm = Notification.permission
        if (perm === 'default') {
          perm = await Notification.requestPermission()
        }
        if (perm !== 'granted') {
          setError('Permiso del navegador denegado. Actívalo en ajustes del sitio.')
          return
        }
      }
      await patchPrefs({ notifyWebPush: next })
      setWebPush(next)
      if (next) {
        await tryRegisterWebPush(accessToken)
      } else {
        await tryUnregisterWebPush(accessToken)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleMobileToggle = async () => {
    const next = !mobilePush
    setError('')
    setSaving(true)
    try {
      await patchPrefs({ notifyMobilePush: next })
      setMobilePush(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEmailToggle = async () => {
    if (!hasEmail) return
    const next = !emailNotify
    setError('')
    setSaving(true)
    try {
      await patchPrefs({ notifyEmail: next })
      setEmailNotify(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container profile-notif-page">
      <header className="page-header">
        <Link to="/profile" className="profile-notif-back">
          ‹ Perfil
        </Link>
        <h1 className="page-title">Notificaciones</h1>
        <p className="page-subtitle">
          Elige cómo quieres recibir avisos de Vecindario
          {community ? ` · ${community}` : ''}.
        </p>
      </header>

      <div className="card profile-notif-card">
        <p className="profile-notif-intro">
          La campana de la app sigue mostrando el historial en la web. Aquí activas o desactivas alertas
          push y correos.
        </p>

        <ul className="profile-notif-list">
          <li
            className={`profile-notif-row${!webPushSupported ? ' profile-notif-row--disabled' : ''}`}
          >
            <div>
              <span className="profile-notif-label">Web (navegador)</span>
              <p className="profile-notif-hint">
                {webPushSupported
                  ? 'Avisos en este dispositivo aunque no tengas la pestaña abierta (PWA / Chrome, Edge…).'
                  : 'Tu navegador no admite notificaciones push en segundo plano.'}
              </p>
            </div>
            <Toggle
              label="Notificaciones web"
              on={webPush && webPushSupported}
              disabled={saving || !webPushSupported}
              onClick={() => void handleWebToggle()}
            />
          </li>

          <li className="profile-notif-row">
            <div>
              <span className="profile-notif-label">App móvil</span>
              <p className="profile-notif-hint">
                Push en el teléfono con la app Vecindario instalada. Actívalo también en Ajustes del
                móvil si usas la app.
              </p>
            </div>
            <Toggle
              label="Notificaciones app móvil"
              on={mobilePush}
              disabled={saving}
              onClick={() => void handleMobileToggle()}
            />
          </li>

          <li
            className={`profile-notif-row${!hasEmail ? ' profile-notif-row--disabled' : ''}`}
          >
            <div>
              <span className="profile-notif-label">Correo electrónico</span>
              <p className="profile-notif-hint">
                {hasEmail
                  ? `Avisos a ${user.email.trim()} (reservas, paquetería, etc.).`
                  : 'Añade un correo en Mis datos para recibir avisos por email.'}
              </p>
            </div>
            <Toggle
              label="Notificaciones por correo"
              on={emailNotify && hasEmail}
              disabled={saving || !hasEmail}
              onClick={() => void handleEmailToggle()}
            />
          </li>
        </ul>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="profile-notif-footnote">
          Si desactivas un canal, dejamos de enviar por ese medio; puedes volver a activarlo cuando
          quieras.
        </p>
      </div>

      <aside className="profile-notif-whatsapp" aria-labelledby="profile-notif-whatsapp-title">
        <span className="profile-notif-whatsapp-badge">Más canales</span>
        <h2 id="profile-notif-whatsapp-title" className="profile-notif-whatsapp-title">
          ¿Te gustaría recibir avisos por WhatsApp?
        </h2>
        <p className="profile-notif-whatsapp-text">
          En Vecindario ya puedes usar web, app móvil y correo. Si tu comunidad quiere recordatorios
          o avisos por <strong>WhatsApp</strong> (servicio opcional para toda la finca), habla con
          tu <strong>distribuidor o administrador</strong> — ellos te informan de disponibilidad y
          condiciones.
        </p>
        <div className="profile-notif-whatsapp-actions">
          <a
            className="btn btn--secondary btn--small"
            href={distributorMailtoUrl('Vecindario — Avisos por WhatsApp')}
          >
            Contactar distribuidor
          </a>
          <a
            className="profile-notif-whatsapp-link"
            href={distributorMailtoUrl('Vecindario — Avisos por WhatsApp')}
          >
            {DISTRIBUTOR_CONTACT_EMAIL}
          </a>
        </div>
      </aside>
    </div>
  )
}
