import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.js'
import { adminCommunitiesRouter } from './routes/admin-communities.js'
import { publicCommunitiesRouter } from './routes/public-communities.js'
import { communityBookingsRouter } from './routes/community-bookings.js'
import { communityResidentsRouter } from './routes/community-residents.js'
import { communityIncidentsRouter } from './routes/community-incidents.js'
import { communityServicesRouter } from './routes/community-services.js'
import { notificationsRouter } from './routes/notifications.js'
import { pushRouter } from './routes/push.js'
import { requireSuperAdmin } from './middleware/require-super-admin.js'
import { scheduleSubscriptionExpiryJob } from './jobs/subscription-expiry.js'
import { attachRealtimeConnections } from './lib/realtime-hub.js'

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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vecindario-api' })
})

app.use('/api/auth', authRouter)
app.use('/api/bookings', communityBookingsRouter)
app.use('/api/incidents', communityIncidentsRouter)
app.use('/api/services', communityServicesRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/push', pushRouter)
app.use('/api/community', communityResidentsRouter)
app.use('/api/public', publicCommunitiesRouter)
app.use('/api/admin/communities', ...requireSuperAdmin, adminCommunitiesRouter)

const port = Number(process.env.PORT || 4001)
const server = http.createServer(app)
attachRealtimeConnections(server)
server.listen(port, () => {
  console.log(`Vecindario API http://localhost:${port}`)
  scheduleSubscriptionExpiryJob()
})
