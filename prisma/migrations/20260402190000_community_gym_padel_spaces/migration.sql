-- AlterTable
ALTER TABLE `communities`
    ADD COLUMN `gym_access_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `padel_court_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `custom_locations` JSON NOT NULL DEFAULT (JSON_ARRAY());
