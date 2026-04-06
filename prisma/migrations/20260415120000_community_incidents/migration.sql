-- CreateTable
CREATE TABLE `community_incidents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `reporter_user_id` INTEGER NOT NULL,
    `category_id` VARCHAR(64) NOT NULL,
    `category_label` VARCHAR(128) NOT NULL,
    `description` TEXT NOT NULL,
    `location_text` VARCHAR(512) NOT NULL,
    `portal_label` VARCHAR(128) NULL,
    `urgency` VARCHAR(16) NOT NULL DEFAULT 'medium',
    `status` VARCHAR(32) NOT NULL DEFAULT 'pendiente',
    `resolved_at` DATETIME(3) NULL,
    `resolved_by_user_id` INTEGER NULL,
    `photo_mime` VARCHAR(64) NULL,
    `photo_base64` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ci_comm_status_created_idx`(`community_id`, `status`, `created_at`),
    INDEX `ci_reporter_idx`(`reporter_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `community_incidents` ADD CONSTRAINT `community_incidents_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_incidents` ADD CONSTRAINT `community_incidents_reporter_user_id_fkey` FOREIGN KEY (`reporter_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_incidents` ADD CONSTRAINT `community_incidents_resolved_by_user_id_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
