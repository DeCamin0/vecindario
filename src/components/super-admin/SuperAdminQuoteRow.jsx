/**
 * V6 — Fila compacta solicitud de oferta (presentacional).
 */
import { quoteStatusLabel, quoteTabsLabel } from './serviceOpsDisplay.js'

/**
 * @param {{
 *   row: object
 *   selected?: boolean
 *   onOpenDetail: () => void
 * }} props
 */
export default function SuperAdminQuoteRow({ row, selected = false, onOpenDetail }) {
  const msg = typeof row.message === 'string' ? row.message.trim() : ''
  const summary = msg.length > 110 ? `${msg.slice(0, 110)}…` : msg

  return (
    <article className={`sa-qr-row${selected ? ' sa-qr-row--on' : ''}`}>
      <div className="sa-qr-row__main">
        <div>
          <div className="sa-qr-row__title-line">
            <h3 className="sa-qr-row__name">{row.communityName || 'Sin nombre'}</h3>
            <span className={`sa-qr-row__status sa-qr-row__status--${row.status || 'new'}`}>
              {quoteStatusLabel(row.status)}
            </span>
          </div>
          <p className="sa-qr-row__meta">
            <span>#{row.id}</span>
            <span className="sa-qr-row__dot">·</span>
            <span>{new Date(row.createdAt).toLocaleString('es-ES')}</span>
          </p>
        </div>

        <div>
          <p className="sa-qr-row__meta">
            {row.contactName}
            {row.contactEmail ? ` · ${row.contactEmail}` : ''}
          </p>
          {summary ? <p className="sa-qr-row__summary">{summary}</p> : null}
        </div>

        <div className="sa-qr-row__side">
          <span>{quoteTabsLabel(row)}</span>
          {row.dwellingApprox ? <span>{row.dwellingApprox} viv.</span> : null}
        </div>
      </div>

      <div className="sa-qr-row__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenDetail}>
          Ver detalle
        </button>
      </div>
    </article>
  )
}
