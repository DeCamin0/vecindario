/**
 * Textos FAQ Ayuda — fuente única web.
 * Móvil: vecindario-mobile/src/content/profileHelpContent.ts (mantener alineado).
 * Evolución: ver docs/PROFILE-AYUDA.md
 */

export const PROFILE_HELP_INTRO =
  'Aquí tienes a quién acudir en tu comunidad y respuestas a las dudas más habituales sobre Vecindario.'

export const PROFILE_HELP_CONTACT_BLOCKS = [
  {
    id: 'concierge',
    title: 'Conserjería',
    description:
      'Paquetería, contraseñas, horarios de servicios y consultas del día a día en el edificio.',
    emailKey: 'conciergeEmail',
  },
  {
    id: 'admin',
    title: 'Administración / presidente',
    description:
      'Alta de vecinos, datos de vivienda (portal, piso, puerta), junta y gestión de la comunidad.',
    emailKey: 'communityAdminEmail',
  },
  {
    id: 'community',
    title: 'Contacto general de la comunidad',
    description: 'Correo de referencia de la finca para avisos y comunicación.',
    emailKey: 'contactEmail',
  },
  {
    id: 'distributor',
    title: 'Distribuidor / soporte Vecindario',
    description:
      'Problemas con la aplicación, nuevas comunidades, servicios opcionales (p. ej. avisos por WhatsApp).',
    emailKey: 'distributorEmail',
  },
]

/** Preguntas para vecinos y presidentes que usan la app como residente. */
export const PROFILE_HELP_FAQ_RESIDENT = [
  {
    q: '¿Cómo entro en Vecindario?',
    a: 'Con el código VEC de tu comunidad, portal, piso (y puerta si aplica) y la contraseña que te dio la administración o conserjería. Si tienes email en la ficha, también puedes usarlo con contraseña.',
  },
  {
    q: 'He olvidado la contraseña',
    a: 'Contacta con conserjería o administración de tu comunidad. Ellos pueden generarte una contraseña temporal desde su panel.',
  },
  {
    q: 'Reservas (pádel, salón, etc.)',
    a: 'En Reservas eliges fecha y tramo según las reglas de tu comunidad. Recibirás confirmación por los canales que tengas activos en Notificaciones.',
  },
  {
    q: 'Paquetería',
    a: 'Cuando el conserje registra un paquete a tu nombre, verás un aviso en la campana y, si lo tienes activo, push o correo.',
  },
  {
    q: 'Notificaciones',
    a: 'En Perfil → Notificaciones activas o desactivas avisos en web, app móvil y correo. La campana del menú sigue mostrando el historial.',
  },
  {
    q: 'Acceso a piscina',
    a: 'Si tu comunidad tiene el módulo activo, en Acceso piscina generas un código QR. Los cupos de titular e invitados los asigna administración o conserjería en tu ficha.',
  },
]

/** Extra para personal de la finca (conserje, admin). */
export const PROFILE_HELP_FAQ_STAFF = [
  {
    q: 'Lista y datos de vecinos',
    a: 'En Perfil → Lista de vecinos consultas fichas, junta, cupos de piscina y contraseñas temporales. Las cuentas nuevas las crea De Camino según la estructura de portales y viviendas en Super Admin.',
  },
  {
    q: 'No puedo dar de alta vecinos',
    a: 'Solo el super administrador crea cuentas (manual o en bloque según portales/plantas/puertas de la ficha). Presidente, conserje y administrador de comunidad consultan la lista y pueden editar junta, piscina o generar contraseña temporal.',
  },
]
