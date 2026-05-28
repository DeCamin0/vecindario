/** Nombre mostrado de personal (conserje, admin) en registros históricos. */
export function staffDisplayName(user: {
  name?: string | null
  email?: string | null
}): string | null {
  const name = user.name?.trim()
  if (name) return name.slice(0, 255)
  const mail = user.email?.trim()
  return mail ? mail.slice(0, 255) : null
}
