-- Cuaderno diario (conserje) + pestaña en app
ALTER TABLE `communities`
  ADD COLUMN `app_nav_cuaderno_diario_enabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `community_diario_entries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_id` INTEGER NOT NULL,
  `entry_date` DATE NOT NULL,
  `start_minute` INTEGER NOT NULL,
  `description` TEXT NOT NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `created_by_name` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `cdiario_comm_date_min_idx`(`community_id`, `entry_date`, `start_minute`),
  INDEX `cdiario_created_by_idx`(`created_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `community_diario_entries`
  ADD CONSTRAINT `community_diario_entries_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_diario_entries`
  ADD CONSTRAINT `community_diario_entries_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
