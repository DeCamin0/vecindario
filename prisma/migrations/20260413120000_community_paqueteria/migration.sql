-- Paquetería / conserjería (pestaña opcional + tabla de paquetes)
ALTER TABLE `communities`
  ADD COLUMN `app_nav_paqueteria_enabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `community_concierge_parcels` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_id` INTEGER NOT NULL,
  `portal` VARCHAR(64) NOT NULL,
  `piso` VARCHAR(64) NOT NULL,
  `puerta` VARCHAR(64) NOT NULL,
  `recipient_user_id` INTEGER NOT NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `photos_json` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `status` VARCHAR(32) NOT NULL DEFAULT 'awaiting_pickup',
  `signature_image` LONGTEXT NULL,
  `picked_up_at` DATETIME(3) NULL,
  `picked_up_by_role` VARCHAR(24) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `ccp_comm_status_idx` (`community_id`, `status`),
  INDEX `ccp_recipient_status_idx` (`recipient_user_id`, `status`),
  CONSTRAINT `community_concierge_parcels_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `community_concierge_parcels_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `community_concierge_parcels_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
