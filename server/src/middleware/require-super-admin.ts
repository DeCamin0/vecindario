import type { RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from './require-auth.js'

/** Solo rol global super_admin (no company_admin acotado). */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === 'super_admin'
}

export const requireSuperAdmin: RequestHandler[] = [
  requireAuth,
  async (req, res, next) => {
    const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
    if (!user || !isSuperAdminRole(user.role)) {
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
