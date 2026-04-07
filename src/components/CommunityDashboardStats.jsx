import './CommunityDashboardStats.css'

/**
 * @param {{
 *   stats?: {
 *     totalIncidents?: number,
 *     bookingsToday?: number,
 *     pendingActions?: number,
 *     resolvedIncidents?: number,
 *     neighborAccountsCount?: number,
 *     estimatedDwellingCapacity?: number | null,
 *   },
 *   residentSlots?: number | null,
 * }} props
 */
export default function CommunityDashboardStats({ stats, residentSlots }) {
  const s = stats || {}
  const totalIncidents = Number(s.totalIncidents) || 0
  const bookingsToday = Number(s.bookingsToday) || 0
  const pendingActions = Number(s.pendingActions) || 0
  const resolvedIncidents = Number(s.resolvedIncidents) || 0
  const neighborCount = Number(s.neighborAccountsCount) || 0

  const officialCap =
    residentSlots != null && residentSlots !== '' && Number(residentSlots) > 0
      ? Number(residentSlots)
      : null
  const estimatedRaw = s.estimatedDwellingCapacity
  const estimatedCap =
    officialCap == null &&
    estimatedRaw != null &&
    estimatedRaw !== '' &&
    Number(estimatedRaw) > 0
      ? Number(estimatedRaw)
      : null

  const denominator = officialCap ?? estimatedCap
  const neighborsValue =
    denominator != null ? `${neighborCount} / ${denominator}` : `${neighborCount} / —`

  let neighborsTitle = ''
  if (officialCap != null) {
    neighborsTitle = `${neighborCount} dados de alta de ${officialCap} cupo planificado en ficha (Nº vecinos).`
  } else if (estimatedCap != null) {
    neighborsTitle = `${neighborCount} dados de alta; el denominador ${estimatedCap} es estimado (suma plantas × puertas por portal). Completa «Nº vecinos» en la ficha para un cupo oficial.`
  } else {
    neighborsTitle =
      'El guión (—) indica que no hay «Nº vecinos» en la ficha y los portales no permiten estimar viviendas (edita la comunidad o completa «Editar portales»).'
  }

  const sublabel = officialCap
    ? null
    : estimatedCap
      ? 'Estimado por portales · define «Nº vecinos» para cupo oficial'
      : 'Sin cupo en ficha — indica «Nº vecinos» al editar'

  return (
    <div className="community-dashboard-stats" role="group" aria-label="Resumen de actividad">
      <div className="community-dashboard-stats__item">
        <span className="community-dashboard-stats__value">{totalIncidents}</span>
        <span className="community-dashboard-stats__label">Total incidencias</span>
      </div>
      <div className="community-dashboard-stats__item">
        <span className="community-dashboard-stats__icon" aria-hidden>
          📅
        </span>
        <span className="community-dashboard-stats__value">{bookingsToday}</span>
        <span className="community-dashboard-stats__label">Reservas hoy</span>
      </div>
      <div className="community-dashboard-stats__item">
        <span className="community-dashboard-stats__icon" aria-hidden>
          ✓
        </span>
        <span className="community-dashboard-stats__value">{pendingActions}</span>
        <span className="community-dashboard-stats__label">Acciones pendientes</span>
      </div>
      <div className="community-dashboard-stats__item">
        <span className="community-dashboard-stats__icon" aria-hidden>
          ✅
        </span>
        <span className="community-dashboard-stats__value">{resolvedIncidents}</span>
        <span className="community-dashboard-stats__label">Incidencias resueltas</span>
      </div>
      <div
        className="community-dashboard-stats__item community-dashboard-stats__item--neighbors"
        title={neighborsTitle}
      >
        <span className="community-dashboard-stats__icon" aria-hidden>
          👥
        </span>
        <span className="community-dashboard-stats__value community-dashboard-stats__value--ratio">
          {neighborsValue}
        </span>
        <span className="community-dashboard-stats__label">Vecinos (alta / cupo)</span>
        {sublabel ? (
          <span className="community-dashboard-stats__sublabel">{sublabel}</span>
        ) : null}
      </div>
    </div>
  )
}
