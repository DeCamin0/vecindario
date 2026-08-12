/**
 * Navegación Super Admin (V2).
 * section = vista interna en /admin
 * link = ruta React Router existente
 */

export const SA_SECTION_INICIO = 'inicio'
export const SA_SECTION_COMUNIDADES = 'comunidades'
export const SA_SECTION_EMPRESAS = 'empresas'
export const SA_SECTION_BILLING = 'billing'

/** @param {string} sectionId */
export function saSectionPath(sectionId) {
  if (!sectionId || sectionId === SA_SECTION_INICIO) return '/admin'
  return `/admin?section=${encodeURIComponent(sectionId)}`
}

/** @typedef {{ id: string, label: string, icon: string, kind: 'section' | 'link', to?: string, superOnly?: boolean }} SaNavItem */

/** @type {SaNavItem[]} */
export const SA_NAV_ITEMS = [
  { id: SA_SECTION_INICIO, label: 'Inicio', icon: '⌂', kind: 'section', to: '/admin' },
  {
    id: SA_SECTION_COMUNIDADES,
    label: 'Comunidades',
    icon: '▣',
    kind: 'section',
    to: saSectionPath(SA_SECTION_COMUNIDADES),
  },
  {
    id: SA_SECTION_EMPRESAS,
    label: 'Empresas',
    icon: '▦',
    kind: 'section',
    to: saSectionPath(SA_SECTION_EMPRESAS),
    superOnly: true,
  },
  {
    id: SA_SECTION_BILLING,
    label: 'Plan y facturación',
    icon: '€',
    kind: 'section',
    to: saSectionPath(SA_SECTION_BILLING),
    superOnly: true,
  },
  { id: 'servicios', label: 'Servicios', icon: '⚙', kind: 'link', to: '/admin/services', superOnly: true },
  {
    id: 'solicitudes',
    label: 'Solicitudes',
    icon: '✉',
    kind: 'link',
    to: '/admin/solicitudes-oferta',
    superOnly: true,
  },
  {
    id: 'soporte',
    label: 'Soporte',
    icon: '💬',
    kind: 'link',
    to: '/admin/support',
    superOnly: true,
  },
]

/**
 * @param {boolean} isFullSuperAdmin
 * @returns {SaNavItem[]}
 */
export function buildSaNavItems(isFullSuperAdmin) {
  return SA_NAV_ITEMS.filter((item) => (item.superOnly ? isFullSuperAdmin : true))
}

/** @param {string | null | undefined} raw */
export function normalizeSaSection(raw, isFullSuperAdmin) {
  const allowed = new Set(
    buildSaNavItems(isFullSuperAdmin)
      .filter((i) => i.kind === 'section')
      .map((i) => i.id),
  )
  if (raw && allowed.has(raw)) return raw
  return SA_SECTION_INICIO
}

export const SA_SECTION_TITLES = {
  [SA_SECTION_INICIO]: {
    title: 'Inicio',
    subtitle: 'Atención, negocio y atajos de creación',
  },
  [SA_SECTION_COMUNIDADES]: {
    title: 'Comunidades',
    subtitle: 'Listado, pendientes y administradores de ficha',
  },
  [SA_SECTION_EMPRESAS]: {
    title: 'Empresas',
    subtitle: 'Directorio y administradores de empresa',
  },
  [SA_SECTION_BILLING]: {
    title: 'Plan y facturación',
    subtitle: 'Resumen comercial y catálogo de precios',
  },
  servicios: {
    title: 'Servicios',
    subtitle: 'Presupuesto, mensajes y cierre de solicitudes',
  },
  solicitudes: {
    title: 'Solicitudes',
    subtitle: 'Ofertas desde web y app · seguimiento interno',
  },
  soporte: {
    title: 'Soporte',
    subtitle: 'Tickets de usuarios · hilo y estados',
  },
}
