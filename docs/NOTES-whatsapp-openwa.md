# Notă internă: WhatsApp și OpenWA (viitor)

**Status:** doar referință — **nu** e integrat în Vecindario.  
**Ultima revizuire:** 2026-05-20

## Context în produs

- Canalele actuale de avisos: **web push**, **app móvil (Expo)**, **email** (`notify_*` en `vecindario_users`).
- En Perfil → Notificaciones hay un bloque informativo: WhatsApp = **servicio opcional** vía distribuidor (`VITE_VECINDARIO_DISTRIBUTOR_EMAIL`).

## Repositorio de referencia: OpenWA

| | |
| --- | --- |
| **URL** | https://github.com/rmyndharis/OpenWA |
| **Qué es** | Gateway **self-hosted**, open source (MIT): API REST + dashboard + webhooks sobre **whatsapp-web.js** (no API oficial Meta). |
| **Uso típico** | Crear sesión → escanear QR → enviar/recibir mensajes por HTTP; multi-sesión; Docker. |
| **Puertos dev** | API `2785`, dashboard `2886` (ver README del repo). |
| **Relación** | No confundir con el paquete npm antiguo `@open-wa/wa-automate` — este proyecto es un gateway NestJS más reciente (2026). |

## Por qué podría servir a Vecindario (más adelante)

- Piloto de **avisos WhatsApp** (paquetería, reservas, incidencias) para una comunidad o un número del distribuidor.
- Arquitectura natural: **servicio aparte** (contenedor OpenWA) + webhooks → `vecindario-app` server, no dentro del mismo proceso que Prisma.

## Riesgos / límites (recordar antes de implementar)

1. **No oficial** — violación potencial de ToS de WhatsApp; riesgo de **ban** del número.
2. **Fragilidad** — cambios en WhatsApp Web rompen el motor hasta actualizar dependencias.
3. **Operación** — QR, rotación de sesión, API keys, un VPS más que mantener.
4. **Legal** — opt-in explícito por vecino (GDPR / anti-spam); no sustituir push/email sin consentimiento.
5. **Escala** — para muchas comunidades y volumen alto, valorar **WhatsApp Business Cloud API** (oficial, de pago).

## Alternativa a largo plazo

- **Meta WhatsApp Cloud API** o proveedor (Twilio, 360dialog, etc.): más estable y compliant, templates aprobados, coste por conversación.

## Siguiente paso sugerido (cuando se decida)

1. POC con Docker en VPS de prueba + 1 comunidad.
2. Definir número (comunidad vs distribuidor), plantillas de mensaje y opt-in en BD.
3. Endpoint interno en Vecindario que llame a OpenWA solo si el vecino tiene flag/consentimiento.
4. No activar en producción masiva hasta validar estabilidad 2–4 semanas.

## Enlaces útiles

- README: https://github.com/rmyndharis/OpenWA/blob/main/README.md
- Docs del repo: carpeta `docs/` en el mismo repositorio
- UI producto: `src/pages/ProfileNotifications.jsx`, `src/config/distributorContact.js`
- Ayuda / contacto distribuidor: `docs/PROFILE-AYUDA.md`, `src/pages/ProfileHelp.jsx`
