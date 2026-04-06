-- Dirección opcional de la comunidad (ficha Super Admin).
ALTER TABLE `communities`
  ADD COLUMN `address` VARCHAR(512) NULL;
