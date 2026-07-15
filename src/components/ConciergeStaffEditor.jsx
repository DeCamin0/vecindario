import { emptyConciergeSlot } from '../utils/conciergeEmailsForm.js'

const MAX_ROWS = 30

/**
 * @param {{
 *   title: string
 *   hint?: string
 *   list: { email: string, name: string, active: boolean }[]
 *   onChange: (next: { email: string, name: string, active: boolean }[]) => void
 *   idPrefix: string
 *   addLabel: string
 *   rowLabel: (index: number) => string
 * }} props
 */
export default function ConciergeStaffEditor({
  title,
  hint,
  list,
  onChange,
  idPrefix,
  addLabel,
  rowLabel,
}) {
  const rows = list?.length ? list : [emptyConciergeSlot()]

  const updateRow = (index, patch) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChange(next)
  }

  const removeRow = (index) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next.length ? next : [emptyConciergeSlot()])
  }

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return
    onChange([...rows, emptyConciergeSlot()])
  }

  return (
    <div className="admin-concierge-block">
      <p className="admin-label admin-concierge-slot-title">{title}</p>
      {hint ? <p className="admin-field-hint">{hint}</p> : null}
      {rows.map((row, i) => (
        <div
          key={`${idPrefix}-${i}`}
          className="admin-modal-field admin-concierge-slot admin-concierge-slot--row"
        >
          <div className="admin-concierge-row-head">
            <p className="admin-label admin-concierge-slot-subtitle">{rowLabel(i + 1)}</p>
            <label className="admin-concierge-active-toggle">
              <input
                type="checkbox"
                checked={row.active !== false}
                onChange={(e) => updateRow(i, { active: e.target.checked })}
              />
              Activo
            </label>
            {rows.length > 1 || row.email ? (
              <button
                type="button"
                className="admin-link-btn admin-concierge-remove"
                onClick={() => removeRow(i)}
              >
                Quitar
              </button>
            ) : null}
          </div>
          <label className="admin-label" htmlFor={`${idPrefix}-name-${i}`}>
            Nombre (opcional)
          </label>
          <input
            id={`${idPrefix}-name-${i}`}
            type="text"
            className="admin-input"
            value={row.name ?? ''}
            onChange={(e) => updateRow(i, { name: e.target.value })}
            placeholder="Ej. María García"
            autoComplete="name"
          />
          <label className="admin-label" htmlFor={`${idPrefix}-email-${i}`}>
            Email
          </label>
          <input
            id={`${idPrefix}-email-${i}`}
            type="email"
            className="admin-input"
            value={row.email ?? ''}
            onChange={(e) => updateRow(i, { email: e.target.value })}
            placeholder={i === 0 ? 'conserje@ejemplo.es' : `conserje${i + 1}@ejemplo.es`}
            autoComplete="email"
          />
          {row.active === false ? (
            <p className="admin-field-hint admin-concierge-inactive-hint">
              Desactivado: no podrá entrar en la app hasta reactivarlo.
            </p>
          ) : null}
        </div>
      ))}
      {rows.length < MAX_ROWS ? (
        <button type="button" className="admin-secondary-btn admin-concierge-add" onClick={addRow}>
          {addLabel}
        </button>
      ) : (
        <p className="admin-field-hint">Máximo {MAX_ROWS} en esta lista.</p>
      )}
    </div>
  )
}
