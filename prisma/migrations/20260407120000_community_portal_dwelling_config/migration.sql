-- Plantas / puertas por portal (JSON array, misma longitud lógica que portal_count).
ALTER TABLE `communities` ADD COLUMN `portal_dwelling_config` JSON NULL;
UPDATE `communities` SET `portal_dwelling_config` = '[]' WHERE `portal_dwelling_config` IS NULL;
ALTER TABLE `communities` MODIFY COLUMN `portal_dwelling_config` JSON NOT NULL;
