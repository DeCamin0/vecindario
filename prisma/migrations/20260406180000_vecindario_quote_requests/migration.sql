-- CreateTable
CREATE TABLE `vecindario_quote_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `contact_name` VARCHAR(255) NOT NULL,
    `contact_email` VARCHAR(255) NOT NULL,
    `contact_phone` VARCHAR(64) NULL,
    `community_name` VARCHAR(255) NOT NULL,
    `community_address` VARCHAR(512) NULL,
    `dwelling_approx` VARCHAR(64) NULL,
    `message` TEXT NULL,
    `want_services` BOOLEAN NOT NULL DEFAULT true,
    `want_incidents` BOOLEAN NOT NULL DEFAULT true,
    `want_bookings` BOOLEAN NOT NULL DEFAULT true,
    `want_pool_access` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(32) NOT NULL DEFAULT 'new',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `vqr_created_idx` ON `vecindario_quote_requests`(`created_at`);
