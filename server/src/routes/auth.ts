import { Router } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { signAccessToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/require-auth.js'
import { effectiveRoleForCommunity } from '../lib/president-by-unit.js'

export const authRouter = Router()

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

function userJsonOut(u: {
  id: number
  email: string | null
  name: string | null
  role: string
  piso: string | null
  portal: string | null
}) {
  const p = u.piso?.trim()
  const po = u.portal?.trim()
  const em = u.email?.trim()
  return {
    id: u.id,
    ...(em ? { email: em } : {}),
    name: u.name?.trim() || (em ? em.split('@')[0] : 'Vecino'),
    role: u.role,
    ...(p ? { piso: p } : {}),
    ...(po ? { portal: po } : {}),
  }
}

/**
 * Login unificado (vecino/presidente/admin/conserje/super admin).
 * Vecinos sin correo: accessCode (VEC) + portal + piso + password.
 * Administrador y conserje: email + password + VEC (o slug que rellena el VEC en cliente).
 */
authRouter.post('/login', async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const accessCodeRaw = typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : ''
  const accessCode = accessCodeRaw ? accessCodeRaw.toUpperCase() : ''
  const email = normEmail(typeof req.body?.email === 'string' ? req.body.email : '')
  const pisoBody =
    typeof req.body?.piso === 'string' ? req.body.piso.trim().slice(0, 64) : ''
  const portalBody =
    typeof req.body?.portal === 'string' ? req.body.portal.trim().slice(0, 64) : ''

  const residentKeyLogin = !email && Boolean(accessCode) && pisoBody && portalBody && password

  if (residentKeyLogin) {
    const comm = await prisma.community.findFirst({
      where: { accessCode, status: { not: 'inactive' } },
      select: { id: true, name: true, presidentPortal: true, presidentPiso: true },
    })
    if (!comm) {
      res.status(403).json({
        error: 'Código no válido',
        message: 'No hay una comunidad activa con ese código VEC.',
      })
      return
    }
    const user = await prisma.vecindarioUser.findFirst({
      where: {
        role: 'resident',
        communityId: comm.id,
        piso: pisoBody,
        portal: portalBody,
      },
    })
    if (!user) {
      res.status(401).json({ error: 'Credenciales incorrectas' })
      return
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      res.status(401).json({ error: 'Credenciales incorrectas' })
      return
    }
    const effRole = effectiveRoleForCommunity(user, comm)
    const userOut = {
      id: user.id,
      email: user.email?.trim() || null,
      name: user.name,
      role: effRole,
      piso: user.piso?.trim() || null,
      portal: user.portal?.trim() || null,
    }
    const accessToken = signAccessToken({
      sub: String(userOut.id),
      email: userOut.email || '',
      role: userOut.role,
    })
    res.json({
      accessToken,
      user: userJsonOut(userOut),
      community: { id: comm.id, name: comm.name },
    })
    return
  }

  if (!email || !password) {
    res.status(400).json({
      error: 'Datos incompletos',
      message:
        'Indica correo y contraseña. Si eres vecino sin correo, usa código VEC, portal, piso y contraseña (sin email).',
    })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const pwOk = await bcrypt.compare(password, user.passwordHash)
  if (!pwOk) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  let communityForClient: { id: number; name: string } | undefined

  if (user.role === 'community_admin') {
    if (!accessCode) {
      res.status(400).json({
        error: 'Falta el código de comunidad',
        message:
          'Como administrador debes indicar el código VEC de la comunidad a la que accedes (puedes gestionar varias).',
      })
      return
    }

    const comm = await prisma.community.findFirst({
      where: { accessCode },
      select: {
        id: true,
        name: true,
        status: true,
        communityAdminEmail: true,
      },
    })

    if (!comm || comm.status === 'inactive') {
      res.status(403).json({
        error: 'Código no válido',
        message: 'No hay una comunidad activa con ese código VEC.',
      })
      return
    }

    const adminMail = normEmail(comm.communityAdminEmail)
    if (!adminMail || adminMail !== user.email) {
      res.status(403).json({
        error: 'Código no autorizado',
        message:
          'Este código no corresponde a una comunidad donde figuras como administrador con este correo.',
      })
      return
    }

    communityForClient = { id: comm.id, name: comm.name }
  } else if (user.role === 'president') {
    if (!accessCode) {
      res.status(400).json({
        error: 'Falta el código de comunidad',
        message:
          'Como presidente debes indicar el código VEC de tu comunidad (puedes figurar en varias como presidente).',
      })
      return
    }

    const comm = await prisma.community.findFirst({
      where: { accessCode },
      select: {
        id: true,
        name: true,
        status: true,
        presidentEmail: true,
      },
    })

    if (!comm || comm.status === 'inactive') {
      res.status(403).json({
        error: 'Código no válido',
        message: 'No hay una comunidad activa con ese código VEC.',
      })
      return
    }

    const presMail = normEmail(comm.presidentEmail)
    if (!presMail || presMail !== user.email) {
      res.status(403).json({
        error: 'Código no autorizado',
        message:
          'Este código no corresponde a una comunidad donde figuras como presidente con este correo.',
      })
      return
    }

    communityForClient = { id: comm.id, name: comm.name }
  } else if (user.role === 'concierge') {
    if (!accessCode) {
      res.status(400).json({
        error: 'Falta el código de comunidad',
        message:
          'Como conserje debes indicar el código VEC de la comunidad donde trabajas.',
      })
      return
    }

    const comm = await prisma.community.findFirst({
      where: { accessCode },
      select: {
        id: true,
        name: true,
        status: true,
        conciergeEmail: true,
      },
    })

    if (!comm || comm.status === 'inactive') {
      res.status(403).json({
        error: 'Código no válido',
        message: 'No hay una comunidad activa con ese código VEC.',
      })
      return
    }

    const cMail = normEmail(comm.conciergeEmail)
    if (!cMail || cMail !== user.email) {
      res.status(403).json({
        error: 'Código no autorizado',
        message:
          'Este código no corresponde a una comunidad donde figuras como conserje con este correo.',
      })
      return
    }

    communityForClient = { id: comm.id, name: comm.name }
  }

  type UserOut = {
    id: number
    email: string | null
    name: string | null
    role: string
    piso: string | null
    portal: string | null
  }

  let userOut: UserOut = {
    id: user.id,
    email: user.email?.trim() || null,
    name: user.name,
    role: user.role,
    piso: user.piso?.trim() || null,
    portal: user.portal?.trim() || null,
  }

  const needsHomeFields = user.role === 'president' || user.role === 'resident'
  if (needsHomeFields) {
    if (pisoBody || portalBody) {
      const updated = await prisma.vecindarioUser.update({
        where: { id: user.id },
        data: {
          ...(pisoBody ? { piso: pisoBody } : {}),
          ...(portalBody ? { portal: portalBody } : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          piso: true,
          portal: true,
        },
      })
      userOut = {
        id: updated.id,
        email: updated.email?.trim() || null,
        name: updated.name,
        role: updated.role,
        piso: updated.piso?.trim() || null,
        portal: updated.portal?.trim() || null,
      }
    }
    const pOk = Boolean((userOut.piso || '').trim())
    const poOk = Boolean((userOut.portal || '').trim())
    if (!pOk || !poOk) {
      res.status(400).json({
        error: 'Faltan datos de vivienda',
        message:
          !pOk && !poOk
            ? 'Indica piso o puerta y portal (acceso); son campos distintos.'
            : !pOk
              ? 'Indica piso o puerta del apartamento.'
              : 'Indica portal de acceso (ej. número de portal, P1…).',
      })
      return
    }
  }

  if (user.role === 'resident' && user.communityId != null) {
    const commRes = await prisma.community.findUnique({
      where: { id: user.communityId },
      select: { id: true, presidentPortal: true, presidentPiso: true },
    })
    userOut.role = effectiveRoleForCommunity(
      {
        role: 'resident',
        communityId: user.communityId,
        portal: userOut.portal,
        piso: userOut.piso,
      },
      commRes,
    )
  }

  const accessToken = signAccessToken({
    sub: String(userOut.id),
    email: userOut.email || '',
    role: userOut.role,
  })

  res.json({
    accessToken,
    user: userJsonOut(userOut),
    ...(communityForClient ? { community: communityForClient } : {}),
  })
})

authRouter.post('/super-admin/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña son obligatorios' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  if (user.role !== 'super_admin') {
    res.status(403).json({
      error: 'No es super administrador',
      message:
        'Este correo no es super administrador. Elige el rol que te corresponda (Vecino, Administrador, Conserje…) y usa la contraseña del correo de alta. Para super administrador, usa SUPER_ADMIN_PASSWORD en .env (sincroniza con: npm run seed en server).',
    })
    return
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const em = user.email?.trim() || ''
  const accessToken = signAccessToken({
    sub: String(user.id),
    email: em,
    role: user.role,
  })

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: em,
      name: user.name,
      role: user.role,
    },
  })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      piso: true,
      portal: true,
      communityId: true,
    },
  })
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  let effRole = user.role
  if (user.role === 'resident' && user.communityId != null) {
    const comm = await prisma.community.findUnique({
      where: { id: user.communityId },
      select: { id: true, presidentPortal: true, presidentPiso: true },
    })
    effRole = effectiveRoleForCommunity(user, comm)
  }
  res.json(
    userJsonOut({
      id: user.id,
      email: user.email?.trim() || null,
      name: user.name,
      role: effRole,
      piso: user.piso,
      portal: user.portal,
    }),
  )
})

/** Presidente / vecino: actualizar piso y/o portal (campos separados). */
authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : null
  const has = (k: string) => body != null && Object.prototype.hasOwnProperty.call(body, k)

  if (!has('piso') && !has('portal')) {
    res.status(400).json({
      error: 'Nada que actualizar',
      message: 'Envía al menos uno: piso o portal.',
    })
    return
  }

  const data: { piso?: string; portal?: string } = {}
  if (has('piso')) {
    const t = typeof body!.piso === 'string' ? body!.piso.trim().slice(0, 64) : ''
    if (!t) {
      res.status(400).json({ error: 'piso vacío', message: 'El piso/puerta no puede estar vacío.' })
      return
    }
    data.piso = t
  }
  if (has('portal')) {
    const t = typeof body!.portal === 'string' ? body!.portal.trim().slice(0, 64) : ''
    if (!t) {
      res.status(400).json({ error: 'portal vacío', message: 'El portal no puede estar vacío.' })
      return
    }
    data.portal = t
  }

  const existing = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { role: true },
  })
  if (!existing) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (existing.role !== 'president' && existing.role !== 'resident') {
    res.status(403).json({
      error: 'No aplicable',
      message: 'Solo presidente y vecinos guardan piso y portal en la cuenta.',
    })
    return
  }

  const updated = await prisma.vecindarioUser.update({
    where: { id: req.userId! },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      piso: true,
      portal: true,
      communityId: true,
    },
  })
  let effRole = updated.role
  if (updated.role === 'resident' && updated.communityId != null) {
    const comm = await prisma.community.findUnique({
      where: { id: updated.communityId },
      select: { id: true, presidentPortal: true, presidentPiso: true },
    })
    effRole = effectiveRoleForCommunity(updated, comm)
  }
  res.json(
    userJsonOut({
      id: updated.id,
      email: updated.email?.trim() || null,
      name: updated.name,
      role: effRole,
      piso: updated.piso,
      portal: updated.portal,
    }),
  )
})
