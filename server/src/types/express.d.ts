import type { VecindarioRole } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      userId?: number
      userRole?: VecindarioRole
    }
  }
}

export {}
