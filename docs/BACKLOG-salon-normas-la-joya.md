# Backlog — Normas salón social (La Joya y similares)

**Estado:** Fase 1 implementada (2026-07-10) — normas, tasas, franjas y antelación por espacio.  
**Comunidad ejemplo:** COMUNIDAD DE PROPIETARIOS LA JOYA — Castillo de Oropesa 1, Las Rozas

## Regulamento de referencia (resumen)

- Uso por propietarios (reuniones / fiestas infantiles); no si hay Junta general ese día.
- Petición por escrito: entre **3 meses** y **1 semana** antes.
- **15 €** uso + **60 €** fianza (devolución si no hay desperfectos).
- Turnos: **12:00–17:00** y **18:00–22:00** (no superar horario).
- Reservas por orden de petición; conflicto mismo día → prioridad al otro el año siguiente.
- Dejar sala limpia; uso infantil comunitario sin pago con mal tiempo (adultos responsables).

## Qué hay hoy en Vecindario

| Regla | Soporte actual |
|-------|----------------|
| Espacio «Salón social» | `customLocations` en Super Admin (+ Añadir espacio) |
| Máx. antelación | `maxDaysInAdvance` por espacio (ej. 90 días ≈ 3 meses) |
| Mín. 1 semana antes | ❌ No (solo pádel tiene `minAdvanceHours`) |
| Franjas 12–17 / 18–22 | ❌ Fijas: mañana 08–12, tarde 12–18, noche 18–22 |
| 15 € / 60 € fianza | ❌ Solo manual fuera de app |
| Petición escrita / aprobación | ❌ Reserva directa confirmada |
| Texto normas en Reservas | ❌ Sin campo |
| Bloqueo Junta / prioridad anual | ❌ |

**Workaround actual:** espacio custom + 90 días + modo franjas; vecinos usan solo Tarde/Noche; pagos y normas por administración.

## Implementación propuesta (fases)

### Fase 1 — Config por espacio (JSON `customLocations`)

Campos nuevos sugeridos:

- `minDaysInAdvance` (7)
- `rulesText` (markdown o texto plano)
- `usageFeeEur`, `depositEur` (informativos)
- `timeSlots`: `[{ id, label, start, end }]` — ej. 12:00–17:00, 18:00–22:00

UI: mostrar normas y tasas en web + móvil antes de confirmar; validar ventana 7–90 días en API.

### Fase 2 — Flujo administrativo

- Estado reserva: `pendiente` → `confirmada` / `rechazada`
- Notificación a presidente/admin; nota «petición por escrito»

### Fase 3 — Reglas avanzadas

- Días bloqueados (Junta general)
- Historial conflicto / prioridad año siguiente
- Tipo «uso infantil comunidad» (sin pago, solo staff)

## Archivos a tocar (Fase 1)

- `server/src/lib/custom-locations.ts`, `public-communities.ts`
- `vecindario-app/src/pages/Admin.jsx` (form espacios)
- `vecindario-app/src/pages/Bookings.jsx`, `utils/salonBookingDates.js`
- `vecindario-mobile/src/bookings/bookingLogic.ts`, `BookingsScreen.tsx`
- Validación en `server/src/routes/community-bookings.ts`
