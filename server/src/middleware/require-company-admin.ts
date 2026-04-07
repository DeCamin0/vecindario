import type { RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from './require-auth.js'

/**
 * JWT + rol company_admin + empresa asignada en BD (no confiar solo en cid del token).
 */
export const requireCompanyAdmin: RequestHandler[] = [
  requireAuth,
  async (req, res, next) => {
    if (req.userRole !== 'company_admin') {
      res.status(403).json({ error: 'Solo administradores de empresa' })
      return
    }
    const user = await prisma.vecindarioUser.findUnique({
      where: { id: req.userId! },
      select: { companyAdminCompanyId: true },
    })
    const cid = user?.companyAdminCompanyId ?? null
    if (cid == null || cid < 1) {
      res.status(403).json({
        error: 'Empresa no asignada',
        message: 'Tu cuenta no tiene una empresa asignada. Contacta con el super administrador.',
      })
      return
    }
    if (req.companyAdminCompanyId != null && req.companyAdminCompanyId !== cid) {
      res.status(403).json({ error: 'Token inconsistente' })
      return
    }
    req.companyAdminCompanyId = cid
    next()
  },
]
