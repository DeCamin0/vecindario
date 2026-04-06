import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Community } from '@prisma/client'
import { prisma } from './prisma.js'
import { isMailConfigured, sendMail } from './mail.js'
import {
  buildContactSummaryEmailContent,
  buildOfficialInviteEmailContent,
} from './vecindario-email-template.js'

export type OnboardingInvitation = {
  email: string
  role: 'president' | 'community_admin' | 'concierge'
  userCreated: boolean
  emailSent: boolean
  note?: string
}

export type CommunityOnboardingResult = {
  mailConfigured: boolean
  invitations: OnboardingInvitation[]
  /** Solo si hubo alta de usuario y no se pudo enviar correo (p. ej. sin SMTP o fallo SMTP). Para copiar desde el panel Super Admin. */
  devPasswords?: { email: string; password: string; role: string }[]
  contactSummarySent: boolean
  errors: string[]
}

/** Selección en el panel Super Admin para envío manual de correos de alta. */
export type OnboardingMailSelection = {
  invitePresident: boolean
  inviteAdmin: boolean
  inviteConcierge: boolean
  contactSummary: boolean
}

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

function generateTempPassword(): string {
  const a = crypto.randomBytes(18).toString('base64url')
  const b = crypto.randomBytes(6).toString('hex')
  return `${a.slice(0, 14)}${b}Aa`
}

function appLoginUrl(): string {
  const base = (process.env.APP_PUBLIC_URL || 'http://localhost:5173/vecindario').replace(/\/$/, '')
  return `${base}/login`
}

type InviteTask = {
  email: string
  role: 'president' | 'community_admin' | 'concierge'
  dualCaption: boolean
}

export function buildInviteTasks(
  presidentEmail: string | null,
  communityAdminEmail: string | null,
  conciergeEmail: string | null,
): InviteTask[] {
  const p = normEmail(presidentEmail)
  const a = normEmail(communityAdminEmail)
  const c = normEmail(conciergeEmail)
  if (p && a && p === a) {
    const out: InviteTask[] = [{ email: p, role: 'community_admin', dualCaption: true }]
    if (c && c !== p) out.push({ email: c, role: 'concierge', dualCaption: false })
    return out
  }
  const out: InviteTask[] = []
  if (p) out.push({ email: p, role: 'president', dualCaption: false })
  if (a) out.push({ email: a, role: 'community_admin', dualCaption: false })
  const seen = new Set(out.map((t) => t.email))
  if (c && !seen.has(c)) {
    out.push({ email: c, role: 'concierge', dualCaption: false })
  }
  return out
}

function filterTasksBySelection(tasks: InviteTask[], sel: OnboardingMailSelection): InviteTask[] {
  return tasks.filter((t) => {
    if (t.dualCaption) return sel.invitePresident || sel.inviteAdmin
    if (t.role === 'president') return sel.invitePresident
    if (t.role === 'community_admin') return sel.inviteAdmin
    if (t.role === 'concierge') return sel.inviteConcierge
    return false
  })
}

async function sendOfficialInviteEmail(params: {
  to: string
  communityName: string
  accessCode: string | null
  role: 'president' | 'community_admin' | 'concierge'
  dualCaption: boolean
  passwordPlain: string | null
  existingAccount: boolean
}): Promise<void> {
  const { to, communityName, accessCode, role, dualCaption, passwordPlain, existingAccount } =
    params
  const loginUrl = appLoginUrl()
  const roleLabelEs = dualCaption
    ? 'presidente y administrador de comunidad'
    : role === 'president'
      ? 'presidente'
      : role === 'concierge'
        ? 'conserje / portería'
        : 'administrador de comunidad'

  const { subject, html, text } = buildOfficialInviteEmailContent({
    toEmail: to,
    communityName,
    accessCode,
    loginUrl,
    roleLabelEs,
    passwordPlain,
    existingAccount,
  })

  await sendMail({
    to,
    subject,
    text,
    html,
  })
}

async function sendContactSummaryEmail(params: {
  to: string
  communityName: string
  accessCode: string | null
  nifCif: string | null
  invitedLines: string[]
}): Promise<void> {
  const { to, communityName, accessCode, nifCif, invitedLines } = params
  const { subject, html, text } = buildContactSummaryEmailContent({
    communityName,
    accessCode,
    nifCif,
    loginUrl: appLoginUrl(),
    invitedLines,
  })
  await sendMail({ to, subject, text, html })
}

function roleEsLine(t: InviteTask): string {
  return t.dualCaption
    ? 'presidente + administrador'
    : t.role === 'president'
      ? 'presidente'
      : t.role === 'concierge'
        ? 'conserje'
        : 'administrador'
}

type ProcessResult = {
  invitation: OnboardingInvitation
  devPassword?: { email: string; password: string; role: string }
}

/**
 * Crea usuario si no existe; opcionalmente envía correo de invitación.
 */
async function processOneInviteTask(
  community: Community,
  task: InviteTask,
  attemptSendEmail: boolean,
): Promise<ProcessResult> {
  const { email, role, dualCaption } = task
  let userCreated = false
  let emailSent = false
  let note: string | undefined
  let passwordPlain: string | null = null
  let existingAccount = false
  const mailConfigured = isMailConfigured()

  const existing = await prisma.vecindarioUser.findUnique({ where: { email } })

  if (!existing) {
    passwordPlain = generateTempPassword()
    const passwordHash = await bcrypt.hash(passwordPlain, 12)
    await prisma.vecindarioUser.create({
      data: {
        email,
        passwordHash,
        role,
        name: null,
      },
    })
    userCreated = true
  } else if (existing.role === 'super_admin') {
    existingAccount = true
    note = attemptSendEmail
      ? 'Email ya es super admin; no se creó cuenta nueva. Se envió solo código de comunidad.'
      : 'Email ya es super admin; no se creó cuenta nueva.'
  } else if (existing.role === 'resident') {
    existingAccount = true
    note =
      'Email ya registrado como vecino; no se cambió la contraseña. Revisa rol con soporte si debe ser presidente/admin/conserje.'
  } else if (existing.role === 'concierge' && role === 'concierge') {
    existingAccount = true
    note = 'Cuenta ya existente (conserje); misma contraseña que antes.'
  } else {
    existingAccount = true
    note = 'Cuenta ya existente (presidente/admin); misma contraseña que antes.'
  }

  let devPassword: ProcessResult['devPassword']

  if (attemptSendEmail && mailConfigured) {
    try {
      await sendOfficialInviteEmail({
        to: email,
        communityName: community.name,
        accessCode: community.accessCode,
        role,
        dualCaption,
        passwordPlain: userCreated ? passwordPlain : null,
        existingAccount,
      })
      emailSent = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      note = note ? `${note} (${msg})` : msg
      if (userCreated && passwordPlain) {
        devPassword = { email, password: passwordPlain, role }
      }
    }
  } else if (attemptSendEmail && !mailConfigured) {
    note = note ? `${note}; SMTP no configurado` : 'SMTP no configurado en el servidor'
    if (userCreated && passwordPlain) {
      devPassword = { email, password: passwordPlain, role }
    }
  } else if (!attemptSendEmail && userCreated && passwordPlain) {
    devPassword = { email, password: passwordPlain, role }
  }

  return {
    invitation: {
      email,
      role,
      userCreated,
      emailSent,
      note,
    },
    devPassword,
  }
}

export type RunCommunityOnboardingOptions = {
  /** Si false, solo crea cuentas y devuelve contraseñas provisionales; no envía correos. */
  sendEmails?: boolean
  /** Resumen al email de contacto (solo si sendEmails y no es el mismo correo que invitados). */
  sendContactSummary?: boolean
}

/**
 * Alta de comunidad: crea usuarios Vecindario si no existen.
 * Por defecto también envía correos; en alta nueva desde API suele usarse sendEmails: false.
 */
export async function runCommunityOnboarding(
  community: Community,
  options: RunCommunityOnboardingOptions = {},
): Promise<CommunityOnboardingResult> {
  const sendEmails = options.sendEmails !== false
  const sendContactSummary = options.sendContactSummary !== false && sendEmails
  const mailConfigured = isMailConfigured()
  const invitations: OnboardingInvitation[] = []
  const devPasswords: { email: string; password: string; role: string }[] = []
  const errors: string[] = []

  const tasks = buildInviteTasks(
    community.presidentEmail,
    community.communityAdminEmail,
    community.conciergeEmail,
  )
  const contactNorm = normEmail(community.contactEmail)
  const invitedNormEmails = new Set(tasks.map((t) => t.email))

  for (const task of tasks) {
    try {
      const { invitation, devPassword } = await processOneInviteTask(
        community,
        task,
        sendEmails,
      )
      invitations.push(invitation)
      if (devPassword) devPasswords.push(devPassword)
      if (sendEmails && !invitation.emailSent && mailConfigured && invitation.note && !devPassword) {
        errors.push(`Correo a ${task.email}: ${invitation.note}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Invitación ${task.email}: ${msg}`)
      invitations.push({
        email: task.email,
        role: task.role,
        userCreated: false,
        emailSent: false,
        note: msg,
      })
    }
  }

  let contactSummarySent = false
  if (sendContactSummary && mailConfigured && contactNorm) {
    const skipContact = invitedNormEmails.has(contactNorm)
    if (!skipContact) {
      try {
        const invitedLines = tasks.map((t) => {
          const inv = invitations.find((i) => i.email === t.email)
          const bits = [t.email, roleEsLine(t)]
          if (inv?.userCreated) bits.push('cuenta nueva')
          else if (inv?.note) bits.push(inv.note)
          return bits.join(' — ')
        })
        await sendContactSummaryEmail({
          to: (community.contactEmail || '').trim(),
          communityName: community.name,
          accessCode: community.accessCode,
          nifCif: community.nifCif,
          invitedLines,
        })
        contactSummarySent = true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`Correo resumen contacto: ${msg}`)
      }
    }
  }

  return {
    mailConfigured,
    invitations,
    devPasswords: devPasswords.length ? devPasswords : undefined,
    contactSummarySent,
    errors,
  }
}

/**
 * Envío manual desde Super Admin: correos de invitación a los destinatarios marcados y/o resumen a contacto.
 */
export async function sendCommunityOnboardingEmails(
  community: Community,
  selection: OnboardingMailSelection,
): Promise<CommunityOnboardingResult> {
  const mailConfigured = isMailConfigured()
  const invitations: OnboardingInvitation[] = []
  const devPasswords: { email: string; password: string; role: string }[] = []
  const errors: string[] = []

  const allTasks = buildInviteTasks(
    community.presidentEmail,
    community.communityAdminEmail,
    community.conciergeEmail,
  )
  const selectedTasks = filterTasksBySelection(allTasks, selection)

  for (const task of selectedTasks) {
    try {
      const { invitation, devPassword } = await processOneInviteTask(community, task, true)
      invitations.push(invitation)
      if (devPassword) devPasswords.push(devPassword)
      if (!invitation.emailSent) {
        if (!mailConfigured) {
          errors.push(`No se envió correo a ${task.email}: SMTP no configurado.`)
        } else if (invitation.note) {
          errors.push(`Correo a ${task.email}: ${invitation.note}`)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Invitación ${task.email}: ${msg}`)
      invitations.push({
        email: task.email,
        role: task.role,
        userCreated: false,
        emailSent: false,
        note: msg,
      })
    }
  }

  let contactSummarySent = false
  const contactNorm = normEmail(community.contactEmail)
  if (selection.contactSummary && mailConfigured && contactNorm) {
    try {
      const linesSource = allTasks.length ? allTasks : buildInviteTasks(
        community.presidentEmail,
        community.communityAdminEmail,
        community.conciergeEmail,
      )
      const invitedLines = linesSource.map((t) => {
        const inv = invitations.find((i) => i.email === t.email)
        const bits = [t.email, roleEsLine(t)]
        if (inv?.emailSent) bits.push('correo de acceso enviado en este envío')
        else if (inv?.userCreated) bits.push('cuenta nueva')
        else if (inv?.note) bits.push(inv.note)
        return bits.join(' — ')
      })
      await sendContactSummaryEmail({
        to: (community.contactEmail || '').trim(),
        communityName: community.name,
        accessCode: community.accessCode,
        nifCif: community.nifCif,
        invitedLines,
      })
      contactSummarySent = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Correo resumen contacto: ${msg}`)
    }
  } else if (selection.contactSummary && !mailConfigured) {
    errors.push('No se envió resumen al contacto: SMTP no configurado.')
  }

  return {
    mailConfigured,
    invitations,
    devPasswords: devPasswords.length ? devPasswords : undefined,
    contactSummarySent,
    errors,
  }
}
