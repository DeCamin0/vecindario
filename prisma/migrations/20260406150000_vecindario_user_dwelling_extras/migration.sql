-- AlterTable
ALTER TABLE `vecindario_users`
  ADD COLUMN `phone` VARCHAR(40) NULL,
  ADD COLUMN `puerta` VARCHAR(64) NULL,
  ADD COLUMN `habitaciones` VARCHAR(64) NULL,
  ADD COLUMN `plaza_garaje` VARCHAR(64) NULL,
  ADD COLUMN `pool_access_owner` VARCHAR(64) NULL,
  ADD COLUMN `pool_access_guest` VARCHAR(64) NULL;
