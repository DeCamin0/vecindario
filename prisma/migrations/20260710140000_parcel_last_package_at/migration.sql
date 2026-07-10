-- Historial de último bulto registrado (actualización de package_count en conserjería).
ALTER TABLE `community_concierge_parcels`
  ADD COLUMN `last_package_at` DATETIME(3) NULL,
  ADD COLUMN `last_package_by_user_id` INTEGER NULL,
  ADD COLUMN `last_package_by_name` VARCHAR(255) NULL;

UPDATE `community_concierge_parcels`
SET `last_package_at` = `created_at`
WHERE `last_package_at` IS NULL;
