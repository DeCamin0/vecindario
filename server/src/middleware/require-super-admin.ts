import type { RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from './require-auth.js'

export const requireSuperAdmin: RequestHandler[] = [
  requireAuth,
  async (req, res, next) => {
    const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
    if (!user || user.role !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden',
        message:
          'Se requiere cuenta de super administrador. Si entraste como presidente o administrador de comunidad, cierra sesión e inicia con el usuario global (semilla / .env).',
        currentRole: user?.role ?? null,
      })
      return
    }
    next()
  },
]
