import { Link } from 'react-router-dom'

/**
 * Superficie operativa compacta: ¿qué necesita atención hoy?
 */
export default function HomeTodaySection({ signals }) {
  if (!Array.isArray(signals) || signals.length === 0) return null

  return (
    <section className="home-today" aria-labelledby="home-today-heading">
      <div className="home-today__head">
        <h2 id="home-today-heading" className="section-label home-today__title">
          Hoy en la comunidad
        </h2>
        <p className="home-today__hint">Qué necesita atención ahora.</p>
      </div>
      <ul className="home-today__list">
        {signals.map((s) => {
          const body = (
            <>
              <span className="home-today__icon" aria-hidden="true">
                {s.icon}
              </span>
              <span className="home-today__meta">
                <span className="home-today__label">{s.label}</span>
                <span className="home-today__value">{s.value}</span>
              </span>
            </>
          )
          if (s.to) {
            return (
              <li key={s.id}>
                <Link to={s.to} className="home-today__item home-today__item--link">
                  {body}
                </Link>
              </li>
            )
          }
          return (
            <li key={s.id}>
              <div className="home-today__item">{body}</div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
