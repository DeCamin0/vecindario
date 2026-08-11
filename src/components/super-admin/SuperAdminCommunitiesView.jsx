/**
 * V4 — Vista Comunidades: filtros locales + lista compacta + drawer.
 */
import { useEffect, useMemo, useState } from 'react'
import SuperAdminCommunityRow from './SuperAdminCommunityRow.jsx'
import SuperAdminCommunityDetail from './SuperAdminCommunityDetail.jsx'
import { isBillingConfigured, statusLabel } from './communityDisplay.js'
import CommunityBillingSummary from '../CommunityBillingSummary.jsx'
import './SuperAdminCommunities.css'

/**
 * @param {{
 *   loading: boolean
 *   communities: object[]
 *   pendingCommunities: object[]
 *   administratorsDirectory: Array<{ email: string, communities: object[] }>
 *   companyNameById: Map<number, string>
 *   companiesList: object[]
 *   isFullSuperAdmin: boolean
 *   accessToken: string | null
 *   billingSummaries: { byId: Map, loading: boolean, error: string | null, forbidden: boolean }
 *   navTabSavingId: number | null
 *   posterPdfBusyId: number | null
 *   approvalBusyId: number | null
 *   onAdd: () => void
 *   onEdit: (c: object) => void
 *   onBilling: (c: object) => void
 *   onUsers: (c: object) => void
 *   onOnboarding: (c: object) => void
 *   onPortals: (c: object) => void
 *   onPoster: (c: object) => void
 *   onCopyLoginUrl: (slug: string) => void
 *   onOpenQr: (payload: object) => void
 *   onPatchNavTabs: (c: object, payload: object) => void
 *   onDelete: (c: object) => void
 *   onPatchStatus: (id: number, status: string) => void
 * }} props
 */
export default function SuperAdminCommunitiesView({
  loading,
  communities,
  pendingCommunities,
  administratorsDirectory,
  companyNameById,
  companiesList,
  isFullSuperAdmin,
  accessToken,
  billingSummaries,
  navTabSavingId,
  posterPdfBusyId,
  approvalBusyId,
  onAdd,
  onEdit,
  onBilling,
  onUsers,
  onOnboarding,
  onPortals,
  onPoster,
  onCopyLoginUrl,
  onOpenQr,
  onPatchNavTabs,
  onDelete,
  onPatchStatus,
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [billingFilter, setBillingFilter] = useState('all')
  const [detailId, setDetailId] = useState(null)
  const [adminsOpen, setAdminsOpen] = useState(false)

  const detailCommunity = useMemo(
    () => (detailId == null ? null : communities.find((c) => c.id === detailId) || null),
    [communities, detailId],
  )

  useEffect(() => {
    if (!detailCommunity) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailCommunity])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return communities.filter((c) => {
      if (c.status === 'pending_approval') return false
      const st = c.status || 'active'
      if (statusFilter !== 'all' && st !== statusFilter) return false

      if (isFullSuperAdmin && billingFilter !== 'all') {
        const summary = billingSummaries.byId.get(Number(c.id)) ?? null
        const configured = isBillingConfigured(summary)
        if (billingFilter === 'configured' && !configured) return false
        if (billingFilter === 'unconfigured' && configured) return false
      }

      if (!q) return true
      const company =
        c.companyId != null
          ? companyNameById.get(Number(c.companyId)) || ''
          : ''
      const hay = [
        c.name,
        String(c.id),
        c.accessCode,
        c.address,
        c.loginSlug,
        company,
        c.nifCif,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [
    communities,
    query,
    statusFilter,
    billingFilter,
    isFullSuperAdmin,
    billingSummaries.byId,
    companyNameById,
  ])

  return (
    <div className="sa-comm">
      {pendingCommunities.length > 0 ? (
        <section className="sa-comm__pending">
          <div className="sa-comm__block-head">
            <h2 className="sa-comm__block-title">Pendientes de aprobación</h2>
            <p className="sa-comm__block-sub">
              Creadas por administradores de empresa. Actívalas cuando estén listas.
            </p>
          </div>
          <div className="sa-comm__pending-list">
            {pendingCommunities.map((c) => (
              <article key={c.id} className="sa-comm-pending-row">
                <div className="sa-comm-pending-row__top">
                  <div>
                    <h3 className="sa-comm-row__name">{c.name}</h3>
                    <p className="sa-comm-row__meta">
                      ID {c.id} · <code>{c.accessCode || '—'}</code> ·{' '}
                      {c.companyId != null
                        ? companyNameById.get(Number(c.companyId)) || `id ${c.companyId}`
                        : 'Sin empresa'}
                    </p>
                  </div>
                  <div className="sa-comm-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={approvalBusyId === c.id}
                      onClick={() => void onPatchStatus(c.id, 'active')}
                    >
                      {approvalBusyId === c.id ? '…' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={approvalBusyId === c.id}
                      onClick={() => void onPatchStatus(c.id, 'inactive')}
                    >
                      Desactivar
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(c)}>
                      Editar
                    </button>
                    {isFullSuperAdmin ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onBilling(c)}
                      >
                        Billing
                      </button>
                    ) : null}
                  </div>
                </div>
                {isFullSuperAdmin ? (
                  <CommunityBillingSummary
                    communityId={c.id}
                    accessToken={accessToken}
                    summary={billingSummaries.byId.get(Number(c.id)) ?? null}
                    loading={billingSummaries.loading}
                    error={billingSummaries.error}
                    forbidden={billingSummaries.forbidden}
                    onConfigure={() => onBilling(c)}
                    onEdit={() => onBilling(c)}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sa-comm__list-section">
        <div className="sa-comm__block-head sa-comm__block-head--row">
          <div>
            <h2 className="sa-comm__block-title">Comunidades</h2>
            <p className="sa-comm__block-sub">
              {loading
                ? 'Cargando…'
                : `${filtered.length} visible${filtered.length === 1 ? '' : 's'}${
                    communities.length !== filtered.length
                      ? ` · ${communities.filter((c) => c.status !== 'pending_approval').length} en total`
                      : ''
                  }`}
            </p>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}>
            + Añadir comunidad
          </button>
        </div>

        {!loading && communities.length > 0 ? (
          <div className="sa-comm__filters">
            <label className="sa-comm__search">
              <span className="sa-comm__filter-label">Buscar</span>
              <input
                type="search"
                className="sa-comm__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, código, empresa, dirección…"
              />
            </label>
            <label className="sa-comm__filter">
              <span className="sa-comm__filter-label">Estado</span>
              <select
                className="sa-comm__input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Active</option>
                <option value="demo">Demo</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            {isFullSuperAdmin ? (
              <label className="sa-comm__filter">
                <span className="sa-comm__filter-label">Billing</span>
                <select
                  className="sa-comm__input"
                  value={billingFilter}
                  onChange={(e) => setBillingFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="configured">Configurado</option>
                  <option value="unconfigured">Sin configurar</option>
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p className="sa-comm__empty">Cargando…</p>
        ) : communities.length === 0 ? (
          <div className="sa-comm__empty-card">
            <p className="sa-comm__empty-title">No hay comunidades todavía</p>
            <p className="sa-comm__block-sub">Pulsa «Añadir comunidad» para crear la primera.</p>
            <button type="button" className="btn btn--primary" onClick={onAdd}>
              + Añadir comunidad
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="sa-comm__empty">Ninguna comunidad coincide con los filtros.</p>
        ) : (
          <div className="sa-comm__rows">
            {filtered.map((community) => (
              <SuperAdminCommunityRow
                key={community.id}
                community={community}
                companyName={
                  community.companyId != null
                    ? companyNameById.get(Number(community.companyId)) ||
                      `id ${community.companyId}`
                    : ''
                }
                billingSummary={billingSummaries.byId.get(Number(community.id)) ?? null}
                showBilling={isFullSuperAdmin}
                onOpenDetail={() => setDetailId(community.id)}
                onEdit={() => onEdit(community)}
                onBilling={() => onBilling(community)}
              />
            ))}
          </div>
        )}
      </section>

      {!loading && administratorsDirectory.length > 0 ? (
        <section className="sa-comm__admins">
          <button
            type="button"
            className="sa-comm__admins-toggle"
            aria-expanded={adminsOpen}
            onClick={() => setAdminsOpen((v) => !v)}
          >
            <span>
              Administradores por correo
              <span className="sa-comm__admins-count">
                {' '}
                · {administratorsDirectory.length}
              </span>
            </span>
            <span aria-hidden="true">{adminsOpen ? '▴' : '▾'}</span>
          </button>
          {adminsOpen ? (
            <div className="sa-comm__admins-grid">
              {administratorsDirectory.map(({ email, communities: rows }) => (
                <article key={email} className="sa-comm__admins-card">
                  <div className="sa-comm__admins-card-head">
                    <span className="sa-comm__admins-email">{email}</span>
                    <span className="sa-comm__admins-n">
                      {rows.length} comunidad{rows.length === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <ul className="sa-comm__admins-list">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <span>{row.name}</span>
                        <span className={`sa-comm-row__status sa-comm-row__status--${row.status || 'active'}`}>
                          {statusLabel(row.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {detailCommunity ? (
        <SuperAdminCommunityDetail
          community={detailCommunity}
          companyNameById={companyNameById}
          companiesList={companiesList}
          isFullSuperAdmin={isFullSuperAdmin}
          accessToken={accessToken}
          billingSummary={billingSummaries.byId.get(Number(detailCommunity.id)) ?? null}
          billingLoading={billingSummaries.loading}
          billingError={billingSummaries.error}
          billingForbidden={billingSummaries.forbidden}
          navTabSavingId={navTabSavingId}
          posterPdfBusyId={posterPdfBusyId}
          onClose={() => setDetailId(null)}
          onEdit={onEdit}
          onBilling={onBilling}
          onUsers={onUsers}
          onOnboarding={onOnboarding}
          onPortals={onPortals}
          onPoster={onPoster}
          onCopyLoginUrl={onCopyLoginUrl}
          onOpenQr={onOpenQr}
          onPatchNavTabs={onPatchNavTabs}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  )
}
