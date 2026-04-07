/** Campos de vivienda / extras del vecino: solo texto, sin lógica de negocio. */

export function trimDwellingField(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().slice(0, max)
  return t || null
}

/** Puerta normalizada para BD / login: vacío → null. */
export function parsePuertaField(raw: unknown): string | null {
  return trimDwellingField(raw, 64)
}

/** Si el cuerpo no incluye la clave, no se actualiza el campo (undefined). Si incluye string vacío → null. */
export function parseOptionalBodyString(
  body: Record<string, unknown>,
  key: string,
  max: number,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined
  return trimDwellingField(body[key], max)
}
