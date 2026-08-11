/**
 * V6 — Drawer detalle solicitud de servicio (acciones siempre usables).
 * Handlers vía callbacks; sin fetch propio.
 */
import {
  SERVICE_STATUS_LABELS,
  SERVICE_MESSAGE_THREAD_STATUSES,
  SERVICE_MESSAGE_COMPOSE_STATUSES,
  formatServicePriceDisplay,
  serviceSubtypeChipLabelEs,
} from '../../constants/serviceRequests.js'
import ServiceRequestPhotoGallery from '../ServiceRequestPhotoGallery.jsx'
import {
  buildServiceProgressSteps,
  categoryMeta,
} from '../../pages/services/serviceRequestUiShared.js'
import { serviceStatusTone } from './serviceOpsDisplay.js'

function adminMessageSubtitle(status) {
  if (status === 'pending_review')
    return 'Aclara dudas o pide datos antes de enviar el presupuesto.'
  if (status === 'price_sent')
    return 'Responde dudas sobre el presupuesto antes de que acepte o rechace.'
  if (status === 'accepted') return 'Informa al vecino mientras asignas proveedor.'
  if (status === 'in_progress') return 'Coordina dudas con el vecino hasta cerrar el servicio.'
  if (status === 'completed') return 'Historial de la conversación (solo lectura).'
  if (status === 'rejected') return 'Historial de mensajes sobre esta solicitud.'
  return ''
}

/**
 * @param {{
 *   displayRow: object
 *   detailLoading: boolean
 *   quoteMessages: object[]
 *   quoteMsgDraft: string
 *   quoteMsgBusy: boolean
 *   quoteMsgErr: string
 *   priceAmount: string
 *   priceAmountMax: string
 *   priceNote: string
 *   providerName: string
 *   busy: boolean
 *   onClose: () => void
 *   onPriceAmount: (v: string) => void
 *   onPriceAmountMax: (v: string) => void
 *   onPriceNote: (v: string) => void
 *   onProviderName: (v: string) => void
 *   onQuoteMsgDraft: (v: string) => void
 *   onSendQuoteMessage: () => void
 *   onSendPrice: () => void
 *   onAssignProvider: () => void
 *   onMarkCompleted: () => void
 *   onAcceptPrice?: () => void
 *   onRejectPrice?: () => void
 *   onPrev?: (() => void) | null
 *   onNext?: (() => void) | null
 *   onGoActionable?: (() => void) | null
 *   navIndex?: number
 *   navTotal?: number
 * }} props
 */
export default function SuperAdminServiceDetail({
  displayRow,
  detailLoading,
  quoteMessages,
  quoteMsgDraft,
  quoteMsgBusy,
  quoteMsgErr,
  priceAmount,
  priceAmountMax,
  priceNote,
  providerName,
  busy,
  onClose,
  onPriceAmount,
  onPriceAmountMax,
  onPriceNote,
  onProviderName,
  onQuoteMsgDraft,
  onSendQuoteMessage,
  onSendPrice,
  onAssignProvider,
  onMarkCompleted,
  onAcceptPrice = () => {},
  onRejectPrice = () => {},
  onPrev = null,
  onNext = null,
  onGoActionable = null,
  navIndex = 0,
  navTotal = 0,
}) {
  if (!displayRow) return null

  const cat = categoryMeta(displayRow.categoryId)
  const progressSteps = buildServiceProgressSteps(displayRow.status)
  const tone = serviceStatusTone(displayRow.status)
  const priceLabel = formatServicePriceDisplay(displayRow.priceAmount, displayRow.priceAmountMax)
  const showNav = navTotal > 1
  const canCompose = SERVICE_MESSAGE_COMPOSE_STATUSES.includes(displayRow.status)
  const showThread = SERVICE_MESSAGE_THREAD_STATUSES.includes(displayRow.status)
  const isClosed =
    displayRow.status === 'completed' || displayRow.status === 'rejected'

  return (
    <div className="sa-sv-drawer" role="dialog" aria-modal="true" aria-labelledby="sa-sv-detail-title">
      <div className="sa-sv-drawer__backdrop" aria-hidden="true" />
      <div className="sa-sv-drawer__panel">
        <header className="sa-sv-drawer__head">
          <div>
            <p className="sa-sv-drawer__kicker">Solicitud #{displayRow.id}</p>
            <h2 id="sa-sv-detail-title" className="sa-sv-drawer__title">
              {cat.name || 'Servicio'}
            </h2>
            <div className="sa-sv-drawer__sub">
              <span className={`sa-sv-row__status sa-sv-row__status--${tone}`}>
                {SERVICE_STATUS_LABELS[displayRow.status] ?? displayRow.status}
              </span>
              <time dateTime={displayRow.createdAt}>
                {new Date(displayRow.createdAt).toLocaleString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          </div>
          <div className="sa-sv-drawer__head-tools">
            {showNav ? (
              <div className="sa-sv-drawer__nav" aria-label="Navegar solicitudes">
                <button
                  type="button"
                  className="sa-sv-drawer__nav-btn"
                  aria-label="Anterior"
                  disabled={!onPrev}
                  onClick={() => onPrev?.()}
                >
                  ‹
                </button>
                <span className="sa-sv-drawer__nav-pos">
                  {navIndex + 1}/{navTotal}
                </span>
                <button
                  type="button"
                  className="sa-sv-drawer__nav-btn"
                  aria-label="Siguiente"
                  disabled={!onNext}
                  onClick={() => onNext?.()}
                >
                  ›
                </button>
              </div>
            ) : null}
            <button type="button" className="sa-sv-drawer__close" aria-label="Cerrar" onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        <div className="sa-sv-drawer__body">
          {detailLoading ? <p className="sa-sv-drawer__hint">Cargando detalle…</p> : null}

          <section>
            <h3 className="sa-sv-drawer__section-title">Identificación</h3>
            <dl className="sa-sv-drawer__dl">
              <div>
                <dt>Comunidad</dt>
                <dd>{displayRow.communityName || `#${displayRow.communityId}`}</dd>
              </div>
              <div>
                <dt>Solicitante</dt>
                <dd>{displayRow.requesterName?.trim() || displayRow.requesterEmail || '—'}</dd>
              </div>
              {displayRow.requesterEmail ? (
                <div className="sa-sv-drawer__dl--full">
                  <dt>Correo</dt>
                  <dd>{displayRow.requesterEmail}</dd>
                </div>
              ) : null}
              {displayRow.requesterPiso || displayRow.requesterPortal ? (
                <div>
                  <dt>Vivienda</dt>
                  <dd>
                    {[displayRow.requesterPortal, displayRow.requesterPiso].filter(Boolean).join(' · ') ||
                      '—'}
                  </dd>
                </div>
              ) : null}
              {displayRow.providerName ? (
                <div className="sa-sv-drawer__dl--full">
                  <dt>Proveedor asignado</dt>
                  <dd>{displayRow.providerName}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <nav className="sr-track card" aria-label="Progreso del servicio">
            <p className="sr-track__title">Seguimiento</p>
            <ol className="sr-track__list">
              {progressSteps.map((step, i) => (
                <li key={step.key} className={`sr-track__item sr-track__item--${step.state}`}>
                  <span className="sr-track__rail" aria-hidden="true">
                    {i < progressSteps.length - 1 ? <span className="sr-track__rail-line" /> : null}
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

          <section className="card sr-detail-panel">
            <h3 className="sa-sv-drawer__section-title">Descripción</h3>
            {displayRow.description?.trim() ? (
              <p className="sa-sv-drawer__p">{displayRow.description}</p>
            ) : (
              <p className="sa-sv-drawer__hint">Sin texto; revisa las fotos.</p>
            )}
            {displayRow.serviceSubtypeLabel ||
            displayRow.preferredDate ||
            displayRow.needsTechnicalVisit ? (
              <div className="sr-detail-chip-row">
                {displayRow.serviceSubtypeLabel ? (
                  <span className="sr-detail-chip">
                    <span className="sr-detail-chip__k">
                      {serviceSubtypeChipLabelEs(displayRow.categoryId)}
                    </span>
                    <span className="sr-detail-chip__v">{displayRow.serviceSubtypeLabel}</span>
                  </span>
                ) : null}
                {displayRow.needsTechnicalVisit ? (
                  <span className="sr-detail-chip">
                    <span className="sr-detail-chip__k">Visita</span>
                    <span className="sr-detail-chip__v">Necesita visita técnica</span>
                  </span>
                ) : null}
                {displayRow.preferredDate ? (
                  <span className="sr-detail-chip">
                    <span className="sr-detail-chip__k">Fecha preferida</span>
                    <span className="sr-detail-chip__v">{displayRow.preferredDate}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>

          <ServiceRequestPhotoGallery photos={displayRow.photos} heading="Fotos del vecino" />

          {displayRow.priceAmount != null &&
          ['price_sent', 'accepted', 'rejected', 'in_progress', 'completed'].includes(
            displayRow.status,
          ) ? (
            <section className="card sr-price-panel sr-admin-price-summary">
              <div className="sr-price-panel__head">
                <span className="sr-price-panel__tag">Presupuesto enviado al vecino</span>
                <p className="sr-price-panel__amount">{priceLabel ?? '—'}</p>
              </div>
              {displayRow.priceNote ? (
                <p className="sr-price-panel__note">{displayRow.priceNote}</p>
              ) : null}
            </section>
          ) : null}

          {showThread ? (
            <section className="card sr-quote-thread-card">
              <header className="sr-quote-thread-card__head">
                <span className="sr-quote-thread-card__icon" aria-hidden="true">
                  💬
                </span>
                <div className="sr-quote-thread-card__head-text">
                  <p className="sr-quote-thread-card__eyebrow">Conversación</p>
                  <h3 className="sr-quote-thread-card__title">Mensajes con el vecino</h3>
                  <p className="sr-quote-thread-card__sub">{adminMessageSubtitle(displayRow.status)}</p>
                </div>
              </header>
              <div className="sr-quote-thread-wrap sr-quote-thread-wrap--card">
                {quoteMessages.length > 0 ? (
                  <ul className="sr-quote-thread sr-quote-thread--admin" aria-label="Mensajes">
                    {quoteMessages.map((m) => (
                      <li
                        key={m.id}
                        className={`sr-quote-msg ${m.fromStaff ? 'sr-quote-msg--me' : 'sr-quote-msg--staff'}`}
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
                    <p className="sr-quote-empty__title">Sin mensajes todavía</p>
                    <p className="sr-quote-empty__hint">
                      {canCompose
                        ? 'Usa el cuadro de abajo (fijo) para escribir al vecino.'
                        : 'No hay mensajes en esta fase.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="sa-sv-drawer__foot">
          {canCompose ? (
            <div className="sa-sv-drawer__compose">
              <p className="sa-sv-drawer__foot-title">Responder al vecino</p>
              {quoteMsgErr ? (
                <p className="sr-quote-compose__err" role="alert">
                  {quoteMsgErr}
                </p>
              ) : null}
              <textarea
                id="admin-sr-quote-msg"
                className="sa-sv-drawer__compose-input"
                rows={3}
                maxLength={4000}
                placeholder="Escribe aquí y pulsa Enviar respuesta…"
                value={quoteMsgDraft}
                onChange={(e) => onQuoteMsgDraft(e.target.value)}
                disabled={quoteMsgBusy || busy}
                aria-label="Mensaje al vecino"
              />
              <div className="sa-sv-drawer__foot-row">
                <span className="sa-sv-drawer__hint">{quoteMsgDraft.length}/4000</span>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={quoteMsgBusy || busy || !quoteMsgDraft.trim()}
                  onClick={() => void onSendQuoteMessage()}
                >
                  {quoteMsgBusy ? 'Enviando…' : 'Enviar respuesta'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="sa-sv-drawer__actions">
            <p className="sa-sv-drawer__foot-title">Gestión</p>

            {displayRow.status === 'pending_review' ? (
              <>
                <div className="sa-sv-drawer__price-range">
                  <label className="sa-sv-drawer__field">
                    Precio mínimo (€)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={priceAmount}
                      onChange={(e) => onPriceAmount(e.target.value)}
                      placeholder="0.00"
                      autoComplete="off"
                    />
                  </label>
                  <label className="sa-sv-drawer__field">
                    Precio máximo (€)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={priceAmountMax}
                      onChange={(e) => onPriceAmountMax(e.target.value)}
                      placeholder="Opcional"
                      autoComplete="off"
                    />
                  </label>
                </div>
                <label className="sa-sv-drawer__field">
                  Nota del presupuesto (opcional)
                  <textarea
                    value={priceNote}
                    onChange={(e) => onPriceNote(e.target.value)}
                    placeholder="Explicación breve"
                    rows={2}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void onSendPrice()}
                >
                  {busy ? 'Enviando…' : 'Enviar presupuesto'}
                </button>
              </>
            ) : null}

            {displayRow.status === 'price_sent' ? (
              <>
                <p className="sa-sv-drawer__hint">
                  Presupuesto ya enviado. Puedes aceptar o rechazar en nombre del vecino, o
                  responderle arriba.
                </p>
                <div className="sa-sv-drawer__foot-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void onAcceptPrice()}
                  >
                    {busy ? '…' : 'Aceptar presupuesto'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => void onRejectPrice()}
                  >
                    Rechazar
                  </button>
                </div>
              </>
            ) : null}

            {displayRow.status === 'accepted' ? (
              <>
                <label className="sa-sv-drawer__field">
                  Proveedor (nombre / contacto)
                  <input
                    type="text"
                    value={providerName}
                    onChange={(e) => onProviderName(e.target.value)}
                    placeholder="Ej. Limpiezas García"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void onAssignProvider()}
                >
                  {busy ? 'Guardando…' : 'Asignar y poner en curso'}
                </button>
              </>
            ) : null}

            {displayRow.status === 'in_progress' ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void onMarkCompleted()}
              >
                {busy ? 'Guardando…' : 'Marcar completado'}
              </button>
            ) : null}

            {isClosed ? (
              <>
                <p className="sa-sv-drawer__hint">
                  {displayRow.status === 'completed'
                    ? 'Esta solicitud está cerrada: no se puede presupuestar ni escribir.'
                    : 'Presupuesto rechazado: no hay más acciones aquí.'}
                </p>
                {onGoActionable ? (
                  <button type="button" className="btn btn--primary" onClick={() => onGoActionable()}>
                    Ir a una solicitud abierta
                  </button>
                ) : onNext ? (
                  <button type="button" className="btn btn--primary" onClick={() => onNext()}>
                    Siguiente solicitud ›
                  </button>
                ) : null}
              </>
            ) : null}

            {showNav ? (
              <div className="sa-sv-drawer__foot-row">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={!onPrev}
                  onClick={() => onPrev?.()}
                >
                  ‹ Anterior
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={!onNext}
                  onClick={() => onNext?.()}
                >
                  Siguiente ›
                </button>
              </div>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  )
}
