# Perfil → Ayuda (Ayuda v1)

**Estado:** implementado (web + móvil).  
**Última actualización:** 2026-05-20

## Objetivo

Centro de orientación para vecinos y personal de la finca: **a quién escribir**, **FAQ corto**, **reportar problema** y enlace a privacidad. No sustituye a Inicio ni a Notificaciones.

## Rutas y archivos

| Capa | Ubicación |
|------|-----------|
| Web UI | `src/pages/ProfileHelp.jsx`, `ProfileHelp.css` |
| Textos FAQ (web) | `src/content/profileHelpContent.js` |
| API contactos | `GET /api/auth/help-context` en `server/src/routes/auth.ts` |
| Email distribuidor (servidor) | `VECINDARIO_DISTRIBUTOR_EMAIL` → `server/src/lib/distributor-contact.ts` |
| Email distribuidor (web build) | `VITE_VECINDARIO_DISTRIBUTOR_EMAIL` → `src/config/distributorContact.js` |
| Móvil UI | `vecindario-mobile/src/screens/ProfileHelpScreen.tsx` |
| Textos FAQ (móvil) | `vecindario-mobile/src/content/profileHelpContent.ts` — **mantener alineado con web** |

## API `GET /api/auth/help-context`

Requiere JWT. Respuesta ejemplo:

```json
{
  "userRole": "resident",
  "communityName": "Officina - …",
  "contacts": {
    "contactEmail": "…",
    "conciergeEmail": "…",
    "communityAdminEmail": "…"
  },
  "distributorEmail": "vecindario@decaminoservicios.com"
}
```

Solo comunidades **operativas** (`communityOperationalWhere`). Sin `communityId` (p. ej. super_admin): `communityName` null, contactos vacíos; el cliente usa siempre `distributorEmail`.

## Bloques de contacto (orden fijo)

Definidos en `PROFILE_HELP_CONTACT_BLOCKS` (`profileHelpContent.js`):

1. Conserjería → `contacts.conciergeEmail`
2. Administración / presidente → `contacts.communityAdminEmail`
3. Contacto general comunidad → `contacts.contactEmail`
4. Distribuidor → `distributorEmail` (env)

Si falta email en ficha: mensaje «Sin correo en la ficha» (no ocultar el bloque).

## FAQ

- **Todos:** `PROFILE_HELP_FAQ_RESIDENT` (acceso, contraseña, reservas, paquetería, notificaciones, piscina).
- **Staff** (`concierge`, `community_admin`, `president`, `pool_staff`, `super_admin`): añade `PROFILE_HELP_FAQ_STAFF`.

En web, el ítem Notificaciones enlaza a `/profile/notificaciones` en lugar de texto duplicado.

## Reportar problema

`mailto:` al distribuidor con asunto `Vecindario — Reporte de problema` y cuerpo con comunidad, rol, versión y usuario.

## Cómo ampliar en el futuro (sin romper v1)

### v2 — Datos por comunidad en BD

- Campos opcionales en `Community`: `helpPhone`, `helpHours`, `helpNotesJson`.
- Extender `help-context` con esos campos.
- UI: mostrar teléfono con `tel:` y horario bajo cada bloque.

### v2 — FAQ editable

- Tabla `community_help_faq` o JSON en comunidad.
- Admin edita desde panel; `help-context` devuelve `faqs[]`.
- Mantener FAQ por defecto en `profileHelpContent.js` como fallback.

### v3 — Incidencias «Ayuda app»

- Botón que abre incidencia precategorizada (`category: app_support`) en lugar de solo mailto.

### v3 — WhatsApp

- Ver `docs/NOTES-whatsapp-openwa.md`; en Ayuda, enlace al bloque informativo o contacto distribuidor.

### i18n

- Hoy todo en español. Para catalán/inglés: extraer strings a `profileHelpContent.*` por locale.

## Checklist al cambiar Ayuda

- [ ] Actualizar `profileHelpContent.js` y `profileHelpContent.ts` (móvil)
- [ ] Si nuevos campos API: migración Prisma + `help-context` + tipos móvil
- [ ] Probar roles: `resident`, `concierge`, `president`, sin comunidad (`super_admin`)
- [ ] Actualizar esta doc y fecha «Última actualización»

## Relacionado

- `docs/NOTES-whatsapp-openwa.md` — WhatsApp opcional vía distribuidor
- Perfil → Notificaciones — preferencias push/email (no duplicar en FAQ salvo enlace)
