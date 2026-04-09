/**
 * O singură comunitate demo (loginSlug `demo`) + utilizatori pe roluri + date fictive
 * (rezervări, incidențe, solicitări servicii). Idempotent: poate fi rulat din nou.
 *
 * Rulare: din vecindario-app:  npm run seed:demo --prefix server
 * Parolă: DEMO_SEED_PASSWORD în .env sau implicită (vezi DEMO_PASSWORD_DEFAULT).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { prisma } from './lib/prisma.js'
import { DEMO_COMMUNITY_SLUG, DEMO_SEED_USER_SPECS } from './lib/demo-explore-presets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const DEMO_SLUG = DEMO_COMMUNITY_SLUG
const DEMO_PASSWORD_DEFAULT = 'VecindarioDemo2026!'

const USERS = DEMO_SEED_USER_SPECS.map((s) => ({
  email: s.email,
  name: s.name,
  role: s.role,
  communityId: null as number | null,
  portal: s.portal,
  piso: s.piso,
  puerta: s.puerta,
  phone: s.phone,
}))

async function main() {
  const plain = String(process.env.DEMO_SEED_PASSWORD || DEMO_PASSWORD_DEFAULT)
  if (plain.length < 10) {
    throw new Error('DEMO_SEED_PASSWORD debe tener al menos 10 caracteres')
  }
  const passwordHash = await bcrypt.hash(plain, 12)

  let company = await prisma.company.findFirst({
    where: { name: 'Administración demo — Vecindario' },
  })
  if (!company) {
    company = await prisma.company.create({
      data: { name: 'Administración demo — Vecindario' },
    })
  }

  const planFar = new Date('2035-12-31')

  let community = await prisma.community.findFirst({
    where: { loginSlug: DEMO_SLUG },
  })

  const portalLabels = ['Portal principal']
  const portalDwellingConfig = [{ floors: 5, doorsPerFloor: 4, doorScheme: 'letters' as const }]

  if (!community) {
    community = await prisma.community.create({
      data: {
        name: 'Comunidad de demostración',
        nifCif: 'B00000000',
        address: 'Calle Ejemplo 123, Madrid (datos ficticios)',
        accessCode: 'DEMO-VEC-2026',
        loginSlug: DEMO_SLUG,
        contactEmail: 'comunidad-demo@decamino.demo',
        presidentEmail: 'presidente-demo@decamino.demo',
        presidentPortal: '1',
        presidentPiso: '3',
        communityAdminEmail: 'admincom-demo@decamino.demo',
        conciergeEmail: 'conserje-demo@decamino.demo',
        poolStaffEmail: 'piscina-demo@decamino.demo',
        status: 'active',
        planExpiresOn: planFar,
        portalCount: 1,
        portalLabels,
        portalDwellingConfig,
        residentSlots: 80,
        gymAccessEnabled: true,
        padelCourtCount: 1,
        salonBookingMode: 'slots',
        customLocations: [{ id: 'sala_reuniones', name: 'Sala de reuniones' }],
        appNavServicesEnabled: true,
        appNavIncidentsEnabled: true,
        appNavBookingsEnabled: true,
        appNavPoolAccessEnabled: true,
        poolAccessSystemEnabled: true,
        poolSeasonActive: true,
        poolSeasonStart: new Date('2026-01-01'),
        poolSeasonEnd: new Date('2026-12-31'),
        poolHoursNote: '10:00–21:00 (demo)',
        poolMaxOccupancy: 40,
        companyId: company.id,
      },
    })
  } else {
    community = await prisma.community.update({
      where: { id: community.id },
      data: {
        name: 'Comunidad de demostración',
        status: 'active',
        planExpiresOn: planFar,
        companyId: company.id,
        portalLabels,
        portalDwellingConfig,
        presidentEmail: 'presidente-demo@decamino.demo',
        presidentPortal: '1',
        presidentPiso: '3',
        communityAdminEmail: 'admincom-demo@decamino.demo',
        conciergeEmail: 'conserje-demo@decamino.demo',
        poolStaffEmail: 'piscina-demo@decamino.demo',
        appNavPoolAccessEnabled: true,
        poolAccessSystemEnabled: true,
        poolSeasonActive: true,
        padelCourtCount: Math.max(1, community.padelCourtCount || 0),
      },
    })
  }

  const cid = community.id

  for (const u of USERS) {
    const communityId =
      u.role === 'company_admin' ? null : cid
    const companyAdminCompanyId = u.role === 'company_admin' ? company.id : null

    await prisma.vecindarioUser.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        communityId,
        companyAdminCompanyId,
        portal: u.portal ?? undefined,
        piso: u.piso ?? undefined,
        puerta: u.puerta ?? undefined,
        phone: u.phone,
      },
      update: {
        passwordHash,
        name: u.name,
        role: u.role,
        communityId,
        companyAdminCompanyId,
        portal: u.portal ?? null,
        piso: u.piso ?? null,
        puerta: u.puerta ?? null,
        phone: u.phone ?? null,
      },
    })
  }

  const vecino = await prisma.vecindarioUser.findUniqueOrThrow({
    where: { email: 'vecino-demo@decamino.demo' },
  })
  const vecina = await prisma.vecindarioUser.findUniqueOrThrow({
    where: { email: 'vecina-demo@decamino.demo' },
  })
  const admincom = await prisma.vecindarioUser.findUniqueOrThrow({
    where: { email: 'admincom-demo@decamino.demo' },
  })

  await prisma.$transaction([
    prisma.communityIncidentComment.deleteMany({
      where: { incident: { communityId: cid } },
    }),
    prisma.communityIncident.deleteMany({ where: { communityId: cid } }),
    prisma.communityServiceRequestMessage.deleteMany({
      where: { serviceRequest: { communityId: cid } },
    }),
    prisma.communityServiceRequest.deleteMany({ where: { communityId: cid } }),
    prisma.communityBooking.deleteMany({ where: { communityId: cid } }),
    prisma.poolAccessPass.deleteMany({ where: { communityId: cid } }),
  ])

  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(0, 0, 0, 0)
  const bookingDate = new Date(tomorrow)

  await prisma.communityBooking.create({
    data: {
      communityId: cid,
      facilityId: 'padel',
      facilityName: 'Pista de pádel',
      bookingDate,
      startMinute: 600,
      endMinute: 660,
      slotKey: 'padel-600-660',
      slotLabel: '10:00 – 11:00',
      vecindarioUserId: vecino.id,
      actorEmail: vecino.email!,
      actorPiso: vecino.piso ?? undefined,
      actorPortal: vecino.portal ?? undefined,
      status: 'confirmed',
    },
  })

  await prisma.communityIncident.create({
    data: {
      communityId: cid,
      reporterUserId: vecina.id,
      categoryId: 'water-leak',
      categoryLabel: 'Fuga de agua',
      description:
        'Ejemplo de incidencia abierta (datos ficticios). Gotera en el rellano del segundo piso.',
      locationText: 'Rellano planta 2, portal principal',
      portalLabel: 'Portal principal',
      urgency: 'high',
      status: 'pendiente',
    },
  })

  const incResolved = await prisma.communityIncident.create({
    data: {
      communityId: cid,
      reporterUserId: vecino.id,
      categoryId: 'cleaning',
      categoryLabel: 'Limpieza',
      description: 'Ejemplo resuelto: zona común desordenada tras obra menor (demo).',
      locationText: 'Trasteros',
      urgency: 'low',
      status: 'resuelta',
      resolvedAt: new Date(),
      resolvedByUserId: admincom.id,
    },
  })

  await prisma.communityIncidentComment.create({
    data: {
      incidentId: incResolved.id,
      authorUserId: admincom.id,
      body: 'Equipo de limpieza pasó el lunes. Quedó resuelto. (mensaje de ejemplo)',
    },
  })

  const sr = await prisma.communityServiceRequest.create({
    data: {
      communityId: cid,
      requesterUserId: vecino.id,
      categoryId: 'cleaning',
      categoryLabel: 'Limpieza',
      serviceSubtype: 'cleaning_general',
      description:
        'Solicitud de ejemplo: limpieza puntual del portal y escalera (datos ficticios).',
      preferredDate: bookingDate,
      photosJson: [],
      status: 'price_sent',
      priceAmount: new Prisma.Decimal('120.00'),
      priceAmountMax: new Prisma.Decimal('180.00'),
      priceNote: 'Presupuesto orientativo para demo; no es un encargo real.',
      priceSentAt: new Date(),
      providerName: 'Proveedor ejemplo SL',
    },
  })

  await prisma.communityServiceRequestMessage.create({
    data: {
      serviceRequestId: sr.id,
      authorUserId: admincom.id,
      body: 'Hola, adjuntamos estimación. ¿Te encaja la franja propuesta? (demo)',
    },
  })

  const expires = new Date()
  expires.setUTCHours(expires.getUTCHours() + 24)

  await prisma.poolAccessPass.create({
    data: {
      userId: vecino.id,
      communityId: cid,
      code: `DEMO-POOL-${cid}`,
      expiresAt: expires,
    },
  })

  console.log('')
  console.log('=== Comunidad demo lista ===')
  console.log('Slug login:', DEMO_SLUG, '→ URL /c/' + DEMO_SLUG + '/login')
  console.log('Código acceso comunidad (si aplica en vuestro flujo):', community.accessCode)
  console.log('Parola (DEMO_SEED_PASSWORD o por defecto):', plain === DEMO_PASSWORD_DEFAULT ? '(valor por defecto del script)' : '(desde .env)')
  console.log('Cuentas (misma contraseña si usáis DEMO_SEED_PASSWORD):')
  for (const u of USERS) {
    console.log(`  ${u.email}  —  ${u.role}`)
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
