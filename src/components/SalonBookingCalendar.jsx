import {
  SALON_WEEKDAY_LABELS,
  buildSalonCalendarCells,
  canNavigateSalonMonthNext,
  canNavigateSalonMonthPrev,
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from '../utils/salonBookingDates.js'

/**
 * Calendario mensual (grid 7×N) para reservas de salón / espacios.
 * @param {object} props
 * @param {string} props.monthYear - YYYY-MM
 * @param {(ym: string) => void} props.onMonthChange
 * @param {string | null | undefined} props.selectedDate - YYYY-MM-DD
 * @param {(dateKey: string) => void} props.onDateSelect
 * @param {number} props.maxDaysInAdvance
 * @param {number} [props.minDaysInAdvance]
 * @param {(dateKey: string) => 'free'|'partial'|'occupied'|'disabled'} props.getDayStatus
 * @param {boolean} [props.showPartialLegend]
 */
export default function SalonBookingCalendar({
  monthYear,
  onMonthChange,
  selectedDate,
  onDateSelect,
  maxDaysInAdvance,
  minDaysInAdvance = 0,
  getDayStatus,
  showPartialLegend = false,
}) {
  const cells = buildSalonCalendarCells(monthYear, maxDaysInAdvance, new Date(), minDaysInAdvance)
  const canPrev = canNavigateSalonMonthPrev(monthYear)
  const canNext = canNavigateSalonMonthNext(monthYear, maxDaysInAdvance)
  const title = formatYearMonthLabel(monthYear)

  const goToday = () => {
    const ym = currentYearMonth()
    onMonthChange(ym)
    const todayCells = buildSalonCalendarCells(ym, maxDaysInAdvance, new Date(), minDaysInAdvance)
    const todayCell = todayCells.find((c) => c.type === 'day' && c.isToday && c.selectable)
    if (todayCell) onDateSelect(todayCell.key)
  }

  return (
    <div className="salon-cal" aria-label="Calendario de reservas">
      <div className="salon-cal__nav">
        <button
          type="button"
          className="salon-cal__nav-btn"
          onClick={() => onMonthChange(shiftYearMonth(monthYear, -1))}
          disabled={!canPrev}
          aria-label="Mes anterior"
        >
          ←
        </button>
        <h3 className="salon-cal__title">{title}</h3>
        <button
          type="button"
          className="salon-cal__nav-btn"
          onClick={() => onMonthChange(shiftYearMonth(monthYear, 1))}
          disabled={!canNext}
          aria-label="Mes siguiente"
        >
          →
        </button>
        <button type="button" className="salon-cal__today-btn btn btn--secondary btn--sm" onClick={goToday}>
          Hoy
        </button>
      </div>

      <div className="salon-cal__weekdays" aria-hidden="true">
        {SALON_WEEKDAY_LABELS.map((w) => (
          <span key={w} className="salon-cal__weekday">
            {w}
          </span>
        ))}
      </div>

      <div className="salon-cal__grid" role="grid" aria-label={`Días de ${title}`}>
        {cells.map((cell) => {
          if (cell.type === 'empty') {
            return <span key={cell.key} className="salon-cal__cell salon-cal__cell--empty" aria-hidden="true" />
          }
          const status = cell.selectable ? getDayStatus(cell.key) : 'disabled'
          const occupied = status === 'occupied'
          const partial = status === 'partial'
          const free = status === 'free'
          const selected = selectedDate === cell.key
          const clickable = cell.selectable && (free || partial)

          let ariaLabel = `${cell.dayNum}`
          if (cell.isToday) ariaLabel += ', hoy'
          if (occupied) ariaLabel += ', ocupado'
          else if (partial) ariaLabel += ', parcialmente ocupado'
          else if (free) ariaLabel += ', libre'
          else if (cell.isPast) ariaLabel += ', pasado'
          else ariaLabel += ', no disponible'

          if (clickable) {
            return (
              <button
                key={cell.key}
                type="button"
                role="gridcell"
                className={[
                  'salon-cal__cell',
                  'salon-cal__cell--day',
                  free ? 'salon-cal__cell--free' : '',
                  partial ? 'salon-cal__cell--partial' : '',
                  selected ? 'salon-cal__cell--selected' : '',
                  cell.isToday ? 'salon-cal__cell--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onDateSelect(cell.key)}
                aria-pressed={selected}
                aria-label={ariaLabel}
              >
                {cell.dayNum}
              </button>
            )
          }

          return (
            <span
              key={cell.key}
              role="gridcell"
              className={[
                'salon-cal__cell',
                'salon-cal__cell--day',
                occupied ? 'salon-cal__cell--occupied' : '',
                partial ? 'salon-cal__cell--partial' : '',
                !cell.selectable ? 'salon-cal__cell--muted' : '',
                cell.isToday && cell.selectable ? 'salon-cal__cell--today' : '',
                selected && !clickable ? 'salon-cal__cell--selected-readonly' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={ariaLabel}
            >
              {cell.dayNum}
              {occupied ? <span className="salon-cal__badge">Ocupado</span> : null}
              {partial ? <span className="salon-cal__badge salon-cal__badge--partial">Parcial</span> : null}
            </span>
          )
        })}
      </div>

      <ul className="salon-cal__legend" aria-label="Leyenda del calendario">
        <li>
          <span className="salon-cal__legend-swatch salon-cal__legend-swatch--free" aria-hidden="true" />
          Libre
        </li>
        {showPartialLegend ? (
          <li>
            <span className="salon-cal__legend-swatch salon-cal__legend-swatch--partial" aria-hidden="true" />
            Parcial
          </li>
        ) : null}
        <li>
          <span className="salon-cal__legend-swatch salon-cal__legend-swatch--occupied" aria-hidden="true" />
          Ocupado
        </li>
        <li>
          <span className="salon-cal__legend-swatch salon-cal__legend-swatch--muted" aria-hidden="true" />
          No disponible
        </li>
        <li>
          <span className="salon-cal__legend-swatch salon-cal__legend-swatch--today" aria-hidden="true" />
          Hoy
        </li>
      </ul>
    </div>
  )
}
