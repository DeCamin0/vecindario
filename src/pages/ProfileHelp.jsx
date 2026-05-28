import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { APP_VERSION } from '../config/version'
import { DISTRIBUTOR_CONTACT_EMAIL } from '../config/distributorContact.js'
import {
  PROFILE_HELP_CONTACT_BLOCKS,
  PROFILE_HELP_FAQ_RESIDENT,
  PROFILE_HELP_FAQ_STAFF,
  PROFILE_HELP_INTRO,
} from '../content/profileHelpContent.js'
import './ProfileHelp.css'

const STAFF_ROLES = new Set([
  'concierge',
  'community_admin',
  'president',
  'pool_staff',
  'super_admin',
])

const CONTACT_ICONS = {
  concierge: '🛎️',
  admin: '🏛️',
  community: '📬',
  distributor: '💬',
}

function mailtoFor(email, subject, body) {
  const e = email?.trim()
  if (!e) return null
  const q = new URLSearchParams()
  if (subject) q.set('subject', subject)
  if (body) q.set('body', body)
  const qs = q.toString()
  return `mailto:${e}${qs ? `?${qs}` : ''}`
}

function resolveEmail(block, ctx) {
  if (block.emailKey === 'distributorEmail') {
    return ctx?.distributorEmail?.trim() || DISTRIBUTOR_CONTACT_EMAIL
  }
  return ctx?.contacts?.[block.emailKey]?.trim() || null
}

function FaqItem({ question, children }) {
  return (
    <details>
      <summary>{question}</summary>
      <div className="profile-help-faq-body">{children}</div>
    </details>
  )
}

export default function ProfileHelp() {
  const { accessToken, user, community, userRole } = useAuth()
  const [ctx, setCtx] = useState(null)
  const [helpFetchDone, setHelpFetchDone] = useState(() => !accessToken)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setHelpFetchDone(false)
    })
    fetch(apiUrl('/api/auth/help-context'), { headers: jsonAuthHeaders(accessToken) })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setCtx(d)
      })
      .finally(() => {
        if (!cancelled) setHelpFetchDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const showLoading = Boolean(accessToken) && !helpFetchDone

  const communityLabel = ctx?.communityName || community || null

  const reportMailto = useMemo(() => {
    const lines = [
      'Describe el problema:',
      '',
      `Comunidad: ${communityLabel || '—'}`,
      `Rol: ${userRole || '—'}`,
      `Versión app: ${APP_VERSION}`,
      `Usuario: ${user?.email?.trim() || user?.name || user?.id || '—'}`,
    ]
    return mailtoFor(
      ctx?.distributorEmail || DISTRIBUTOR_CONTACT_EMAIL,
      'Vecindario — Reporte de problema',
      lines.join('\n'),
    )
  }, [ctx, communityLabel, userRole, user])

  const showStaffFaq = STAFF_ROLES.has(userRole)

  return (
    <div className="page-container profile-help-page">
      <header className="page-header">
        <Link to="/profile" className="profile-help-back">
          ‹ Perfil
        </Link>
        <h1 className="page-title">Ayuda</h1>
        <p className="page-subtitle">
          Contactos de tu comunidad y respuestas rápidas
          {communityLabel ? ` · ${communityLabel}` : ''}.
        </p>
      </header>

      <section className="profile-help-hero card" aria-labelledby="profile-help-hero-title">
        <span className="profile-help-hero-icon" aria-hidden="true">
          ❓
        </span>
        <div className="profile-help-hero-text">
          <p id="profile-help-hero-title">{PROFILE_HELP_INTRO}</p>
          <nav className="profile-help-quick" aria-label="Accesos rápidos">
            <Link to="/profile/notificaciones">Notificaciones</Link>
            <Link to="/profile/mis-datos">Mis datos</Link>
            {reportMailto ? (
              <a href={reportMailto}>Reportar problema</a>
            ) : null}
            <Link to="/privacy">Privacidad</Link>
          </nav>
        </div>
      </section>

      <section className="profile-help-section" aria-labelledby="profile-help-contacts-title">
        <div className="profile-help-section-head">
          <h2 id="profile-help-contacts-title">¿A quién contactar?</h2>
          {showLoading ? <p className="profile-help-loading">Cargando…</p> : null}
        </div>
        <div className="profile-help-contact-grid">
          {PROFILE_HELP_CONTACT_BLOCKS.map((block) => {
            const email = resolveEmail(block, ctx)
            const writeUrl = email
              ? mailtoFor(email, `Vecindario — ${block.title}`, '')
              : null
            const isDistributor = block.id === 'distributor'
            return (
              <article
                key={block.id}
                className={`profile-help-contact-card${isDistributor ? ' profile-help-contact-card--distributor' : ''}`}
              >
                <div className="profile-help-contact-top">
                  <span className="profile-help-contact-icon" aria-hidden="true">
                    {CONTACT_ICONS[block.id] || '✉️'}
                  </span>
                  <div className="profile-help-contact-meta">
                    <h3>{block.title}</h3>
                    <p>{block.description}</p>
                  </div>
                </div>
                <div className="profile-help-contact-action">
                  {writeUrl ? (
                    <>
                      <a href={writeUrl} className="profile-help-contact-btn">
                        Enviar correo
                      </a>
                      <span className="profile-help-contact-email-chip">{email}</span>
                    </>
                  ) : (
                    <p className="profile-help-contact-empty">
                      Sin correo en la ficha. Pregunta en el portal o al administrador.
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="profile-help-faq-card" aria-labelledby="profile-help-faq-title">
        <h2 id="profile-help-faq-title">Preguntas frecuentes</h2>
        <div className="profile-help-faq">
          {PROFILE_HELP_FAQ_RESIDENT.map((item) => (
            <FaqItem key={item.q} question={item.q}>
              {item.q === 'Notificaciones' ? (
                <>
                  En{' '}
                  <Link to="/profile/notificaciones">Perfil → Notificaciones</Link> activas o
                  desactivas avisos en web, app móvil y correo. La campana del menú sigue
                  mostrando el historial.
                </>
              ) : (
                item.a
              )}
            </FaqItem>
          ))}
          {showStaffFaq ? (
            <>
              <p className="profile-help-faq-group-label">Conserje y administración</p>
              {PROFILE_HELP_FAQ_STAFF.map((item) => (
                <FaqItem key={item.q} question={item.q}>
                  {item.a}
                </FaqItem>
              ))}
            </>
          ) : null}
        </div>
      </section>

      <footer className="profile-help-footer-bar">
        <span>
          Vecindario v{APP_VERSION}
          {communityLabel ? ` · ${communityLabel}` : ''}
        </span>
        <div className="profile-help-footer-actions">
          {reportMailto ? <a href={reportMailto}>Soporte técnico</a> : null}
          <Link to="/privacy">Términos y privacidad</Link>
        </div>
      </footer>
    </div>
  )
}
