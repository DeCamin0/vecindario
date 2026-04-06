import { useState, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  useAuth,
  canActAsResident,
  canLockIncidentComments,
  canResolveIncidents,
} from '../context/AuthContext'
import { apiUrl } from '../config/api.js'
import './Incidents.css'

const CATEGORIES = [
  { id: 'water-leak', name: 'Fuga de agua', icon: '💧' },
  { id: 'electricity', name: 'Problema eléctrico', icon: '⚡' },
  { id: 'noise', name: 'Ruidos', icon: '🔊' },
  { id: 'cleaning', name: 'Limpieza', icon: '🧹' },
  { id: 'damage', name: 'Daños', icon: '⚠️' },
  { id: 'other', name: 'Otro', icon: '📋' },
]

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
]

const STATUS_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'resuelta', label: 'Resuelta' },
]

const initialForm = {
  description: '',
  location: '',
  urgency: 'medium',
}

function formatDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return { mime: 'image/jpeg', base64: dataUrl.replace(/\s/g, '') }
  return { mime: m[1], base64: m[2] }
}

export default function Incidents() {
  const { user, userRole, accessToken, communityId } = useAuth()
  const showIncidentManagement = canResolveIncidents(userRole)
  const showReportForm = canActAsResident(userRole)
  const showCommentsLockToggle = canLockIncidentComments(userRole)

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [portalChoice, setPortalChoice] = useState('')
  const [portalOptions, setPortalOptions] = useState(null)
  const [photoDataUrl, setPhotoDataUrl] = useState(null)
  const fileInputRef = useRef(null)

  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')

  const [errors, setErrors] = useState({})
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [expandedThreadId, setExpandedThreadId] = useState(null)
  const [commentsByIncident, setCommentsByIncident] = useState({})
  const [commentsLoadingId, setCommentsLoadingId] = useState(null)
  const [commentBusyId, setCommentBusyId] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [threadError, setThreadError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const loadList = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setList([])
      return
    }
    setListLoading(true)
    setListError('')
    try {
      const res = await fetch(apiUrl(`/api/incidents?communityId=${communityId}`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(typeof data.error === 'string' ? data.error : 'No se pudieron cargar las incidencias')
        setList([])
        return
      }
      setList(Array.isArray(data) ? data : [])
    } catch {
      setListError('Error de red')
      setList([])
    } finally {
      setListLoading(false)
    }
  }, [accessToken, communityId])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    setPortalChoice('')
  }, [communityId])

  useEffect(() => {
    let cancelled = false
    if (communityId == null) {
      setPortalOptions(null)
      return
    }
    fetch(apiUrl(`/api/public/community-config?communityId=${communityId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const po = d.portalSelectOptions
        setPortalOptions(Array.isArray(po) ? po : null)
      })
      .catch(() => {
        if (!cancelled) setPortalOptions(null)
      })
    return () => {
      cancelled = true
    }
  }, [communityId])

  const handleCategorySelect = (id) => {
    setSelectedCategory(selectedCategory === id ? null : id)
    setErrors({})
    if (selectedCategory !== id) {
      setForm(initialForm)
      setPortalChoice('')
      setPhotoDataUrl(null)
    }
  }

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 2.5 * 1024 * 1024) {
      setSubmitError('La imagen no debe superar ~2,5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoDataUrl(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const validate = () => {
    const next = {}
    if (!selectedCategory) next.category = 'Elige el tipo de incidencia.'
    if (!form.description.trim()) next.description = 'Describe qué ha ocurrido para que podamos actuar.'
    if (!form.location.trim()) next.location = 'Indica la ubicación (obligatorio).'
    if (portalOptions != null && portalOptions.length > 0 && !portalChoice.trim()) {
      next.portal = 'Elige el portal de la lista.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!validate() || isSubmitting) return
    if (!accessToken || communityId == null) {
      setSubmitError('Inicia sesión de nuevo.')
      return
    }

    let photoBase64 = null
    let photoMime = null
    if (photoDataUrl) {
      const parsed = parseDataUrl(photoDataUrl)
      photoMime = parsed.mime
      photoBase64 = parsed.base64
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/incidents'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          communityId,
          categoryId: selectedCategory,
          description: form.description.trim(),
          locationText: form.location.trim(),
          portalLabel: portalOptions?.length ? portalChoice.trim() : portalChoice.trim() || null,
          urgency: form.urgency,
          ...(photoBase64 ? { photoBase64, photoMime } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(typeof data.error === 'string' ? data.error : 'No se pudo enviar el reporte.')
        return
      }
      setSuccess(true)
      setForm(initialForm)
      setSelectedCategory(null)
      setPortalChoice('')
      setPhotoDataUrl(null)
      await loadList()
    } catch {
      setSubmitError('Error de red al enviar.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusChange = async (id, status) => {
    if (!accessToken) return
    try {
      const res = await fetch(apiUrl(`/api/incidents/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(typeof data.error === 'string' ? data.error : 'No se pudo actualizar')
        return
      }
      setList((prev) => prev.map((row) => (row.id === id ? { ...row, ...data } : row)))
    } catch {
      setListError('Error de red')
    }
  }

  const handleCommentsLockedChange = async (id, commentsLocked) => {
    if (!accessToken) return
    try {
      const res = await fetch(apiUrl(`/api/incidents/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ commentsLocked }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(typeof data.error === 'string' ? data.error : 'No se pudo actualizar')
        return
      }
      setList((prev) => prev.map((row) => (row.id === id ? { ...row, ...data } : row)))
    } catch {
      setListError('Error de red')
    }
  }

  const loadCommentsFor = useCallback(
    async (incidentId) => {
      if (!accessToken) return
      setCommentsLoadingId(incidentId)
      setThreadError('')
      try {
        const res = await fetch(apiUrl(`/api/incidents/${incidentId}/comments`), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setThreadError(
            typeof data.error === 'string' ? data.error : 'No se pudieron cargar los comentarios',
          )
          return
        }
        setCommentsByIncident((prev) => ({
          ...prev,
          [incidentId]: Array.isArray(data) ? data : [],
        }))
      } catch {
        setThreadError('Error de red')
      } finally {
        setCommentsLoadingId(null)
      }
    },
    [accessToken],
  )

  const toggleThread = (id) => {
    setCommentDraft('')
    setThreadError('')
    if (expandedThreadId === id) {
      setExpandedThreadId(null)
      return
    }
    setExpandedThreadId(id)
    if (!commentsByIncident[id]) {
      void loadCommentsFor(id)
    }
  }

  const postComment = async (incidentId) => {
    const text = commentDraft.trim()
    if (!text || !accessToken || commentBusyId) return
    setCommentBusyId(incidentId)
    setThreadError('')
    try {
      const res = await fetch(apiUrl(`/api/incidents/${incidentId}/comments`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setThreadError(typeof data.error === 'string' ? data.error : 'No se pudo publicar')
        return
      }
      setCommentDraft('')
      setCommentsByIncident((prev) => ({
        ...prev,
        [incidentId]: [...(prev[incidentId] || []), data],
      }))
      setList((prev) =>
        prev.map((row) =>
          row.id === incidentId
            ? { ...row, commentCount: (row.commentCount ?? 0) + 1 }
            : row,
        ),
      )
    } catch {
      setThreadError('Error de red')
    } finally {
      setCommentBusyId(null)
    }
  }

  const startEdit = (item) => {
    setEditError('')
    setEditingId(item.id)
    setEditForm({
      description: item.description || '',
      locationText: item.locationText || '',
      portalLabel: item.portalLabel || '',
      urgency: item.urgency || 'medium',
      categoryId: item.categoryId || 'other',
    })
    setExpandedThreadId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
    setEditError('')
  }

  const saveEdit = async () => {
    if (!accessToken || !editingId || !editForm) return
    if (portalOptions != null && portalOptions.length > 0 && !editForm.portalLabel.trim()) {
      setEditError('Elige el portal de la lista.')
      return
    }
    setEditSaving(true)
    setEditError('')
    const portalPayload = editForm.portalLabel.trim() || null
    try {
      const res = await fetch(apiUrl(`/api/incidents/${editingId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          description: editForm.description.trim(),
          locationText: editForm.locationText.trim(),
          urgency: editForm.urgency,
          categoryId: editForm.categoryId,
          portalLabel: portalPayload,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(typeof data.error === 'string' ? data.error : 'No se pudo guardar')
        return
      }
      setList((prev) => prev.map((row) => (row.id === editingId ? { ...row, ...data } : row)))
      cancelEdit()
    } catch {
      setEditError('Error de red')
    } finally {
      setEditSaving(false)
    }
  }

  const handleReportAnother = () => {
    setSuccess(false)
    setErrors({})
    setSubmitError('')
  }

  if (success) {
    return (
      <div className="page-container incidents-page">
        <div className="incident-success card success-entrance">
          <span className="incident-success-icon" aria-hidden="true">✓</span>
          <h2 className="incident-success-title">Reporte enviado</h2>
          <p className="incident-success-text">
            La incidencia queda como <strong>pendiente</strong> hasta que administración, presidente o conserje la marque
            como resuelta.
          </p>
          <div className="incident-success-actions">
            <Link to="/" className="btn btn--primary btn--block">
              Volver al inicio
            </Link>
            <button type="button" className="btn btn--ghost btn--block" onClick={handleReportAnother}>
              Reportar otra incidencia
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container incidents-page">
      <header className="page-header">
        <h1 className="page-title">{showIncidentManagement ? 'Incidencias' : 'Reportar incidencia'}</h1>
        <p className="page-subtitle">
          {showIncidentManagement && showReportForm
            ? 'Reporta como vecino. Las incidencias nuevas quedan pendientes; puedes marcarlas resueltas cuando estén atendidas. Todos los vecinos ven la lista y pueden comentar.'
            : showIncidentManagement
              ? 'Revisa y actualiza el estado de las incidencias de la comunidad. Los vecinos ven todas y comentan; solo tú cambias el estado.'
              : 'Indica el tipo de problema, la ubicación y los detalles. Se guarda como pendiente. Abajo ves las incidencias de toda la comunidad: puedes comentar; solo quien abrió el reporte puede editarlo mientras esté pendiente.'}
        </p>
      </header>

      {showReportForm && (
        <>
          <section className="incident-categories-section">
            <h2 className="section-label">¿Qué tipo de incidencia es?</h2>
            {errors.category && (
              <p className="form-error form-error--block" role="alert">{errors.category}</p>
            )}
            <div className="incident-category-grid">
              {CATEGORIES.map(({ id, name, icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`incident-category-card card ${selectedCategory === id ? 'incident-category-card--selected' : ''}`}
                  onClick={() => handleCategorySelect(id)}
                  aria-pressed={selectedCategory === id}
                >
                  <span className="incident-category-icon" aria-hidden="true">{icon}</span>
                  <span className="incident-category-name">{name}</span>
                </button>
              ))}
            </div>
          </section>

          {selectedCategory && (
            <form onSubmit={handleSubmit} className="incident-form card incident-form--modern">
              <div className="incident-form-header">
                <span className="incident-form-category">
                  {CATEGORIES.find((c) => c.id === selectedCategory)?.name}
                </span>
                <button
                  type="button"
                  className="incident-form-change"
                  onClick={() => setSelectedCategory(null)}
                  aria-label="Cambiar categoría"
                >
                  Cambiar
                </button>
              </div>

              {portalOptions != null && portalOptions.length > 0 ? (
                <div className="form-field">
                  <label className="form-label" htmlFor="incident-portal">
                    Portal <span className="form-required">*</span>
                  </label>
                  <select
                    id="incident-portal"
                    className={`form-input form-select ${errors.portal ? 'form-input--error' : ''}`}
                    value={portalChoice}
                    onChange={(e) => {
                      setPortalChoice(e.target.value)
                      if (errors.portal) setErrors((p) => ({ ...p, portal: null }))
                    }}
                  >
                    <option value="">Elige portal…</option>
                    {portalOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {errors.portal && <p className="form-error" role="alert">{errors.portal}</p>}
                </div>
              ) : null}

              <div className="form-field">
                <label className="form-label" htmlFor="incident-location">
                  Ubicación <span className="form-required">*</span>
                </label>
                <input
                  id="incident-location"
                  type="text"
                  className={`form-input ${errors.location ? 'form-input--error' : ''}`}
                  placeholder="Ej. escalera 2, garaje, zona lavandería"
                  value={form.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  required
                />
                {errors.location && <p className="form-error" role="alert">{errors.location}</p>}
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="incident-description">
                  Descripción <span className="form-required">*</span>
                </label>
                <textarea
                  id="incident-description"
                  className={`form-input form-textarea ${errors.description ? 'form-input--error' : ''}`}
                  placeholder="Describe qué ha ocurrido…"
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={4}
                  required
                />
                {errors.description && (
                  <p className="form-error" role="alert">{errors.description}</p>
                )}
              </div>

              <div className="form-field">
                <label className="form-label">Foto (opcional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="incident-file-input"
                  onChange={onFileChange}
                />
                <div className="incident-photo-row">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {photoDataUrl ? 'Cambiar foto' : 'Adjuntar imagen'}
                  </button>
                  {photoDataUrl ? (
                    <button type="button" className="btn btn--ghost" onClick={() => setPhotoDataUrl(null)}>
                      Quitar
                    </button>
                  ) : null}
                </div>
                {photoDataUrl ? (
                  <div className="incident-photo-preview-wrap">
                    <img src={photoDataUrl} alt="" className="incident-photo-preview" />
                  </div>
                ) : (
                  <p className="form-hint-muted">PNG o JPG, máx. ~2,5 MB.</p>
                )}
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="incident-urgency">Urgencia</label>
                <select
                  id="incident-urgency"
                  className="form-input form-select"
                  value={form.urgency}
                  onChange={(e) => handleChange('urgency', e.target.value)}
                >
                  {URGENCY_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {submitError ? <p className="form-error form-error--block" role="alert">{submitError}</p> : null}

              <button
                type="submit"
                className={`btn btn--primary btn--block incident-submit ${isSubmitting ? 'btn--loading' : ''}`}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" />
                    <span>Enviando…</span>
                  </>
                ) : (
                  'Enviar reporte'
                )}
              </button>
            </form>
          )}
        </>
      )}

      <section className="incident-management-section">
        <h2 className="section-label">Incidencias de la comunidad</h2>
        {listLoading ? (
          <p className="incident-list-hint">Cargando…</p>
        ) : null}
        {listError ? (
          <p className="form-error form-error--block" role="alert">{listError}</p>
        ) : null}
        <div className="incident-management-list">
          {!listLoading && list.length === 0 ? (
            <div className="incident-management-empty card">
              <p className="incident-management-empty-text">
                {showReportForm
                  ? 'Aún no hay incidencias en la comunidad.'
                  : 'No hay incidencias registradas.'}
              </p>
            </div>
          ) : (
            list.map((item) => {
              const myReport =
                user?.id != null &&
                item.reporterUserId != null &&
                Number(user.id) === Number(item.reporterUserId)
              const canEditReport = myReport && item.status === 'pendiente'
              const nComments = item.commentCount ?? 0
              return (
                <div key={item.id} className="incident-management-card card incident-management-card--modern">
                  <div className="incident-management-card-top">
                  <div className="incident-management-card-main">
                    {editingId === item.id && editForm ? (
                      <div className="incident-edit-block">
                        {editError ? (
                          <p className="form-error form-error--block" role="alert">
                            {editError}
                          </p>
                        ) : null}
                        <div className="form-field">
                          <label className="form-label" htmlFor={`edit-cat-${item.id}`}>
                            Tipo
                          </label>
                          <select
                            id={`edit-cat-${item.id}`}
                            className="form-input form-select"
                            value={editForm.categoryId}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, categoryId: e.target.value } : f))
                            }
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-field">
                          <label className="form-label" htmlFor={`edit-loc-${item.id}`}>
                            Ubicación
                          </label>
                          <input
                            id={`edit-loc-${item.id}`}
                            className="form-input"
                            value={editForm.locationText}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, locationText: e.target.value } : f))
                            }
                          />
                        </div>
                        {portalOptions != null && portalOptions.length > 0 ? (
                          <div className="form-field">
                            <label className="form-label" htmlFor={`edit-portal-${item.id}`}>
                              Portal
                            </label>
                            <select
                              id={`edit-portal-${item.id}`}
                              className="form-input form-select"
                              value={editForm.portalLabel}
                              onChange={(e) =>
                                setEditForm((f) => (f ? { ...f, portalLabel: e.target.value } : f))
                              }
                            >
                              <option value="">—</option>
                              {portalOptions.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div className="form-field">
                          <label className="form-label" htmlFor={`edit-desc-${item.id}`}>
                            Descripción
                          </label>
                          <textarea
                            id={`edit-desc-${item.id}`}
                            className="form-input form-textarea"
                            rows={4}
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, description: e.target.value } : f))
                            }
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label" htmlFor={`edit-urg-${item.id}`}>
                            Urgencia
                          </label>
                          <select
                            id={`edit-urg-${item.id}`}
                            className="form-input form-select"
                            value={editForm.urgency}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, urgency: e.target.value } : f))
                            }
                          >
                            {URGENCY_OPTIONS.map(({ value, label }) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="incident-edit-actions">
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={cancelEdit}
                            disabled={editSaving}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className={`btn btn--primary ${editSaving ? 'btn--loading' : ''}`}
                            onClick={() => void saveEdit()}
                            disabled={editSaving}
                          >
                            {editSaving ? 'Guardando…' : 'Guardar cambios'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="incident-card-badges-row">
                          <span className="incident-management-category">
                            {item.categoryLabel || item.categoryId}
                          </span>
                          <span
                            className={`incident-pill incident-pill--${item.status === 'resuelta' ? 'resuelta' : 'pendiente'}`}
                          >
                            {item.status === 'resuelta' ? 'Resuelta' : 'Pendiente'}
                          </span>
                          {myReport ? (
                            <span className="incident-your-report-pill" title="Eres quien abrió este reporte">
                              Tu reporte
                            </span>
                          ) : null}
                          {item.commentsLocked ? (
                            <span className="incident-pill incident-pill--comments-closed" title="Nuevos comentarios desactivados por conserje">
                              Comentarios cerrados
                            </span>
                          ) : null}
                        </div>
                        <p className="incident-management-desc">{item.description?.trim() || '—'}</p>
                        <p className="incident-management-location">
                          <strong>Ubicación:</strong> {item.locationText || '—'}
                          {item.portalLabel ? ` · Portal: ${item.portalLabel}` : ''}
                        </p>
                        {showIncidentManagement ? (
                          <p className="incident-reporter-line">
                            <strong>Reportado por:</strong>{' '}
                            {[
                              item.reporterName?.trim(),
                              item.reporterEmail,
                              item.reporterPortal ? `Portal ${item.reporterPortal}` : null,
                              item.reporterPiso ? `Piso ${item.reporterPiso}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        ) : null}
                        <p className="incident-management-meta">
                          Urgencia: {URGENCY_OPTIONS.find((o) => o.value === item.urgency)?.label ?? item.urgency}
                          {' · '}
                          {formatDate(item.createdAt)}
                          {!showIncidentManagement && (item.reporterName || item.reporterEmail)
                            ? ` · ${item.reporterName?.trim() || item.reporterEmail}`
                            : ''}
                          {item.hasPhoto ? ' · 📷 Foto' : ''}
                          {nComments > 0 ? ` · ${nComments} comentario${nComments === 1 ? '' : 's'}` : ''}
                        </p>
                        <div className="incident-card-actions-row">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => toggleThread(item.id)}
                            aria-expanded={expandedThreadId === item.id}
                          >
                            {expandedThreadId === item.id
                              ? 'Ocultar comentarios'
                              : nComments > 0
                                ? `Comentarios (${nComments})`
                                : 'Comentar'}
                          </button>
                          {canEditReport ? (
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => startEdit(item)}
                            >
                              Editar reporte
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                  {showIncidentManagement && editingId !== item.id ? (
                    <div className="incident-management-card-actions">
                      <label className="incident-management-status-label" htmlFor={`incident-status-${item.id}`}>
                        Estado
                      </label>
                      <select
                        id={`incident-status-${item.id}`}
                        className="form-input form-select incident-management-status-select"
                        value={item.status === 'resuelta' ? 'resuelta' : 'pendiente'}
                        onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        aria-label={`Cambiar estado incidencia ${item.id}`}
                      >
                        {STATUS_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {showCommentsLockToggle ? (
                        <label className="incident-comments-lock-label">
                          <input
                            type="checkbox"
                            checked={Boolean(item.commentsLocked)}
                            onChange={(e) => void handleCommentsLockedChange(item.id, e.target.checked)}
                          />
                          Cerrar comentarios a vecinos
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                  {expandedThreadId === item.id ? (
                    <div className="incident-comments-thread">
                      {threadError ? (
                        <p className="form-error form-error--block" role="alert">
                          {threadError}
                        </p>
                      ) : null}
                      {commentsLoadingId === item.id ? (
                        <p className="incident-list-hint">Cargando comentarios…</p>
                      ) : (
                        <ul className="incident-comments-list">
                          {(commentsByIncident[item.id] || []).map((c) => (
                            <li key={c.id} className="incident-comment-item">
                              <div className="incident-comment-head">
                                <strong>{c.authorName?.trim() || c.authorEmail || 'Vecino'}</strong>
                                <span className="incident-comment-date">{formatDate(c.createdAt)}</span>
                              </div>
                              <p className="incident-comment-body">{c.body}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="incident-comment-compose">
                        {item.commentsLocked && !showIncidentManagement ? (
                          <p className="form-hint-muted incident-comments-closed-hint" role="status">
                            El conserje ha cerrado nuevos comentarios en esta incidencia. Puedes leer los anteriores.
                          </p>
                        ) : (
                          <>
                            <label className="form-label" htmlFor={`comment-${item.id}`}>
                              Tu comentario
                            </label>
                            <textarea
                              id={`comment-${item.id}`}
                              className="form-input form-textarea"
                              rows={3}
                              maxLength={2000}
                              placeholder="Añade información o seguimiento…"
                              value={commentDraft}
                              onChange={(e) => setCommentDraft(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={!commentDraft.trim() || commentBusyId === item.id}
                              onClick={() => void postComment(item.id)}
                            >
                              {commentBusyId === item.id ? 'Publicando…' : 'Publicar comentario'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
