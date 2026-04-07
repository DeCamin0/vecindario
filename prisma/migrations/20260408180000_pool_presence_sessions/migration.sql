ALTER TABLE `communities`
  ADD COLUMN `pool_max_occupancy` INT NULL;

CREATE TABLE `pool_presence_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `community_id` INT NOT NULL,
  `resident_user_id` INT NOT NULL,
  `pass_code` VARCHAR(24) NOT NULL,
  `people_count` INT NOT NULL,
  `validator_user_id` INT NOT NULL,
  `admitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `released_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  INDEX `pool_presence_sessions_community_id_released_at_idx` (`community_id`, `released_at`),
  INDEX `pool_presence_sessions_resident_community_released_idx` (`resident_user_id`, `community_id`, `released_at`),
  CONSTRAINT `pool_presence_sessions_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pool_presence_sessions_resident_user_id_fkey` FOREIGN KEY (`resident_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pool_presence_sessions_validator_user_id_fkey` FOREIGN KEY (`validator_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
