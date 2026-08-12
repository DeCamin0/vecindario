/**
 * Soporte — inbox Super Admin.
 */
import { Router } from 'express'
import {
  SupportError,
  adminListSupportTickets,
  adminPatchSupportTicket,
  adminReplySupportTicket,
  adminUnreadSupportCount,
  getAdminSupportTicket,
} from '../lib/support-service.js'
import {
  supportAreasCatalog,
  supportPrioritiesCatalog,
  supportStatusesCatalog,
} from '../lib/support-catalog.js'

export const adminSupportRouter = Router()

adminSupportRouter.get('/meta', (_req, res) => {
  res.json({
    areas: supportAreasCatalog(),
    statuses: supportStatusesCatalog(),
    priorities: supportPrioritiesCatalog(),
  })
})

adminSupportRouter.get('/unread-count', async (_req, res) => {
  try {
    const count = await adminUnreadSupportCount()
    res.json({ count })
  } catch (e) {
    console.error('[admin support unread]', e)
    res.status(500).json({ error: 'Error al contar pendientes' })
  }
})

adminSupportRouter.get('/tickets', async (req, res) => {
  try {
    const unreadRaw = String(req.query.unreadOnly ?? '')
    const items = await adminListSupportTickets({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
      area: typeof req.query.area === 'string' ? req.query.area : undefined,
      communityId: typeof req.query.communityId === 'string' ? req.query.communityId : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      unreadOnly: unreadRaw === '1' || unreadRaw === 'true',
    })
    res.json({ items })
  } catch (e) {
    console.error('[admin support list]', e)
    res.status(500).json({ error: 'Error al cargar tickets' })
  }
})

adminSupportRouter.get('/tickets/:id', async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Id no válido' })
    return
  }
  try {
    const detail = await getAdminSupportTicket(id)
    res.json(detail)
  } catch (e) {
    if (e instanceof SupportError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    console.error('[admin support get]', e)
    res.status(500).json({ error: 'Error al cargar el ticket' })
  }
})

adminSupportRouter.post('/tickets/:id/messages', async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Id no válido' })
    return
  }
  try {
    const detail = await adminReplySupportTicket({
      staffUserId: req.userId!,
      ticketId: id,
      body: req.body?.body,
    })
    res.json(detail)
  } catch (e) {
    if (e instanceof SupportError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    console.error('[admin support reply]', e)
    res.status(500).json({ error: 'Error al enviar el mensaje' })
  }
})

adminSupportRouter.patch('/tickets/:id', async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Id no válido' })
    return
  }
  try {
    const detail = await adminPatchSupportTicket({
      ticketId: id,
      status: req.body?.status,
      priority: req.body?.priority,
    })
    res.json(detail)
  } catch (e) {
    if (e instanceof SupportError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    console.error('[admin support patch]', e)
    res.status(500).json({ error: 'Error al actualizar el ticket' })
  }
})
