-- Pestaña «Acceso piscina» en la app vecinos (opcional por comunidad)
ALTER TABLE `communities`
  ADD COLUMN `app_nav_pool_access_enabled` BOOLEAN NOT NULL DEFAULT false;
