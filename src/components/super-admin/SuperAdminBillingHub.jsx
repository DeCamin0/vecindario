/**
 * V7 — Hub visual Plan y facturación (Resumen | Catálogo).
 * Sin lógica de negocio: solo composición y subnavegación.
 */
import { useState } from 'react'
import BillingCommercialDashboard from '../BillingCommercialDashboard.jsx'
import BillingCatalogPanel from '../BillingCatalogPanel.jsx'
import './SuperAdminBillingHub.css'

/**
 * @param {{
 *   accessToken: string | null
 *   commercial: {
 *     data: object | null
 *     loading: boolean
 *     error: string | null
 *     reload: () => void
 *   }
 * }} props
 */
export default function SuperAdminBillingHub({ accessToken, commercial }) {
  const [tab, setTab] = useState('resumen')

  return (
    <div className="sa-billing-hub">
      <div className="sa-billing-hub__toolbar">
        <nav className="sa-billing-hub__tabs" aria-label="Plan y facturación">
          <button
            type="button"
            className={`sa-billing-hub__tab${tab === 'resumen' ? ' is-active' : ''}`}
            aria-current={tab === 'resumen' ? 'page' : undefined}
            onClick={() => setTab('resumen')}
          >
            Resumen
          </button>
          <button
            type="button"
            className={`sa-billing-hub__tab${tab === 'catalogo' ? ' is-active' : ''}`}
            aria-current={tab === 'catalogo' ? 'page' : undefined}
            onClick={() => setTab('catalogo')}
          >
            Catálogo
          </button>
        </nav>
        <p className="sa-billing-hub__hint">
          {tab === 'resumen'
            ? 'MRR y desglose comercial (contratos / snapshots)'
            : 'Precios e includes del catálogo (no reescribe contratos)'}
        </p>
      </div>

      <div
        className="sa-billing-hub__pane sa-view"
        data-billing-tab="resumen"
        hidden={tab !== 'resumen'}
      >
        <BillingCommercialDashboard
          data={commercial?.data ?? null}
          loading={Boolean(commercial?.loading)}
          error={commercial?.error ?? null}
          onReload={commercial?.reload}
          embedded
        />
      </div>

      <div
        className="sa-billing-hub__pane sa-view"
        data-billing-tab="catalogo"
        hidden={tab !== 'catalogo'}
      >
        <BillingCatalogPanel accessToken={accessToken} embedded />
      </div>
    </div>
  )
}
