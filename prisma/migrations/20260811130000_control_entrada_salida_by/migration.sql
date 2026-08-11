-- Quién marcó la salida en control de entrada
ALTER TABLE `community_control_entrada_entries`
  ADD COLUMN `salida_by_user_id` INTEGER NULL,
  ADD COLUMN `salida_by_name` VARCHAR(255) NULL;

CREATE INDEX `cce_salida_by_idx` ON `community_control_entrada_entries`(`salida_by_user_id`);

ALTER TABLE `community_control_entrada_entries`
  ADD CONSTRAINT `community_control_entrada_entries_salida_by_user_id_fkey`
    FOREIGN KEY (`salida_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
