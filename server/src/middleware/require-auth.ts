import type { RequestHandler } from 'express'
import { verifyAccessToken } from '../lib/jwt.js'

export const requireAuth: RequestHandler = (req, res, next) => {
  const h = req.headers.authorization
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = verifyAccessToken(token)
    const id = Number(payload.sub)
    if (!Number.isInteger(id) || id < 1) {
      res.status(401).json({ error: 'Token inválido' })
      return
    }
    req.userId = id
    req.userRole = payload.role as import('@prisma/client').VecindarioRole
    const cidRaw = typeof payload.cid === 'string' ? payload.cid.trim() : ''
    const cidNum = cidRaw ? Number(cidRaw) : NaN
    req.companyAdminCompanyId =
      Number.isInteger(cidNum) && cidNum >= 1 ? cidNum : undefined
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}
