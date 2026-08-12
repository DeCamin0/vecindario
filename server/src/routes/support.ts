/**
 * Soporte — rutas usuario autenticado (roles profesionales).
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/require-auth.js'
import { supportAreasCatalog } from '../lib/support-catalog.js'
import { canUseSupportSelfService } from '../lib/support-access.js'
import {
  SupportError,
  createSupportTicket,
  getMySupportTicket,
  listMySupportTickets,
  replyMySupportTicket,
} from '../lib/support-service.js'

export const supportRouter = Router()
supportRouter.use(requireAuth)
supportRouter.use((req, res, next) => {
  if (!canUseSupportSelfService(req.userRole)) {
    res.status(403).json({
      error: 'Soporte está disponible para personal y administración, no para vecinos.',
    })
    return
  }
  next()
})

supportRouter.get('/areas', (_req, res) => {
  res.json({ areas: supportAreasCatalog() })
})

supportRouter.get('/tickets', async (req, res) => {
  try {
    const items = await listMySupportTickets(req.userId!)
    res.json({ items })
  } catch (e) {
    console.error('[support list]', e)
    res.status(500).json({ error: 'Error al cargar tickets' })
  }
})

supportRouter.post('/tickets', async (req, res) => {
  try {
    const created = await createSupportTicket({
      userId: req.userId!,
      area: req.body?.area,
      subject: req.body?.subject,
      body: req.body?.body,
    })
    const detail = await getMySupportTicket(req.userId!, created.id)
    res.status(201).json(detail)
  } catch (e) {
    if (e instanceof SupportError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    console.error('[support create]', e)
    res.status(500).json({ error: 'Error al crear el ticket' })
  }
})

supportRouter.get('/tickets/:id', async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Id no válido' })
    return
  }
  try {
    const detail = await getMySupportTicket(req.userId!, id)
    res.json(detail)
  } catch (e) {
    if (e instanceof SupportError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    console.error('[support get]', e)
    res.status(500).json({ error: 'Error al cargar el ticket' })
  }
})

supportRouter.post('/tickets/:id/messages', async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Id no válido' })
    return
  }
  try {
    const detail = await replyMySupportTicket({
      userId: req.userId!,
      ticketId: id,
      body: req.body?.body,
    })
    res.json(detail)
  } catch (e) {
    if (e instanceof SupportError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    console.error('[support reply]', e)
    res.status(500).json({ error: 'Error al enviar el mensaje' })
  }
})
