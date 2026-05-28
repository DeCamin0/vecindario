export function notificationPrefsFromApi(data) {
  return {
    notifyWebPush: data?.notifyWebPush !== false,
    notifyMobilePush: data?.notifyMobilePush !== false,
    notifyEmail: data?.notifyEmail !== false,
  }
}

/** Normaliza respuesta GET/PATCH /api/auth/me → objeto user del contexto. */
export function userFromMeResponse(data, prev = null) {
  if (!data || data.id == null) return prev

  const pisoMe = data.piso != null && String(data.piso).trim() ? String(data.piso).trim() : ''
  const portalMe =
    data.portal != null && String(data.portal).trim() ? String(data.portal).trim() : ''
  const puertaMe =
    data.puerta != null && String(data.puerta).trim() ? String(data.puerta).trim() : ''
  const phoneMe = data.phone != null && String(data.phone).trim() ? String(data.phone).trim() : ''
  const habMe =
    data.habitaciones != null && String(data.habitaciones).trim()
      ? String(data.habitaciones).trim()
      : ''
  const pgMe =
    data.plazaGaraje != null && String(data.plazaGaraje).trim()
      ? String(data.plazaGaraje).trim()
      : ''
  const poolOMe =
    data.poolAccessOwner != null && String(data.poolAccessOwner).trim()
      ? String(data.poolAccessOwner).trim()
      : ''
  const poolGMe =
    data.poolAccessGuest != null && String(data.poolAccessGuest).trim()
      ? String(data.poolAccessGuest).trim()
      : ''
  const emailMe = data.email != null && String(data.email).trim() ? String(data.email).trim() : ''
  const nameMe =
    data.name?.trim() ||
    (emailMe ? emailMe.split('@')[0] : portalMe && pisoMe ? `${portalMe} · ${pisoMe}` : 'Vecino')

  const companyMe =
    data.company &&
    typeof data.company === 'object' &&
    data.company.id != null &&
    Number.isFinite(Number(data.company.id))
      ? {
          id: Number(data.company.id),
          name:
            typeof data.company.name === 'string' && data.company.name.trim()
              ? data.company.name.trim()
              : `Empresa ${data.company.id}`,
        }
      : prev?.company ?? null

  const avatarMe =
    data.profileImageUrl != null && String(data.profileImageUrl).trim()
      ? String(data.profileImageUrl).trim()
      : ''

  return {
    id: data.id,
    ...(emailMe ? { email: emailMe } : {}),
    name: nameMe,
    ...(avatarMe ? { profileImageUrl: avatarMe } : {}),
    ...(pisoMe ? { piso: pisoMe } : {}),
    ...(portalMe ? { portal: portalMe } : {}),
    ...(puertaMe ? { puerta: puertaMe } : {}),
    ...(phoneMe ? { phone: phoneMe } : {}),
    ...(habMe ? { habitaciones: habMe } : {}),
    ...(pgMe ? { plazaGaraje: pgMe } : {}),
    ...(poolOMe ? { poolAccessOwner: poolOMe } : {}),
    ...(poolGMe ? { poolAccessGuest: poolGMe } : {}),
    ...(companyMe ? { company: companyMe } : {}),
    ...notificationPrefsFromApi(data),
  }
}

export function canEditMyProfileData(role) {
  return role === 'resident' || role === 'president'
}

/** Portal + piso + puerta ya asignados (alta / administración). */
export function isDwellingAssigned(user) {
  if (!user) return false
  const portal = user.portal != null ? String(user.portal).trim() : ''
  const piso = user.piso != null ? String(user.piso).trim() : ''
  const puerta = user.puerta != null ? String(user.puerta).trim() : ''
  return Boolean(portal && piso && puerta)
}

export const PROFILE_ROLE_LABELS = {
  resident: 'Residente',
  president: 'Presidente',
  community_admin: 'Administrador de comunidad',
  concierge: 'Conserje',
  pool_staff: 'Personal piscina',
  super_admin: 'Super administrador',
  company_admin: 'Administrador de empresa',
}
