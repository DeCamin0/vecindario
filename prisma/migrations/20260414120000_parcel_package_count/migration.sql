-- Cantidad de bultos por registro (p. ej. varios paquetes a la vez).
ALTER TABLE `community_concierge_parcels`
  ADD COLUMN `package_count` INTEGER NOT NULL DEFAULT 1;
