import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Community } from '@prisma/client'
import { prisma } from './prisma.js'
import { isMailConfigured, sendMail } from './mail.js'
import {
  buildContactSummaryEmailContent,
  buildOfficialInviteEmailContent,
} from './vecindario-email-template.js'
import { capturePasswordPlainSnapshot } from './password-plain-snapshot.js'
import {
  conciergeNameForEmail,
  listConciergeEmails,
  type ConciergeEmailFields,
} from './concierge-emails.js'
import { communityManagedByCompany } from './community-user-access.js'
import { vecindarioLoginUrl } from './public-app-url.js'

function conciergeFieldsFromCommunity(community: {
  conciergeEmail: string | null
  conciergeEmail2?: string | null
  conciergeSubstituteEmail?: string | null
  conciergeSubstituteName?: string | null
  conciergeEmailsJson?: unknown
  conciergeSubstitutesJson?: unknown
}): ConciergeEmailFields {
  return {
    conciergeEmail: community.conciergeEmail,
    conciergeEmail2: community.conciergeEmail2 ?? null,
    conciergeSubstituteEmail: community.conciergeSubstituteEmail ?? null,
    conciergeSubstituteName: community.conciergeSubstituteName ?? null,
    conciergeEmailsJson: community.conciergeEmailsJson,
    conciergeSubstitutesJson: community.conciergeSubstitutesJson,
  }
}

export type OnboardingInvitation = {
  email: string
  role: 'president' | 'community_admin' | 'company_admin' | 'concierge' | 'pool_staff'
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
  invitePoolStaff: boolean
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

const STAFF_ROLES_FOR_PASSWORD_RESET = new Set([
  'president',
  'community_admin',
  'concierge',
  'pool_staff',
  'company_admin',
])

async function assignTemporaryPassword(userId: number): Promise<string> {
  const plain = generateTempPassword()
  const passwordHash = await bcrypt.hash(plain, 12)
  await prisma.vecindarioUser.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordPlainSnapshot: capturePasswordPlainSnapshot(plain),
    },
  })
  return plain
}

type InviteTask = {
  email: string
  role: 'president' | 'community_admin' | 'company_admin' | 'concierge' | 'pool_staff'
  dualCaption: boolean
  displayName?: string | null
  companyAdminCompanyId?: number
}

export function buildInviteTasks(
  presidentEmail: string | null,
  communityAdminEmail: string | null,
  communityAdminName: string | null | undefined,
  concierge: ConciergeEmailFields | string | null,
  poolStaffEmail: string | null,
): InviteTask[] {
  const p = normEmail(presidentEmail)
  const a = normEmail(communityAdminEmail)
  const adminLabel =
    communityAdminName != null && String(communityAdminName).trim()
      ? String(communityAdminName).trim().slice(0, 255)
      : null
  const conciergeFields: ConciergeEmailFields =
    typeof concierge === 'string' || concierge == null
      ? { conciergeEmail: concierge }
      : concierge
  const conciergeList = listConciergeEmails(conciergeFields)
  const ps = normEmail(poolStaffEmail)
  if (p && a && p === a) {
    const out: InviteTask[] = [
      { email: p, role: 'community_admin', dualCaption: true, displayName: adminLabel },
    ]
    const seen = new Set(out.map((t) => t.email))
    for (const ce of conciergeList) {
      if (!seen.has(ce)) {
        out.push({
          email: ce,
          role: 'concierge',
          dualCaption: false,
          displayName: conciergeNameForEmail(conciergeFields, ce),
        })
        seen.add(ce)
      }
    }
    if (ps && !seen.has(ps)) {
      out.push({ email: ps, role: 'pool_staff', dualCaption: false })
    }
    return out
  }
  const out: InviteTask[] = []
  if (p) out.push({ email: p, role: 'president', dualCaption: false })
  if (a) out.push({ email: a, role: 'community_admin', dualCaption: false, displayName: adminLabel })
  const seen = new Set(out.map((t) => t.email))
  for (const ce of conciergeList) {
    if (!seen.has(ce)) {
      out.push({
        email: ce,
        role: 'concierge',
        dualCaption: false,
        displayName: conciergeNameForEmail(conciergeFields, ce),
      })
      seen.add(ce)
    }
  }
  if (ps && !seen.has(ps)) {
    out.push({ email: ps, role: 'pool_staff', dualCaption: false })
  }
  return out
}

/** Si la comunidad es de empresa y no hay admin en ficha, invita a los company_admin de la firma. */
async function appendCompanyAdminInviteTasks(
  community: Community,
  tasks: InviteTask[],
): Promise<InviteTask[]> {
  const hasAdminOnFicha = tasks.some((t) => t.role === 'community_admin' || t.dualCaption)
  if (hasAdminOnFicha || !communityManagedByCompany(community) || community.companyId == null) {
    return tasks
  }
  const companyId = community.companyId
  const admins = await prisma.vecindarioUser.findMany({
    where: { companyAdminCompanyId: companyId, role: 'company_admin' },
    select: { email: true, name: true },
    orderBy: { id: 'asc' },
  })
  const out = [...tasks]
  const seen = new Set(out.map((t) => t.email))
  for (const u of admins) {
    const e = normEmail(u.email)
    if (!e || seen.has(e)) continue
    out.push({
      email: e,
      role: 'company_admin',
      dualCaption: false,
      displayName: u.name?.trim() || null,
      companyAdminCompanyId: companyId,
    })
    seen.add(e)
  }
  return out
}

async function buildAllInviteTasks(community: Community): Promise<InviteTask[]> {
  const base = buildInviteTasks(
    community.presidentEmail,
    community.communityAdminEmail,
    community.communityAdminName,
    conciergeFieldsFromCommunity(community),
    community.poolStaffEmail,
  )
  return appendCompanyAdminInviteTasks(community, base)
}

function filterTasksBySelection(tasks: InviteTask[], sel: OnboardingMailSelection): InviteTask[] {
  return tasks.filter((t) => {
    if (t.dualCaption) return sel.invitePresident || sel.inviteAdmin
    if (t.role === 'president') return sel.invitePresident
    if (t.role === 'community_admin' || t.role === 'company_admin') return sel.inviteAdmin
    if (t.role === 'concierge') return sel.inviteConcierge
    if (t.role === 'pool_staff') return sel.invitePoolStaff
    return false
  })
}

async function sendOfficialInviteEmail(params: {
  to: string
  communityName: string
  accessCode: string | null
  role: 'president' | 'community_admin' | 'company_admin' | 'concierge' | 'pool_staff'
  dualCaption: boolean
  passwordPlain: string | null
  existingAccount: boolean
}): Promise<void> {
  const { to, communityName, accessCode, role, dualCaption, passwordPlain, existingAccount } =
    params
  const loginUrl = vecindarioLoginUrl()
  const roleLabelEs = dualCaption
    ? 'presidente y administrador de comunidad'
    : role === 'president'
      ? 'presidente'
      : role === 'concierge'
        ? 'conserje / portería'
        : role === 'pool_staff'
          ? 'socorrista (acceso piscina)'
          : role === 'company_admin'
            ? 'administrador de empresa (gestiona las comunidades de la firma)'
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
    loginUrl: vecindarioLoginUrl(),
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
        : t.role === 'pool_staff'
          ? 'socorrista (piscina)'
          : t.role === 'company_admin'
            ? 'administrador de empresa'
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
  const { email, role, dualCaption, displayName, companyAdminCompanyId } = task
  let userCreated = false
  let emailSent = false
  let note: string | undefined
  let passwordPlain: string | null = null
  let existingAccount = false
  const mailConfigured = isMailConfigured()

  const existing = await prisma.vecindarioUser.findUnique({ where: { email } })
  /** Rol efectivo tras alta/promoción (para reset de contraseña al enviar correo). */
  let roleAfterProcess: string | null = existing?.role ?? null

  if (!existing) {
    passwordPlain = generateTempPassword()
    const passwordHash = await bcrypt.hash(passwordPlain, 12)
    await prisma.vecindarioUser.create({
      data: {
        email,
        passwordHash,
        passwordPlainSnapshot: capturePasswordPlainSnapshot(passwordPlain),
        role,
        name: displayName?.trim() || null,
        ...(role === 'pool_staff' ? { communityId: community.id } : {}),
        ...(role === 'company_admin' && companyAdminCompanyId != null
          ? { companyAdminCompanyId }
          : {}),
      },
    })
    userCreated = true
    roleAfterProcess = role
  } else if (existing.role === 'super_admin') {
    existingAccount = true
    note = attemptSendEmail
      ? 'Email ya es super admin; no se creó cuenta nueva. Se envió solo código de comunidad.'
      : 'Email ya es super admin; no se creó cuenta nueva.'
  } else if (existing.role === 'resident') {
    /**
     * Si el correo ya era vecino (alta previa, import, etc.) y ahora figura en ficha
     * como conserje/presidente/admin/socorrista, hay que promover el rol.
     * Antes se dejaba en resident → el 2.º suplente (u otro staff) quedaba como vecino.
     */
    await prisma.vecindarioUser.update({
      where: { id: existing.id },
      data: {
        role,
        ...(displayName?.trim() ? { name: displayName.trim() } : {}),
        ...(role === 'pool_staff'
          ? { communityId: community.id }
          : { communityId: null }),
        ...(role === 'company_admin' && companyAdminCompanyId != null
          ? { companyAdminCompanyId }
          : {}),
      },
    })
    existingAccount = true
    roleAfterProcess = role
    note = `Cuenta era vecino; rol actualizado a ${roleEsLine(task)}.`
  } else if (existing.role === 'concierge' && role === 'concierge') {
    existingAccount = true
    note = 'Cuenta ya existente (conserje).'
  } else if (existing.role === 'pool_staff' && role === 'pool_staff') {
    existingAccount = true
    note = 'Cuenta ya existente (socorrista).'
    await prisma.vecindarioUser.update({
      where: { id: existing.id },
      data: { communityId: community.id },
    })
  } else if (existing.role === 'company_admin' && role === 'company_admin') {
    existingAccount = true
    note = 'Cuenta ya existente (administrador de empresa).'
    if (
      companyAdminCompanyId != null &&
      existing.companyAdminCompanyId !== companyAdminCompanyId
    ) {
      await prisma.vecindarioUser.update({
        where: { id: existing.id },
        data: { companyAdminCompanyId },
      })
      note += ' Empresa de gestión actualizada en la cuenta.'
    }
  } else if (STAFF_ROLES_FOR_PASSWORD_RESET.has(existing.role)) {
    existingAccount = true
    note = 'Cuenta ya existente (personal de gestión).'
  } else {
    existingAccount = true
    note = 'Cuenta ya existente; no se cambió la contraseña.'
  }

  if (
    attemptSendEmail &&
    existing &&
    roleAfterProcess != null &&
    STAFF_ROLES_FOR_PASSWORD_RESET.has(roleAfterProcess)
  ) {
    passwordPlain = await assignTemporaryPassword(existing.id)
    existingAccount = false
    note =
      'Contraseña temporal nueva generada y enviada por correo (la anterior ya no vale).'
  }

  let devPassword: ProcessResult['devPassword']
  const passwordToShare = passwordPlain && !existingAccount ? passwordPlain : null

  if (attemptSendEmail && mailConfigured) {
    try {
      await sendOfficialInviteEmail({
        to: email,
        communityName: community.name,
        accessCode: community.accessCode,
        role,
        dualCaption,
        passwordPlain: passwordToShare,
        existingAccount,
      })
      emailSent = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      note = note ? `${note} (${msg})` : msg
      if (passwordToShare) {
        devPassword = { email, password: passwordToShare, role }
      }
    }
  } else if (attemptSendEmail && !mailConfigured) {
    note = note ? `${note}; SMTP no configurado` : 'SMTP no configurado en el servidor'
    if (passwordToShare) {
      devPassword = { email, password: passwordToShare, role }
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

  const tasks = await buildAllInviteTasks(community)
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

  const allTasks = await buildAllInviteTasks(community)
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
      const linesSource = allTasks.length ? allTasks : await buildAllInviteTasks(community)
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
