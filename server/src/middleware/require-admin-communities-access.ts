import type { RequestHandler } from 'express'
import { resolveAdminCommunityAccess } from '../lib/admin-community-access.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from './require-auth.js'

/**
 * Super admin global o administrador de empresa prestador de servicios (super admin acotado).
 */
export const requireAdminCommunitiesAccess: RequestHandler[] = [
  requireAuth,
  async (req, res, next) => {
    const access = await resolveAdminCommunityAccess(req.userId!, req.userRole ?? '')
    if (!access) {
      const user = await prisma.vecindarioUser.findUnique({
        where: { id: req.userId! },
        select: { role: true, companyAdminCompany: { select: { kind: true } } },
      })
      res.status(403).json({
        error: 'Forbidden',
        message:
          user?.role === 'company_admin' && user.companyAdminCompany?.kind === 'administracion'
            ? 'Las empresas de administración usan el panel de empresa (/company-admin), no el super administrador.'
            : 'Se requiere cuenta de super administrador o administrador de empresa prestador de servicios.',
        currentRole: user?.role ?? null,
      })
      return
    }
    req.adminCommunityAccess = access
    next()
  },
]
