/**
 * V4 — Drawer detalle comunidad (presentacional).
 * Reutiliza handlers vía callbacks; no fetch propio.
 */
import { Link } from 'react-router-dom'
import { buildCommunityLoginUrl } from '../../utils/communityLoginUrl.js'
import { conciergeEmailsSummary } from '../../utils/conciergeEmailsForm.js'
import {
  formatPadelHoursDisplay,
} from '../../utils/padelHours.js'
import CommunityDashboardStats from '../CommunityDashboardStats.jsx'
import CommunityBillingSummary from '../CommunityBillingSummary.jsx'
import { statusLabel } from './communityDisplay.js'

function portalsAliasesPreview(portalCount, portalLabels) {
  const n = Number(portalCount) || 1
  const labels = Array.isArray(portalLabels) ? portalLabels : []
  const parts = Array.from({ length: n }, (_, i) => {
    const t = typeof labels[i] === 'string' ? labels[i].trim() : ''
    return t || `Portal ${i + 1}`
  })
  if (parts.length <= 5) return parts.join(' · ')
  return `${parts.slice(0, 5).join(' · ')}…`
}

function spacesPreview(customLocations) {
  if (!Array.isArray(customLocations) || customLocations.length === 0) return '—'
  return customLocations
    .map((x) => (typeof x?.name === 'string' ? x.name : ''))
    .filter(Boolean)
    .slice(0, 4)
    .join(', ')
}

function formatPlanExpiresForCard(iso) {
  if (iso == null || iso === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  return new Date(Date.UTC(y, mo - 1, da)).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatPresidentOnCard(c) {
  const pp = (c.presidentPortal || '').trim()
  const ps = (c.presidentPiso || '').trim()
  if (pp && ps) return `vivienda: portal ${pp} · piso ${ps}`
  const em = (c.presidentEmail || '').trim()
  if (em) return `${em} (legado correo)`
  return '—'
}

function companyAdminEmailsForCommunity(community, companiesList) {
  if (!community?.companyId || !Array.isArray(companiesList)) return []
  const co = companiesList.find((x) => Number(x.id) === Number(community.companyId))
  const admins = Array.isArray(co?.companyAdmins) ? co.companyAdmins : []
  return admins
    .map((a) => (typeof a.email === 'string' ? a.email.trim() : ''))
    .filter(Boolean)
}

/**
 * @param {{
 *   community: object
 *   companyNameById: Map<number, string>
 *   companiesList: object[]
 *   isFullSuperAdmin: boolean
 *   accessToken: string | null
 *   billingSummary: object | null
 *   billingLoading: boolean
 *   billingError: string | null
 *   billingForbidden: boolean
 *   navTabSavingId: number | null
 *   posterPdfBusyId: number | null
 *   onClose: () => void
 *   onEdit: (c: object) => void
 *   onBilling: (c: object) => void
 *   onUsers: (c: object) => void
 *   onOnboarding: (c: object) => void
 *   onPortals: (c: object) => void
 *   onPoster: (c: object) => void
 *   onCopyLoginUrl: (slug: string) => void
 *   onOpenQr: (payload: { url: string, fileSafeName: string }) => void
 *   onPatchNavTabs: (c: object, payload: object) => void
 *   onDelete: (c: object) => void
 * }} props
 */
export default function SuperAdminCommunityDetail({
  community,
  companyNameById,
  companiesList,
  isFullSuperAdmin,
  accessToken,
  billingSummary,
  billingLoading,
  billingError,
  billingForbidden,
  navTabSavingId,
  posterPdfBusyId,
  onClose,
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
}) {
  if (!community) return null

  const adminName =
    community.companyId != null
      ? companyNameById.get(Number(community.companyId)) || `id ${community.companyId}`
      : '—'
  const serviceName =
    community.serviceProviderCompanyId != null
      ? companyNameById.get(Number(community.serviceProviderCompanyId)) ||
        `id ${community.serviceProviderCompanyId}`
      : '—'

  return (
    <div className="sa-comm-drawer" role="dialog" aria-modal="true" aria-labelledby="sa-comm-drawer-title">
      <button type="button" className="sa-comm-drawer__backdrop" aria-label="Cerrar detalle" onClick={onClose} />
      <aside className="sa-comm-drawer__panel">
        <header className="sa-comm-drawer__head">
          <div>
            <p className="sa-comm-drawer__kicker">Detalle comunidad</p>
            <h2 id="sa-comm-drawer-title" className="sa-comm-drawer__title">
              {community.name}
            </h2>
            <p className="sa-comm-drawer__sub">
              <span className={`sa-comm-row__status sa-comm-row__status--${community.status || 'active'}`}>
                {statusLabel(community.status)}
              </span>
              <span>ID {community.id}</span>
              <code>{community.accessCode || '—'}</code>
            </p>
          </div>
          <button type="button" className="sa-comm-drawer__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="sa-comm-drawer__body">
          <section className="sa-comm-drawer__section">
            <h3 className="sa-comm-drawer__section-title">Identidad</h3>
            <dl className="sa-comm-drawer__dl">
              <div>
                <dt>Administración</dt>
                <dd>{adminName}</dd>
              </div>
              <div>
                <dt>Servicios</dt>
                <dd>{serviceName}</dd>
              </div>
              <div>
                <dt>NIF/CIF</dt>
                <dd>{community.nifCif || '—'}</dd>
              </div>
              <div className="sa-comm-drawer__dl--full">
                <dt>Dirección</dt>
                <dd>{community.address?.trim() || '—'}</dd>
              </div>
              <div>
                <dt>Plan hasta</dt>
                <dd>{formatPlanExpiresForCard(community.planExpiresOn) || 'Sin fecha'}</dd>
              </div>
              <div>
                <dt>Cupo vecinos</dt>
                <dd>{community.residentSlots != null ? community.residentSlots : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="sa-comm-drawer__section">
            <h3 className="sa-comm-drawer__section-title">Acceso vecinos</h3>
            {(community.loginSlug || '').trim() ? (
              <div className="sa-comm-drawer__link-block">
                <code className="sa-comm-drawer__code">{buildCommunityLoginUrl(community.loginSlug)}</code>
                <div className="sa-comm-drawer__btn-row">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => onCopyLoginUrl(community.loginSlug)}
                  >
                    Copiar
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() =>
                      onOpenQr({
                        url: buildCommunityLoginUrl(community.loginSlug),
                        fileSafeName: community.loginSlug,
                      })
                    }
                  >
                    QR
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={posterPdfBusyId === community.id}
                    onClick={() => onPoster(community)}
                  >
                    {posterPdfBusyId === community.id ? 'PDF…' : 'Cartel PDF'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="sa-comm-drawer__missing">
                <p>Sin slug corto. Configúralo en la ficha para enlace, QR y cartel.</p>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEdit(community)}>
                  Configurar slug
                </button>
              </div>
            )}
          </section>

          <section className="sa-comm-drawer__section">
            <h3 className="sa-comm-drawer__section-title">Emails</h3>
            <ul className="sa-comm-drawer__list">
              <li>Comunidad: {community.contactEmail || '—'}</li>
              <li>Presidente: {formatPresidentOnCard(community)}</li>
              <li>
                Admin:{' '}
                {community.communityAdminName?.trim()
                  ? `${community.communityAdminName.trim()} · `
                  : ''}
                {community.communityAdminEmail?.trim() ||
                  (companyAdminEmailsForCommunity(community, companiesList).length
                    ? `empresa — ${companyAdminEmailsForCommunity(community, companiesList).join(', ')}`
                    : community.companyId != null
                      ? '— (gestión por empresa)'
                      : '—')}
              </li>
              <li>Conserje: {conciergeEmailsSummary(community) || '—'}</li>
              <li>Socorrista: {community.poolStaffEmail || '—'}</li>
            </ul>
          </section>

          <section className="sa-comm-drawer__section">
            <h3 className="sa-comm-drawer__section-title">Portales y espacios</h3>
            <p className="sa-comm-drawer__p">
              Portales: {community.portalCount ?? 1} —{' '}
              {portalsAliasesPreview(community.portalCount, community.portalLabels)}
            </p>
            <p className="sa-comm-drawer__p">Espacios: {spacesPreview(community.customLocations)}</p>
            <p className="sa-comm-drawer__p">
              Gimnasio: {community.gymAccessEnabled ? 'Control activo' : 'No'}
            </p>
            <p className="sa-comm-drawer__p">
              Piscina:{' '}
              {community.poolAccessSystemEnabled
                ? `Sí${community.poolSeasonActive ? ' · temporada activa' : ''}${
                    community.poolMaxOccupancy != null
                      ? ` · aforo ${community.poolMaxOccupancy}`
                      : ''
                  }`
                : 'No'}
            </p>
            <p className="sa-comm-drawer__p">
              Pádel: {Number(community.padelCourtCount) || 0} pista(s) · máx.{' '}
              {formatPadelHoursDisplay(community.padelMaxHoursPerBooking, 2)} h/reserva ·{' '}
              {formatPadelHoursDisplay(community.padelMaxHoursPerApartmentPerDay, 4)} h/vivienda/día ·{' '}
              {community.padelOpenTime || '08:00'}–{community.padelCloseTime || '22:00'}
              {community.padelOpenTime2 && community.padelCloseTime2
                ? ` y ${community.padelOpenTime2}–${community.padelCloseTime2}`
                : ''}
            </p>
          </section>

          <section className="sa-comm-drawer__section">
            <h3 className="sa-comm-drawer__section-title">Pestañas app vecinos</h3>
            <div className="admin-nav-tab-checks" role="group" aria-label="Pestañas visibles para vecinos">
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavServicesEnabled !== false}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) =>
                    onPatchNavTabs(community, { appNavServicesEnabled: e.target.checked })
                  }
                />
                <span>Servicios</span>
              </label>
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavIncidentsEnabled !== false}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) =>
                    onPatchNavTabs(community, { appNavIncidentsEnabled: e.target.checked })
                  }
                />
                <span>Incidencias</span>
              </label>
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavBookingsEnabled !== false}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) =>
                    onPatchNavTabs(community, { appNavBookingsEnabled: e.target.checked })
                  }
                />
                <span>Reservas</span>
              </label>
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavPoolAccessEnabled === true}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) =>
                    onPatchNavTabs(community, { appNavPoolAccessEnabled: e.target.checked })
                  }
                />
                <span>Acceso piscina</span>
              </label>
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavPaqueteriaEnabled === true}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) => {
                    const checked = e.target.checked
                    onPatchNavTabs(community, {
                      appNavPaqueteriaEnabled: checked,
                      ...(checked
                        ? {}
                        : { paqueteriaSpecialDeliveryEnabled: false, paqueteriaKeyLoansEnabled: false }),
                    })
                  }}
                />
                <span>Paquetería</span>
              </label>
              <label className="admin-nav-tab-check admin-nav-tab-check--sub">
                <input
                  type="checkbox"
                  checked={community.paqueteriaSpecialDeliveryEnabled === true}
                  disabled={
                    navTabSavingId === community.id || community.appNavPaqueteriaEnabled !== true
                  }
                  onChange={(e) =>
                    onPatchNavTabs(community, {
                      paqueteriaSpecialDeliveryEnabled: e.target.checked,
                    })
                  }
                />
                <span>Entrega especial</span>
              </label>
              <label className="admin-nav-tab-check admin-nav-tab-check--sub">
                <input
                  type="checkbox"
                  checked={community.paqueteriaKeyLoansEnabled === true}
                  disabled={
                    navTabSavingId === community.id || community.appNavPaqueteriaEnabled !== true
                  }
                  onChange={(e) =>
                    onPatchNavTabs(community, {
                      paqueteriaKeyLoansEnabled: e.target.checked,
                    })
                  }
                />
                <span>Registro de llaves</span>
              </label>
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavCuadernoDiarioEnabled === true}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) =>
                    onPatchNavTabs(community, {
                      appNavCuadernoDiarioEnabled: e.target.checked,
                    })
                  }
                />
                <span>Cuaderno diario</span>
              </label>
              <label className="admin-nav-tab-check">
                <input
                  type="checkbox"
                  checked={community.appNavControlEntradaEnabled === true}
                  disabled={navTabSavingId === community.id}
                  onChange={(e) =>
                    onPatchNavTabs(community, {
                      appNavControlEntradaEnabled: e.target.checked,
                    })
                  }
                />
                <span>Control de entrada</span>
              </label>
            </div>
            <p className="admin-field-hint admin-field-hint--block" style={{ marginTop: '0.35rem' }}>
              Solo se muestran en la app las pestañas marcadas; el acceso directo por URL también se
              bloquea.
            </p>
          </section>

          {community.dashboardStats ? (
            <section className="sa-comm-drawer__section">
              <h3 className="sa-comm-drawer__section-title">Actividad</h3>
              <CommunityDashboardStats
                stats={community.dashboardStats}
                residentSlots={community.residentSlots}
              />
            </section>
          ) : null}

          {isFullSuperAdmin ? (
            <section className="sa-comm-drawer__section">
              <h3 className="sa-comm-drawer__section-title">Plan y facturación</h3>
              <CommunityBillingSummary
                communityId={community.id}
                accessToken={accessToken}
                summary={billingSummary}
                loading={billingLoading}
                error={billingError}
                forbidden={billingForbidden}
                onConfigure={() => onBilling(community)}
                onEdit={() => onBilling(community)}
              />
            </section>
          ) : null}
        </div>

        <footer className="sa-comm-drawer__foot">
          <div className="sa-comm-drawer__foot-primary">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEdit(community)}>
              Editar
            </button>
            {isFullSuperAdmin ? (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => onBilling(community)}>
                Plan y facturación
              </button>
            ) : null}
            <Link
              to={`/admin/communities/${community.id}/vecinos`}
              className="btn btn--primary btn--sm"
            >
              Alta de vecinos
            </Link>
          </div>
          <div className="sa-comm-drawer__foot-secondary">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onUsers(community)}>
              Usuarios y acceso
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOnboarding(community)}>
              Enviar correos de alta
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!(community.loginSlug || '').trim() || posterPdfBusyId === community.id}
              onClick={() => onPoster(community)}
            >
              {posterPdfBusyId === community.id ? 'Generando PDF…' : 'Cartel PDF'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPortals(community)}>
              Editar portales
            </button>
          </div>
          <div className="sa-comm-drawer__foot-danger">
            <button
              type="button"
              className="btn btn--ghost btn--sm admin-row-btn--danger"
              onClick={() => onDelete(community)}
            >
              Delete
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
