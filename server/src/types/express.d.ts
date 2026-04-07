import type { VecindarioRole } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      userId?: number
      userRole?: VecindarioRole
      /** Set when JWT incluye cid (company_admin). */
      companyAdminCompanyId?: number | null
    }
  }
}

export {}
