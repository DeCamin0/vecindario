/**
 * Panel READ-ONLY: flags funcionales vs contrato comercial.
 * Fuente: flagDiff del backend. Sin writes / sin auto-fix.
 */
import { billingModuleLabel, summarizeFlagDiff } from '../lib/billingModuleLabels.js'
import './BillingFlagDiffPanel.css'

const STATUS_COPY = {
  ok: {
    short: 'Alineado',
    detail: 'Flag y contrato coinciden',
  },
  active_not_contracted: {
    short: 'Activo · no contratado',
    detail: 'El módulo está activo en la app, pero no figura en el contrato comercial.',
  },
  contracted_not_active: {
    short: 'Contratado · no activo',
    detail: 'El módulo está en el contrato, pero el flag funcional está desactivado.',
  },
}

/**
 * @param {{
 *   flagDiff?: {
 *     modules?: Array<{
 *       moduleCode: string,
 *       status: string,
 *       functionallyActive?: boolean,
 *       commerciallyContracted?: boolean,
 *     }>,
 *     specialDelivery?: {
 *       status: string,
 *       note?: string,
 *       functionallyActive?: boolean,
 *       parcelsContracted?: boolean,
 *     },
 *     hasWarnings?: boolean,
 *   } | null,
 *   compact?: boolean,
 *   showAligned?: boolean,
 * }} props
 */
export default function BillingFlagDiffPanel({
  flagDiff = null,
  compact = false,
  showAligned = false,
}) {
  if (!flagDiff || !Array.isArray(flagDiff.modules)) {
    return <p className="bfdp-muted">Sin datos de comparación flags ↔ contrato.</p>
  }

  const summary = summarizeFlagDiff(flagDiff)
  const rows = showAligned
    ? flagDiff.modules
    : flagDiff.modules.filter((m) => m.status !== 'ok')
  const special = flagDiff.specialDelivery
  const specialInfo = special?.status === 'info_without_parcels_contract'

  return (
    <div className={`bfdp${compact ? ' bfdp--compact' : ''}`}>
      <ul className="bfdp-counts" aria-label="Resumen flags vs contrato">
        <li className="bfdp-count bfdp-count--ok">✓ Alineados: {summary.ok}</li>
        <li className="bfdp-count bfdp-count--warn">
          ⚠ Activo no contratado: {summary.activeNotContracted}
        </li>
        <li className="bfdp-count bfdp-count--warn">
          ⚠ Contratado no activo: {summary.contractedNotActive}
        </li>
      </ul>

      {rows.length === 0 && !specialInfo ? (
        <p className="bfdp-ok">Flags funcionales y contrato comercial alineados.</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="bfdp-list">
          {rows.map((item) => {
            const copy = STATUS_COPY[item.status] || STATUS_COPY.ok
            const tone =
              item.status === 'ok' ? 'ok' : item.status === 'active_not_contracted' ? 'warn' : 'warn2'
            return (
              <li key={item.moduleCode} className={`bfdp-row bfdp-row--${tone}`}>
                <div className="bfdp-row__main">
                  <strong>{billingModuleLabel(item.moduleCode)}</strong>
                  <span className={`bfdp-pill bfdp-pill--${tone}`}>{copy.short}</span>
                </div>
                {!compact ? <p className="bfdp-row__detail">{copy.detail}</p> : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {specialInfo ? (
        <div className="bfdp-info" role="note">
          <strong>Entrega especial</strong>
          <p>
            {special.note ||
              'Entrega especial activa funcionalmente, pero Paquetería no está contratada. Aviso informativo; no se cobra aparte.'}
          </p>
        </div>
      ) : null}

      <p className="bfdp-footnote">
        Solo avisos. La configuración comercial no modifica automáticamente los módulos activos.
      </p>
    </div>
  )
}
