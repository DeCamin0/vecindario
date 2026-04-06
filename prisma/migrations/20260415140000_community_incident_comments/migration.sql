-- CreateTable
CREATE TABLE `community_incident_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `incident_id` INTEGER NOT NULL,
    `author_user_id` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cic_incident_created_idx`(`incident_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `community_incident_comments` ADD CONSTRAINT `community_incident_comments_incident_id_fkey` FOREIGN KEY (`incident_id`) REFERENCES `community_incidents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_incident_comments` ADD CONSTRAINT `community_incident_comments_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
