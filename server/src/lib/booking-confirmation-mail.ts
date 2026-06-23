import type { Community, CommunityBooking, VecindarioUser } from '@prisma/client'
import { prisma } from './prisma.js'
import { sendMail, isMailConfigured } from './mail.js'
import { listConciergeEmails } from './concierge-emails.js'
import { escapeHtml, wrapVecindarioEmailHtml } from './vecindario-email-template.js'

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

function fmtDateLongEs(isoYmd: string): string {
  const [y, m, d] = isoYmd.split('-').map(Number)
  if (!y || !m || !d) return isoYmd
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return isoYmd
  return dt.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function facilityLine(row: CommunityBooking): string {
  return (row.facilityName && row.facilityName.trim()) || row.facilityId
}

function slotLine(row: CommunityBooking): string {
  const l = row.slotLabel?.trim()
  if (l) return l
  const h = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  return `${h(row.startMinute)} – ${h(row.endMinute)}`
}

function bookingDetailRowsHtml(row: CommunityBooking, commName: string): string {
  const dateStr = row.bookingDate.toISOString().slice(0, 10)
  const fecha = fmtDateLongEs(dateStr)
  const espacio = facilityLine(row)
  const tramo = slotLine(row)
  const piso = row.actorPiso?.trim()
  const portal = row.actorPortal?.trim()
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#334155;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:120px;vertical-align:top;">Comunidad</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(commName)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">Espacio</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(espacio)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(fecha)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Tramo</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(tramo)}</td></tr>
      ${portal ? `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Portal</td><td style="padding:8px 0;">${escapeHtml(portal)}</td></tr>` : ''}
      ${piso ? `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Piso / puerta</td><td style="padding:8px 0;">${escapeHtml(piso)}</td></tr>` : ''}
    </table>`
}

function bookingDetailText(row: CommunityBooking, commName: string): string {
  const dateStr = row.bookingDate.toISOString().slice(0, 10)
  const fecha = fmtDateLongEs(dateStr)
  const espacio = facilityLine(row)
  const tramo = slotLine(row)
  const piso = row.actorPiso?.trim()
  const portal = row.actorPortal?.trim()
  return `Comunidad: ${commName}
Espacio: ${espacio}
Fecha: ${fecha}
Tramo: ${tramo}${portal ? `\nPortal: ${portal}` : ''}${piso ? `\nPiso / puerta: ${piso}` : ''}`
}

/** Respeta Perfil → Notificaciones → Correo (`notifyEmail`). Sin cuenta en la comunidad: se envía (como antes). */
async function userAllowsNotificationEmail(
  email: string,
  communityId: number,
  userId?: number | null,
): Promise<boolean> {
  if (userId != null && Number.isInteger(userId) && userId > 0) {
    const byId = await prisma.vecindarioUser.findUnique({
      where: { id: userId },
      select: { notifyEmail: true, communityId: true },
    })
    if (byId && byId.communityId === communityId) return byId.notifyEmail !== false
  }
  const actorNorm = normEmail(email)
  if (!actorNorm) return false
  const user = await prisma.vecindarioUser.findFirst({
    where: { communityId, email: actorNorm },
    select: { notifyEmail: true },
  })
  if (!user) return true
  return user.notifyEmail !== false
}

async function conciergeEmailsForBookingAlerts(
  community: Community,
  excludeNorm: Set<string>,
): Promise<string[]> {
  const out: string[] = []
  for (const raw of listConciergeEmails(community)) {
    const n = normEmail(raw)
    if (!n || excludeNorm.has(n)) continue
    if (await userAllowsNotificationEmail(raw, community.id)) {
      out.push(raw.trim())
    }
  }
  return out
}

function cancellerDisplayName(user: VecindarioUser): string {
  const name = user.name?.trim()
  if (name) return name
  const mail = user.email?.trim()
  return mail || 'usuario de gestión'
}

/**
 * Tras crear reserva: correo al vecino y a conserje(s) de la ficha, si tienen «Correo» activo en Perfil.
 * Sin cuenta Vecindario en ese email: se envía igual que antes (solo email en ficha).
 */
export async function sendBookingCreatedNotifications(params: {
  row: CommunityBooking
  community: Community
}): Promise<void> {
  if (!isMailConfigured()) return

  const { row, community } = params
  const toResident = row.actorEmail?.trim()
  if (!toResident) return

  const commName = community.name
  const detailRowsHtml = bookingDetailRowsHtml(row, commName)
  const textDetails = bookingDetailText(row, commName)

  if (await userAllowsNotificationEmail(toResident, community.id, row.vecindarioUserId)) {
    const subjectResident = `Vecindario — Reserva confirmada «${commName}»`
    const innerResident = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
      Tu reserva queda <strong>confirmada</strong>.
    </p>
    ${detailRowsHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

    try {
      await sendMail({
        to: toResident,
        subject: subjectResident,
        text: `Hola,\n\nTu reserva queda confirmada.\n\n${textDetails}\n\nUn saludo,\nVecindario`,
        html: wrapVecindarioEmailHtml(innerResident),
      })
    } catch (e) {
      console.error('[booking-email] residente', e)
    }
  }

  const exclude = new Set<string>()
  const rNorm = normEmail(toResident)
  if (rNorm) exclude.add(rNorm)
  const conciergeTos = await conciergeEmailsForBookingAlerts(community, exclude)
  if (!conciergeTos.length) return

  const subjectConc = `Vecindario — Nueva reserva «${commName}»`
  const innerConc = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
      Se ha registrado una <strong>nueva reserva</strong> en tu comunidad.
    </p>
    ${detailRowsHtml}
    <p style="margin:16px 0 0;font-size:14px;color:#334155;"><strong>Reservado por:</strong> ${escapeHtml(toResident)}</p>
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

  for (const toConcierge of conciergeTos) {
    try {
      await sendMail({
        to: toConcierge,
        subject: subjectConc,
        text: `Hola,\n\nNueva reserva en «${commName}».\n\n${textDetails}\n\nReservado por: ${toResident}\n\nUn saludo,\nVecindario`,
        html: wrapVecindarioEmailHtml(innerConc),
      })
    } catch (e) {
      console.error('[booking-email] conserje', toConcierge, e)
    }
  }
}

/**
 * Tras cancelar reserva: correo al vecino y a conserje(s) con el mismo criterio de notificaciones.
 */
export async function sendBookingCancelledNotifications(params: {
  row: CommunityBooking
  community: Community
  cancelledBy: VecindarioUser
}): Promise<void> {
  if (!isMailConfigured()) return

  const { row, community, cancelledBy } = params
  const toResident = row.actorEmail?.trim()
  if (!toResident) return

  const commName = community.name
  const detailRowsHtml = bookingDetailRowsHtml(row, commName)
  const textDetails = bookingDetailText(row, commName)
  const cancellerName = cancellerDisplayName(cancelledBy)
  const cancelledByConcierge = cancelledBy.role === 'concierge'
  const residentIsCanceller =
    !cancelledByConcierge &&
    (row.vecindarioUserId === cancelledBy.id ||
      normEmail(row.actorEmail) === normEmail(cancelledBy.email))

  if (await userAllowsNotificationEmail(toResident, community.id, row.vecindarioUserId)) {
    const introResident = cancelledByConcierge
      ? `Tu reserva ha sido <strong>cancelada</strong> por el conserje (<strong>${escapeHtml(cancellerName)}</strong>). El tramo queda libre para otros vecinos.`
      : residentIsCanceller
        ? 'Has <strong>cancelado</strong> tu reserva. El tramo queda libre para otros vecinos.'
        : 'Tu reserva ha sido <strong>cancelada</strong>. El tramo queda libre para otros vecinos.'

    const subjectResident = `Vecindario — Reserva cancelada «${commName}»`
    const innerResident = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">${introResident}</p>
    ${detailRowsHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

    const textIntro = cancelledByConcierge
      ? `Tu reserva ha sido cancelada por el conserje (${cancellerName}). El tramo queda libre.`
      : residentIsCanceller
        ? 'Has cancelado tu reserva. El tramo queda libre.'
        : 'Tu reserva ha sido cancelada. El tramo queda libre.'

    try {
      await sendMail({
        to: toResident,
        subject: subjectResident,
        text: `Hola,\n\n${textIntro}\n\n${textDetails}\n\nUn saludo,\nVecindario`,
        html: wrapVecindarioEmailHtml(innerResident),
      })
    } catch (e) {
      console.error('[booking-email-cancel] residente', e)
    }
  }

  const exclude = new Set<string>()
  const rNorm = normEmail(toResident)
  if (rNorm) exclude.add(rNorm)
  const cancellerNorm = normEmail(cancelledBy.email)
  if (cancellerNorm) exclude.add(cancellerNorm)
  const conciergeTos = await conciergeEmailsForBookingAlerts(community, exclude)
  if (!conciergeTos.length) return

  const introConc = cancelledByConcierge
    ? `<strong>${escapeHtml(cancellerName)}</strong> ha cancelado una reserva en tu comunidad.`
    : `Un vecino ha cancelado su reserva (<strong>${escapeHtml(toResident)}</strong>).`

  const subjectConc = `Vecindario — Reserva cancelada «${commName}»`
  const innerConc = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">${introConc}</p>
    ${detailRowsHtml}
    <p style="margin:16px 0 0;font-size:14px;color:#334155;"><strong>Reserva de:</strong> ${escapeHtml(toResident)}</p>
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

  const textIntroConc = cancelledByConcierge
    ? `${cancellerName} ha cancelado una reserva.`
    : `Reserva cancelada por el vecino ${toResident}.`

  for (const toConcierge of conciergeTos) {
    try {
      await sendMail({
        to: toConcierge,
        subject: subjectConc,
        text: `Hola,\n\n${textIntroConc}\n\n${textDetails}\n\nReserva de: ${toResident}\n\nUn saludo,\nVecindario`,
        html: wrapVecindarioEmailHtml(innerConc),
      })
    } catch (e) {
      console.error('[booking-email-cancel] conserje', toConcierge, e)
    }
  }
}
