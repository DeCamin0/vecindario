import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import {
  SERVICE_STATUS_LABELS,
  SERVICE_MESSAGE_THREAD_STATUSES,
  SERVICE_MESSAGE_COMPOSE_STATUSES,
  formatServicePriceDisplay,
  serviceMessageResidentSubtitle,
} from '../../constants/serviceRequests.js'
import {
  buildServiceProgressSteps,
  categoryMeta,
  serviceRequestStatusBadgeClass,
} from './serviceRequestUiShared.js'
import '../Services.css'
import './serviceRequestsPages.css'

export default function ServiceRequestDetailPage() {
  const { serviceId } = useParams()
  const id = Number(serviceId)
  const { accessToken } = useAuth()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [quoteMessages, setQuoteMessages] = useState([])
  const [quoteMsgDraft, setQuoteMsgDraft] = useState('')
  const [quoteMsgBusy, setQuoteMsgBusy] = useState(false)
  const [quoteMsgErr, setQuoteMsgErr] = useState('')

  const load = useCallback(async () => {
    if (!accessToken || !Number.isInteger(id) || id < 1) {
      setRow(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${id}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'No encontrado')
        setRow(null)
        return
      }
      setRow(data)
    } catch {
      setErr('Error de red')
      setRow(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken, id])

  useEffect(() => {
    void load()
  }, [load])

  const loadQuoteMessages = useCallback(async () => {
    if (!accessToken || !Number.isInteger(id) || id < 1) {
      setQuoteMessages([])
      return
    }
    try {
      const res = await fetch(apiUrl(`/api/services/${id}/messages`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data)) {
        setQuoteMessages([])
        return
      }
      setQuoteMessages(data)
    } catch {
      setQuoteMessages([])
    }
  }, [accessToken, id])

  useEffect(() => {
    if (!row || !SERVICE_MESSAGE_THREAD_STATUSES.includes(row.status)) {
      setQuoteMessages([])
      setQuoteMsgDraft('')
      setQuoteMsgErr('')
      return
    }
    void loadQuoteMessages()
  }, [row, loadQuoteMessages])

  const sendQuoteMessage = async () => {
    if (
      !accessToken ||
      quoteMsgBusy ||
      !row ||
      !SERVICE_MESSAGE_COMPOSE_STATUSES.includes(row.status)
    )
      return
    const text = quoteMsgDraft.trim()
    if (!text) return
    setQuoteMsgBusy(true)
    setQuoteMsgErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${id}/messages`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setQuoteMsgErr(data.error || 'No se pudo enviar')
        return
      }
      setQuoteMsgDraft('')
      setQuoteMessages((prev) => [...prev, data])
    } catch {
      setQuoteMsgErr('Error de red')
    } finally {
      setQuoteMsgBusy(false)
    }
  }

  const postAction = async (path) => {
    if (!accessToken || actionBusy) return
    setActionBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/services/${id}${path}`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Error')
        return
      }
      setRow(data)
      setErr('')
    } catch {
      setErr('Error de red')
    } finally {
      setActionBusy(false)
    }
  }

  const markServiceCompleted = async () => {
    if (!accessToken || actionBusy) return
    setActionBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${id}/status`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ status: 'completed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Error')
        return
      }
      setRow(data)
    } catch {
      setErr('Error de red')
    } finally {
      setActionBusy(false)
    }
  }

  const steps = useMemo(() => (row ? buildServiceProgressSteps(row.status) : []), [row])

  if (!Number.isInteger(id) || id < 1) {
    return (
      <div className="page-container sr-detail-page sr-detail-page--bare">
        <div className="sr-detail-shell">
          <p>Solicitud no válida.</p>
          <Link to="/services" className="sr-back-pill">
            Volver a servicios
          </Link>
        </div>
      </div>
    )
  }

  const cat = row ? categoryMeta(row.categoryId) : { name: '', icon: '📌' }

  return (
    <div className="page-container services-page sr-detail-page">
      <div className="sr-detail-bg" aria-hidden="true" />

      <div className="sr-detail-shell">
        <Link to="/services" className="sr-back-pill">
          <span className="sr-back-pill__arrow" aria-hidden="true">
            ←
          </span>
          Mis solicitudes
        </Link>

        {loading ? (
          <div className="sr-detail-skeleton card" aria-busy="true">
            <div className="sr-detail-skeleton__hero" />
            <div className="sr-detail-skeleton__line" />
            <div className="sr-detail-skeleton__line sr-detail-skeleton__line--short" />
            <div className="sr-detail-skeleton__block" />
          </div>
        ) : err && !row ? (
          <div className="card sr-detail-error-card">
            <p className="sr-detail-error-card__msg">{err}</p>
            <Link to="/services" className="btn btn--primary">
              Volver
            </Link>
          </div>
        ) : row ? (
          <>
            <header className="sr-detail-hero card">
              <div className="sr-detail-hero__visual" aria-hidden="true">
                <span className="sr-detail-hero__icon">{cat.icon}</span>
              </div>
              <div className="sr-detail-hero__text">
                <p className="sr-detail-hero__eyebrow">Solicitud de servicio</p>
                <h1 className="sr-detail-hero__title">{cat.name}</h1>
                <div className="sr-detail-hero__meta">
                  <span className={`sr-badge sr-badge--lg ${serviceRequestStatusBadgeClass(row.status)}`}>
                    {SERVICE_STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="sr-detail-hero__dot" aria-hidden="true">
                    ·
                  </span>
                  <time className="sr-detail-hero__time" dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            </header>

            <nav className="sr-track card" aria-label="Progreso del servicio">
              <p className="sr-track__title">Seguimiento</p>
              <ol className="sr-track__list">
                {steps.map((step, i) => (
                  <li
                    key={step.key}
                    className={`sr-track__item sr-track__item--${step.state}`}
                  >
                    <span className="sr-track__rail" aria-hidden="true">
                      {i < steps.length - 1 ? <span className="sr-track__rail-line" /> : null}
                    </span>
                    <span className="sr-track__dot-wrap">
                      <span className="sr-track__dot">
                        {step.state === 'done' ? '✓' : step.state === 'failed' ? '✕' : i + 1}
                      </span>
                    </span>
                    <span className="sr-track__copy">
                      <span className="sr-track__label">{step.label}</span>
                      <span className="sr-track__sub">{step.sub}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </nav>

            {err ? (
              <p className="sr-inline-error sr-detail-inline-err" role="alert">
                {err}
              </p>
            ) : null}

            <section className="card sr-detail-panel">
              <h2 className="sr-detail-panel__h">Tu mensaje</h2>
              <p className="sr-detail-panel__body">{row.description}</p>
              {row.serviceSubtypeLabel || row.preferredDate ? (
                <div className="sr-detail-chip-row">
                  {row.serviceSubtypeLabel ? (
                    <span className="sr-detail-chip">
                      <span className="sr-detail-chip__k">Tipo de limpieza</span>
                      <span className="sr-detail-chip__v">{row.serviceSubtypeLabel}</span>
                    </span>
                  ) : null}
                  {row.preferredDate ? (
                    <span className="sr-detail-chip">
                      <span className="sr-detail-chip__k">Fecha preferida</span>
                      <span className="sr-detail-chip__v">{row.preferredDate}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>

            {Array.isArray(row.photos) && row.photos.length > 0 ? (
              <section className="sr-gallery" aria-label="Fotos adjuntas">
                <h2 className="sr-gallery__h">Fotos</h2>
                <div className="sr-gallery__grid">
                  {row.photos.map((src, i) => (
                    <a
                      key={i}
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      className="sr-gallery__cell"
                    >
                      <img src={src} alt={`Foto ${i + 1} de la solicitud`} className="sr-gallery__img" />
                      <span className="sr-gallery__zoom">Ampliar</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {SERVICE_MESSAGE_THREAD_STATUSES.includes(row.status) ? (
              <section className="card sr-quote-thread-card">
                <header className="sr-quote-thread-card__head">
                  <span className="sr-quote-thread-card__icon" aria-hidden="true">
                    💬
                  </span>
                  <div className="sr-quote-thread-card__head-text">
                    <p className="sr-quote-thread-card__eyebrow">Conversación</p>
                    <h2 className="sr-quote-thread-card__title">Mensajes con administración</h2>
                    <p className="sr-quote-thread-card__sub">
                      {serviceMessageResidentSubtitle(row.status)}
                    </p>
                  </div>
                </header>
                <div className="sr-quote-thread-wrap sr-quote-thread-wrap--card">
                  {quoteMessages.length > 0 ? (
                    <ul className="sr-quote-thread" aria-label="Mensajes">
                      {quoteMessages.map((m) => (
                        <li
                          key={m.id}
                          className={`sr-quote-msg ${m.fromStaff ? 'sr-quote-msg--staff' : 'sr-quote-msg--me'}`}
                        >
                          <span className="sr-quote-msg__who">{m.authorLabel}</span>
                          <p className="sr-quote-msg__body">{m.body}</p>
                          <time className="sr-quote-msg__time" dateTime={m.createdAt}>
                            {new Date(m.createdAt).toLocaleString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="sr-quote-empty" role="status">
                      <span className="sr-quote-empty__glyph" aria-hidden="true" />
                      <p className="sr-quote-empty__title">Aún no hay mensajes</p>
                      <p className="sr-quote-empty__hint">
                        {SERVICE_MESSAGE_COMPOSE_STATUSES.includes(row.status)
                          ? 'Escribe abajo: te responderemos pronto.'
                          : 'No hubo mensajes en esta fase.'}
                      </p>
                    </div>
                  )}
                  {SERVICE_MESSAGE_COMPOSE_STATUSES.includes(row.status) ? (
                    <div className="sr-quote-compose">
                      <label className="sr-quote-compose__label" htmlFor="sr-quote-msg-input">
                        Tu mensaje
                      </label>
                      {quoteMsgErr ? (
                        <p className="sr-quote-compose__err" role="alert">
                          {quoteMsgErr}
                        </p>
                      ) : null}
                      <textarea
                        id="sr-quote-msg-input"
                        className="sr-quote-compose__input"
                        rows={4}
                        maxLength={4000}
                        placeholder="Ej. ¿Incluye materiales? ¿Qué día podrían venir?"
                        value={quoteMsgDraft}
                        onChange={(e) => setQuoteMsgDraft(e.target.value)}
                        disabled={quoteMsgBusy || actionBusy}
                        aria-label="Mensaje para administración"
                      />
                      <div className="sr-quote-compose__footer">
                        <span className="sr-quote-compose__counter">
                          {quoteMsgDraft.length}/4000
                        </span>
                        <button
                          type="button"
                          className="btn btn--primary sr-quote-compose__send"
                          disabled={quoteMsgBusy || actionBusy || !quoteMsgDraft.trim()}
                          onClick={() => void sendQuoteMessage()}
                        >
                          {quoteMsgBusy ? 'Enviando…' : 'Enviar mensaje'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {row.status === 'price_sent' ? (
              <section className="card sr-price-panel">
                <div className="sr-price-panel__head">
                  <span className="sr-price-panel__tag">Presupuesto orientativo</span>
                  <p className="sr-price-panel__amount">
                    {formatServicePriceDisplay(row.priceAmount, row.priceAmountMax) ?? '—'}
                  </p>
                </div>
                {row.priceNote ? <p className="sr-price-panel__note">{row.priceNote}</p> : null}
                <p className="sr-price-panel__hint">
                  No es un cobro automático. Revisa el importe y decide con tranquilidad.
                </p>

                <div className="sr-price-panel__actions">
                  <button
                    type="button"
                    className="btn btn--primary sr-price-panel__btn-primary"
                    disabled={actionBusy}
                    onClick={() => void postAction('/accept')}
                  >
                    Aceptar presupuesto
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost sr-price-panel__btn-ghost"
                    disabled={actionBusy}
                    onClick={() => void postAction('/reject')}
                  >
                    Rechazar
                  </button>
                </div>
              </section>
            ) : null}

            {row.status === 'accepted' ? (
              <section className="card sr-message-panel sr-message-panel--wait">
                <span className="sr-message-panel__icon" aria-hidden="true">
                  ⏳
                </span>
                <p className="sr-message-panel__text">
                  Has aceptado el presupuesto. En breve asignaremos un proveedor y pasará a «en curso».
                </p>
              </section>
            ) : null}

            {row.status === 'in_progress' ? (
              <section className="card sr-message-panel sr-message-panel--work">
                <span className="sr-message-panel__icon" aria-hidden="true">
                  🛠️
                </span>
                <p className="sr-message-panel__text">
                  Servicio en curso
                  {row.providerName ? (
                    <>
                      {' '}
                      con <strong>{row.providerName}</strong>
                    </>
                  ) : null}
                  .
                </p>
                <p className="sr-in-progress-hint">
                  Cuando el trabajo esté terminado, puedes marcar el servicio como completado.
                </p>
                <button
                  type="button"
                  className="btn btn--primary sr-in-progress-complete-btn"
                  disabled={actionBusy}
                  onClick={() => void markServiceCompleted()}
                >
                  {actionBusy ? 'Guardando…' : 'Marcar como completado'}
                </button>
              </section>
            ) : null}

            {row.status === 'completed' ? (
              <section className="card sr-message-panel sr-message-panel--done">
                <span className="sr-message-panel__icon" aria-hidden="true">
                  ✓
                </span>
                <p className="sr-message-panel__text">Servicio marcado como completado. ¡Gracias por usar Vecindario!</p>
              </section>
            ) : null}

            {row.status === 'rejected' ? (
              <section className="card sr-message-panel sr-message-panel--reject">
                <span className="sr-message-panel__icon" aria-hidden="true">
                  —
                </span>
                <p className="sr-message-panel__text">
                  Rechazaste el presupuesto. Si cambias de idea, puedes abrir una nueva solicitud.
                </p>
                <Link to="/services/new" className="btn btn--primary btn--sm sr-message-panel__cta">
                  Nueva solicitud
                </Link>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
