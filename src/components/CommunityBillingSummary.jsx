/**
 * Resumen compacto «Plan y facturación» en cards de Super Admin (READ-ONLY).
 * B7: alertas flags↔contrato más claras; detalle vía GET community (flagDiff backend).
 */
import { useCallback, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import BillingFlagDiffPanel from './BillingFlagDiffPanel.jsx'
import './CommunityBillingSummary.css'

/** @typedef {{
 *   communityId: number,
 *   commercialStatus: string,
 *   planCode: string | null,
 *   planName: string | null,
 *   dwellingCount: number | null,
 *   netEur: string | null,
 *   vatEur: string | null,
 *   grossEur: string | null,
 *   pricingSource: string | null,
 *   planPartEur: string | null,
 *   sizeSurchargeEur: string | null,
 *   discountEur: string | null,
 *   modulesActive: number,
 *   modulesContracted: number,
 *   discrepancyCount: number,
 *   hasWarnings: boolean,
 * }} BillingCardSummary
 */

const STATUS_LABELS = {
  unconfigured: 'Sin configurar',
  billable: 'Facturable',
  demo: 'Demo',
  courtesy: 'Cortesía',
  promo: 'Promoción',
  legacy: 'Legacy',
  non_billable: 'No facturable',
}

const USAGE_LABELS = {
  neighbors_and_staff: 'Vecinos + conserjería',
  staff_only: 'Solo conserjería',
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—'
}

function formatMoneyPart(raw) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n === 0) return null
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `−${abs}` : abs
}

function buildTotalLine(summary) {
  if (!summary?.netEur) return null
  const parts = []
  if (summary.planPartEur != null) parts.push(String(summary.planPartEur))
  const size = formatMoneyPart(summary.sizeSurchargeEur)
  if (size) parts.push(`+${size}`)
  const disc = formatMoneyPart(summary.discountEur)
  if (disc) parts.push(`−${disc}`)

  const net = String(summary.netEur)
  if (summary.pricingSource === 'negotiated_override') {
    return `${net} €/mes + IVA (negociado)`
  }
  if (parts.length <= 1) {
    return `${net} €/mes + IVA`
  }
  return `${parts.join(' ')} = ${net} €/mes + IVA`
}

/**
 * @param {{
 *   communityId: number,
 *   accessToken?: string | null,
 *   summary?: BillingCardSummary | null,
 *   loading?: boolean,
 *   error?: string | null,
 *   forbidden?: boolean,
 *   onConfigure?: (() => void) | null,
 *   onEdit?: (() => void) | null,
 * }} props
 */
export default function CommunityBillingSummary({
  communityId,
  accessToken = null,
  summary = null,
  loading = false,
  error = null,
  forbidden = false,
  onConfigure = null,
  onEdit = null,
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [flagDiff, setFlagDiff] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const loadFlagDiff = useCallback(async () => {
    if (!accessToken || !communityId) return
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await fetch(apiUrl(`/api/admin/billing/communities/${communityId}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setFlagDiff(data.flagDiff || null)
    } catch (e) {
      setDetailError(e.message || 'No se pudo cargar el detalle')
      setFlagDiff(null)
    } finally {
      setDetailLoading(false)
    }
  }, [accessToken, communityId])

  const toggleDetail = async () => {
    const next = !detailOpen
    setDetailOpen(next)
    if (next && !flagDiff && !detailLoading) {
      await loadFlagDiff()
    }
  }

  if (forbidden) return null

  if (loading && !summary) {
    return (
      <div className="cbs" data-community-id={communityId}>
        <div className="cbs__head">
          <span className="cbs__title">Plan y facturación</span>
        </div>
        <p className="cbs__muted">Cargando…</p>
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="cbs cbs--error" data-community-id={communityId}>
        <div className="cbs__head">
          <span className="cbs__title">Plan y facturación</span>
        </div>
        <p className="cbs__muted">No se pudo cargar billing</p>
      </div>
    )
  }

  const status = summary?.commercialStatus || 'unconfigured'
  const unconfigured = status === 'unconfigured' || !summary

  if (unconfigured) {
    return (
      <div className="cbs" data-community-id={communityId}>
        <div className="cbs__head">
          <span className="cbs__title">Plan y facturación</span>
          <span className="cbs-badge cbs-badge--unconfigured">{statusLabel('unconfigured')}</span>
        </div>
        <p className="cbs__hint">Sin contrato comercial.</p>
        {typeof onConfigure === 'function' ? (
          <div className="cbs__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={onConfigure}>
              Configurar
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const totalLine = buildTotalLine(summary)
  const dwellings =
    summary.dwellingCount != null && Number.isFinite(Number(summary.dwellingCount))
      ? `${summary.dwellingCount} viv.`
      : null
  const discCount = Number(summary.discrepancyCount) || 0
  const hasDisc = discCount > 0

  return (
    <div className="cbs" data-community-id={communityId}>
      <div className="cbs__head">
        <span className="cbs__title">Plan y facturación</span>
        <span className={`cbs-badge cbs-badge--${status}`}>{statusLabel(status)}</span>
      </div>

      <p className="cbs__plan">{summary.planName || summary.planCode || '—'}</p>

      <p className="cbs__meta">
        {summary.usageMode ? (
          <span className="cbs-mode">{USAGE_LABELS[summary.usageMode] || summary.usageMode}</span>
        ) : null}
        {dwellings ? <span>{dwellings}</span> : null}
        {!summary.usageMode && !dwellings ? (
          <span className="cbs__muted">Viviendas no indicadas</span>
        ) : null}
        {summary.usageMode && !dwellings ? (
          <span className="cbs__muted">viv. no indicadas</span>
        ) : null}
      </p>

      {totalLine ? <p className="cbs__total">{totalLine}</p> : null}

      <p className="cbs__modules">
        Módulos: {summary.modulesActive} activos · {summary.modulesContracted} contratados
      </p>

      <div className={`cbs-diff${hasDisc ? ' cbs-diff--warn' : ' cbs-diff--ok'}`}>
        {hasDisc ? (
          <>
            <div className="cbs-diff__head">
              <span className="cbs-chip cbs-chip--warn">
                ⚠ {discCount} aviso{discCount === 1 ? '' : 's'} flags ↔ contrato
              </span>
            </div>
            <p className="cbs-diff__hint">
              Hay diferencias entre módulos activos (flags) y el contrato comercial. Solo
              informativo; no se corrige solo.
            </p>
          </>
        ) : (
          <div className="cbs-diff__head">
            <span className="cbs-chip cbs-chip--ok">✓ Flags y contrato alineados</span>
          </div>
        )}

        {accessToken ? (
          <button type="button" className="cbs-link" onClick={() => void toggleDetail()}>
            {detailOpen ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
        ) : null}

        {detailOpen ? (
          <div className="cbs-diff__panel">
            {detailLoading ? <p className="cbs__muted">Cargando comparación…</p> : null}
            {detailError ? <p className="cbs__warn">{detailError}</p> : null}
            {!detailLoading && !detailError && flagDiff ? (
              <BillingFlagDiffPanel flagDiff={flagDiff} compact={false} showAligned={false} />
            ) : null}
            {!detailLoading && !detailError && !flagDiff ? (
              <p className="cbs__muted">Sin flagDiff en la respuesta.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {typeof onEdit === 'function' ? (
        <div className="cbs__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onEdit}>
            Editar
          </button>
        </div>
      ) : null}
    </div>
  )
}
