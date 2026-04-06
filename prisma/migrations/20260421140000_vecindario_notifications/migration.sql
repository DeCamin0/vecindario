CREATE TABLE `vecindario_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipient_user_id` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `read_at` DATETIME(3) NULL,
    `service_request_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vn_recipient_created_idx`(`recipient_user_id`, `created_at`),
    INDEX `vn_recipient_read_idx`(`recipient_user_id`, `read_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `vecindario_notifications` ADD CONSTRAINT `vecindario_notifications_recipient_fk` FOREIGN KEY (`recipient_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
