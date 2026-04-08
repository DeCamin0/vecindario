import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const adminQuoteRequestsRouter = Router()

const ALLOWED_STATUS = new Set(['new', 'reviewed', 'contacted', 'closed'])

adminQuoteRequestsRouter.get('/', async (_req, res) => {
  try {
    const rows = await prisma.vecindarioQuoteRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    res.json(rows)
  } catch (e) {
    console.error('[admin quote-requests]', e)
    res.status(500).json({ error: 'Error al listar solicitudes' })
  }
})

adminQuoteRequestsRouter.patch('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10)
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'Id no válido' })
    return
  }
  const status = typeof req.body?.status === 'string' ? req.body.status.trim().slice(0, 32) : ''
  if (!ALLOWED_STATUS.has(status)) {
    res.status(400).json({
      error: 'Estado no válido',
      message: `Usa uno de: ${[...ALLOWED_STATUS].join(', ')}`,
    })
    return
  }
  try {
    const row = await prisma.vecindarioQuoteRequest.update({
      where: { id },
      data: { status },
    })
    res.json(row)
  } catch {
    res.status(404).json({ error: 'Solicitud no encontrada' })
  }
})
