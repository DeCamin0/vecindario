/**
 * B8 — Dashboard comercial (MRR/ARR) Super Admin.
 * Solo lectura. Importes vienen del API; no se calculan en cliente.
 * El fetch vive en useAdminBillingSummary (compartido con Inicio V3).
 */
import { billingModuleLabel } from '../lib/billingModuleLabels.js'
import './BillingCommercialDashboard.css'

function formatEur(raw) {
  if (raw == null || raw === '') return '—'
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return String(raw)
  return `${n.toFixed(2).replace('.', ',')} €`
}

function formatEurMonth(raw) {
  const base = formatEur(raw)
  return base === '—' ? base : `${base}/mes`
}

function formatEurYear(raw) {
  const base = formatEur(raw)
  return base === '—' ? base : `${base}/año`
}

/**
 * @param {{
 *   data: object | null
 *   loading?: boolean
 *   error?: string | null
 *   onReload?: () => void
 *   embedded?: boolean
 * }} props
 */
export default function BillingCommercialDashboard({
  data = null,
  loading = false,
  error = null,
  onReload,
  embedded = false,
}) {
  if (!data && !loading && !error) return null

  const communities = data?.communities
  const mrr = data?.mrrEur ?? data?.mrr
  const arr = data?.arrEur ?? data?.arr
  const ticket = data?.averageMonthlyTicketEur ?? data?.averageMonthlyTicket

  return (
    <section
      className={`bcd admin-section${embedded ? ' bcd--embedded' : ''}`}
      aria-labelledby="bcd-title"
    >
      <div className="admin-section-head">
        <h2 id="bcd-title" className="admin-section-title">
          {embedded ? 'Resumen comercial' : 'Resumen comercial'}
        </h2>
        {typeof onReload === 'function' ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void onReload()}
            disabled={loading}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        ) : null}
      </div>

      <p className="bcd-lead">
        Métricas a partir de contratos configurados (snapshots). Importes sin IVA. El catálogo no
        representa el MRR actual.
      </p>

      {error ? <p className="admin-banner-error">{error}</p> : null}
      {loading && !data ? <p className="bcd-muted">Cargando resumen…</p> : null}

      {data ? (
        <>
          <div className="bcd-kpis">
            <article className="bcd-kpi bcd-kpi--primary">
              <span className="bcd-kpi__label">MRR</span>
              <strong className="bcd-kpi__value">{formatEurMonth(mrr)}</strong>
            </article>
            <article className="bcd-kpi">
              <span className="bcd-kpi__label">ARR estimado</span>
              <strong className="bcd-kpi__value">{formatEurYear(arr)}</strong>
            </article>
            <article className="bcd-kpi">
              <span className="bcd-kpi__label">Ticket medio</span>
              <strong className="bcd-kpi__value">
                {ticket == null ? '—' : formatEurMonth(ticket)}
              </strong>
            </article>
            <article className="bcd-kpi">
              <span className="bcd-kpi__label">Comunidades con MRR</span>
              <strong className="bcd-kpi__value">
                {communities?.contributingToMrr ?? data.mrrCommunities ?? 0}
              </strong>
            </article>
          </div>

          <div className="bcd-meta-row">
            <span className="bcd-chip">
              Total <strong>{communities?.total ?? '—'}</strong>
            </span>
            <span className="bcd-chip">
              Configurado <strong>{communities?.configured ?? data.configuredCommunities}</strong>
            </span>
            <span className="bcd-chip">
              Sin configurar{' '}
              <strong>{communities?.unconfigured ?? data.unconfiguredCommunities}</strong>
            </span>
            <span className="bcd-chip">
              No aportan MRR <strong>{communities?.notContributingToMrr ?? '—'}</strong>
            </span>
            {typeof data.negotiatedContractsCount === 'number' &&
            data.negotiatedContractsCount > 0 ? (
              <span className="bcd-chip">
                Precio negociado <strong>{data.negotiatedContractsCount}</strong>
              </span>
            ) : null}
          </div>

          <div className="bcd-panels">
            <article className="bcd-panel">
              <h3 className="bcd-panel__title">Estado comercial</h3>
              <ul className="bcd-list">
                {(data.byCommercialStatus || []).map((row) => (
                  <li key={row.status}>
                    <span className={`bcd-status bcd-status--${row.status}`}>{row.label}</span>
                    <strong>{row.communityCount}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="bcd-panel">
              <h3 className="bcd-panel__title">Modalidad de uso</h3>
              {(data.byUsageMode || []).length === 0 ? (
                <p className="bcd-muted">Sin contratos configurados.</p>
              ) : (
                <ul className="bcd-list bcd-list--rich">
                  {(data.byUsageMode || []).map((row) => (
                    <li key={row.usageMode}>
                      <div>
                        <strong>{row.label}</strong>
                        <span className="bcd-muted">
                          {' '}
                          · {row.communityCount} comunidad
                          {row.communityCount === 1 ? '' : 'es'}
                        </span>
                      </div>
                      <span>{formatEurMonth(row.mrrEur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="bcd-panel">
              <h3 className="bcd-panel__title">Planes contratados</h3>
              {(data.byPlan || []).length === 0 ? (
                <p className="bcd-muted">Sin planes contratados todavía.</p>
              ) : (
                <ul className="bcd-list bcd-list--rich">
                  {(data.byPlan || []).map((row) => (
                    <li key={row.planCode}>
                      <div>
                        <strong>{row.planName || row.planCode}</strong>
                        <span className="bcd-muted">
                          {' '}
                          · {row.communityCount} comunidad
                          {row.communityCount === 1 ? '' : 'es'}
                        </span>
                      </div>
                      <span>{formatEurMonth(row.mrrEur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="bcd-panel bcd-panel--wide">
              <h3 className="bcd-panel__title">Módulos contratados</h3>
              {(data.modules || []).length === 0 ? (
                <p className="bcd-muted">Sin módulos contratados todavía.</p>
              ) : (
                <ul className="bcd-list bcd-list--modules">
                  {(data.modules || []).map((row) => (
                    <li key={row.moduleCode}>
                      <span>{row.moduleName || billingModuleLabel(row.moduleCode)}</span>
                      <span>
                        {row.contractedCommunityCount} comunidad
                        {row.contractedCommunityCount === 1 ? '' : 'es'}
                        {row.percentageConfigured != null
                          ? ` · ${String(row.percentageConfigured).replace('.', ',')}%`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        </>
      ) : null}
    </section>
  )
}
