-- Pool access MVP: community flags, passes, validation logs, pool_staff role

ALTER TABLE `vecindario_users`
  MODIFY COLUMN `role` ENUM(
    'resident',
    'community_admin',
    'company_admin',
    'president',
    'super_admin',
    'concierge',
    'pool_staff'
  ) NOT NULL DEFAULT 'resident';

ALTER TABLE `communities`
  ADD COLUMN `pool_access_system_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `pool_season_active` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `pool_season_start` DATE NULL,
  ADD COLUMN `pool_season_end` DATE NULL,
  ADD COLUMN `pool_hours_note` VARCHAR(255) NULL;

CREATE TABLE `pool_access_passes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `community_id` INTEGER NOT NULL,
    `code` VARCHAR(24) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pool_access_passes_code_key`(`code`),
    INDEX `pool_access_passes_community_id_idx`(`community_id`),
    INDEX `pool_access_passes_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `pool_access_validation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `resident_user_id` INTEGER NOT NULL,
    `validator_user_id` INTEGER NOT NULL,
    `outcome` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pool_access_validation_logs_community_id_created_at_idx`(`community_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pool_access_passes`
  ADD CONSTRAINT `pool_access_passes_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `pool_access_passes_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `pool_access_validation_logs`
  ADD CONSTRAINT `pool_access_validation_logs_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `pool_access_validation_logs_resident_user_id_fkey`
    FOREIGN KEY (`resident_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `pool_access_validation_logs_validator_user_id_fkey`
    FOREIGN KEY (`validator_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
