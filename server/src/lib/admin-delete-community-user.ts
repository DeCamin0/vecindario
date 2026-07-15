import type { Community, Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { normEmail } from './community-user-access.js'
import {
  normalizeConciergeEmailsForDb,
  parseConciergeEntries,
  parseConciergeSubstituteEntries,
} from './concierge-emails.js'
import { resolveStaffUserIdsForCommunity } from './admin-community-staff-ids.js'
import {
  bulkDeleteResidentAccountsForCommunity,
  collectBulkDeletableResidentUserIds,
} from './admin-bulk-delete-residents.js'
import { deleteAvatarFilesForUser } from './profile-avatar.js'

/** Quita el correo de los campos de ficha de la comunidad (presidente, admin, conserjes, piscina). */
export function buildCommunityFichaClearForEmail(
  community: Community,
  emailNorm: string,
): Prisma.CommunityUpdateInput {
  const data: Prisma.CommunityUpdateInput = {}

  if (normEmail(community.presidentEmail) === emailNorm) {
    data.presidentEmail = null
    data.presidentPortal = null
    data.presidentPiso = null
    data.presidentPuerta = null
  }
  if (normEmail(community.communityAdminEmail) === emailNorm) {
    data.communityAdminEmail = null
  }
  if (normEmail(community.poolStaffEmail) === emailNorm) {
    data.poolStaffEmail = null
  }

  const conciergeEntries = parseConciergeEntries(community).filter(
    (e) => normEmail(e.email) !== emailNorm,
  )
  const substituteEntries = parseConciergeSubstituteEntries(community).filter(
    (e) => normEmail(e.email) !== emailNorm,
  )
  const conciergeNorm = normalizeConciergeEmailsForDb(conciergeEntries, substituteEntries)
  const hadConcierge =
    normEmail(community.conciergeEmail) === emailNorm ||
    normEmail(community.conciergeEmail2) === emailNorm ||
    parseConciergeEntries(community).some((e) => normEmail(e.email) === emailNorm) ||
    parseConciergeSubstituteEntries(community).some((e) => normEmail(e.email) === emailNorm)

  if (hadConcierge) {
    data.conciergeEmailsJson = conciergeNorm.conciergeEmailsJson
    data.conciergeEmail = conciergeNorm.conciergeEmail
    data.conciergeEmail2 = conciergeNorm.conciergeEmail2
    data.conciergeSubstitutesJson = conciergeNorm.conciergeSubstitutesJson
    data.conciergeSubstituteEmail = conciergeNorm.conciergeSubstituteEmail
    data.conciergeSubstituteName = conciergeNorm.conciergeSubstituteName
  }

  return data
}

export type DeleteCommunityUserResult =
  | { ok: true; deleted: true; clearedFicha: boolean }
  | { ok: false; status: number; error: string; message?: string }

export async function deleteCommunityUserAccount(
  community: Community,
  targetUserId: number,
  actorUserId: number,
): Promise<DeleteCommunityUserResult> {
  if (targetUserId === actorUserId) {
    return {
      ok: false,
      status: 400,
      error: 'No puedes eliminar tu propia cuenta desde el panel.',
    }
  }

  const target = await prisma.vecindarioUser.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      communityId: true,
    },
  })
  if (!target) {
    return { ok: false, status: 404, error: 'Usuario no encontrado' }
  }
  if (target.role === 'super_admin') {
    return {
      ok: false,
      status: 403,
      error: 'No se puede eliminar una cuenta de super administrador.',
    }
  }

  const staffIds = await resolveStaffUserIdsForCommunity(community)
  const isStaffFicha = staffIds.has(targetUserId)
  const deletableResidents = await collectBulkDeletableResidentUserIds(community)
  const isDeletableResident = deletableResidents.includes(targetUserId)

  if (!isStaffFicha && !isDeletableResident) {
    return {
      ok: false,
      status: 403,
      error: 'Este usuario no está vinculado a esta comunidad en la lista de usuarios.',
    }
  }

  const parcelLinks = await prisma.communityConciergeParcel.count({
    where: {
      communityId: community.id,
      OR: [
        { recipientUserId: targetUserId },
        { createdByUserId: targetUserId },
        { pickedUpByUserId: targetUserId },
      ],
    },
  })
  if (parcelLinks > 0) {
    return {
      ok: false,
      status: 409,
      error: 'Paquetería vinculada',
      message:
        'Hay registros de paquetería donde esta persona es destinatario, quien registró o quien entregó el paquete. Resuélvelos o reasígnalos antes de borrar la cuenta.',
    }
  }

  const emailNorm = normEmail(target.email)
  let clearedFicha = false

  try {
    await prisma.$transaction(async (tx) => {
      if (isDeletableResident) {
        await bulkDeleteResidentAccountsForCommunity(community, {
          tx,
          userIds: [targetUserId],
        })
      } else {
        await tx.communityIncident.deleteMany({
          where: { communityId: community.id, reporterUserId: targetUserId },
        })
        await tx.communityServiceRequest.deleteMany({
          where: { communityId: community.id, requesterUserId: targetUserId },
        })
        if (emailNorm) {
          const fichaPatch = buildCommunityFichaClearForEmail(community, emailNorm)
          if (Object.keys(fichaPatch).length > 0) {
            await tx.community.update({
              where: { id: community.id },
              data: fichaPatch,
            })
            clearedFicha = true
          }
        }
        await tx.vecindarioUser.delete({ where: { id: targetUserId } })
      }
    })
    try {
      await deleteAvatarFilesForUser(targetUserId)
    } catch {
      /* optional */
    }
    return { ok: true, deleted: true, clearedFicha }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      status: 500,
      error: 'No se pudo eliminar la cuenta',
      message: msg,
    }
  }
}
