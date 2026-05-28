import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import {
  SERVICE_CATEGORIES,
  CLEANING_SUBTYPES,
  PLUMBER_SUBTYPES,
  RENOVATION_SUBTYPES,
  CLEANING_DISCLAIMER_ES,
  isServiceCategoryActiveForCommunity,
  SERVICE_CATEGORIES_WITH_SUBTYPE,
  serviceSubtypePickErrorEs,
  PHOTO_REQUIRED_ERROR_ES,
  MAX_SERVICE_REQUEST_PHOTOS,
  MIN_SERVICE_REQUEST_PHOTOS,
} from '../../constants/serviceRequests.js'
import '../Services.css'
import './serviceRequestsPages.css'

export default function ServiceRequestNewPage() {
  const { accessToken, communityId, appNavFlagsReady, serviceRequestCategoryModes } = useAuth()
  const navigate = useNavigate()
  const galleryInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [serviceSubtype, setServiceSubtype] = useState(null)
  const [needsTechnicalVisit, setNeedsTechnicalVisit] = useState(false)
  const [description, setDescription] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!serviceRequestCategoryModes || !selectedCategory) return
    if (!isServiceCategoryActiveForCommunity(serviceRequestCategoryModes, selectedCategory)) {
      setSelectedCategory(null)
      setServiceSubtype(null)
      setNeedsTechnicalVisit(false)
    }
  }, [serviceRequestCategoryModes, selectedCategory])

  const onFiles = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []).slice(
        0,
        MAX_SERVICE_REQUEST_PHOTOS - photos.length,
      )
      if (files.length === 0) return
      const readers = files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(String(r.result || ''))
            r.onerror = () => reject(new Error('read'))
            r.readAsDataURL(file)
          }),
      )
      void Promise.all(readers).then((urls) => {
        setPhotos((prev) => [...prev, ...urls].slice(0, MAX_SERVICE_REQUEST_PHOTOS))
        setErrors((x) => (x.photos ? { ...x, photos: null } : x))
      })
      e.target.value = ''
    },
    [photos.length],
  )

  const removePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const selectCategory = (id) => {
    if (!isServiceCategoryActiveForCommunity(serviceRequestCategoryModes, id)) return
    setSelectedCategory(id)
    setServiceSubtype(null)
    setNeedsTechnicalVisit(false)
    if (errors.category) setErrors((x) => ({ ...x, category: null }))
    if (errors.serviceSubtype) setErrors((x) => ({ ...x, serviceSubtype: null }))
  }

  const validate = () => {
    const next = {}
    if (!selectedCategory) next.category = 'Elige un tipo de servicio.'
    else if (!isServiceCategoryActiveForCommunity(serviceRequestCategoryModes, selectedCategory)) {
      next.category = 'Este tipo de servicio no está disponible en tu comunidad.'
    }
    if (SERVICE_CATEGORIES_WITH_SUBTYPE.includes(selectedCategory) && !serviceSubtype) {
      next.serviceSubtype = serviceSubtypePickErrorEs(selectedCategory)
    }
    if (photos.length < MIN_SERVICE_REQUEST_PHOTOS) {
      next.photos = PHOTO_REQUIRED_ERROR_ES
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate() || submitting || !accessToken || !communityId) return
    setSubmitting(true)
    setErrors({})
    try {
      const body = {
        communityId,
        categoryId: selectedCategory,
        description: description.trim(),
        photos,
      }
      if (preferredDate.trim()) body.preferredDate = preferredDate.trim()
      if (SERVICE_CATEGORIES_WITH_SUBTYPE.includes(selectedCategory) && serviceSubtype) {
        body.serviceSubtype = serviceSubtype
      }
      if (selectedCategory === 'renovation') {
        body.needsTechnicalVisit = needsTechnicalVisit
      }
      const res = await fetch(apiUrl('/api/services'), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors({ form: data.error || 'No se pudo enviar' })
        setSubmitting(false)
        return
      }
      navigate(`/services/${data.id}`, { replace: true })
    } catch {
      setErrors({ form: 'Error de red' })
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!serviceRequestCategoryModes || !selectedCategory || !serviceSubtype) return
    if (!SERVICE_CATEGORIES_WITH_SUBTYPE.includes(selectedCategory)) return
    const allowed =
      selectedCategory === 'cleaning'
        ? CLEANING_SUBTYPES.some((s) => s.id === serviceSubtype)
        : selectedCategory === 'plumber'
          ? PLUMBER_SUBTYPES.some((s) => s.id === serviceSubtype)
          : RENOVATION_SUBTYPES.some((s) => s.id === serviceSubtype)
    if (!allowed) setServiceSubtype(null)
  }, [serviceRequestCategoryModes, selectedCategory, serviceSubtype])

  return (
    <div className="page-container services-page sr-new-page">
      <div className="sr-new-toolbar">
        <Link to="/services" className="sr-back-link">
          ← Volver
        </Link>
      </div>
      <header className="page-header">
        <h1 className="page-title">Solicitar servicio</h1>
        <p className="page-subtitle">
          No es una reserva: es una solicitud de presupuesto. Te enviaremos un precio orientativo.
        </p>
      </header>

      <section className="categories-section">
        <h2 className="section-label">1. ¿Qué necesitas?</h2>
        {communityId && !appNavFlagsReady ? (
          <p className="sr-muted">Cargando opciones…</p>
        ) : (
          <div className="category-grid">
            {SERVICE_CATEGORIES.map(({ id, name, icon }) => {
              const available = isServiceCategoryActiveForCommunity(serviceRequestCategoryModes, id)
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!available}
                  className={`category-card card ${selectedCategory === id ? 'category-card--selected' : ''}${!available ? ' category-card--soon' : ''}`}
                  onClick={() => selectCategory(id)}
                  aria-pressed={selectedCategory === id}
                  aria-disabled={!available}
                >
                  <span className="category-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="category-name">{name}</span>
                  {!available ? (
                    <span className="category-card-badge-soon">Pronto</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
        {errors.category ? (
          <p className="form-error" role="alert">
            {errors.category}
          </p>
        ) : null}

        {selectedCategory === 'cleaning' ? (
          <div className="sr-cleaning-block">
            <p className="sr-cleaning-notice">{CLEANING_DISCLAIMER_ES}</p>
            <h2 className="section-label">2. Tipo de limpieza</h2>
            <div className="sr-subtype-grid" role="group" aria-label="Tipo de limpieza">
              {CLEANING_SUBTYPES.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  className={`sr-subtype-btn ${serviceSubtype === id ? 'sr-subtype-btn--on' : ''}`}
                  onClick={() => {
                    setServiceSubtype(id)
                    if (errors.serviceSubtype) setErrors((x) => ({ ...x, serviceSubtype: null }))
                  }}
                  aria-pressed={serviceSubtype === id}
                >
                  {name}
                </button>
              ))}
            </div>
            {errors.serviceSubtype ? (
              <p className="form-error" role="alert">
                {errors.serviceSubtype}
              </p>
            ) : null}
          </div>
        ) : null}

        {selectedCategory === 'plumber' ? (
          <div className="sr-cleaning-block">
            <h2 className="section-label">2. Tipo de trabajo (fontanería)</h2>
            <div className="sr-subtype-grid" role="group" aria-label="Tipo de fontanería">
              {PLUMBER_SUBTYPES.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  className={`sr-subtype-btn ${serviceSubtype === id ? 'sr-subtype-btn--on' : ''}`}
                  onClick={() => {
                    setServiceSubtype(id)
                    if (errors.serviceSubtype) setErrors((x) => ({ ...x, serviceSubtype: null }))
                  }}
                  aria-pressed={serviceSubtype === id}
                >
                  {name}
                </button>
              ))}
            </div>
            {errors.serviceSubtype ? (
              <p className="form-error" role="alert">
                {errors.serviceSubtype}
              </p>
            ) : null}
          </div>
        ) : null}

        {selectedCategory === 'renovation' ? (
          <div className="sr-cleaning-block">
            <h2 className="section-label">2. Tipo de reforma</h2>
            <div className="sr-subtype-grid" role="group" aria-label="Tipo de reforma">
              {RENOVATION_SUBTYPES.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  className={`sr-subtype-btn ${serviceSubtype === id ? 'sr-subtype-btn--on' : ''}`}
                  onClick={() => {
                    setServiceSubtype(id)
                    if (errors.serviceSubtype) setErrors((x) => ({ ...x, serviceSubtype: null }))
                  }}
                  aria-pressed={serviceSubtype === id}
                >
                  {name}
                </button>
              ))}
            </div>
            {errors.serviceSubtype ? (
              <p className="form-error" role="alert">
                {errors.serviceSubtype}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <form onSubmit={submit} className="service-form card sr-new-form">
        {errors.form ? (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        ) : null}

        <h2 className="section-label sr-new-form__step">3. Detalles</h2>

        <div className="form-field">
          <label className="form-label" htmlFor="sr-desc">
            Descripción <span className="form-optional">(recomendada)</span>
          </label>
          <textarea
            id="sr-desc"
            className={`form-input form-textarea ${errors.description ? 'form-input--error' : ''}`}
            rows={5}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              if (errors.description) setErrors((x) => ({ ...x, description: null }))
            }}
            placeholder="Explica el trabajo, urgencia y cualquier detalle útil."
          />
          {errors.description ? (
            <p className="form-error" role="alert">
              {errors.description}
            </p>
          ) : null}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="sr-date">
            Fecha preferida (opcional)
          </label>
          <input
            id="sr-date"
            type="date"
            className="form-input"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
          />
        </div>

        {selectedCategory === 'renovation' ? (
          <div className="sr-renovation-visit">
            <label>
              <input
                type="checkbox"
                checked={needsTechnicalVisit}
                onChange={(e) => setNeedsTechnicalVisit(e.target.checked)}
              />
              <span>Necesita visita técnica</span>
            </label>
          </div>
        ) : null}

        <div className="form-field">
          <span className="form-label">
            4. Fotos del problema <span className="form-required">*</span>
          </span>
          <div className={`sr-upload-zone ${errors.photos ? 'sr-upload-zone--error' : ''}`}>
            <p className="sr-upload-zone__title">Añade fotos del problema</p>
            <p className="sr-upload-zone__hint">Esto nos ayuda a darte un precio más preciso.</p>
            <p className="sr-upload-zone__warn">👉 Sin foto no podemos darte presupuesto</p>
            <div className="sr-upload-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => galleryInputRef.current?.click()}
                disabled={photos.length >= MAX_SERVICE_REQUEST_PHOTOS}
              >
                Elegir de galería
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => cameraInputRef.current?.click()}
                disabled={photos.length >= MAX_SERVICE_REQUEST_PHOTOS}
              >
                Hacer foto
              </button>
            </div>
            <p className="sr-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Mínimo {MIN_SERVICE_REQUEST_PHOTOS}, máximo {MAX_SERVICE_REQUEST_PHOTOS} imágenes.
            </p>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-file-input"
              onChange={onFiles}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-file-input"
              onChange={onFiles}
            />
          </div>
          {errors.photos ? (
            <p className="form-error" role="alert">
              {errors.photos}
            </p>
          ) : null}
          {photos.length > 0 ? (
            <ul className="sr-photo-strip">
              {photos.map((url, i) => (
                <li key={i} className="sr-photo-tile">
                  <img src={url} alt="" />
                  <button
                    type="button"
                    className="sr-photo-remove"
                    onClick={() => removePhoto(i)}
                    aria-label="Quitar foto"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="submit"
          className={`btn btn--primary btn--block ${submitting ? 'btn--loading' : ''}`}
          disabled={submitting}
        >
          {submitting ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  )
}
