/**
 * Final Review — Dashboard Inicio Super Admin (presentacional).
 * No fetch propio: recibe datos/callbacks desde Admin.jsx.
 *
 * Orden: Atención → Comercial → Contexto (secundario) → Acciones de creación.
 */
import { Link } from 'react-router-dom'
import './SuperAdminHomeDashboard.css'

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
 *   context?: {
 *     communitiesCount: number | string
 *     communitiesHint?: string | null
 *     plannedSlots: number | string
 *     plannedHint?: string | null
 *     activeBookings: number | string
 *     bookingsHint?: string | null
 *     loading?: boolean
 *   } | null
 *   showCommercial?: boolean
 *   commercial?: {
 *     data: object | null
 *     loading: boolean
 *     error: string | null
 *   } | null
 *   attentionItems?: Array<{
 *     id: string
 *     title: string
 *     count: number
 *     hint?: string
 *     accent?: boolean
 *     section?: string
 *     to?: string
 *   }>
 *   quickActions?: Array<{
 *     id: string
 *     title: string
 *     subtitle?: string
 *     icon: string
 *     section?: string
 *     to?: string
 *     onClick?: () => void
 *   }>
 *   onNavigateSection?: (sectionId: string) => void
 * }} props
 */
export default function SuperAdminHomeDashboard({
  context = null,
  showCommercial = false,
  commercial = null,
  attentionItems = [],
  quickActions = [],
  onNavigateSection,
}) {
  const cData = commercial?.data
  const mrr = cData?.mrrEur ?? cData?.mrr
  const arr = cData?.arrEur ?? cData?.arr
  const ticket = cData?.averageMonthlyTicketEur ?? cData?.averageMonthlyTicket
  const mrrCommunities =
    cData?.communities?.contributingToMrr ?? cData?.mrrCommunities ?? (cData ? 0 : null)

  return (
    <div className="sa-home">
      <section className="sa-home__block" aria-labelledby="sa-home-attn-title">
        <div className="sa-home__block-head">
          <h2 id="sa-home-attn-title" className="sa-home__block-title">
            Atención
          </h2>
          <p className="sa-home__block-sub">Señales que requieren revisión (datos ya cargados)</p>
        </div>
        {attentionItems.length === 0 ? (
          <p className="sa-home__empty">Nada pendiente por ahora.</p>
        ) : (
          <ul className="sa-home__attn-list sa-home__attn-list--primary">
            {attentionItems.map((item) => {
              const className = `sa-home__attn-item${item.accent ? ' is-accent' : ''}`
              const body = (
                <>
                  <span className="sa-home__attn-count">{item.count}</span>
                  <span className="sa-home__attn-body">
                    <span className="sa-home__attn-title">{item.title}</span>
                    {item.hint ? <span className="sa-home__attn-hint">{item.hint}</span> : null}
                  </span>
                  <span className="sa-home__attn-chevron" aria-hidden="true">
                    →
                  </span>
                </>
              )
              if (item.to) {
                return (
                  <li key={item.id}>
                    <Link to={item.to} className={className}>
                      {body}
                    </Link>
                  </li>
                )
              }
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={className}
                    onClick={() => item.section && onNavigateSection?.(item.section)}
                  >
                    {body}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showCommercial ? (
        <section className="sa-home__block" aria-labelledby="sa-home-com-title">
          <div className="sa-home__block-head sa-home__block-head--row">
            <div>
              <h2 id="sa-home-com-title" className="sa-home__block-title">
                Comercial
              </h2>
              <p className="sa-home__block-sub">Pulso del negocio · detalle en Plan y facturación</p>
            </div>
            <button
              type="button"
              className="sa-home__text-link"
              onClick={() => onNavigateSection?.('billing')}
            >
              Ver detalle →
            </button>
          </div>
          {commercial?.error ? (
            <p className="sa-home__error" role="alert">
              {commercial.error}
            </p>
          ) : null}
          {commercial?.loading && !cData ? (
            <p className="sa-home__muted">Cargando resumen comercial…</p>
          ) : null}
          {cData ? (
            <div className="sa-home__kpi-grid sa-home__kpi-grid--commercial">
              <article className="sa-home__kpi sa-home__kpi--commercial">
                <span className="sa-home__kpi-label">MRR</span>
                <strong className="sa-home__kpi-value">{formatEurMonth(mrr)}</strong>
              </article>
              <article className="sa-home__kpi">
                <span className="sa-home__kpi-label">ARR estimado</span>
                <strong className="sa-home__kpi-value">{formatEurYear(arr)}</strong>
              </article>
              <article className="sa-home__kpi">
                <span className="sa-home__kpi-label">Ticket medio</span>
                <strong className="sa-home__kpi-value">
                  {ticket == null ? '—' : formatEurMonth(ticket)}
                </strong>
              </article>
              <article className="sa-home__kpi">
                <span className="sa-home__kpi-label">Comunidades con MRR</span>
                <strong className="sa-home__kpi-value">{mrrCommunities ?? '—'}</strong>
              </article>
            </div>
          ) : null}
        </section>
      ) : null}

      {context ? (
        <section className="sa-home__block" aria-labelledby="sa-home-ctx-title">
          <div className="sa-home__block-head">
            <h2 id="sa-home-ctx-title" className="sa-home__block-title">
              Contexto
            </h2>
            <p className="sa-home__block-sub">Volumen operativo (secundario)</p>
          </div>
          <div className="sa-home__ctx-grid" role="list">
            <div className="sa-home__ctx-item" role="listitem">
              <span className="sa-home__ctx-label">Comunidades operativas</span>
              <strong className="sa-home__ctx-value">{context.communitiesCount}</strong>
              {context.communitiesHint ? (
                <span className="sa-home__ctx-hint">{context.communitiesHint}</span>
              ) : null}
            </div>
            <div className="sa-home__ctx-item" role="listitem">
              <span className="sa-home__ctx-label">Cupo vecinos</span>
              <strong className="sa-home__ctx-value">
                {context.loading ? '—' : context.plannedSlots}
              </strong>
              {context.plannedHint ? (
                <span className="sa-home__ctx-hint">{context.plannedHint}</span>
              ) : null}
            </div>
            <div className="sa-home__ctx-item" role="listitem">
              <span className="sa-home__ctx-label">Reservas activas</span>
              <strong className="sa-home__ctx-value">
                {context.loading ? '—' : context.activeBookings}
              </strong>
              {context.bookingsHint ? (
                <span className="sa-home__ctx-hint">{context.bookingsHint}</span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {quickActions.length > 0 ? (
        <section className="sa-home__block" aria-labelledby="sa-home-qa-title">
          <div className="sa-home__block-head">
            <h2 id="sa-home-qa-title" className="sa-home__block-title">
              Acciones rápidas
            </h2>
            <p className="sa-home__block-sub">Creación frecuente (el menú lateral cubre la navegación)</p>
          </div>
          <div className="sa-home__actions sa-home__actions--create">
            {quickActions.map((action) => {
              const className = 'sa-home__action'
              const inner = (
                <>
                  <span className="sa-home__action-icon" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="sa-home__action-text">
                    <span className="sa-home__action-title">{action.title}</span>
                    {action.subtitle ? (
                      <span className="sa-home__action-sub">{action.subtitle}</span>
                    ) : null}
                  </span>
                </>
              )
              if (action.to) {
                return (
                  <Link key={action.id} to={action.to} className={className}>
                    {inner}
                  </Link>
                )
              }
              return (
                <button
                  key={action.id}
                  type="button"
                  className={className}
                  onClick={() => {
                    if (action.onClick) action.onClick()
                    else if (action.section) onNavigateSection?.(action.section)
                  }}
                >
                  {inner}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
