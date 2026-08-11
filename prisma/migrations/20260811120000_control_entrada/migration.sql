-- Control de entrada/salida de personas + pestaña en app
ALTER TABLE `communities`
  ADD COLUMN `app_nav_control_entrada_enabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `community_control_entrada_entries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_id` INTEGER NOT NULL,
  `entry_date` DATE NOT NULL,
  `nombre` VARCHAR(255) NOT NULL,
  `identificacion` VARCHAR(255) NOT NULL,
  `hora_entrada_minute` INTEGER NOT NULL,
  `hora_salida_minute` INTEGER NULL,
  `ubicacion` VARCHAR(255) NOT NULL,
  `motivo` TEXT NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `created_by_name` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `cce_comm_date_idx`(`community_id`, `entry_date`),
  INDEX `cce_created_by_idx`(`created_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `community_control_entrada_entries`
  ADD CONSTRAINT `community_control_entrada_entries_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_control_entrada_entries`
  ADD CONSTRAINT `community_control_entrada_entries_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
