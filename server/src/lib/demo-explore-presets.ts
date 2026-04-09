/**
 * Comunidad demo (slug `demo`) — emails y presets para seed + login exploración.
 * Mantener alineado con seed-demo-community.ts (usa estos emails).
 */
import type { VecindarioRole } from '@prisma/client'

export const DEMO_COMMUNITY_SLUG = 'demo'

export type DemoExplorePresetId =
  | 'company_admin'
  | 'president'
  | 'community_admin'
  | 'concierge'
  | 'pool_staff'
  | 'resident_vecino'
  | 'resident_vecina'

export type DemoSeedUserSpec = {
  preset: DemoExplorePresetId
  email: string
  name: string
  role: VecindarioRole
  portal: string | null
  piso: string | null
  puerta: string | null
  phone?: string
}

/** Orden estable: mismo que el seed histórico. */
export const DEMO_SEED_USER_SPECS: DemoSeedUserSpec[] = [
  {
    preset: 'company_admin',
    email: 'empresa-demo@decamino.demo',
    name: 'Admin empresa (demo)',
    role: 'company_admin',
    portal: null,
    piso: null,
    puerta: null,
  },
  {
    preset: 'president',
    email: 'presidente-demo@decamino.demo',
    name: 'Presidente (demo)',
    role: 'president',
    portal: '1',
    piso: '3',
    puerta: 'A',
  },
  {
    preset: 'community_admin',
    email: 'admincom-demo@decamino.demo',
    name: 'Administración finca (demo)',
    role: 'community_admin',
    portal: null,
    piso: null,
    puerta: null,
  },
  {
    preset: 'concierge',
    email: 'conserje-demo@decamino.demo',
    name: 'Conserje (demo)',
    role: 'concierge',
    portal: null,
    piso: null,
    puerta: null,
  },
  {
    preset: 'pool_staff',
    email: 'piscina-demo@decamino.demo',
    name: 'Socorrista piscina (demo)',
    role: 'pool_staff',
    portal: null,
    piso: null,
    puerta: null,
  },
  {
    preset: 'resident_vecino',
    email: 'vecino-demo@decamino.demo',
    name: 'Vecino García (demo)',
    role: 'resident',
    portal: '1',
    piso: '2',
    puerta: 'B',
    phone: '+34 600 000 000',
  },
  {
    preset: 'resident_vecina',
    email: 'vecina-demo@decamino.demo',
    name: 'Vecina López (demo)',
    role: 'resident',
    portal: '1',
    piso: '4',
    puerta: 'C',
    phone: '+34 600 000 001',
  },
]

/** UI: exploración sin exponer emails al usuario final. */
export const DEMO_EXPLORE_UI: {
  id: DemoExplorePresetId
  label: string
  hint: string
}[] = [
  { id: 'resident_vecino', label: 'Vecino / residente', hint: 'App: reservas, incidencias, servicios' },
  { id: 'resident_vecina', label: 'Otro vecino (ejemplo)', hint: 'Segunda cuenta de demostración' },
  { id: 'president', label: 'Presidente', hint: 'Panel de comunidad' },
  { id: 'community_admin', label: 'Administrador de comunidad', hint: 'Gestión incidencias y reservas' },
  { id: 'concierge', label: 'Conserje / portería', hint: 'Vista conserje' },
  { id: 'pool_staff', label: 'Socorrista / piscina', hint: 'Validación acceso piscina' },
  { id: 'company_admin', label: 'Administrador de empresa', hint: 'Empresa y comunidades' },
]

export function demoPresetEmail(preset: string): string | null {
  const s = DEMO_SEED_USER_SPECS.find((x) => x.preset === preset)
  return s?.email ?? null
}

export function isDemoExplorePreset(preset: string): preset is DemoExplorePresetId {
  return DEMO_SEED_USER_SPECS.some((x) => x.preset === preset)
}
