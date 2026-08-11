/**
 * V4 — Fila compacta de comunidad (presentacional).
 */
import { Link } from 'react-router-dom'
import {
  commercialStatusLabel,
  compactOpsStats,
  countAppNavFlags,
  formatBillingNet,
  isBillingConfigured,
  statusLabel,
  usageModeLabel,
} from './communityDisplay.js'

/**
 * @param {{
 *   community: object
 *   companyName: string
 *   billingSummary?: object | null
 *   showBilling?: boolean
 *   onOpenDetail: () => void
 *   onEdit: () => void
 *   onBilling: () => void
 * }} props
 */
export default function SuperAdminCommunityRow({
  community,
  companyName,
  billingSummary = null,
  showBilling = false,
  onOpenDetail,
  onEdit,
  onBilling,
}) {
  const ops = compactOpsStats(community)
  const nav = countAppNavFlags(community)
  const status = community.status || 'active'
  const billingConfigured = isBillingConfigured(billingSummary)
  const disc = Number(billingSummary?.discrepancyCount) || 0

  return (
    <article className="sa-comm-row">
      <div className="sa-comm-row__main">
        <div className="sa-comm-row__identity">
          <div className="sa-comm-row__title-line">
            <h3 className="sa-comm-row__name">{community.name}</h3>
            <span className={`sa-comm-row__status sa-comm-row__status--${status}`}>
              {statusLabel(status)}
            </span>
          </div>
          <p className="sa-comm-row__meta">
            <span>ID {community.id}</span>
            <span className="sa-comm-row__dot">·</span>
            <code>{community.accessCode || '—'}</code>
            <span className="sa-comm-row__dot">·</span>
            <span>{companyName || 'Sin empresa'}</span>
          </p>
        </div>

        {showBilling ? (
          <div className="sa-comm-row__billing">
            {billingConfigured ? (
              <>
                <span className={`cbs-badge cbs-badge--${billingSummary.commercialStatus}`}>
                  {commercialStatusLabel(billingSummary.commercialStatus)}
                </span>
                <span className="sa-comm-row__billing-plan">
                  {billingSummary.planName || billingSummary.planCode || '—'}
                </span>
                <span className="sa-comm-row__billing-mode">
                  {usageModeLabel(billingSummary.usageMode)}
                </span>
                <span className="sa-comm-row__billing-net">
                  {formatBillingNet(billingSummary) || '—'}
                </span>
                {disc > 0 ? (
                  <span className="sa-comm-row__disc" title="Discrepancias flags ↔ contrato">
                    ⚠ {disc}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="cbs-badge cbs-badge--unconfigured">Sin configurar</span>
            )}
          </div>
        ) : null}

        <div className="sa-comm-row__ops">
          <span title="Vecinos / cupo">{ops.neighborsLabel}</span>
          <span title="Incidencias abiertas / total">
            {ops.openIncidents}/{ops.totalIncidents} inc.
          </span>
          <span title="Reservas hoy">{ops.bookingsToday} res. hoy</span>
          <span title="Pestañas app activas">
            Pestañas {nav.active}/{nav.total}
          </span>
        </div>
      </div>

      <div className="sa-comm-row__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenDetail}>
          Ver detalle
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
          Editar
        </button>
        {showBilling ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBilling}>
            Plan y facturación
          </button>
        ) : null}
        <Link
          to={`/admin/communities/${community.id}/vecinos`}
          className="btn btn--primary btn--sm"
        >
          Vecinos
        </Link>
      </div>
    </article>
  )
}
