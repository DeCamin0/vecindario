import type { VecindarioRole } from '@prisma/client'
import type { AdminCommunityAccess } from '../lib/admin-community-access.js'

declare global {
  namespace Express {
    interface Request {
      userId?: number
      userRole?: VecindarioRole
      /** Set when JWT incluye cid (company_admin). */
      companyAdminCompanyId?: number | null
      /** Acceso al panel /api/admin/communities (completo o prestador acotado). */
      adminCommunityAccess?: AdminCommunityAccess
    }
  }
}

export {}
