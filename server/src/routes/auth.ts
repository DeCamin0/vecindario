import { Router } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { signAccessToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/require-auth.js'
import { effectiveRoleForCommunity } from '../lib/president-by-unit.js'
import {
  parseOptionalBodyString,
  parsePuertaField,
} from '../lib/resident-dwelling-fields.js'
import { communityOperationalWhere, isCommunityOperationalStatus } from '../lib/community-status.js'

export const authRouter = Router()

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

/** Login diagnostics: off in production unless DEBUG_VECINDARIO_LOGIN=1. Never logs password or accessCode value. */
function debugLogin(msg: string, data?: Record<string, unknown>) {
  const on =
    process.env.DEBUG_VECINDARIO_LOGIN === '1' || process.env.NODE_ENV !== 'production'
  if (!on) return
  if (data && Object.keys(data).length > 0) {
    console.log(`[vecindario-auth/login] ${msg}`, data)
  } else {
    console.log(`[vecindario-auth/login] ${msg}`)
  }
}

function userJsonOut(u: {
  id: number
  email: string | null
  name: string | null
  role: string
  piso: string | null
  portal: string | null
  puerta?: string | null
  phone?: string | null
  habitaciones?: string | null
  plazaGaraje?: string | null
  poolAccessOwner?: string | null
  poolAccessGuest?: string | null
}) {
  const p = u.piso?.trim()
  const po = u.portal?.trim()
  const pt = u.puerta?.trim()
  const em = u.email?.trim()
  const ph = u.phone?.trim()
  const hab = u.habitaciones?.trim()
  const pg = u.plazaGaraje?.trim()
  const poolO = u.poolAccessOwner?.trim()
  const poolG = u.poolAccessGuest?.trim()
  return {
    id: u.id,
    ...(em ? { email: em } : {}),
    name: u.name?.trim() || (em ? em.split('@')[0] : 'Vecino'),
    role: u.role,
    ...(p ? { piso: p } : {}),
    ...(po ? { portal: po } : {}),
    ...(pt ? { puerta: pt } : {}),
    ...(ph ? { phone: ph } : {}),
    ...(hab ? { habitaciones: hab } : {}),
    ...(pg ? { plazaGaraje: pg } : {}),
    ...(poolO ? { poolAccessOwner: poolO } : {}),
    ...(poolG ? { poolAccessGuest: poolG } : {}),
  }
}

/**
 * Login unificado (vecino/presidente/admin/conserje/super admin).
 * Vecinos sin correo: accessCode (VEC) + portal + piso + password.
 * Conserje: email + password + VEC. Administrador: email + password (sin VEC; siempre por communityAdminEmail).
 * Presidente: email + password; sin VEC se elige comunidad por presidentEmail (igual criterio que administrador).
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

  const loginBody =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : null
  const hasPuertaInLogin =
    loginBody != null && Object.prototype.hasOwnProperty.call(loginBody, 'puerta')
  const puertaBody = parsePuertaField(req.body?.puerta)

  const residentKeyLogin = !email && Boolean(accessCode) && pisoBody && portalBody && password

  const bodyKeys =
    loginBody && typeof loginBody === 'object'
      ? Object.keys(loginBody as Record<string, unknown>).sort()
      : []
  debugLogin('POST /login', {
    residentKeyLogin,
    hasEmail: Boolean(email),
    hasPassword: Boolean(password),
    accessCodeInBody: Boolean(accessCode),
    bodyKeys,
  })

  if (residentKeyLogin) {
    const comm = await prisma.community.findFirst({
      where: { accessCode, ...communityOperationalWhere() },
      select: { id: true, name: true, presidentPortal: true, presidentPiso: true },
    })
    if (!comm) {
      debugLogin('reject resident_key: comunidad no encontrada o inactive')
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
        puerta: puertaBody,
      },
    })
    if (!user) {
      debugLogin('reject resident_key: 401 usuario no encontrado', { communityId: comm.id })
      res.status(401).json({ error: 'Credenciales incorrectas' })
      return
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      debugLogin('reject resident_key: 401 contraseña incorrecta', { userId: user.id })
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
      puerta: user.puerta?.trim() || null,
      phone: user.phone?.trim() || null,
      habitaciones: user.habitaciones?.trim() || null,
      plazaGaraje: user.plazaGaraje?.trim() || null,
      poolAccessOwner: user.poolAccessOwner?.trim() || null,
      poolAccessGuest: user.poolAccessGuest?.trim() || null,
    }
    const accessToken = signAccessToken({
      sub: String(userOut.id),
      email: userOut.email || '',
      role: userOut.role,
    })
    debugLogin('200 resident_key', { userId: userOut.id, role: effRole, communityId: comm.id })
    res.json({
      accessToken,
      user: userJsonOut(userOut),
      community: { id: comm.id, name: comm.name, accessCode },
    })
    return
  }

  if (!email || !password) {
    debugLogin('reject: 400 datos incompletos (falta email o password)')
    res.status(400).json({
      error: 'Datos incompletos',
      message:
        'Indica correo y contraseña. Si eres vecino sin correo, usa código VEC, portal, piso y contraseña (sin email).',
    })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { email } })
  if (!user) {
    debugLogin('reject: 401 usuario no existe', { email })
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const pwOk = await bcrypt.compare(password, user.passwordHash)
  if (!pwOk) {
    debugLogin('reject: 401 contraseña incorrecta', { userId: user.id, email })
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  debugLogin('password ok', {
    userId: user.id,
    dbRole: user.role,
    accessCodeInBody: Boolean(accessCode),
  })

  let communityForClient: { id: number; name: string; accessCode: string } | undefined

  if (user.role === 'community_admin') {
    /* Nunca usar accessCode del body: evita VEC erróneo (clientes viejos, proxies) y errores «debes indicar VEC». */
    const candidates = await prisma.community.findMany({
      where: {
        ...communityOperationalWhere(),
        communityAdminEmail: { not: null },
      },
      select: {
        id: true,
        name: true,
        accessCode: true,
        communityAdminEmail: true,
      },
    })
    const em = normEmail(user.email)
    const matched = candidates.filter((c) => normEmail(c.communityAdminEmail) === em)
    if (matched.length === 0) {
      debugLogin('reject community_admin: 403 sin comunidades por communityAdminEmail', {
        userId: user.id,
        email,
      })
      res.status(403).json({
        error: 'Sin comunidades asignadas',
        message:
          'No hay comunidades activas donde figuras como administrador de comunidad con este correo. Comprueba que el email de administrador en la ficha de la comunidad coincide con tu cuenta.',
      })
      return
    }
    matched.sort((a, b) => a.id - b.id)
    const first = matched[0]!
    const ac = (first.accessCode ?? '').trim()
    communityForClient = {
      id: first.id,
      name: first.name,
      accessCode: ac,
    }
    debugLogin('branch community_admin: comunidad elegida (primera por id)', {
      userId: user.id,
      matchedCount: matched.length,
      communityId: first.id,
      accessCodeFromBodyIgnored: Boolean(accessCode),
    })
  } else if (user.role === 'president') {
    if (!accessCode) {
      const presCandidates = await prisma.community.findMany({
        where: {
          ...communityOperationalWhere(),
          presidentEmail: { not: null },
        },
        select: {
          id: true,
          name: true,
          accessCode: true,
          presidentEmail: true,
        },
      })
      const pem = normEmail(user.email)
      const presMatched = presCandidates.filter((c) => normEmail(c.presidentEmail) === pem)
      if (presMatched.length === 0) {
        debugLogin('reject president: 403 sin comunidades por presidentEmail', { userId: user.id, email })
        res.status(403).json({
          error: 'Sin comunidades asignadas',
          message:
            'No hay comunidades activas donde figuras como presidente con este correo. Si gestionas la comunidad como administrador de sistema, tu rol debe ser «community_admin» o el email de presidente en la ficha debe coincidir.',
        })
        return
      }
      presMatched.sort((a, b) => a.id - b.id)
      const presFirst = presMatched[0]!
      const presAc = (presFirst.accessCode ?? '').trim()
      communityForClient = {
        id: presFirst.id,
        name: presFirst.name,
        accessCode: presAc,
      }
      debugLogin('branch president: sin VEC en body, primera comunidad por presidentEmail', {
        userId: user.id,
        communityId: presFirst.id,
        presMatchedCount: presMatched.length,
      })
    } else {
      const comm = await prisma.community.findFirst({
        where: { accessCode },
        select: {
          id: true,
          name: true,
          status: true,
          accessCode: true,
          presidentEmail: true,
        },
      })

      if (!comm || !isCommunityOperationalStatus(comm.status)) {
        res.status(403).json({
          error: 'Código no válido',
          message: 'No hay una comunidad activa con ese código VEC.',
        })
        return
      }

      const presMail = normEmail(comm.presidentEmail)
      const presUserMail = normEmail(user.email)
      if (!presMail || !presUserMail || presMail !== presUserMail) {
        res.status(403).json({
          error: 'Código no autorizado',
          message:
            'Este código no corresponde a una comunidad donde figuras como presidente con este correo.',
        })
        return
      }

      communityForClient = {
        id: comm.id,
        name: comm.name,
        accessCode: (comm.accessCode ?? '').trim(),
      }
      debugLogin('branch president: con VEC en body', { userId: user.id, communityId: comm.id })
    }
  } else if (user.role === 'concierge') {
    if (!accessCode) {
      debugLogin(
        'reject concierge: 400 falta accessCode (el cliente envió solo email+password; rol en DB = concierge)',
        { userId: user.id, email },
      )
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
        accessCode: true,
        conciergeEmail: true,
      },
    })

    if (!comm || !isCommunityOperationalStatus(comm.status)) {
      res.status(403).json({
        error: 'Código no válido',
        message: 'No hay una comunidad activa con ese código VEC.',
      })
      return
    }

    const cMail = normEmail(comm.conciergeEmail)
    const conciergeUserMail = normEmail(user.email)
    if (!cMail || !conciergeUserMail || cMail !== conciergeUserMail) {
      res.status(403).json({
        error: 'Código no autorizado',
        message:
          'Este código no corresponde a una comunidad donde figuras como conserje con este correo.',
      })
      return
    }

    communityForClient = {
      id: comm.id,
      name: comm.name,
      accessCode: (comm.accessCode ?? '').trim(),
    }
    debugLogin('branch concierge: comunidad resuelta por VEC', { userId: user.id, communityId: comm.id })
  } else if (user.role === 'pool_staff') {
    if (!accessCode) {
      res.status(400).json({
        error: 'Falta el código de comunidad',
        message:
          'Como socorrista debes indicar el código VEC de la comunidad donde trabajas.',
      })
      return
    }

    const comm = await prisma.community.findFirst({
      where: { accessCode },
      select: {
        id: true,
        name: true,
        status: true,
        accessCode: true,
        poolStaffEmail: true,
      },
    })

    if (!comm || !isCommunityOperationalStatus(comm.status)) {
      res.status(403).json({
        error: 'Código no válido',
        message: 'No hay una comunidad activa con ese código VEC.',
      })
      return
    }

    const pMail = normEmail(comm.poolStaffEmail)
    const poolUserMail = normEmail(user.email)
    if (!pMail || !poolUserMail || pMail !== poolUserMail) {
      res.status(403).json({
        error: 'Código no autorizado',
        message:
          'Este código no corresponde a una comunidad donde figuras como socorrista con este correo (revisa el email en la ficha).',
      })
      return
    }

    if (user.communityId !== comm.id) {
      await prisma.vecindarioUser.update({
        where: { id: user.id },
        data: { communityId: comm.id },
      })
    }

    communityForClient = {
      id: comm.id,
      name: comm.name,
      accessCode: (comm.accessCode ?? '').trim(),
    }
    debugLogin('branch pool_staff: comunidad por VEC', { userId: user.id, communityId: comm.id })
  } else if (user.role === 'company_admin') {
    const cid = user.companyAdminCompanyId
    if (cid == null) {
      res.status(403).json({
        error: 'Empresa no asignada',
        message:
          'Tu cuenta de administrador de empresa no tiene una empresa asignada. Contacta con el super administrador.',
      })
      return
    }
    const co = await prisma.company.findUnique({
      where: { id: cid },
      select: { id: true, name: true },
    })
    if (!co) {
      res.status(403).json({
        error: 'Empresa no encontrada',
        message: 'La empresa vinculada a tu cuenta ya no existe.',
      })
      return
    }
    debugLogin('branch company_admin', { userId: user.id, companyId: co.id })
  } else {
    debugLogin('sin rama community_admin/president/concierge/company_admin; rol sigue en user', {
      userId: user.id,
      dbRole: user.role,
    })
  }

  type UserOut = {
    id: number
    email: string | null
    name: string | null
    role: string
    piso: string | null
    portal: string | null
    puerta: string | null
    phone: string | null
    habitaciones: string | null
    plazaGaraje: string | null
    poolAccessOwner: string | null
    poolAccessGuest: string | null
  }

  let userOut: UserOut = {
    id: user.id,
    email: user.email?.trim() || null,
    name: user.name,
    role: user.role,
    piso: user.piso?.trim() || null,
    portal: user.portal?.trim() || null,
    puerta: user.puerta?.trim() || null,
    phone: user.phone?.trim() || null,
    habitaciones: user.habitaciones?.trim() || null,
    plazaGaraje: user.plazaGaraje?.trim() || null,
    poolAccessOwner: user.poolAccessOwner?.trim() || null,
    poolAccessGuest: user.poolAccessGuest?.trim() || null,
  }

  const needsHomeFields = user.role === 'president' || user.role === 'resident'
  if (needsHomeFields) {
    if (pisoBody || portalBody || hasPuertaInLogin) {
      const updated = await prisma.vecindarioUser.update({
        where: { id: user.id },
        data: {
          ...(pisoBody ? { piso: pisoBody } : {}),
          ...(portalBody ? { portal: portalBody } : {}),
          ...(hasPuertaInLogin ? { puerta: parsePuertaField(loginBody!.puerta) } : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          piso: true,
          portal: true,
          puerta: true,
          phone: true,
          habitaciones: true,
          plazaGaraje: true,
          poolAccessOwner: true,
          poolAccessGuest: true,
        },
      })
      userOut = {
        id: updated.id,
        email: updated.email?.trim() || null,
        name: updated.name,
        role: updated.role,
        piso: updated.piso?.trim() || null,
        portal: updated.portal?.trim() || null,
        puerta: updated.puerta?.trim() || null,
        phone: updated.phone?.trim() || null,
        habitaciones: updated.habitaciones?.trim() || null,
        plazaGaraje: updated.plazaGaraje?.trim() || null,
        poolAccessOwner: updated.poolAccessOwner?.trim() || null,
        poolAccessGuest: updated.poolAccessGuest?.trim() || null,
      }
    }
    const pOk = Boolean((userOut.piso || '').trim())
    const poOk = Boolean((userOut.portal || '').trim())
    if (!pOk || !poOk) {
      debugLogin('reject: 400 faltan datos de vivienda (president/resident)', {
        userId: user.id,
        role: user.role,
        pOk,
        poOk,
      })
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
    companyId: user.companyAdminCompanyId,
  })

  debugLogin('200 email+password', {
    userId: userOut.id,
    effectiveRole: userOut.role,
    communityId: communityForClient?.id ?? null,
    communityInResponse: Boolean(communityForClient),
  })

  let companyForClient: { id: number; name: string } | undefined
  if (user.role === 'company_admin' && user.companyAdminCompanyId != null) {
    const co = await prisma.company.findUnique({
      where: { id: user.companyAdminCompanyId },
      select: { id: true, name: true },
    })
    if (co) companyForClient = co
  }

  res.json({
    accessToken,
    user: userJsonOut(userOut),
    ...(communityForClient ? { community: communityForClient } : {}),
    ...(companyForClient ? { company: companyForClient } : {}),
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
      puerta: true,
      phone: true,
      habitaciones: true,
      plazaGaraje: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
      communityId: true,
      companyAdminCompanyId: true,
      companyAdminCompany: {
        select: { id: true, name: true },
      },
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
  const base = userJsonOut({
    id: user.id,
    email: user.email?.trim() || null,
    name: user.name,
    role: effRole,
    piso: user.piso,
    portal: user.portal,
    puerta: user.puerta,
    phone: user.phone,
    habitaciones: user.habitaciones,
    plazaGaraje: user.plazaGaraje,
    poolAccessOwner: user.poolAccessOwner,
    poolAccessGuest: user.poolAccessGuest,
  })
  if (user.role === 'company_admin' && user.companyAdminCompany) {
    res.json({
      ...base,
      company: {
        id: user.companyAdminCompany.id,
        name: user.companyAdminCompany.name,
      },
    })
    return
  }
  res.json(base)
})

/**
 * Comunidades donde el usuario autenticado figura como administrador, conserje o presidente (email en ficha).
 * Sirve para cambiar de contexto en la app sin volver a iniciar sesión.
 */
authRouter.get('/my-managed-communities', requireAuth, async (req, res) => {
  const user = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { email: true, role: true },
  })
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const e = normEmail(user.email)
  if (
    !e ||
    (user.role !== 'community_admin' &&
      user.role !== 'concierge' &&
      user.role !== 'president' &&
      user.role !== 'pool_staff')
  ) {
    res.json({ communities: [] })
    return
  }

  const allActive = await prisma.community.findMany({
    where: communityOperationalWhere(),
    select: {
      id: true,
      name: true,
      accessCode: true,
      loginSlug: true,
      communityAdminEmail: true,
      conciergeEmail: true,
      presidentEmail: true,
      poolStaffEmail: true,
    },
  })

  const matched = allActive.filter((c) => {
    if (user.role === 'community_admin') return normEmail(c.communityAdminEmail) === e
    if (user.role === 'concierge') return normEmail(c.conciergeEmail) === e
    if (user.role === 'pool_staff') return normEmail(c.poolStaffEmail) === e
    return normEmail(c.presidentEmail) === e
  })

  res.json({
    communities: matched.map((c) => ({
      id: c.id,
      name: c.name,
      accessCode: c.accessCode?.trim() ?? '',
      loginSlug: c.loginSlug?.trim() || null,
    })),
  })
})

/** Presidente / vecino: vivienda, nombre y datos extra (texto). */
authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : null
  const has = (k: string) => body != null && Object.prototype.hasOwnProperty.call(body, k)

  if (
    !has('piso') &&
    !has('portal') &&
    !has('puerta') &&
    !has('phone') &&
    !has('habitaciones') &&
    !has('plazaGaraje') &&
    !has('poolAccessOwner') &&
    !has('poolAccessGuest') &&
    !has('name')
  ) {
    res.status(400).json({
      error: 'Nada que actualizar',
      message: 'Envía al menos un campo editable.',
    })
    return
  }

  const data: {
    piso?: string
    portal?: string
    puerta?: string | null
    phone?: string | null
    habitaciones?: string | null
    plazaGaraje?: string | null
    poolAccessOwner?: string | null
    poolAccessGuest?: string | null
    name?: string | null
  } = {}
  if (has('name')) {
    data.name = typeof body!.name === 'string' ? body!.name.trim().slice(0, 255) || null : null
  }
  if (has('piso')) {
    const t = typeof body!.piso === 'string' ? body!.piso.trim().slice(0, 64) : ''
    if (!t) {
      res.status(400).json({ error: 'piso vacío', message: 'El piso no puede estar vacío.' })
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
  if (has('puerta')) {
    data.puerta = parsePuertaField(body!.puerta)
  }
  const ph = parseOptionalBodyString(body!, 'phone', 40)
  if (ph !== undefined) data.phone = ph
  const hab = parseOptionalBodyString(body!, 'habitaciones', 64)
  if (hab !== undefined) data.habitaciones = hab
  const pg = parseOptionalBodyString(body!, 'plazaGaraje', 64)
  if (pg !== undefined) data.plazaGaraje = pg
  const po = parseOptionalBodyString(body!, 'poolAccessOwner', 64)
  if (po !== undefined) data.poolAccessOwner = po
  const pguest = parseOptionalBodyString(body!, 'poolAccessGuest', 64)
  if (pguest !== undefined) data.poolAccessGuest = pguest

  const existing = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: {
      role: true,
      communityId: true,
      piso: true,
      portal: true,
      puerta: true,
    },
  })
  if (!existing) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (existing.role !== 'president' && existing.role !== 'resident') {
    res.status(403).json({
      error: 'No aplicable',
      message: 'Solo presidente y vecinos pueden actualizar estos datos.',
    })
    return
  }

  const mergedPortal = (data.portal ?? existing.portal)?.trim() || ''
  const mergedPiso = (data.piso ?? existing.piso)?.trim() || ''
  const mergedPuerta = data.puerta !== undefined ? data.puerta : existing.puerta

  if (data.portal !== undefined || data.piso !== undefined || data.puerta !== undefined) {
    if (!mergedPortal || !mergedPiso) {
      res.status(400).json({
        error: 'Vivienda incompleta',
        message: 'Portal y piso deben quedar definidos.',
      })
      return
    }
    const puertaOk =
      mergedPuerta != null && String(mergedPuerta).trim().length > 0
    if (!puertaOk) {
      res.status(400).json({
        error: 'Vivienda incompleta',
        message:
          'La puerta (apartamento) es obligatoria junto con portal y piso.',
      })
      return
    }
    if (existing.role === 'resident' && existing.communityId != null) {
      const dup = await prisma.vecindarioUser.findFirst({
        where: {
          role: 'resident',
          communityId: existing.communityId,
          portal: mergedPortal,
          piso: mergedPiso,
          puerta: mergedPuerta,
          NOT: { id: req.userId! },
        },
        select: { id: true },
      })
      if (dup) {
        res.status(409).json({ error: 'Ya existe otro vecino con esa vivienda.' })
        return
      }
    }
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
      puerta: true,
      phone: true,
      habitaciones: true,
      plazaGaraje: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
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
      puerta: updated.puerta,
      phone: updated.phone,
      habitaciones: updated.habitaciones,
      plazaGaraje: updated.plazaGaraje,
      poolAccessOwner: updated.poolAccessOwner,
      poolAccessGuest: updated.poolAccessGuest,
    }),
  )
})
