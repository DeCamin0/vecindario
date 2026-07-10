ALTER TABLE `communities`
  ADD COLUMN `paqueteria_key_loans_enabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `community_key_loans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_id` INTEGER NOT NULL,
  `key_reference` VARCHAR(120) NOT NULL,
  `borrower_name` VARCHAR(255) NOT NULL,
  `handed_out_at` DATETIME(3) NOT NULL,
  `returned_at` DATETIME(3) NULL,
  `notes` VARCHAR(512) NULL,
  `portal` VARCHAR(64) NULL,
  `piso` VARCHAR(64) NULL,
  `puerta` VARCHAR(64) NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `created_by_name` VARCHAR(255) NULL,
  `returned_by_user_id` INTEGER NULL,
  `returned_by_name` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `ckl_comm_handout_idx`(`community_id`, `handed_out_at`),
  INDEX `ckl_comm_return_idx`(`community_id`, `returned_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `community_key_loans`
  ADD CONSTRAINT `community_key_loans_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_key_loans`
  ADD CONSTRAINT `community_key_loans_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `community_key_loans`
  ADD CONSTRAINT `community_key_loans_returned_by_user_id_fkey`
    FOREIGN KEY (`returned_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
