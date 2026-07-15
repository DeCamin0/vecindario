-- AlterTable: tipo de empresa + segunda vinculación prestador de servicios por comunidad
ALTER TABLE `companies`
  ADD COLUMN `kind` ENUM('administracion', 'prestacion_servicios') NOT NULL DEFAULT 'administracion';

ALTER TABLE `communities`
  ADD COLUMN `service_provider_company_id` INTEGER NULL;

CREATE INDEX `communities_service_provider_company_id_idx`
  ON `communities`(`service_provider_company_id`);

ALTER TABLE `communities`
  ADD CONSTRAINT `communities_service_provider_company_id_fkey`
  FOREIGN KEY (`service_provider_company_id`) REFERENCES `companies`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
