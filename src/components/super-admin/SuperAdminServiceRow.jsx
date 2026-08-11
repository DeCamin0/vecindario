/**
 * V6 — Fila compacta solicitud de servicio (presentacional).
 */
import {
  SERVICE_STATUS_LABELS,
  formatServicePriceDisplay,
} from '../../constants/serviceRequests.js'
import { serviceStatusTone } from './serviceOpsDisplay.js'

function categoryLabel(id, categories) {
  return categories.find((c) => c.id === id)?.name ?? id
}

/**
 * @param {{
 *   row: object
 *   categories: Array<{ id: string, name: string }>
 *   selected?: boolean
 *   onOpenDetail: () => void
 * }} props
 */
export default function SuperAdminServiceRow({ row, categories, selected = false, onOpenDetail }) {
  const price = formatServicePriceDisplay(row.priceAmount, row.priceAmountMax)
  const desc = typeof row.description === 'string' ? row.description.trim() : ''
  const summary = desc.length > 120 ? `${desc.slice(0, 120)}…` : desc
  const tone = serviceStatusTone(row.status)

  return (
    <article className={`sa-sv-row${selected ? ' sa-sv-row--on' : ''}`}>
      <div className="sa-sv-row__main">
        <div>
          <div className="sa-sv-row__title-line">
            <h3 className="sa-sv-row__name">{categoryLabel(row.categoryId, categories)}</h3>
            <span className={`sa-sv-row__status sa-sv-row__status--${tone}`}>
              {SERVICE_STATUS_LABELS[row.status] ?? row.status}
            </span>
          </div>
          <p className="sa-sv-row__meta">
            <span>#{row.id}</span>
            <span className="sa-sv-row__dot">·</span>
            <span>{row.communityName || `Comunidad #${row.communityId}`}</span>
          </p>
        </div>

        <div>
          {summary ? <p className="sa-sv-row__summary">{summary}</p> : null}
          {row.serviceSubtypeLabel ? (
            <p className="sa-sv-row__meta">{row.serviceSubtypeLabel}</p>
          ) : null}
        </div>

        <div className="sa-sv-row__side">
          <span>{row.requesterEmail || row.requesterName || '—'}</span>
          <span>{new Date(row.createdAt).toLocaleDateString('es-ES')}</span>
          {row.providerName ? <span>Prov. {row.providerName}</span> : null}
          {price ? <span className="sa-sv-row__price">{price}</span> : null}
        </div>
      </div>

      <div className="sa-sv-row__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenDetail}>
          Ver detalle
        </button>
      </div>
    </article>
  )
}
