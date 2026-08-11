/**
 * V5 — Vista Empresas: lista compacta + drawer + modal Nueva empresa.
 */
import { useEffect, useMemo, useState } from 'react'
import SuperAdminCompanyRow from './SuperAdminCompanyRow.jsx'
import SuperAdminCompanyDetail from './SuperAdminCompanyDetail.jsx'
import './SuperAdminCompanies.css'

/**
 * @param {{
 *   loading: boolean
 *   companiesList: object[]
 *   communities: object[]
 *   companyAdminFlash?: string
 *   companyPasswordFlash?: string
 *   newCompanyName: string
 *   newCompanyKind: string
 *   creatingCompany: boolean
 *   companyKindBusyId: number | null
 *   companyAdminLoginBusyId: number | null
 *   companyAdminDeleteBusyId: number | null
 *   companyPasswordBusy: string | null
 *   setNewCompanyName: (v: string) => void
 *   setNewCompanyKind: (v: string) => void
 *   onCreateCompany: (e: import('react').FormEvent) => Promise<boolean | void>
 *   onPatchKind: (co: object, kind: string) => void
 *   onAddAdmin: (co: object) => void
 *   onImpersonate: (companyId: number, userId: number, companyName: string) => void
 *   onDeleteAdmin: (companyId: number, admin: object, companyName: string) => void
 *   onPasswordShow: (co: object) => void
 *   onPasswordEmail: (co: object) => void
 *   createOpenTick?: number
 * }} props
 */
export default function SuperAdminCompaniesView({
  loading,
  companiesList,
  communities,
  companyAdminFlash = '',
  companyPasswordFlash = '',
  newCompanyName,
  newCompanyKind,
  creatingCompany,
  companyKindBusyId,
  companyAdminLoginBusyId,
  companyAdminDeleteBusyId,
  companyPasswordBusy,
  setNewCompanyName,
  setNewCompanyKind,
  onCreateCompany,
  onPatchKind,
  onAddAdmin,
  onImpersonate,
  onDeleteAdmin,
  onPasswordShow,
  onPasswordEmail,
  createOpenTick = 0,
}) {
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [detailId, setDetailId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [seenCreateTick, setSeenCreateTick] = useState(0)
  if (createOpenTick !== seenCreateTick) {
    setSeenCreateTick(createOpenTick)
    if (createOpenTick > 0) setCreateOpen(true)
  }

  const detailCompany = useMemo(
    () => (detailId == null ? null : companiesList.find((c) => c.id === detailId) || null),
    [companiesList, detailId],
  )

  const relatedCommunities = useMemo(() => {
    if (!detailCompany) return []
    const id = Number(detailCompany.id)
    const rows = []
    for (const c of communities || []) {
      if (Number(c.companyId) === id) {
        rows.push({ id: c.id, name: c.name, status: c.status, link: 'admin' })
      } else if (Number(c.serviceProviderCompanyId) === id) {
        rows.push({ id: c.id, name: c.name, status: c.status, link: 'service' })
      }
    }
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }, [communities, detailCompany])

  useEffect(() => {
    if (!detailCompany) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (createOpen) setCreateOpen(false)
        else setDetailId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailCompany, createOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return companiesList.filter((co) => {
      const kind = co.kind === 'prestacion_servicios' ? 'prestacion_servicios' : 'administracion'
      if (kindFilter !== 'all' && kind !== kindFilter) return false
      if (!q) return true
      const adminEmails = (Array.isArray(co.companyAdmins) ? co.companyAdmins : [])
        .map((a) => a.email || '')
        .join(' ')
      const hay = [co.name, String(co.id), kind, adminEmails].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [companiesList, query, kindFilter])

  const submitCreate = async (e) => {
    e.preventDefault()
    const ok = await onCreateCompany(e)
    if (ok === true) setCreateOpen(false)
  }

  return (
    <div className="sa-co">
      <div className="sa-co__block-head sa-co__block-head--row">
        <div>
          <h2 className="sa-co__block-title">Empresas</h2>
          <p className="sa-co__block-sub">
            Directorio de firmas, administradores y acceso. Las comunidades que creen quedan
            pendientes hasta activarlas.
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreateOpen(true)}>
          + Nueva empresa
        </button>
      </div>

      {companyAdminFlash ? (
        <p className="admin-banner-success" role="status">
          {companyAdminFlash}
        </p>
      ) : null}
      {companyPasswordFlash ? (
        <p className="admin-banner-success" role="alert">
          {companyPasswordFlash}
        </p>
      ) : null}

      {!loading && companiesList.length > 0 ? (
        <div className="sa-co__filters">
          <label className="sa-co__search">
            <span className="sa-co__filter-label">Buscar</span>
            <input
              type="search"
              className="sa-co__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, email admin, tipo…"
            />
          </label>
          <label className="sa-co__filter">
            <span className="sa-co__filter-label">Tipo</span>
            <select
              className="sa-co__input"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="administracion">Administración</option>
              <option value="prestacion_servicios">Servicios</option>
            </select>
          </label>
        </div>
      ) : null}

      <p className="sa-co__count">
        {loading
          ? 'Cargando…'
          : `${filtered.length} empresa${filtered.length === 1 ? '' : 's'}${
              companiesList.length !== filtered.length ? ` · ${companiesList.length} en total` : ''
            }`}
      </p>

      {loading ? (
        <p className="sa-co__empty">Cargando empresas…</p>
      ) : companiesList.length === 0 ? (
        <div className="sa-co__empty-card">
          <p className="sa-co__empty-title">No hay empresas</p>
          <p className="sa-co__block-sub">Crea la primera con «Nueva empresa».</p>
          <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
            + Nueva empresa
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="sa-co__empty">Ninguna empresa coincide con los filtros.</p>
      ) : (
        <div className="sa-co__rows">
          {filtered.map((co) => (
            <SuperAdminCompanyRow
              key={co.id}
              company={co}
              onOpenDetail={() => setDetailId(co.id)}
            />
          ))}
        </div>
      )}

      {detailCompany ? (
        <SuperAdminCompanyDetail
          company={detailCompany}
          relatedCommunities={relatedCommunities}
          companyKindBusyId={companyKindBusyId}
          companiesLoading={loading}
          companyAdminLoginBusyId={companyAdminLoginBusyId}
          companyAdminDeleteBusyId={companyAdminDeleteBusyId}
          companyPasswordBusy={companyPasswordBusy}
          onClose={() => setDetailId(null)}
          onPatchKind={onPatchKind}
          onAddAdmin={onAddAdmin}
          onImpersonate={onImpersonate}
          onDeleteAdmin={onDeleteAdmin}
          onPasswordShow={onPasswordShow}
          onPasswordEmail={onPasswordEmail}
        />
      ) : null}

      {createOpen ? (
        <div className="sa-co-create" role="dialog" aria-modal="true" aria-labelledby="sa-co-create-title">
          <button
            type="button"
            className="sa-co-drawer__backdrop"
            aria-label="Cerrar"
            onClick={() => setCreateOpen(false)}
          />
          <div className="sa-co-create__panel card">
            <div className="sa-co-create__head">
              <h2 id="sa-co-create-title" className="sa-co-create__title">
                Nueva empresa
              </h2>
              <button
                type="button"
                className="sa-co-drawer__close"
                aria-label="Cerrar"
                onClick={() => setCreateOpen(false)}
              >
                ×
              </button>
            </div>
            <form className="sa-co-create__body" onSubmit={submitCreate}>
              <p className="sa-co__block-sub">
                Añade el nombre comercial. Después podrás vincular comunidades y crear administradores.
              </p>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="sa-new-company-kind">
                  Tipo de empresa
                </label>
                <select
                  id="sa-new-company-kind"
                  className="admin-input admin-select"
                  value={newCompanyKind}
                  onChange={(e) => setNewCompanyKind(e.target.value)}
                  disabled={loading || creatingCompany}
                >
                  <option value="administracion">Administración de fincas</option>
                  <option value="prestacion_servicios">
                    Prestación de servicios (super admin acotado)
                  </option>
                </select>
              </div>
              <div className="admin-modal-field">
                <label className="admin-label" htmlFor="sa-new-company-name">
                  Nombre comercial
                </label>
                <input
                  id="sa-new-company-name"
                  className="admin-input"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Ej. Mi empresa de gestión S.L."
                  disabled={loading || creatingCompany}
                  autoComplete="organization"
                  required
                />
              </div>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setCreateOpen(false)}
                  disabled={creatingCompany}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={creatingCompany || loading}>
                  {creatingCompany ? 'Creando…' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
