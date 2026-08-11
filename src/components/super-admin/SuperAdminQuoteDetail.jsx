/**
 * V6 — Drawer detalle solicitud de oferta.
 * Cambio de estado vía callback (mismo PATCH que antes).
 */
import { quoteStatusLabel, quoteTabsLabel } from './serviceOpsDisplay.js'

const STATUS_OPTS = [
  { value: 'new', label: 'Nueva' },
  { value: 'reviewed', label: 'Revisada' },
  { value: 'contacted', label: 'Contactada' },
  { value: 'closed', label: 'Cerrada' },
]

/**
 * @param {{
 *   row: object
 *   onClose: () => void
 *   onPatchStatus: (id: number, status: string) => void
 *   onPrev?: (() => void) | null
 *   onNext?: (() => void) | null
 *   navIndex?: number
 *   navTotal?: number
 * }} props
 */
export default function SuperAdminQuoteDetail({
  row,
  onClose,
  onPatchStatus,
  onPrev = null,
  onNext = null,
  navIndex = 0,
  navTotal = 0,
}) {
  if (!row) return null
  const showNav = navTotal > 1

  return (
    <div className="sa-qr-drawer" role="dialog" aria-modal="true" aria-labelledby="sa-qr-detail-title">
      <div className="sa-qr-drawer__backdrop" aria-hidden="true" />
      <div className="sa-qr-drawer__panel">
        <header className="sa-qr-drawer__head">
          <div>
            <p className="sa-qr-drawer__kicker">Solicitud de oferta #{row.id}</p>
            <h2 id="sa-qr-detail-title" className="sa-qr-drawer__title">
              {row.communityName || 'Sin nombre'}
            </h2>
            <div className="sa-qr-drawer__sub">
              <span className={`sa-qr-row__status sa-qr-row__status--${row.status || 'new'}`}>
                {quoteStatusLabel(row.status)}
              </span>
              <time dateTime={row.createdAt}>
                {new Date(row.createdAt).toLocaleString('es-ES')}
              </time>
            </div>
          </div>
          <div className="sa-qr-drawer__head-tools">
            {showNav ? (
              <div className="sa-qr-drawer__nav" aria-label="Navegar solicitudes">
                <button
                  type="button"
                  className="sa-qr-drawer__nav-btn"
                  aria-label="Anterior"
                  disabled={!onPrev}
                  onClick={() => onPrev?.()}
                >
                  ‹
                </button>
                <span className="sa-qr-drawer__nav-pos">
                  {navIndex + 1}/{navTotal}
                </span>
                <button
                  type="button"
                  className="sa-qr-drawer__nav-btn"
                  aria-label="Siguiente"
                  disabled={!onNext}
                  onClick={() => onNext?.()}
                >
                  ›
                </button>
              </div>
            ) : null}
            <button type="button" className="sa-qr-drawer__close" aria-label="Cerrar" onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        <div className="sa-qr-drawer__body">
          <section>
            <h3 className="sa-qr-drawer__section-title">Información de la solicitud</h3>
            <dl className="sa-qr-drawer__dl">
              <div>
                <dt>Comunidad</dt>
                <dd>{row.communityName || '—'}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{new Date(row.createdAt).toLocaleString('es-ES')}</dd>
              </div>
              {row.communityAddress ? (
                <div className="sa-qr-drawer__dl--full">
                  <dt>Dirección</dt>
                  <dd>{row.communityAddress}</dd>
                </div>
              ) : null}
              {row.dwellingApprox ? (
                <div>
                  <dt>Viviendas</dt>
                  <dd>{row.dwellingApprox}</dd>
                </div>
              ) : null}
              <div className="sa-qr-drawer__dl--full">
                <dt>Pestañas app</dt>
                <dd>{quoteTabsLabel(row)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="sa-qr-drawer__section-title">Datos de contacto</h3>
            <dl className="sa-qr-drawer__dl">
              <div>
                <dt>Nombre</dt>
                <dd>{row.contactName || '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{row.contactEmail || '—'}</dd>
              </div>
              {row.contactPhone ? (
                <div>
                  <dt>Teléfono</dt>
                  <dd>{row.contactPhone}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h3 className="sa-qr-drawer__section-title">Contenido solicitado</h3>
            {row.message?.trim() ? (
              <p className="sa-qr-drawer__p">{row.message}</p>
            ) : (
              <p className="sa-qr-drawer__hint">Sin notas adicionales.</p>
            )}
          </section>
        </div>

        <footer className="sa-qr-drawer__foot">
          <p className="sa-qr-drawer__foot-title">Estado / acciones</p>
          <label className="sa-qr-drawer__field" htmlFor={`qr-st-detail-${row.id}`}>
            Seguimiento interno
            <select
              id={`qr-st-detail-${row.id}`}
              value={row.status}
              onChange={(e) => void onPatchStatus(row.id, e.target.value)}
            >
              {STATUS_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {showNav && (onPrev || onNext) ? (
            <div className="sa-qr-drawer__foot-row">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={!onPrev}
                onClick={() => onPrev?.()}
              >
                ‹ Anterior
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={!onNext}
                onClick={() => onNext?.()}
              >
                Siguiente ›
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
