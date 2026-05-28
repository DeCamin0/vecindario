ALTER TABLE `community_concierge_parcels`
  ADD COLUMN `created_by_name` VARCHAR(255) NULL AFTER `created_by_user_id`,
  ADD COLUMN `picked_up_by_user_id` INT NULL AFTER `picked_up_at`,
  ADD COLUMN `picked_up_by_name` VARCHAR(255) NULL AFTER `picked_up_by_user_id`,
  ADD INDEX `ccp_picked_up_by_user_idx` (`picked_up_by_user_id`),
  ADD CONSTRAINT `community_concierge_parcels_picked_up_by_user_id_fkey`
    FOREIGN KEY (`picked_up_by_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
