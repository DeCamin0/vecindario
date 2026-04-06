-- CreateTable
CREATE TABLE `community_service_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `requester_user_id` INTEGER NOT NULL,
    `category_id` VARCHAR(64) NOT NULL,
    `category_label` VARCHAR(128) NOT NULL,
    `description` TEXT NOT NULL,
    `preferred_date` DATE NULL,
    `photos_json` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending_review',
    `price_amount` DECIMAL(12, 2) NULL,
    `price_note` TEXT NULL,
    `price_sent_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `provider_name` VARCHAR(255) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `csr_comm_status_created_idx`(`community_id`, `status`, `created_at` DESC),
    INDEX `csr_requester_idx`(`requester_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `community_service_requests` ADD CONSTRAINT `community_service_requests_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_service_requests` ADD CONSTRAINT `community_service_requests_requester_user_id_fkey` FOREIGN KEY (`requester_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
