/**
 * Ejecución manual: marcar inactive las comunidades active con plan vencido.
 * Uso: npm run subscription:expire-once (desde server/)
 */
import { runSubscriptionExpiryOnce } from '../jobs/subscription-expiry.js'

runSubscriptionExpiryOnce()
  .then((n) => {
    console.log(`Comunidades actualizadas a inactive: ${n}`)
    process.exit(0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
