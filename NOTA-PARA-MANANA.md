# Nota — acceso por slug (implementado)

Ya está en el código:

- Campo **`loginSlug`** en comunidad (único, opcional) + migración `20260410120000_community_login_slug`.
- **`GET /api/public/community-by-slug?slug=...`** — devuelve `id`, `name`, `accessCode`, etc.
- Ruta SPA: **`/vecindario/c/:loginSlug/login`** — resuelve la comunidad sin escribir VEC.
- Super Admin: campo slug, enlace completo en la tarjeta, **Copiar** y **QR** (PNG).
- Variable opcional: **`VITE_PUBLIC_APP_ORIGIN`** para dominio correcto en enlaces/QR en producción (ver `.env.example`).

**Pendiente en servidor:** `npx prisma migrate deploy` (desde `vecindario-app`) en cada entorno.
