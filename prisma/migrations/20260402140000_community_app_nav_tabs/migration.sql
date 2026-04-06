-- Pestañas visibles en la app vecinos por comunidad (despliegue progresivo).
ALTER TABLE `communities`
  ADD COLUMN `app_nav_services_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `app_nav_incidents_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `app_nav_bookings_enabled` BOOLEAN NOT NULL DEFAULT TRUE;
