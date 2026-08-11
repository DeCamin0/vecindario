/**
 * Panel «Catálogo y precios» (Super Admin).
 * READ: GET /api/admin/billing/catalog
 * WRITE: PUT /api/admin/billing/catalog (precios + includes de packs)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { billingModuleLabel } from '../lib/billingModuleLabels.js'
import './BillingCatalogPanel.css'

function formatEur(raw) {
  if (raw == null || raw === '') return '—'
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return String(raw)
  return `${n.toFixed(2).replace('.', ',')} €`
}

function normalizeMoneyInput(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(',', '.')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n.toFixed(2)
}

function includesEqual(a, b) {
  const na = [...new Set((a || []).map(String))].sort()
  const nb = [...new Set((b || []).map(String))].sort()
  return JSON.stringify(na) === JSON.stringify(nb)
}

/**
 * @param {{ accessToken: string | null, embedded?: boolean }} props
 */
export default function BillingCatalogPanel({ accessToken, embedded = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saveMsg, setSaveMsg] = useState(null)
  const [modeTab, setModeTab] = useState('neighbors_and_staff')
  const [editing, setEditing] = useState(false)
  /** @type {Record<string, string>} planCode::usageMode → input */
  const [draftPlans, setDraftPlans] = useState({})
  /** @type {Record<string, string>} moduleCode → input */
  const [draftModules, setDraftModules] = useState({})
  /** @type {Record<string, string[]>} planCode → includes */
  const [draftIncludes, setDraftIncludes] = useState({})
  const [editingTiers, setEditingTiers] = useState(false)
  const [savingTiers, setSavingTiers] = useState(false)
  /** @type {Array<{ fromUnits: string, toUnits: string, surchargeEur: string, infinite: boolean }>} */
  const [draftTiers, setDraftTiers] = useState([])
  const [tiersMsg, setTiersMsg] = useState(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/billing/catalog'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || json.message || `Error ${res.status}`)
      setData(json)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el catálogo')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const beginEdit = useCallback(() => {
    if (!data) return
    const plans = {}
    for (const p of data.plans || []) {
      const byMode = p.pricesByUsageMode || {}
      for (const [mode, price] of Object.entries(byMode)) {
        if (price == null) continue
        plans[`${p.code}::${mode}`] = String(price)
      }
    }
    const mods = {}
    for (const m of data.modules || []) {
      if (m.active === false) continue
      mods[m.code] = String(m.listPrice ?? '')
    }
    const includes = {}
    for (const p of data.plans || []) {
      if (p.kind === 'platform' || p.code === 'a_medida') continue
      includes[p.code] = Array.isArray(p.includes) ? [...p.includes] : []
    }
    setDraftPlans(plans)
    setDraftModules(mods)
    setDraftIncludes(includes)
    setSaveMsg(null)
    setError(null)
    setEditing(true)
  }, [data])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setDraftPlans({})
    setDraftModules({})
    setDraftIncludes({})
    setSaveMsg(null)
  }, [])

  const editablePlanRows = useMemo(() => {
    const mode = data?.usageModes?.[modeTab]
    return (mode?.plans || []).map((p) => ({
      key: `${p.code}::${modeTab}`,
      planCode: p.code,
      usageMode: modeTab,
      name: p.name,
      kind: p.kind,
      current: p.monthlyPrice,
    }))
  }, [data, modeTab])

  const modules = useMemo(
    () => (data?.modules || []).filter((m) => m.active !== false && m.code !== 'special_delivery'),
    [data],
  )

  const packPlansForEdit = useMemo(() => {
    return (data?.plans || []).filter(
      (p) => p.active !== false && p.kind === 'pack' && p.code !== 'a_medida',
    )
  }, [data])

  const sizeTiers = useMemo(() => data?.sizeTiers || [], [data])

  const beginEditTiers = useCallback(() => {
    setDraftTiers(
      (data?.sizeTiers || []).map((t) => ({
        fromUnits: String(t.fromUnits),
        toUnits: t.toUnits == null ? '' : String(t.toUnits),
        surchargeEur: String(t.surchargeEur ?? ''),
        infinite: t.toUnits == null,
      })),
    )
    setEditingTiers(true)
    setTiersMsg(null)
    setError(null)
  }, [data])

  const cancelEditTiers = useCallback(() => {
    setEditingTiers(false)
    setDraftTiers([])
    setTiersMsg(null)
  }, [])

  const updateDraftTier = useCallback((idx, patch) => {
    setDraftTiers((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }, [])

  const addDraftTier = useCallback(() => {
    setDraftTiers((prev) => {
      const last = prev[prev.length - 1]
      const nextFrom =
        last && !last.infinite && last.toUnits !== ''
          ? String(Number(last.toUnits) + 1)
          : String(prev.length === 0 ? 0 : '')
      const next = [...prev]
      if (last?.infinite) {
        next[next.length - 1] = { ...last, infinite: false, toUnits: last.toUnits || '' }
      }
      next.push({ fromUnits: nextFrom, toUnits: '', surchargeEur: '0.00', infinite: true })
      return next
    })
  }, [])

  const removeDraftTier = useCallback((idx) => {
    setDraftTiers((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      if (next.length > 0 && !next.some((t) => t.infinite)) {
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, infinite: true, toUnits: '' }
      }
      return next
    })
  }, [])

  const saveTiers = useCallback(async () => {
    if (!accessToken) return
    setSavingTiers(true)
    setError(null)
    setTiersMsg(null)
    try {
      const tiers = draftTiers.map((row, i) => {
        const fromUnits = Number.parseInt(String(row.fromUnits), 10)
        if (!Number.isInteger(fromUnits) || fromUnits < 0) {
          throw new Error(`Tramo ${i + 1}: fromUnits inválido`)
        }
        const surchargeEur = normalizeMoneyInput(row.surchargeEur)
        if (surchargeEur == null) {
          throw new Error(`Tramo ${i + 1}: suplemento inválido`)
        }
        let toUnits = null
        if (!row.infinite) {
          toUnits = Number.parseInt(String(row.toUnits), 10)
          if (!Number.isInteger(toUnits) || toUnits < 0) {
            throw new Error(`Tramo ${i + 1}: toUnits inválido`)
          }
        }
        return { fromUnits, toUnits, surchargeEur }
      })

      const res = await fetch(apiUrl('/api/admin/billing/catalog/size-tiers'), {
        method: 'PUT',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ tiers }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.message || json.error || `Error ${res.status}`)
      }
      setData(json)
      setEditingTiers(false)
      setDraftTiers([])
      setTiersMsg(
        json?.meta?.unchanged
          ? 'Sin cambios en tramos.'
          : 'Tramos de tamaño guardados (no modifica contratos existentes).',
      )
    } catch (e) {
      setError(e.message || 'No se pudieron guardar los tramos')
    } finally {
      setSavingTiers(false)
    }
  }, [accessToken, draftTiers])

  const toggleInclude = useCallback((planCode, moduleCode) => {
    setDraftIncludes((prev) => {
      const cur = new Set(prev[planCode] || [])
      if (cur.has(moduleCode)) cur.delete(moduleCode)
      else cur.add(moduleCode)
      return { ...prev, [planCode]: [...cur] }
    })
  }, [])

  const save = useCallback(async () => {
    if (!accessToken || !data) return
    setSaving(true)
    setError(null)
    setSaveMsg(null)
    try {
      const planPrices = []
      for (const [key, raw] of Object.entries(draftPlans)) {
        const [planCode, usageMode] = key.split('::')
        const next = normalizeMoneyInput(raw)
        if (next == null) {
          throw new Error(`Importe no válido en plan ${planCode} (${usageMode})`)
        }
        const plan = (data.plans || []).find((p) => p.code === planCode)
        const before = plan?.pricesByUsageMode?.[usageMode]
        if (before != null && String(before) === next) continue
        planPrices.push({ planCode, usageMode, monthlyPriceEur: next })
      }

      const modulePrices = []
      for (const [moduleCode, raw] of Object.entries(draftModules)) {
        const next = normalizeMoneyInput(raw)
        if (next == null) {
          throw new Error(`Importe no válido en módulo ${moduleCode}`)
        }
        const mod = modules.find((m) => m.code === moduleCode)
        if (mod && String(mod.listPrice) === next) continue
        modulePrices.push({ moduleCode, listPriceEur: next })
      }

      const planIncludes = []
      for (const p of packPlansForEdit) {
        const next = draftIncludes[p.code] || []
        const before = Array.isArray(p.includes) ? p.includes : []
        if (includesEqual(before, next)) continue
        planIncludes.push({ planCode: p.code, includes: next })
      }

      if (planPrices.length === 0 && modulePrices.length === 0 && planIncludes.length === 0) {
        setSaveMsg('Sin cambios en el catálogo.')
        setEditing(false)
        return
      }

      const res = await fetch(apiUrl('/api/admin/billing/catalog'), {
        method: 'PUT',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ planPrices, modulePrices, planIncludes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || json.message || `Error ${res.status}`)
      }
      setData(json)
      setEditing(false)
      setDraftPlans({})
      setDraftModules({})
      setDraftIncludes({})
      const n = json?.meta?.changed ?? 0
      setSaveMsg(
        json?.meta?.unchanged
          ? 'Sin cambios en el catálogo.'
          : `Guardado: ${n} cambio(s) de catálogo.`,
      )
    } catch (e) {
      setError(e.message || 'No se pudo guardar el catálogo')
    } finally {
      setSaving(false)
    }
  }, [accessToken, data, draftPlans, draftModules, draftIncludes, modules, packPlansForEdit])

  if (!accessToken) return null

  const mode = data?.usageModes?.[modeTab]
  const platform = mode?.plans?.find((p) => p.kind === 'platform')
  const packs = (mode?.plans || []).filter((p) => p.kind === 'pack')

  return (
    <section
      className={`bcp admin-section${embedded ? ' bcp--embedded' : ''}`}
      aria-labelledby="bcp-title"
    >
      <div className="admin-section-head">
        <h2 id="bcp-title" className="admin-section-title">
          Catálogo y precios
        </h2>
        <div className="bcp-actions">
          {!editing ? (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Cargando…' : 'Actualizar'}
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={beginEdit}
                disabled={!data || loading || editingTiers}
              >
                Editar catálogo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="bcp-lead bcp-lead--safety">
        Los cambios del catálogo solo afectan a nuevas contrataciones o futuras
        incorporaciones/cambios comerciales. Los contratos ya configurados conservan sus precios
        snapshot.
      </p>
      <p className="bcp-lead">
        Esta configuración define qué módulos incluye comercialmente el pack. No modifica los
        módulos activos de ninguna comunidad.
      </p>

      {error ? <p className="admin-banner-error">{error}</p> : null}
      {saveMsg ? <p className="bcp-save-ok">{saveMsg}</p> : null}
      {tiersMsg ? <p className="bcp-save-ok">{tiersMsg}</p> : null}

      <article className="bcp-card bcp-card--tiers">
        <header className="bcp-tiers-head">
          <div>
            <span className="bcp-kicker">Suplemento por tamaño</span>
            <h3>Tramos globales (viviendas contractuales)</h3>
          </div>
          <div className="bcp-actions">
            {!editingTiers ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={beginEditTiers}
                disabled={!data || loading || editing}
              >
                Editar tramos
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={cancelEditTiers}
                  disabled={savingTiers}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void saveTiers()}
                  disabled={savingTiers}
                >
                  {savingTiers ? 'Guardando…' : 'Guardar tramos'}
                </button>
              </>
            )}
          </div>
        </header>
        <p className="bcp-help">
          Cobertura continua 0→∞. Cambiar tramos no reescribe el suplemento contractual
          (sizeSurchargeEur) de comunidades ya configuradas.
        </p>
        {editingTiers ? (
          <div className="bcp-tiers-edit">
            <ul className="bcp-tiers-list">
              {draftTiers.map((row, idx) => (
                <li key={idx} className="bcp-tiers-row">
                  <label>
                    <span>Desde</span>
                    <input
                      className="bcp-input"
                      type="number"
                      min="0"
                      step="1"
                      value={row.fromUnits}
                      onChange={(e) => updateDraftTier(idx, { fromUnits: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Hasta</span>
                    <input
                      className="bcp-input"
                      type="number"
                      min="0"
                      step="1"
                      disabled={row.infinite}
                      value={row.infinite ? '' : row.toUnits}
                      placeholder={row.infinite ? '∞' : ''}
                      onChange={(e) => updateDraftTier(idx, { toUnits: e.target.value })}
                    />
                  </label>
                  <label className="bcp-check bcp-tiers-inf">
                    <input
                      type="checkbox"
                      checked={row.infinite}
                      onChange={(e) => {
                        const infinite = e.target.checked
                        setDraftTiers((prev) =>
                          prev.map((r, i) => {
                            if (i === idx) {
                              return { ...r, infinite, toUnits: infinite ? '' : r.toUnits }
                            }
                            if (infinite && r.infinite) {
                              return { ...r, infinite: false }
                            }
                            return r
                          }),
                        )
                      }}
                    />
                    <span>∞</span>
                  </label>
                  <label>
                    <span>€/mes</span>
                    <input
                      className="bcp-input"
                      type="text"
                      inputMode="decimal"
                      value={row.surchargeEur}
                      onChange={(e) => updateDraftTier(idx, { surchargeEur: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeDraftTier(idx)}
                    disabled={draftTiers.length <= 1}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn--ghost btn--sm" onClick={addDraftTier}>
              Añadir tramo
            </button>
          </div>
        ) : (
          <table className="bcp-table">
            <thead>
              <tr>
                <th>Tramo</th>
                <th>Suplemento / mes</th>
              </tr>
            </thead>
            <tbody>
              {sizeTiers.length === 0 ? (
                <tr>
                  <td colSpan={2} className="bcp-muted">
                    Sin tramos (ejecuta seed o crea desde Editar tramos).
                  </td>
                </tr>
              ) : (
                sizeTiers.map((t) => (
                  <tr key={`${t.fromUnits}-${t.toUnits ?? 'inf'}`}>
                    <td>{t.label || `${t.fromUnits}–${t.toUnits ?? '∞'}`}</td>
                    <td>{formatEur(t.surchargeEur)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </article>

      <div className="bcp-tabs" role="tablist" aria-label="Modalidad de uso">
        {[
          { code: 'neighbors_and_staff', label: 'Vecinos + conserjería' },
          { code: 'staff_only', label: 'Solo conserjería' },
        ].map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={modeTab === t.code}
            className={`bcp-tab${modeTab === t.code ? ' is-on' : ''}`}
            onClick={() => setModeTab(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? <p className="bcp-muted">Cargando catálogo…</p> : null}

      {editing && data ? (
        <div className="bcp-edit">
          <p className="bcp-help">
            Editas precios e includes comerciales. No se editan nombres, códigos, flags ni
            disponibilidad de planes.
          </p>

          <h3 className="bcp-edit-title">Cuota plataforma / packs · precios · {mode?.label || modeTab}</h3>
          <ul className="bcp-edit-list">
            {editablePlanRows.map((row) => (
              <li key={row.key}>
                <label className="bcp-edit-row">
                  <span>
                    <strong>{row.name}</strong>
                    <span className="bcp-muted"> · actual {formatEur(row.current)}</span>
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="bcp-input"
                    value={draftPlans[row.key] ?? ''}
                    onChange={(e) =>
                      setDraftPlans((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                    aria-label={`Precio ${row.name}`}
                  />
                </label>
              </li>
            ))}
          </ul>

          <h3 className="bcp-edit-title">Módulos incluidos (pack · precio cerrado)</h3>
          <p className="bcp-help">
            Define el contenido comercial del pack. No activa ni desactiva módulos en comunidades.
          </p>

          <article className="bcp-includes-card bcp-includes-card--platform">
            <h4>A medida · cuota plataforma</h4>
            <p className="bcp-help">
              Sin módulos incluidos. Los módulos se contratan por separado.
            </p>
          </article>

          {packPlansForEdit.map((p) => {
            const selected = new Set(draftIncludes[p.code] || [])
            return (
              <article key={p.code} className="bcp-includes-card">
                <h4>
                  {p.name}
                  <span className="bcp-muted">
                    {' '}
                    · {formatEur(p.pricesByUsageMode?.neighbors_and_staff ?? p.monthlyPrice)}
                  </span>
                </h4>
                <p className="bcp-kicker">Módulos incluidos</p>
                <ul className="bcp-check-list">
                  {modules.map((m) => {
                    const id = `inc-${p.code}-${m.code}`
                    return (
                      <li key={m.code}>
                        <label className="bcp-check" htmlFor={id}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={selected.has(m.code)}
                            onChange={() => toggleInclude(p.code, m.code)}
                          />
                          <span>{m.name || billingModuleLabel(m.code)}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}

          <h3 className="bcp-edit-title">Módulos a la carta · precios</h3>
          <ul className="bcp-edit-list">
            {modules.map((m) => (
              <li key={m.code}>
                <label className="bcp-edit-row">
                  <span>
                    <strong>{m.name || billingModuleLabel(m.code)}</strong>
                    <span className="bcp-muted"> · actual {formatEur(m.listPrice)}</span>
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="bcp-input"
                    value={draftModules[m.code] ?? ''}
                    onChange={(e) =>
                      setDraftModules((prev) => ({ ...prev, [m.code]: e.target.value }))
                    }
                    aria-label={`Precio ${m.name || m.code}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!editing && mode ? (
        <div className="bcp-grid">
          <article className="bcp-card bcp-card--platform">
            <header>
              <span className="bcp-kicker">Cuota plataforma</span>
              <h3>{platform?.name || 'A medida'}</h3>
            </header>
            <p className="bcp-price">{formatEur(platform?.monthlyPrice)}/mes</p>
            <p className="bcp-help">
              Sin módulos incluidos. Los módulos se contratan por separado. Cubre hosting, dominio,
              mantenimiento, backups, actualizaciones y soporte base.
            </p>
          </article>

          <article className="bcp-card bcp-card--packs">
            <header>
              <span className="bcp-kicker">Pack · precio cerrado</span>
              <h3>Planes y módulos incluidos</h3>
            </header>
            {packs.length === 0 ? (
              <p className="bcp-muted">No hay packs para esta modalidad.</p>
            ) : (
              <ul className="bcp-pack-list">
                {packs.map((p) => (
                  <li key={p.code}>
                    <div className="bcp-pack__head">
                      <strong>{p.name}</strong>
                      <span>{formatEur(p.monthlyPrice)}/mes</span>
                    </div>
                    <p className="bcp-help">Precio cerrado. Módulos incluidos no se cobran aparte.</p>
                    {(p.includes || []).length > 0 ? (
                      <ul className="bcp-includes">
                        {p.includes.map((code) => (
                          <li key={code}>{billingModuleLabel(code)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bcp-muted">Sin módulos incluidos configurados.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="bcp-card bcp-card--modules">
            <header>
              <span className="bcp-kicker">Módulos a la carta</span>
              <h3>Catálogo de módulos</h3>
            </header>
            <p className="bcp-help">
              Mismos precios en ambas modalidades. Se suman solo en A medida (o como extras fuera del
              pack).
            </p>
            <table className="bcp-table">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Precio / mes</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.code}>
                    <td>{m.name || billingModuleLabel(m.code)}</td>
                    <td>{formatEur(m.listPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}
    </section>
  )
}
