import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { isMailConfigured, sendMail } from '../lib/mail.js'
import { signAccessToken } from '../lib/jwt.js'
import { deleteAvatarFilesForUser } from '../lib/profile-avatar.js'
import { vecindarioLoginHint } from '../lib/public-app-url.js'

export const adminCompaniesRouter = Router()

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

function generateTemporaryPasswordPlain(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(16)
  let s = ''
  for (let i = 0; i < 14; i += 1) {
    s += alphabet[bytes[i]! % alphabet.length]
  }
  return s
}

adminCompaniesRouter.get('/', async (_req, res) => {
  const items = await prisma.company.findMany({
    orderBy: { id: 'asc' },
    include: {
      _count: { select: { communities: true, companyAdminUsers: true } },
      companyAdminUsers: {
        where: { role: 'company_admin' },
        select: { id: true, email: true, name: true },
        orderBy: { id: 'asc' },
      },
    },
  })
  res.json(
    items.map((c: (typeof items)[number]) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      communityCount: c._count.communities,
      companyAdminCount: c._count.companyAdminUsers,
      companyAdmins: c.companyAdminUsers.map((u) => ({
        id: u.id,
        email: u.email?.trim() || null,
        name: u.name?.trim() || null,
      })),
    })),
  )
})

adminCompaniesRouter.post('/', async (req, res) => {
  const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 255) : ''
  if (!nameRaw) {
    res.status(400).json({ error: 'El nombre de la empresa es obligatorio.' })
    return
  }
  const row = await prisma.company.create({
    data: { name: nameRaw },
  })
  res.status(201).json(row)
})

adminCompaniesRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 255) : ''
  if (!nameRaw) {
    res.status(400).json({ error: 'Indica un nombre válido.' })
    return
  }
  try {
    const row = await prisma.company.update({
      where: { id },
      data: { name: nameRaw },
    })
    res.json(row)
  } catch {
    res.status(404).json({ error: 'Empresa no encontrada' })
  }
})

/** Usuarios company_admin de una empresa. */
adminCompaniesRouter.get('/:id/admins', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const company = await prisma.company.findUnique({ where: { id } })
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  const users = await prisma.vecindarioUser.findMany({
    where: { companyAdminCompanyId: id, role: 'company_admin' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
    orderBy: { id: 'asc' },
  })
  res.json({ company: { id: company.id, name: company.name }, admins: users })
})

/**
 * Crear administrador de empresa (email único, contraseña opcional → temporal en claro en respuesta).
 */
adminCompaniesRouter.post('/:id/admins', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const company = await prisma.company.findUnique({ where: { id } })
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  const email = normEmail(typeof req.body?.email === 'string' ? req.body.email : '')
  if (!email) {
    res.status(400).json({ error: 'Email obligatorio y válido.' })
    return
  }
  const nameRaw =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim().slice(0, 255)
      : null
  const existing = await prisma.vecindarioUser.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      name: true,
      companyAdminCompanyId: true,
    },
  })
  if (existing) {
    if (existing.role === 'company_admin') {
      if (existing.companyAdminCompanyId === id) {
        res.status(409).json({ error: 'Este usuario ya es administrador de esta empresa.' })
        return
      }
      res.status(409).json({
        error: 'Ya existe un usuario con ese email como administrador de otra empresa.',
      })
      return
    }
    if (existing.role === 'community_admin') {
      const companyCommunities = await prisma.community.findMany({
        where: { companyId: id, communityAdminEmail: { not: null } },
        select: { id: true, communityAdminEmail: true },
      })
      const linked = companyCommunities.some(
        (c) => normEmail(c.communityAdminEmail) === email,
      )
      if (!linked) {
        res.status(409).json({
          error: 'Ya existe un usuario con ese email.',
          message:
            'Ese correo ya tiene cuenta de administrador de comunidad, pero no figura en la ficha de ninguna comunidad de esta empresa. Quita el administrador de la ficha o asigna la empresa a la comunidad.',
        })
        return
      }
      let plain =
        typeof req.body?.password === 'string' && req.body.password.length >= 8
          ? req.body.password
          : ''
      let generated = false
      if (!plain) {
        plain = generateTemporaryPasswordPlain()
        generated = true
      }
      const passwordHash = await bcrypt.hash(plain, 12)
      const user = await prisma.vecindarioUser.update({
        where: { id: existing.id },
        data: {
          role: 'company_admin',
          companyAdminCompanyId: id,
          communityId: null,
          passwordHash,
          ...(nameRaw ? { name: nameRaw } : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          companyAdminCompanyId: true,
          createdAt: true,
        },
      })
      for (const c of companyCommunities) {
        if (normEmail(c.communityAdminEmail) !== email) continue
        await prisma.community.update({
          where: { id: c.id },
          data: { communityAdminEmail: null, communityAdminName: null },
        })
      }
      res.status(201).json({
        user,
        promoted: true,
        ...(generated ? { temporaryPassword: plain } : {}),
      })
      return
    }
    res.status(409).json({ error: 'Ya existe un usuario con ese email.' })
    return
  }
  let plain =
    typeof req.body?.password === 'string' && req.body.password.length >= 8
      ? req.body.password
      : ''
  let generated = false
  if (!plain) {
    plain = generateTemporaryPasswordPlain()
    generated = true
  }
  const passwordHash = await bcrypt.hash(plain, 12)
  const user = await prisma.vecindarioUser.create({
    data: {
      email,
      passwordHash,
      name: nameRaw,
      role: 'company_admin',
      companyAdminCompanyId: id,
      communityId: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyAdminCompanyId: true,
      createdAt: true,
    },
  })
  res.status(201).json({
    user,
    ...(generated ? { temporaryPassword: plain } : {}),
  })
})

function publicLoginHint(): string {
  return vecindarioLoginHint()
}

/**
 * Sesión JWT del administrador de empresa (solo super admin, misma empresa).
 */
adminCompaniesRouter.post('/:companyId/admins/:userId/impersonate', async (req, res) => {
  const companyId = Number(req.params.companyId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(companyId) || companyId < 1 || !Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ error: 'Parámetros inválidos' })
    return
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  })
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  const target = await prisma.vecindarioUser.findFirst({
    where: {
      id: userId,
      role: 'company_admin',
      companyAdminCompanyId: companyId,
    },
  })
  if (!target) {
    res.status(404).json({ error: 'Administrador de empresa no encontrado en esta empresa' })
    return
  }
  const accessToken = signAccessToken({
    sub: String(target.id),
    email: target.email || '',
    role: target.role,
    companyId,
  })
  const em = target.email?.trim()
  res.json({
    accessToken,
    user: {
      id: target.id,
      ...(em ? { email: em } : {}),
      name: target.name?.trim() || (em ? em.split('@')[0] : 'Administrador'),
      role: target.role,
    },
    company: { id: company.id, name: company.name },
  })
})

/**
 * Eliminar cuenta de administrador de empresa (solo super admin).
 */
adminCompaniesRouter.delete('/:companyId/admins/:userId', async (req, res) => {
  const companyId = Number(req.params.companyId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(companyId) || companyId < 1 || !Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ error: 'Parámetros inválidos' })
    return
  }
  const actorId = req.userId!
  if (userId === actorId) {
    res.status(400).json({ error: 'No puedes eliminar tu propia cuenta desde el panel.' })
    return
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  })
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  const target = await prisma.vecindarioUser.findFirst({
    where: {
      id: userId,
      role: 'company_admin',
      companyAdminCompanyId: companyId,
    },
    select: { id: true, email: true, name: true },
  })
  if (!target) {
    res.status(404).json({ error: 'Administrador de empresa no encontrado en esta empresa' })
    return
  }

  const parcelLinks = await prisma.communityConciergeParcel.count({
    where: {
      OR: [
        { recipientUserId: userId },
        { createdByUserId: userId },
        { pickedUpByUserId: userId },
      ],
    },
  })
  if (parcelLinks > 0) {
    res.status(409).json({
      error: 'Paquetería vinculada',
      message:
        'Hay registros de paquetería asociados a esta cuenta. Resuélvelos o reasígnalos antes de borrarla.',
    })
    return
  }

  const diarioCount = await prisma.communityDiarioEntry.count({
    where: { createdByUserId: userId },
  })
  if (diarioCount > 0) {
    res.status(409).json({
      error: 'Cuaderno diario vinculado',
      message:
        'Esta cuenta tiene entradas en el cuaderno diario. Reasígnalas o elimínalas antes de borrar el usuario.',
    })
    return
  }

  const emailNorm = normEmail(target.email)
  let clearedFicha = false

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityIncidentComment.deleteMany({ where: { authorUserId: userId } })
      await tx.communityIncident.deleteMany({ where: { reporterUserId: userId } })
      await tx.communityServiceRequestMessage.deleteMany({ where: { authorUserId: userId } })
      await tx.communityServiceRequest.deleteMany({ where: { requesterUserId: userId } })

      if (emailNorm) {
        const comms = await tx.community.findMany({
          where: { companyId, communityAdminEmail: { not: null } },
          select: { id: true, communityAdminEmail: true },
        })
        for (const c of comms) {
          if (normEmail(c.communityAdminEmail) !== emailNorm) continue
          await tx.community.update({
            where: { id: c.id },
            data: { communityAdminEmail: null, communityAdminName: null },
          })
          clearedFicha = true
        }
      }

      await tx.vecindarioUser.delete({ where: { id: userId } })
    })
    try {
      await deleteAvatarFilesForUser(userId)
    } catch {
      /* optional */
    }
    res.json({
      ok: true,
      clearedFicha,
      message: clearedFicha
        ? 'Cuenta eliminada. Si figuraba como administrador en alguna ficha de comunidad de la empresa, el correo se quitó.'
        : 'Cuenta de administrador de empresa eliminada.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({
      error: 'No se pudo eliminar la cuenta',
      message: msg,
    })
  }
})

/**
 * Nueva contraseña temporal para un company_admin de la empresa (solo super admin).
 * La anterior deja de valer. No se puede «ver» el hash guardado.
 */
adminCompaniesRouter.post('/:companyId/admins/:userId/reset-password', async (req, res) => {
  const companyId = Number(req.params.companyId)
  const userId = Number(req.params.userId)
  if (!Number.isInteger(companyId) || companyId < 1 || !Number.isInteger(userId) || userId < 1) {
    res.status(400).json({ error: 'Parámetros inválidos' })
    return
  }
  const sendEmail = Boolean(req.body?.sendEmail)
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  const user = await prisma.vecindarioUser.findFirst({
    where: {
      id: userId,
      role: 'company_admin',
      companyAdminCompanyId: companyId,
    },
    select: { id: true, email: true, name: true },
  })
  if (!user || !user.email) {
    res.status(404).json({ error: 'Administrador de empresa no encontrado en esta empresa' })
    return
  }
  const plain = generateTemporaryPasswordPlain()
  const passwordHash = await bcrypt.hash(plain, 12)
  const { capturePasswordPlainSnapshot } = await import('../lib/password-plain-snapshot.js')
  await prisma.vecindarioUser.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordPlainSnapshot: capturePasswordPlainSnapshot(plain),
    },
  })
  const emailTo = user.email.trim()
  const loginHint = publicLoginHint()

  if (sendEmail) {
    if (!isMailConfigured()) {
      res.status(503).json({
        error: 'SMTP no configurado',
        message:
          'Configura SMTP_HOST y SMTP_FROM en el servidor para enviar correo, o usa «Ver contraseña» para copiarla desde el panel.',
      })
      return
    }
    const subject = `Vecindario — nueva contraseña (administrador de empresa · ${company.name})`
    const text = `Hola,

Se ha generado una nueva contraseña temporal para tu acceso como administrador de empresa en Vecindario.

Empresa: ${company.name}
Correo de acceso: ${emailTo}
Contraseña temporal: ${plain}

Entra en ${loginHint} y usa «Acceso administrador de empresa» con este correo y la contraseña. Te recomendamos cambiarla después si la plataforma lo permite.

Si no has solicitado este cambio, contacta con el super administrador.

— Vecindario`
    const html = `<p>Hola,</p>
<p>Se ha generado una <strong>nueva contraseña temporal</strong> para tu acceso como <strong>administrador de empresa</strong> en Vecindario.</p>
<ul>
<li><strong>Empresa:</strong> ${escapeHtml(company.name)}</li>
<li><strong>Correo de acceso:</strong> ${escapeHtml(emailTo)}</li>
<li><strong>Contraseña temporal:</strong> <code style="font-size:1.1em">${escapeHtml(plain)}</code></li>
</ul>
<p>Entra en <strong>${escapeHtml(loginHint)}</strong> y usa <strong>«Acceso administrador de empresa»</strong> con este correo y la contraseña.</p>
<p style="color:#64748b;font-size:0.9em">Si no has solicitado este cambio, contacta con el super administrador.</p>
<p>— Vecindario</p>`
    try {
      await sendMail({ to: emailTo, subject, text, html })
    } catch (e) {
      console.error('[company-admin reset-password email]', e)
      res.status(500).json({
        error: 'No se pudo enviar el correo',
        message: e instanceof Error ? e.message : String(e),
      })
      return
    }
    res.json({
      ok: true,
      emailSent: true,
      email: emailTo,
      message: 'Correo enviado con la nueva contraseña temporal.',
    })
    return
  }

  res.json({
    temporaryPassword: plain,
    email: emailTo,
    message:
      'Nueva contraseña temporal (cópiala ahora; la anterior deja de valer). No es posible mostrar la contraseña antigua.',
  })
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
