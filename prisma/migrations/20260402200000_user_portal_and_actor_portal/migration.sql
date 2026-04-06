-- AlterTable vecindario_users: portal separado de piso
ALTER TABLE `vecindario_users` ADD COLUMN `portal` VARCHAR(64) NULL;

-- AlterTable community_bookings
ALTER TABLE `community_bookings` ADD COLUMN `actor_portal` VARCHAR(64) NULL;
