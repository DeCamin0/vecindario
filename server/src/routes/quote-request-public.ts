import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'

function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function optStr(v: unknown, max: number): string | null {
  const t = str(v, max)
  return t || null
}

function parseBool(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true
    if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false
  }
  return def
}

/** POST /api/public/quote-request — sin autenticación (formulario marketing). */
export async function handlePublicQuoteRequestPost(req: Request, res: Response): Promise<void> {
  const contactName = str(req.body?.contactName, 255)
  const contactEmail = str(req.body?.contactEmail, 255).toLowerCase()
  const contactPhone = optStr(req.body?.contactPhone, 64)
  const communityName = str(req.body?.communityName, 255)
  const communityAddress = optStr(req.body?.communityAddress, 512)
  const dwellingApprox = optStr(req.body?.dwellingApprox, 64)
  const message = optStr(req.body?.message, 8000)

  if (!contactName || !contactEmail || !communityName) {
    res.status(400).json({
      error: 'Datos incompletos',
      message: 'Indica nombre, email y nombre de la comunidad.',
    })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    res.status(400).json({ error: 'Email no válido' })
    return
  }

  const wantServices = parseBool(req.body?.wantServices, true)
  const wantIncidents = parseBool(req.body?.wantIncidents, true)
  const wantBookings = parseBool(req.body?.wantBookings, true)
  const wantPoolAccess = parseBool(req.body?.wantPoolAccess, false)

  try {
    const row = await prisma.vecindarioQuoteRequest.create({
      data: {
        contactName,
        contactEmail,
        contactPhone,
        communityName,
        communityAddress,
        dwellingApprox,
        message,
        wantServices,
        wantIncidents,
        wantBookings,
        wantPoolAccess,
        status: 'new',
      },
      select: { id: true },
    })
    res.status(201).json({ ok: true, id: row.id })
  } catch (e) {
    console.error('[quote-request]', e)
    res.status(500).json({ error: 'No se pudo guardar la solicitud' })
  }
}
