import type { Prisma } from '@prisma/client'

/** Ids alineados con SERVICE_CATEGORIES (front) y CATEGORY_IDS (community-services). */
export const SERVICE_REQUEST_CATEGORY_IDS = [
  'plumber',
  'electrician',
  'locksmith',
  'cleaning',
  'renovation',
  'other',
] as const

export type ServiceRequestCategoryId = (typeof SERVICE_REQUEST_CATEGORY_IDS)[number]
export type ServiceCategoryMode = 'active' | 'soon'

const ID_SET = new Set<string>(SERVICE_REQUEST_CATEGORY_IDS)

/** Respuesta pública / admin: siempre las 6 claves. */
export function normalizeServiceCategoryModes(
  raw: unknown,
): Record<ServiceRequestCategoryId, ServiceCategoryMode> {
  const out = {} as Record<ServiceRequestCategoryId, ServiceCategoryMode>
  for (const id of SERVICE_REQUEST_CATEGORY_IDS) {
    out[id] = 'active'
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    for (const id of SERVICE_REQUEST_CATEGORY_IDS) {
      if (o[id] === 'soon') out[id] = 'soon'
    }
  }
  return out
}

export function isServiceCategorySelectable(
  modes: Record<ServiceRequestCategoryId, ServiceCategoryMode>,
  categoryId: string,
): boolean {
  if (!ID_SET.has(categoryId)) return false
  return modes[categoryId as ServiceRequestCategoryId] !== 'soon'
}

/** Parsea PATCH/POST: objeto { plumber: 'active'|'soon', ... }; null/undefined → {}. */
export function parseServiceRequestCategoryModesBody(
  raw: unknown,
): { ok: true; value: Prisma.InputJsonValue } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, value: {} }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'serviceRequestCategoryModes debe ser un objeto' }
  }
  const o = raw as Record<string, unknown>
  for (const k of Object.keys(o)) {
    if (!ID_SET.has(k)) {
      return { ok: false, error: `Clave de categoría desconocida: ${k}` }
    }
  }
  const stored: Record<string, ServiceCategoryMode> = {}
  for (const id of SERVICE_REQUEST_CATEGORY_IDS) {
    const v = o[id]
    if (v === undefined || v === 'active') {
      stored[id] = 'active'
    } else if (v === 'soon') {
      stored[id] = 'soon'
    } else {
      return { ok: false, error: `Modo inválido para ${id}: use "active" o "soon"` }
    }
  }
  return { ok: true, value: stored as Prisma.InputJsonValue }
}
