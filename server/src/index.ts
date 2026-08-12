import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.js'
import { adminCommunitiesRouter } from './routes/admin-communities.js'
import { adminCompaniesRouter } from './routes/admin-companies.js'
import { companyCommunitiesRouter } from './routes/company-communities.js'
import { requireCompanyAdmin } from './middleware/require-company-admin.js'
import { publicCommunitiesRouter } from './routes/public-communities.js'
import { communityBookingsRouter } from './routes/community-bookings.js'
import { communityResidentsRouter } from './routes/community-residents.js'
import { communityParcelsRouter } from './routes/community-parcels.js'
import { communityKeyLoansRouter } from './routes/community-key-loans.js'
import { communityDiarioRouter } from './routes/community-diario.js'
import { communityControlEntradaRouter } from './routes/community-control-entrada.js'
import { communityIncidentsRouter } from './routes/community-incidents.js'
import { communityServicesRouter } from './routes/community-services.js'
import { notificationsRouter } from './routes/notifications.js'
import { pushRouter } from './routes/push.js'
import { requireSuperAdmin } from './middleware/require-super-admin.js'
import { requireAdminCommunitiesAccess } from './middleware/require-admin-communities-access.js'
import { scheduleSubscriptionExpiryJob } from './jobs/subscription-expiry.js'
import { attachRealtimeConnections } from './lib/realtime-hub.js'
import { poolAccessRouter } from './routes/pool-access.js'
import { adminQuoteRequestsRouter } from './routes/quote-requests-admin.js'
import { adminBillingRouter } from './routes/admin-billing.js'
import { supportRouter } from './routes/support.js'
import { adminSupportRouter } from './routes/admin-support.js'
import { resolveAvatarFile } from './lib/profile-avatar.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const app = express()

const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use(
  cors({
    origin: corsOrigins?.length ? corsOrigins : true,
    credentials: true,
  }),
)
app.use(express.json({ limit: '4mb' }))

/** Avatar GET: R2 when profile_image_storage_key is set, else disk under uploads/avatars. */
app.get('/api/uploads/avatars/:file', async (req, res) => {
  const file = String(req.params.file || '')
  try {
    const resolved = await resolveAvatarFile(file)
    if (!resolved) {
      res.status(404).end()
      return
    }
    res.setHeader('Content-Type', resolved.contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800')
    res.send(resolved.buffer)
  } catch (e) {
    console.error('[avatar serve]', e)
    res.status(500).end()
  }
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vecindario-api' })
})

app.use('/api/auth', authRouter)
app.use('/api/pool-access', poolAccessRouter)
app.use('/api/bookings', communityBookingsRouter)
app.use('/api/incidents', communityIncidentsRouter)
app.use('/api/services', communityServicesRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/push', pushRouter)
app.use('/api/community', communityResidentsRouter)
app.use('/api/community', communityParcelsRouter)
app.use('/api/community', communityKeyLoansRouter)
app.use('/api/community', communityDiarioRouter)
app.use('/api/community', communityControlEntradaRouter)
app.use('/api/public', publicCommunitiesRouter)
app.use('/api/admin/communities', ...requireAdminCommunitiesAccess, adminCommunitiesRouter)
app.use('/api/admin/companies', ...requireSuperAdmin, adminCompaniesRouter)
app.use('/api/admin/quote-requests', ...requireSuperAdmin, adminQuoteRequestsRouter)
app.use('/api/admin/billing', ...requireSuperAdmin, adminBillingRouter)
app.use('/api/admin/support', ...requireSuperAdmin, adminSupportRouter)
app.use('/api/support', supportRouter)
app.use('/api/company/communities', ...requireCompanyAdmin, companyCommunitiesRouter)

const port = Number(process.env.PORT || 4001)
const server = http.createServer(app)
attachRealtimeConnections(server)
server.listen(port, () => {
  console.log(`Vecindario API http://localhost:${port}`)
  scheduleSubscriptionExpiryJob()
})
