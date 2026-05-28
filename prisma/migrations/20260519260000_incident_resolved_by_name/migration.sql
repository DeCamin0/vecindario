ALTER TABLE `community_incidents`
  ADD COLUMN `resolved_by_name` VARCHAR(255) NULL AFTER `resolved_by_user_id`;
