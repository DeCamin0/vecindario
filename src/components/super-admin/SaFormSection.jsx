/**
 * V8 — Sección de formulario Super Admin (solo presentación).
 */
export default function SaFormSection({ title, subtitle = null, children }) {
  return (
    <section className="sa-form-section">
      <header className="sa-form-section__head">
        <h3 className="sa-form-section__title">{title}</h3>
        {subtitle ? <p className="sa-form-section__sub">{subtitle}</p> : null}
      </header>
      <div className="sa-form-section__body">{children}</div>
    </section>
  )
}
