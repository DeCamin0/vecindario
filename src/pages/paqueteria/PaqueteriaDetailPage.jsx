import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import PaqueteriaBackLink from './PaqueteriaBackLink.jsx'
import {
  PAQUETERIA_STAFF_LIST_ROLES,
  canConfirmPaquetePickup,
} from './paqueteriaRoles.js'
import { isSpecialParcel } from './parcelDeliveryKind.js'
import './paqueteria.css'
import '../Admin.css'

export default function PaqueteriaDetailPage() {
  const { id } = useParams()
  const { accessToken, communityId, communityAccessCode, userRole } = useAuth()
  const [parcel, setParcel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickupBusy, setPickupBusy] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  const isStaff = PAQUETERIA_STAFF_LIST_ROLES.has(userRole)
  const isNeighbor = userRole === 'resident' || userRole === 'president'
  const canSign = Boolean(
    parcel && parcel.status === 'awaiting_pickup' && canConfirmPaquetePickup(userRole),
  )

  const load = useCallback(async () => {
    if (!accessToken || communityId == null || !id) {
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (isStaff && communityAccessCode?.trim()) {
        q.set('accessCode', communityAccessCode.trim().toUpperCase())
      }
      const res = await fetch(apiUrl(`/api/community/parcels/${id}?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setParcel(data.parcel || null)
    } catch (e) {
      setError(e.message || 'Error')
      setParcel(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, communityAccessCode, id, isStaff])

  useEffect(() => {
    void load()
  }, [load])

  const startDraw = (ev) => {
    const c = canvasRef.current
    if (!c) return
    drawing.current = true
    const ctx = c.getContext('2d')
    const r = c.getBoundingClientRect()
    const x = (ev.clientX ?? ev.touches?.[0]?.clientX) - r.left
    const y = (ev.clientY ?? ev.touches?.[0]?.clientY) - r.top
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const moveDraw = (ev) => {
    if (!drawing.current) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const r = c.getBoundingClientRect()
    const x = (ev.clientX ?? ev.touches?.[0]?.clientX) - r.left
    const y = (ev.clientY ?? ev.touches?.[0]?.clientY) - r.top
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => {
    drawing.current = false
  }

  const clearCanvas = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
  }

  const submitPickup = async () => {
    const c = canvasRef.current
    if (!c || !accessToken || communityId == null) return
    const dataUrl = c.toDataURL('image/png')
    if (dataUrl.length < 200) {
      setError('Firma demasiado corta.')
      return
    }
    setPickupBusy(true)
    setError('')
    try {
      const body = {
        communityId,
        signatureDataUrl: dataUrl,
      }
      if (communityAccessCode?.trim()) {
        body.accessCode = communityAccessCode.trim().toUpperCase()
      }
      const res = await fetch(apiUrl(`/api/community/parcels/${id}/pickup`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setParcel(data.parcel || null)
    } catch (e) {
      setError(e.message || 'Error')
    } finally {
      setPickupBusy(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header pq-page-header">
        <PaqueteriaBackLink />
        <h1 className="page-title">
          {parcel && isSpecialParcel(parcel) ? `Entrega especial #${id}` : `Paquete #${id}`}
        </h1>
        <p className="page-subtitle">
          {isNeighbor
            ? 'Consulta el estado de tu paquete. La firma de recogida la registra conserjería cuando pases a recogerlo.'
            : 'Detalle del paquete y registro de recogida con firma del vecino (entrega en conserjería).'}
        </p>
      </header>
      {loading ? <p>Cargando…</p> : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {parcel ? (
        <div className="card" style={{ padding: '1rem' }}>
          <p>
            <strong>Vivienda:</strong> {parcel.portal} / {parcel.piso} / {parcel.puerta}
          </p>
          {isSpecialParcel(parcel) ? (
            <p>
              <strong>Entrega:</strong> {parcel.itemDescription?.trim() || 'Entrega especial'}
            </p>
          ) : (
          <p>
            <strong>Bultos:</strong>{' '}
            {typeof parcel.packageCount === 'number' && parcel.packageCount > 0
              ? parcel.packageCount
              : 1}
          </p>
          )}
          <p>
            <strong>Estado:</strong> {parcel.status === 'picked_up' ? 'Recogido' : 'Pendiente de recogida'}
          </p>
          {parcel.createdByName?.trim() ? (
            <p>
              <strong>Recibido en conserjería por:</strong> {parcel.createdByName.trim()}
            </p>
          ) : null}
          {parcel.pickedUpByName?.trim() ? (
            <p>
              <strong>Entregado al vecino por:</strong> {parcel.pickedUpByName.trim()}
              {parcel.pickedUpAt
                ? ` (${new Date(parcel.pickedUpAt).toLocaleString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })})`
                : null}
            </p>
          ) : null}
          {Array.isArray(parcel.photos) && parcel.photos.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              {parcel.photos.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  style={{ maxWidth: 160, maxHeight: 160, objectFit: 'cover', borderRadius: 8 }}
                />
              ))}
            </div>
          ) : null}
          {parcel.signatureImage && parcel.status === 'picked_up' ? (
            <div style={{ marginTop: '1rem' }}>
              <p className="admin-label">Firma de recogida</p>
              <img
                src={parcel.signatureImage}
                alt="Firma"
                style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: 8 }}
              />
            </div>
          ) : null}
          {parcel.status === 'awaiting_pickup' && isNeighbor ? (
            <p className="pq-detail-hint" role="status">
              Pendiente de recogida: pasa por conserjería con tu documentación. El conserje confirmará la entrega y la
              firma desde su cuenta.
            </p>
          ) : null}
          {parcel.status === 'awaiting_pickup' && userRole === 'community_admin' ? (
            <p className="pq-detail-hint" role="status">
              Solo consulta: la recogida con firma la registra el conserje en conserjería.
            </p>
          ) : null}
          {canSign ? (
            <div style={{ marginTop: '1.5rem' }}>
              <p className="admin-label">Firma del vecino al entregar el paquete (ratón o dedo)</p>
              <canvas
                ref={canvasRef}
                width={320}
                height={160}
                style={{ border: '1px solid #cbd5e1', touchAction: 'none', borderRadius: 8, background: '#fff' }}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={(e) => {
                  e.preventDefault()
                  startDraw(e)
                }}
                onTouchMove={(e) => {
                  e.preventDefault()
                  moveDraw(e)
                }}
                onTouchEnd={endDraw}
              />
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn--ghost" onClick={clearCanvas}>
                  Limpiar firma
                </button>
                <button type="button" className="btn btn--primary" disabled={pickupBusy} onClick={() => void submitPickup()}>
                  {pickupBusy ? 'Guardando…' : 'Confirmar recogida con firma'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
