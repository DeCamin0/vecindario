/**
 * Editor modal de Plan y facturación (Super Admin).
 * Precios finales: solo vía POST preview / PUT — sin computeBillingQuote en cliente.
 * B6 polish: UI SaaS; lógica/contratos intactos.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { useDialog } from '../context/DialogContext.jsx'
import {
  COMMERCIAL_STATUS_OPTIONS,
  MODULE_MODE_OPTIONS,
  USAGE_MODES,
  applyPlanToModuleStates,
  forcedIncludeCodes,
  formFingerprint,
  formFromBillingDetail,
  formToPutPayload,
  isPlanAllowedForUsageMode,
  plansAllowedForUsageMode,
} from '../lib/billingEditorPayload.js'
import './CommunityBillingEditor.css'

/** Caché de catálogo en memoria de sesión (evita N+1 al abrir varias comunidades). */
let catalogCache = null
let catalogCachePromise = null

async function loadBillingCatalog(accessToken, { force = false } = {}) {
  if (!force && catalogCache) return catalogCache
  if (catalogCachePromise) return catalogCachePromise
  catalogCachePromise = (async () => {
    const res = await fetch(apiUrl('/api/admin/billing/catalog'), {
      headers: jsonAuthHeaders(accessToken),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.message || 'Error al cargar catálogo')
    catalogCache = data
    return data
  })()
  try {
    return await catalogCachePromise
  } finally {
    catalogCachePromise = null
  }
}

function formatEur(raw) {
  if (raw == null || raw === '') return '—'
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return String(raw)
  return `${n.toFixed(2).replace('.', ',')} €`
}

function normalizeMoneyCompare(raw) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return n.toFixed(2)
}

function formatEurMes(raw) {
  const s = formatEur(raw)
  return s === '—' ? s : `${s}/mes`
}

const PLAN_BLURBS = {
  comunidad: 'Pack precio cerrado · Incidencias y Reservas incluidas',
  conserjeria: 'Pack precio cerrado · módulos de conserjería incluidos',
  completo: 'Pack precio cerrado · todos los módulos incluidos',
  a_medida: 'Cuota plataforma · los módulos a la carta se suman',
}

function planDisplayName(plan) {
  if (plan?.code === 'a_medida') return 'Cuota plataforma (A medida)'
  return plan?.name || plan?.code || '—'
}

function catalogPriceForMode(plan, usageMode) {
  if (!plan) return null
  const byMode = plan.pricesByUsageMode?.[usageMode]
  if (byMode != null && byMode !== '') return byMode
  return plan.monthlyPrice
}

const DWELLING_SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'suggested_accepted', label: 'Sugerencia aceptada' },
  { value: 'unknown', label: 'Desconocido' },
]

function summarizeFlagDiff(modules) {
  const list = Array.isArray(modules) ? modules : []
  return {
    ok: list.filter((m) => m.status === 'ok').length,
    activeNotContracted: list.filter((m) => m.status === 'active_not_contracted').length,
    contractedNotActive: list.filter((m) => m.status === 'contracted_not_active').length,
  }
}

function functionalBadge(flagItem) {
  if (!flagItem) {
    return { label: '—', tone: 'muted' }
  }
  if (flagItem.functionallyActive) {
    return { label: 'Activo', tone: 'ok' }
  }
  return { label: 'Inactivo', tone: 'off' }
}

function appliedPriceLabel(state, listPrice, resolvedLine) {
  if (resolvedLine?.chargedPriceEur != null) return formatEur(resolvedLine.chargedPriceEur)
  if (!state || state.mode === 'not_contracted') return '—'
  if (state.mode === 'included' || state.mode === 'free') return formatEur(0)
  if (state.mode === 'custom') {
    return state.customPrice ? formatEur(state.customPrice) : '—'
  }
  return formatEur(listPrice)
}

/**
 * @param {{
 *   communityId: number,
 *   communityName?: string,
 *   accessToken: string,
 *   onClose: () => void,
 *   onSaved: () => void | Promise<void>,
 * }} props
 */
export default function CommunityBillingEditor({
  communityId,
  communityName = '',
  accessToken,
  onClose,
  onSaved,
}) {
  const { confirm } = useDialog()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [catalog, setCatalog] = useState(catalogCache)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  const [baselineFp, setBaselineFp] = useState('')
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(null)

  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [conflict409, setConflict409] = useState(false)
  const [formError, setFormError] = useState(null)
  const [showFlagDetail, setShowFlagDetail] = useState(false)

  const previewSeq = useRef(0)
  const dirty = form ? formFingerprint(form) !== baselineFp : false

  const plans = useMemo(() => {
    const all = (catalog?.plans || []).filter((p) => p.active !== false)
    const allowed = new Set(plansAllowedForUsageMode(form?.usageMode || 'neighbors_and_staff'))
    const filtered = all.filter((p) => allowed.has(p.code))
    if (form?.planCode && !allowed.has(form.planCode)) {
      const legacy = all.find((p) => p.code === form.planCode)
      if (legacy) return [legacy, ...filtered]
    }
    return filtered
  }, [catalog, form?.usageMode, form?.planCode])

  const selectedPlan = useMemo(
    () => (catalog?.plans || []).find((p) => p.code === form?.planCode) || null,
    [catalog, form?.planCode],
  )

  /** Includes contractuales si mismo plan; catálogo vigente si alta/cambio de plan. */
  const forcedIncludesSet = useMemo(() => {
    return new Set(
      forcedIncludeCodes({
        plan: selectedPlan,
        billing: detail?.billing,
        formPlanCode: form?.planCode,
      }),
    )
  }, [selectedPlan, detail?.billing, form?.planCode])

  const legacyPlanWarning =
    form?.planCode &&
    form?.usageMode &&
    !isPlanAllowedForUsageMode(form.planCode, form.usageMode)
      ? 'Este plan no está disponible para el modo de uso actual. Cámbialo antes de guardar.'
      : null

  const flagModules = preview?.flagDiff?.modules || detail?.flagDiff?.modules || []
  const flagByCode = useMemo(() => {
    const map = new Map()
    for (const item of flagModules) {
      if (item?.moduleCode) map.set(item.moduleCode, item)
    }
    return map
  }, [flagModules])

  const flagSummary = useMemo(() => summarizeFlagDiff(flagModules), [flagModules])

  const resolvedLinesByCode = useMemo(() => {
    const map = new Map()
    for (const line of preview?.resolved?.lines || []) {
      if (line?.moduleCode) map.set(line.moduleCode, line)
    }
    return map
  }, [preview])

  const commercialLabel =
    COMMERCIAL_STATUS_OPTIONS.find((o) => o.value === form?.commercialStatus)?.label ||
    form?.commercialStatus

  const reloadDetail = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setSaveError(null)
    setConflict409(false)
    setFormError(null)
    try {
      const [cat, res] = await Promise.all([
        loadBillingCatalog(accessToken, { force: true }),
        fetch(apiUrl(`/api/admin/billing/communities/${communityId}`), {
          headers: jsonAuthHeaders(accessToken),
        }),
      ])
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setCatalog(cat)
      setDetail(data)
      const nextForm = formFromBillingDetail(data, cat)
      setForm(nextForm)
      setBaselineFp(formFingerprint(nextForm))
      setExpectedUpdatedAt(data.billing?.updatedAt ?? null)
      if (data.quote) {
        setPreview({
          quote: data.quote,
          resolved: {
            planName: data.billing?.plan?.name,
            planListPriceEur: data.billing?.plan?.listPriceEur,
            planChargedPriceEur: data.billing?.plan?.chargedPriceEur,
            planCode: data.billing?.plan?.code,
            lines: data.billing?.lines || [],
          },
          sizeSuggestion: data.sizeSuggestion,
          flagDiff: data.flagDiff,
          warnings: data.warnings || [],
        })
        setPreviewError(null)
      } else {
        setPreview(null)
      }
    } catch (e) {
      setLoadError(e.message || 'No se pudo cargar billing')
      setForm(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId])

  useEffect(() => {
    void reloadDetail()
  }, [reloadDetail])

  useEffect(() => {
    if (!form || !accessToken || loading) return
    const parsed = formToPutPayload(form, {
      expectedUpdatedAt: null,
      catalogModules: catalog?.modules || [],
    })
    if (!parsed.ok) {
      setPreviewError(parsed.error)
      return
    }
    setFormError(null)
    const seq = ++previewSeq.current
    setPreviewLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/admin/billing/communities/${communityId}/preview`), {
          method: 'POST',
          headers: jsonAuthHeaders(accessToken),
          body: JSON.stringify(parsed.value),
        })
        const data = await res.json().catch(() => ({}))
        if (seq !== previewSeq.current) return
        if (!res.ok) {
          setPreviewError(data.message || data.error || `Preview ${res.status}`)
          setPreviewLoading(false)
          return
        }
        setPreview(data)
        setPreviewError(null)
      } catch (e) {
        if (seq !== previewSeq.current) return
        setPreviewError(e.message || 'Error de preview')
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [form, accessToken, communityId, catalog, loading])

  const patchForm = useCallback((patch) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    setConflict409(false)
    setSaveError(null)
  }, [])

  const onUsageModeChange = (usageMode) => {
    setForm((prev) => {
      if (!prev) return prev
      let planCode = prev.planCode
      if (!isPlanAllowedForUsageMode(planCode, usageMode)) {
        planCode = usageMode === 'staff_only' ? 'conserjeria' : planCode
        if (!isPlanAllowedForUsageMode(planCode, usageMode)) planCode = 'a_medida'
      }
      const plan = (catalog?.plans || []).find((p) => p.code === planCode)
      const modules =
        plan && planCode !== prev.planCode
          ? applyPlanToModuleStates(prev.modules, plan, catalog?.modules || [])
          : prev.modules
      return { ...prev, usageMode, planCode, modules }
    })
  }

  const onPlanChange = (planCode) => {
    setForm((prev) => {
      if (!prev) return prev
      const plan = (catalog?.plans || []).find((p) => p.code === planCode)
      if (!plan) return { ...prev, planCode }
      return {
        ...prev,
        planCode,
        modules: applyPlanToModuleStates(prev.modules, plan, catalog?.modules || []),
      }
    })
  }

  const onModuleModeChange = (code, mode) => {
    if (forcedIncludesSet.has(code) && mode !== 'included' && mode !== 'free') {
      setFormError(`«${code}» forma parte del plan: usa Incluido o Gratis.`)
      return
    }
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        modules: {
          ...prev.modules,
          [code]: {
            mode,
            customPrice: prev.modules[code]?.customPrice || '',
          },
        },
      }
    })
    setFormError(null)
  }

  const onModuleContractedToggle = (code, contracted) => {
    if (forcedIncludesSet.has(code)) {
      if (!contracted) {
        setFormError(`«${code}» forma parte del plan y no se puede descontratar.`)
        return
      }
      onModuleModeChange(code, 'included')
      return
    }
    if (contracted) {
      onModuleModeChange(code, 'catalog')
    } else {
      onModuleModeChange(code, 'not_contracted')
    }
  }

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Cambios sin guardar',
        message: 'Hay cambios sin guardar. ¿Quieres salir sin guardar?',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir editando',
        variant: 'default',
      })
      if (!ok) return
    }
    onClose()
  }

  const handleSave = async () => {
    if (!form) return
    const parsed = formToPutPayload(form, {
      expectedUpdatedAt,
      catalogModules: catalog?.modules || [],
    })
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    setSaving(true)
    setSaveError(null)
    setConflict409(false)
    try {
      const res = await fetch(apiUrl(`/api/admin/billing/communities/${communityId}`), {
        method: 'PUT',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(parsed.value),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setConflict409(true)
        setSaveError(
          data.message ||
            'La configuración fue modificada por otra sesión. Recarga los datos antes de guardar.',
        )
        return
      }
      if (!res.ok) {
        setSaveError(data.message || data.error || `Error ${res.status}`)
        return
      }
      setBaselineFp(formFingerprint(form))
      await onSaved()
      onClose()
    } catch (e) {
      setSaveError(e.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const applySuggestedSurcharge = () => {
    const sug = preview?.sizeSuggestion?.suggestedSurchargeEur
    if (sug == null) return
    patchForm({ sizeSurchargeEur: String(sug) })
  }

  const sizeSuggestion = preview?.sizeSuggestion ?? detail?.sizeSuggestion ?? null
  const suggestedSurcharge = sizeSuggestion?.suggestedSurchargeEur ?? null
  const contractualSurchargeNorm = normalizeMoneyCompare(form.sizeSurchargeEur)
  const suggestedNorm = suggestedSurcharge != null ? normalizeMoneyCompare(suggestedSurcharge) : null
  const isManualSizeAdjustment =
    suggestedNorm != null &&
    contractualSurchargeNorm != null &&
    contractualSurchargeNorm !== suggestedNorm

  const applySuggestedDwellings = () => {
    if (!detail?.suggestionReliable || detail.suggestedDwellingCount == null) return
    patchForm({
      dwellingCount: String(detail.suggestedDwellingCount),
      dwellingSource: 'suggested_accepted',
    })
  }

  const quote = preview?.quote
  const resolved = preview?.resolved
  const warnings = [
    ...(legacyPlanWarning ? [legacyPlanWarning] : []),
    ...(preview?.warnings || []),
  ]

  const catalogModules = (catalog?.modules || []).filter(
    (m) => m.active !== false && m.code !== 'special_delivery',
  )

  return (
    <div className="admin-modal-overlay cbe-overlay" role="presentation" onClick={requestClose}>
      <div
        className="admin-modal card admin-modal--wide admin-modal--scroll cbe-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cbe-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cbe-head">
          <div>
            <h2 id="cbe-title" className="cbe-title">
              Plan y facturación
            </h2>
            <p className="cbe-sub">
              <span className="cbe-sub__name">{communityName || `Comunidad #${communityId}`}</span>
              <span className="cbe-sub__sep">·</span>
              <span>{detail?.billing ? 'Editar contrato' : 'Configurar contrato'}</span>
            </p>
          </div>
          <button type="button" className="cbe-close" onClick={requestClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        {loading ? <p className="cbe-muted cbe-pad">Cargando datos de facturación…</p> : null}
        {loadError ? (
          <div className="cbe-banner cbe-banner--error cbe-pad">
            <p>{loadError}</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reloadDetail()}>
              Reintentar
            </button>
          </div>
        ) : null}

        {!loading && !loadError && form ? (
          <>
            <div className="cbe-layout">
              <div className="cbe-main">
                {/* 1. Modalidad */}
                <section className="cbe-section">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">1</span> Modalidad de uso
                  </h3>
                  <div className="cbe-usage-grid" role="radiogroup" aria-label="Modalidad de uso">
                    {USAGE_MODES.map((u) => {
                      const selected = form.usageMode === u.value
                      return (
                        <button
                          key={u.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`cbe-choice${selected ? ' is-selected' : ''}`}
                          onClick={() => onUsageModeChange(u.value)}
                        >
                          <span className="cbe-choice__radio" aria-hidden="true" />
                          <span className="cbe-choice__body">
                            <strong>{u.label}</strong>
                            <span className="cbe-choice__help">{u.help}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>

                {/* 2. Plan */}
                <section className="cbe-section">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">2</span> Plan comercial
                  </h3>
                  <div className="cbe-plan-grid" role="radiogroup" aria-label="Plan comercial">
                    {plans.map((p) => {
                      const selected = form.planCode === p.code
                      const catalogModePrice = catalogPriceForMode(p, form.usageMode)
                      const priceDisplay =
                        selected && resolved?.planChargedPriceEur != null
                          ? resolved.planChargedPriceEur
                          : catalogModePrice
                      const listHint =
                        selected &&
                        resolved?.planListPriceEur &&
                        resolved.planListPriceEur !== resolved.planChargedPriceEur
                          ? resolved.planListPriceEur
                          : null
                      const isPlatform = p.code === 'a_medida' || p.kind === 'platform'
                      return (
                        <button
                          key={p.code}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`cbe-plan-card${selected ? ' is-selected' : ''}${isPlatform ? ' cbe-plan-card--platform' : ' cbe-plan-card--pack'}`}
                          onClick={() => onPlanChange(p.code)}
                        >
                          <span className="cbe-plan-card__kind">
                            {isPlatform ? 'Cuota plataforma' : 'Pack precio cerrado'}
                          </span>
                          <span className="cbe-plan-card__name">{planDisplayName(p)}</span>
                          <span className="cbe-plan-card__price">{formatEurMes(priceDisplay)}</span>
                          {listHint ? (
                            <span className="cbe-plan-card__list">Lista {formatEur(listHint)}</span>
                          ) : null}
                          <span className="cbe-plan-card__blurb">
                            {PLAN_BLURBS[p.code] || 'Plan comercial'}
                          </span>
                          {!isPlatform && Array.isArray(p.includes) && p.includes.length > 0 ? (
                            <span className="cbe-plan-card__includes">
                              Incluye: {p.includes.length} módulo{p.includes.length === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  {form.planCode === 'a_medida' ? (
                    <p className="cbe-footnote">
                      La cuota plataforma no incluye módulos. Cada módulo contratado se suma al total
                      mensual (confirmado por el preview del backend).
                    </p>
                  ) : (
                    <p className="cbe-footnote">
                      Pack a precio cerrado: los módulos incluidos no se cobran aparte. Precios
                      confirmados por el preview del backend (IVA y descuentos aparte).
                    </p>
                  )}
                </section>

                {/* 3. Módulos */}
                <section className="cbe-section">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">3</span> Módulos
                  </h3>
                  <p className="cbe-lead">
                    Contratar un módulo no lo activa. Descontratar no lo desactiva. Los flags
                    funcionales son independientes.
                  </p>

                  <div className="cbe-table-wrap">
                    <table className="cbe-table">
                      <thead>
                        <tr>
                          <th>Módulo</th>
                          <th>Estado funcional</th>
                          <th>Contratado</th>
                          <th>Modalidad</th>
                          <th>Catálogo</th>
                          <th>Aplicado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogModules.map((m) => {
                          const state = form.modules[m.code] || {
                            mode: 'not_contracted',
                            customPrice: '',
                          }
                          const forcedIncluded = forcedIncludesSet.has(m.code)
                          const contracted = state.mode !== 'not_contracted'
                          const flagItem = flagByCode.get(m.code)
                          const badge = functionalBadge(flagItem)
                          const modeOptions = MODULE_MODE_OPTIONS.filter((opt) => {
                            if (forcedIncluded) {
                              return opt.value === 'included' || opt.value === 'free'
                            }
                            if (!contracted) return opt.value === 'not_contracted'
                            return (
                              opt.value === 'catalog' ||
                              opt.value === 'free' ||
                              opt.value === 'custom' ||
                              (opt.value === 'included' && state.mode === 'included')
                            )
                          })

                          return (
                            <tr key={m.code} className={contracted ? 'is-on' : ''}>
                              <td>
                                <div className="cbe-mod-name">{m.name}</div>
                                {forcedIncluded ? (
                                  <span className="cbe-chip">Incluido en el plan</span>
                                ) : null}
                              </td>
                              <td>
                                <span className={`cbe-pill cbe-pill--${badge.tone}`}>
                                  <span className="cbe-pill__dot" />
                                  {badge.label}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={`cbe-switch${contracted ? ' is-on' : ''}`}
                                  role="switch"
                                  aria-checked={contracted}
                                  aria-label={`Contratar ${m.name}`}
                                  disabled={forcedIncluded}
                                  onClick={() => onModuleContractedToggle(m.code, !contracted)}
                                >
                                  <span className="cbe-switch__knob" />
                                </button>
                              </td>
                              <td>
                                {contracted ? (
                                  <select
                                    className="cbe-select"
                                    value={state.mode}
                                    onChange={(e) => onModuleModeChange(m.code, e.target.value)}
                                  >
                                    {modeOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="cbe-muted">No contratado</span>
                                )}
                              </td>
                              <td className="cbe-num">{formatEur(m.listPrice)}</td>
                              <td className="cbe-num">
                                {state.mode === 'custom' ? (
                                  <input
                                    className="cbe-input cbe-input--price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    aria-label={`Precio personalizado ${m.name}`}
                                    value={state.customPrice}
                                    onChange={(e) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        modules: {
                                          ...prev.modules,
                                          [m.code]: {
                                            ...prev.modules[m.code],
                                            customPrice: e.target.value,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                ) : (
                                  appliedPriceLabel(state, m.listPrice, resolvedLinesByCode.get(m.code))
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 4. Comunidad */}
                <section className="cbe-section">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">4</span> Comunidad y ajustes
                  </h3>
                  <div className="cbe-fields">
                    <label className="cbe-field">
                      <span className="cbe-field__label">Viviendas contratadas</span>
                      <input
                        className="cbe-input"
                        type="number"
                        min="0"
                        step="1"
                        value={form.dwellingCount}
                        onChange={(e) =>
                          patchForm({
                            dwellingCount: e.target.value,
                            dwellingSource: e.target.value === '' ? 'unknown' : 'manual',
                          })
                        }
                      />
                      {detail?.suggestionReliable && detail.suggestedDwellingCount != null ? (
                        <span className="cbe-suggest">
                          Sugerencia según configuración: {detail.suggestedDwellingCount} viviendas{' '}
                          <button type="button" className="cbe-link" onClick={applySuggestedDwellings}>
                            Usar sugerencia
                          </button>
                        </span>
                      ) : null}
                    </label>

                    <label className="cbe-field">
                      <span className="cbe-field__label">Origen del dato</span>
                      <select
                        className="cbe-select"
                        value={form.dwellingSource}
                        onChange={(e) => patchForm({ dwellingSource: e.target.value })}
                      >
                        {DWELLING_SOURCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                {/* 5. Ajustes de precio */}
                <section className="cbe-section">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">5</span> Ajustes de precio
                  </h3>
                  <div className="cbe-fields">
                    <div className="cbe-field cbe-field--wide">
                      <span className="cbe-field__label">Suplemento por tamaño</span>
                      <div className="cbe-size-meta">
                        <div>
                          <span className="cbe-muted">Viviendas contractuales: </span>
                          <strong>
                            {form.dwellingCount === '' || form.dwellingCount == null
                              ? '—'
                              : form.dwellingCount}
                          </strong>
                        </div>
                        <div>
                          <span className="cbe-muted">Tramo vigente: </span>
                          <strong>{sizeSuggestion?.tierLabel || '—'}</strong>
                        </div>
                        <div>
                          <span className="cbe-muted">Suplemento sugerido: </span>
                          <strong>
                            {suggestedSurcharge != null ? formatEur(suggestedSurcharge) : '—'}
                          </strong>
                          {suggestedSurcharge != null ? (
                            <>
                              {' '}
                              <button
                                type="button"
                                className="cbe-link"
                                onClick={applySuggestedSurcharge}
                              >
                                Aplicar sugerencia
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <label className="cbe-field" style={{ marginTop: '0.55rem' }}>
                        <span className="cbe-field__label">
                          Suplemento contractual / manual (€/mes)
                          {isManualSizeAdjustment ? (
                            <span className="cbe-badge-manual"> Ajuste manual</span>
                          ) : null}
                        </span>
                        <input
                          className="cbe-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.sizeSurchargeEur}
                          onChange={(e) => patchForm({ sizeSurchargeEur: e.target.value })}
                        />
                      </label>
                      {sizeSuggestion?.requiresManualSurcharge ? (
                        <span className="cbe-suggest">
                          Sin tramo sugerido (viviendas desconocidas o catálogo incompleto). Fija el
                          suplemento manualmente.
                        </span>
                      ) : null}
                    </div>

                    <label className="cbe-field">
                      <span className="cbe-field__label">Descuento mensual (€)</span>
                      <input
                        className="cbe-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.discountEur}
                        onChange={(e) => patchForm({ discountEur: e.target.value })}
                      />
                    </label>

                    <label className="cbe-field cbe-field--wide">
                      <span className="cbe-field__label">Motivo del descuento</span>
                      <input
                        className="cbe-input"
                        type="text"
                        maxLength={512}
                        value={form.discountNote}
                        onChange={(e) => patchForm({ discountNote: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className={`cbe-negotiated${form.useNegotiated ? ' is-on' : ''}`}>
                    <label className="cbe-check">
                      <input
                        type="checkbox"
                        checked={form.useNegotiated}
                        onChange={(e) => patchForm({ useNegotiated: e.target.checked })}
                      />
                      <span>
                        <strong>Usar precio mensual negociado</strong>
                        <span className="cbe-choice__help">
                          Sustituye el cálculo de plan, módulos, suplemento y descuento.
                        </span>
                      </span>
                    </label>
                    {form.useNegotiated ? (
                      <label className="cbe-field">
                        <span className="cbe-field__label">Importe neto negociado (€/mes)</span>
                        <input
                          className="cbe-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.negotiatedTotalEur}
                          onChange={(e) => patchForm({ negotiatedTotalEur: e.target.value })}
                        />
                      </label>
                    ) : null}
                  </div>

                  <label className="cbe-field cbe-field--vat">
                    <span className="cbe-field__label">IVA (%)</span>
                    <input
                      className="cbe-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.vatRatePct}
                      onChange={(e) => patchForm({ vatRatePct: e.target.value })}
                    />
                  </label>
                </section>

                {/* 6. Estado comercial */}
                <section className="cbe-section">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">6</span> Estado comercial
                  </h3>
                  <p className="cbe-lead">
                    Independiente del estado operativo de la comunidad (active / demo / …).
                  </p>
                  <div className="cbe-status-row">
                    <select
                      className="cbe-select cbe-select--lg"
                      value={form.commercialStatus}
                      onChange={(e) => patchForm({ commercialStatus: e.target.value })}
                      aria-label="Estado comercial"
                    >
                      {COMMERCIAL_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className={`cbe-badge-status cbe-badge-status--${form.commercialStatus}`}>
                      {commercialLabel}
                    </span>
                  </div>
                </section>

                {/* 7. Notas */}
                <section className="cbe-section cbe-section--last">
                  <h3 className="cbe-section__title">
                    <span className="cbe-step">7</span> Notas internas
                  </h3>
                  <label className="cbe-field cbe-field--wide">
                    <textarea
                      className="cbe-textarea"
                      rows={4}
                      maxLength={4000}
                      value={form.notes}
                      onChange={(e) => patchForm({ notes: e.target.value })}
                      placeholder="Notas internas de facturación (solo Super Admin)"
                    />
                    <span className="cbe-counter">{(form.notes || '').length} / 4000</span>
                  </label>
                </section>
              </div>

              <aside className="cbe-side">
                <div className="cbe-side__sticky">
                  <div className="cbe-summary">
                    <div className="cbe-summary__head">
                      <h3>Resumen mensual</h3>
                      {previewLoading ? <span className="cbe-summary__live">Actualizando…</span> : null}
                    </div>

                    {previewError ? (
                      <p className="cbe-banner cbe-banner--error">{previewError}</p>
                    ) : null}

                    {quote ? (
                      <dl className="cbe-quote">
                        <div>
                          <dt>Plan</dt>
                          <dd>{formatEur(quote.planPartEur)}</dd>
                        </div>
                        <div>
                          <dt>Módulos extra</dt>
                          <dd>{formatEur(quote.modulesPartEur)}</dd>
                        </div>
                        <div>
                          <dt>Suplemento</dt>
                          <dd>{formatEur(quote.sizeSurchargeEur)}</dd>
                        </div>
                        <div className="cbe-quote__discount">
                          <dt>Descuento</dt>
                          <dd>
                            {Number(quote.discountEur) > 0 ? '−' : ''}
                            {formatEur(quote.discountEur)}
                          </dd>
                        </div>
                        <div className="cbe-quote__rule" aria-hidden="true" />
                        <div className="cbe-quote__net">
                          <dt>Total neto</dt>
                          <dd>
                            {formatEurMes(quote.netEur)}
                            {quote.pricingSource === 'negotiated_override' ? (
                              <span className="cbe-quote__tag">Precio mensual negociado</span>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt>IVA {String(quote.vatRatePct).replace(/\.00$/, '')}%</dt>
                          <dd>{formatEur(quote.vatEur)}</dd>
                        </div>
                        <div className="cbe-quote__gross">
                          <dt>Total con IVA</dt>
                          <dd>{formatEurMes(quote.grossEur)}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="cbe-muted">Completa la configuración para ver el resumen.</p>
                    )}
                  </div>

                  {preview?.packRecommendation ? (
                    <div className="cbe-recommend" role="status">
                      <strong>Recomendación comercial</strong>
                      <p>{preview.packRecommendation.message}</p>
                      <p className="cbe-help">
                        Solo informativo. No cambia el plan ni bloquea guardar.
                        {preview.packRecommendation.packPriceEur
                          ? ` Precio cerrado del pack: ${formatEurMes(preview.packRecommendation.packPriceEur)}.`
                          : ''}
                      </p>
                    </div>
                  ) : null}

                  {warnings.length > 0 ? (
                    <div className="cbe-avisos">
                      <h4>Avisos</h4>
                      <ul>
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="cbe-diff-card">
                    <h4>Estado funcional vs contrato</h4>
                    <ul className="cbe-diff-summary">
                      <li className="is-ok">✓ Alineados: {flagSummary.ok}</li>
                      <li className="is-warn">
                        ⚠ Activo no contratado: {flagSummary.activeNotContracted}
                      </li>
                      <li className="is-warn">
                        ⚠ Contratado no activo: {flagSummary.contractedNotActive}
                      </li>
                    </ul>
                    <button
                      type="button"
                      className="cbe-link"
                      onClick={() => setShowFlagDetail((v) => !v)}
                    >
                      {showFlagDetail ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                    {showFlagDetail ? (
                      <ul className="cbe-diff-list">
                        {flagModules.map((item) => {
                          let label = '✓ Alineado'
                          let cls = 'cbe-diff--ok'
                          if (item.status === 'active_not_contracted') {
                            label = '⚠ Activo pero no contratado'
                            cls = 'cbe-diff--warn'
                          } else if (item.status === 'contracted_not_active') {
                            label = '⚠ Contratado pero no activo'
                            cls = 'cbe-diff--warn'
                          }
                          return (
                            <li key={item.moduleCode} className={`cbe-diff ${cls}`}>
                              <span>{label}</span>
                              <span className="cbe-diff__code">{item.moduleCode}</span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                    <p className="cbe-footnote">
                      La configuración comercial no modifica automáticamente los módulos activos.
                    </p>
                  </div>

                  {conflict409 ? (
                    <div className="cbe-banner cbe-banner--warn">
                      <p>
                        La configuración fue modificada por otra sesión. Recarga los datos antes de
                        guardar.
                      </p>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => void reloadDetail()}
                      >
                        Recargar datos
                      </button>
                    </div>
                  ) : null}

                  {formError ? <p className="cbe-banner cbe-banner--error">{formError}</p> : null}
                  {saveError && !conflict409 ? (
                    <p className="cbe-banner cbe-banner--error">{saveError}</p>
                  ) : null}
                </div>
              </aside>
            </div>

            <footer className="cbe-footer">
              <button type="button" className="btn btn--ghost" onClick={requestClose} disabled={saving}>
                Cancelar
              </button>
              <p className="cbe-footer__hint">
                Guardar escribe solo el contrato comercial (billing). No cambia flags ni estado
                operativo.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleSave()}
                disabled={saving || Boolean(legacyPlanWarning)}
              >
                {saving ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}
