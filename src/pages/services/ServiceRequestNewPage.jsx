import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import {
  SERVICE_CATEGORIES,
  CLEANING_SUBTYPES,
  CLEANING_DISCLAIMER_ES,
} from '../../constants/serviceRequests.js'
import '../Services.css'
import './serviceRequestsPages.css'

const MAX_PHOTOS = 4

export default function ServiceRequestNewPage() {
  const { accessToken, communityId } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [cleaningSubtype, setCleaningSubtype] = useState(null)
  const [description, setDescription] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const onFiles = useCallback((e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - photos.length)
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
      setPhotos((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS))
    })
    e.target.value = ''
  }, [photos.length])

  const removePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const selectCategory = (id) => {
    setSelectedCategory(id)
    if (id !== 'cleaning') setCleaningSubtype(null)
    if (errors.category) setErrors((x) => ({ ...x, category: null }))
    if (errors.cleaningSubtype) setErrors((x) => ({ ...x, cleaningSubtype: null }))
  }

  const validate = () => {
    const next = {}
    if (!selectedCategory) next.category = 'Elige un tipo de servicio.'
    if (selectedCategory === 'cleaning' && !cleaningSubtype) {
      next.cleaningSubtype = 'Elige un tipo de limpieza.'
    }
    if (!description.trim()) next.description = 'Describe lo que necesitas.'
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
      if (selectedCategory === 'cleaning' && cleaningSubtype) {
        body.serviceSubtype = cleaningSubtype
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
        <h2 className="section-label">¿Qué necesitas?</h2>
        <div className="category-grid">
          {SERVICE_CATEGORIES.map(({ id, name, icon }) => (
            <button
              key={id}
              type="button"
              className={`category-card card ${selectedCategory === id ? 'category-card--selected' : ''}`}
              onClick={() => selectCategory(id)}
              aria-pressed={selectedCategory === id}
            >
              <span className="category-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="category-name">{name}</span>
            </button>
          ))}
        </div>
        {errors.category ? (
          <p className="form-error" role="alert">
            {errors.category}
          </p>
        ) : null}

        {selectedCategory === 'cleaning' ? (
          <div className="sr-cleaning-block">
            <p className="sr-cleaning-notice">{CLEANING_DISCLAIMER_ES}</p>
            <h2 className="section-label">Tipo de limpieza</h2>
            <div className="sr-subtype-grid" role="group" aria-label="Tipo de limpieza">
              {CLEANING_SUBTYPES.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  className={`sr-subtype-btn ${cleaningSubtype === id ? 'sr-subtype-btn--on' : ''}`}
                  onClick={() => {
                    setCleaningSubtype(id)
                    if (errors.cleaningSubtype) setErrors((x) => ({ ...x, cleaningSubtype: null }))
                  }}
                  aria-pressed={cleaningSubtype === id}
                >
                  {name}
                </button>
              ))}
            </div>
            {errors.cleaningSubtype ? (
              <p className="form-error" role="alert">
                {errors.cleaningSubtype}
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

        <div className="form-field">
          <label className="form-label" htmlFor="sr-desc">
            Descripción <span className="form-required">*</span>
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

        <div className="form-field">
          <span className="form-label">Fotos (opcional, máx. {MAX_PHOTOS})</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-file-input"
            onChange={onFiles}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => fileRef.current?.click()}
            disabled={photos.length >= MAX_PHOTOS}
          >
            Añadir imágenes
          </button>
          {photos.length > 0 ? (
            <ul className="sr-photo-strip">
              {photos.map((url, i) => (
                <li key={i} className="sr-photo-tile">
                  <img src={url} alt="" />
                  <button type="button" className="sr-photo-remove" onClick={() => removePhoto(i)} aria-label="Quitar">
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
          {submitting ? 'Enviando…' : 'Solicitar servicio'}
        </button>
      </form>
    </div>
  )
}
