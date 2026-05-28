/** Puede añadir / editar / borrar anotaciones. */
export function canWriteCuadernoDiario(access) {
  return access === 'write'
}

/** Puede ver el cuaderno (junta, administrador, conserje). */
export function canViewCuadernoDiario(access) {
  return access === 'read' || access === 'write'
}

/**
 * Editar o eliminar: solo tus anotaciones y solo el día de hoy (vista = hoy).
 * @param {{ createdByUserId?: number | null }} entry
 */
export function canMutateCuadernoEntry(entry, { userId, viewDateYmd, todayYmd, canWrite }) {
  if (!canWrite || userId == null || !entry) return false
  if (viewDateYmd !== todayYmd) return false
  const authorId = Number(entry.createdByUserId)
  if (!Number.isFinite(authorId)) return false
  return Number(userId) === authorId
}

/** Nueva anotación: solo en el día de hoy. */
export function canCreateCuadernoEntry({ viewDateYmd, todayYmd, canWrite }) {
  return Boolean(canWrite && viewDateYmd === todayYmd)
}
