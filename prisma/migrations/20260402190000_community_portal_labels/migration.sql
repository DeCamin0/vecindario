-- AlterTable (filas existentes: rellenar antes de NOT NULL)
ALTER TABLE `communities` ADD COLUMN `portal_labels` JSON NULL;
UPDATE `communities` SET `portal_labels` = '[]' WHERE `portal_labels` IS NULL;
ALTER TABLE `communities` MODIFY COLUMN `portal_labels` JSON NOT NULL;
