import type { PrismaClient } from '@prisma/client'

/**
 * Copia en claro de la contraseña vigente del portal (alta, reset o último login correcto).
 * El hash bcrypt no se puede descifrar; este campo es la fuente para 👁 en super admin.
 */
export function capturePasswordPlainSnapshot(plain: string | null | undefined): string | null {
  if (plain == null) return null
  const t = String(plain).trim()
  if (!t) return null
  return t.slice(0, 255)
}

/** Tras verificar bcrypt, guarda la clave que acaba de funcionar (sin cambiar el hash). */
export async function syncPasswordPlainSnapshotAfterVerify(
  prisma: PrismaClient,
  userId: number,
  plain: string,
): Promise<void> {
  const snap = capturePasswordPlainSnapshot(plain)
  if (!snap) return
  try {
    await prisma.vecindarioUser.update({
      where: { id: userId },
      data: { passwordPlainSnapshot: snap },
    })
  } catch {
    /* no bloquear login */
  }
}
