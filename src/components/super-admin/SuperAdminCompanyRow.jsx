/**
 * V5 — Fila compacta de empresa.
 */
export default function SuperAdminCompanyRow({ company, onOpenDetail }) {
  const kindLabel =
    company.kind === 'prestacion_servicios' ? 'Servicios' : 'Administración'
  const admins = company.companyAdminCount ?? 0
  const communities = company.communityCount ?? 0
  const services = company.serviceProviderCommunityCount ?? 0

  return (
    <article className="sa-co-row">
      <div className="sa-co-row__main">
        <div className="sa-co-row__identity">
          <div className="sa-co-row__title-line">
            <h3 className="sa-co-row__name">{company.name}</h3>
            <span
              className={`sa-co-row__kind sa-co-row__kind--${
                company.kind === 'prestacion_servicios' ? 'servicios' : 'admin'
              }`}
            >
              {kindLabel}
            </span>
          </div>
          <p className="sa-co-row__meta">
            <span>ID {company.id}</span>
            <span className="sa-co-row__dot">·</span>
            <span>
              {admins} admin{admins === 1 ? '' : 's'}
            </span>
            <span className="sa-co-row__dot">·</span>
            <span>
              {communities} comunidad{communities === 1 ? '' : 'es'} adm.
            </span>
            <span className="sa-co-row__dot">·</span>
            <span>
              {services} serv.
            </span>
            {admins < 1 ? (
              <>
                <span className="sa-co-row__dot">·</span>
                <span className="sa-co-row__warn">Sin administrador</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="sa-co-row__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenDetail}>
          Ver detalle
        </button>
      </div>
    </article>
  )
}
