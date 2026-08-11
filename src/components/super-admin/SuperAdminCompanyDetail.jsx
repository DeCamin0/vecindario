/**
 * V5 — Drawer detalle empresa (presentacional).
 */
export default function SuperAdminCompanyDetail({
  company,
  relatedCommunities = [],
  companyKindBusyId,
  companiesLoading,
  companyAdminLoginBusyId,
  companyAdminDeleteBusyId,
  companyPasswordBusy,
  onClose,
  onPatchKind,
  onAddAdmin,
  onImpersonate,
  onDeleteAdmin,
  onPasswordShow,
  onPasswordEmail,
}) {
  if (!company) return null

  const admins = Array.isArray(company.companyAdmins) ? company.companyAdmins : []
  const kindValue =
    company.kind === 'prestacion_servicios' ? 'prestacion_servicios' : 'administracion'

  return (
    <div className="sa-co-drawer" role="dialog" aria-modal="true" aria-labelledby="sa-co-drawer-title">
      <button type="button" className="sa-co-drawer__backdrop" aria-label="Cerrar detalle" onClick={onClose} />
      <aside className="sa-co-drawer__panel">
        <header className="sa-co-drawer__head">
          <div>
            <p className="sa-co-drawer__kicker">Detalle empresa</p>
            <h2 id="sa-co-drawer-title" className="sa-co-drawer__title">
              {company.name}
            </h2>
            <p className="sa-co-drawer__sub">ID {company.id}</p>
          </div>
          <button type="button" className="sa-co-drawer__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="sa-co-drawer__body">
          <section className="sa-co-drawer__section">
            <h3 className="sa-co-drawer__section-title">Tipo</h3>
            <label className="admin-label" htmlFor={`sa-co-kind-${company.id}`}>
              Tipo de empresa
            </label>
            <select
              id={`sa-co-kind-${company.id}`}
              className="admin-input admin-select"
              value={kindValue}
              disabled={companyKindBusyId === company.id || companiesLoading}
              onChange={(e) => void onPatchKind(company, e.target.value)}
            >
              <option value="administracion">Administración de fincas</option>
              <option value="prestacion_servicios">Prestación de servicios</option>
            </select>
            <p className="admin-field-hint" style={{ marginTop: '0.35rem' }}>
              Administración → panel empresa. Servicios → super admin acotado a sus comunidades.
            </p>
          </section>

          <section className="sa-co-drawer__section">
            <div className="sa-co-drawer__section-head">
              <h3 className="sa-co-drawer__section-title">Administradores</h3>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => onAddAdmin(company)}
              >
                Añadir administrador
              </button>
            </div>
            {admins.length === 0 ? (
              <p className="sa-co-drawer__empty">Ningún administrador todavía.</p>
            ) : (
              <ul className="sa-co-admin-list">
                {admins.map((a) => (
                  <li key={a.id} className="sa-co-admin-row">
                    <div className="sa-co-admin-row__info">
                      <span className="sa-co-admin-row__email">
                        {a.email || `— (usuario id ${a.id})`}
                      </span>
                      {a.name ? <span className="sa-co-admin-row__name">{a.name}</span> : null}
                      <span className="sa-co-admin-row__role">Administrador de empresa</span>
                    </div>
                    <div className="sa-co-admin-row__actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={
                          companyAdminLoginBusyId === a.id || companyAdminDeleteBusyId === a.id
                        }
                        title="Abrir el panel de administrador de empresa en una pestaña nueva (sesión aislada)"
                        onClick={() => void onImpersonate(company.id, a.id, company.name)}
                      >
                        {companyAdminLoginBusyId === a.id ? '…' : 'Entrar como…'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm admin-row-btn--danger"
                        disabled={
                          companyAdminDeleteBusyId === a.id || companyAdminLoginBusyId === a.id
                        }
                        title="Eliminar esta cuenta de administrador de empresa"
                        onClick={() => void onDeleteAdmin(company.id, a, company.name)}
                      >
                        {companyAdminDeleteBusyId === a.id ? '…' : 'Eliminar'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sa-co-drawer__section">
            <h3 className="sa-co-drawer__section-title">Acceso administrador</h3>
            <p className="sa-co-drawer__hint">
              Genera una contraseña temporal nueva (no se puede leer la anterior).
            </p>
            <div className="sa-co-drawer__btn-row">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={
                  (company.companyAdminCount ?? 0) < 1 ||
                  companyPasswordBusy === `${company.id}-show`
                }
                title="No se puede leer la contraseña antigua (está cifrada). Se genera una nueva y se muestra aquí una sola vez; la anterior deja de valer."
                onClick={() => void onPasswordShow(company)}
              >
                {companyPasswordBusy === `${company.id}-show` ? '…' : 'Ver contraseña'}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={
                  (company.companyAdminCount ?? 0) < 1 ||
                  companyPasswordBusy === `${company.id}-email`
                }
                title="Genera una nueva contraseña temporal y la envía por correo al administrador (requiere SMTP en el servidor)."
                onClick={() => void onPasswordEmail(company)}
              >
                {companyPasswordBusy === `${company.id}-email`
                  ? '…'
                  : 'Enviar contraseña por correo'}
              </button>
            </div>
          </section>

          <section className="sa-co-drawer__section">
            <h3 className="sa-co-drawer__section-title">Comunidades relacionadas</h3>
            {relatedCommunities.length === 0 ? (
              <p className="sa-co-drawer__empty">Ninguna comunidad vinculada todavía.</p>
            ) : (
              <ul className="sa-co-related-list">
                {relatedCommunities.map((c) => (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    <span className="sa-co-related-list__meta">
                      {c.link === 'service' ? 'Servicios' : 'Administración'}
                      {c.status ? ` · ${c.status}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
