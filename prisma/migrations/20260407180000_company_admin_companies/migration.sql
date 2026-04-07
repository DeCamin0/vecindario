-- Empresas, company_admin en users, comunidades opcionalmente ligadas a empresa.

CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `communities` ADD COLUMN `company_id` INTEGER NULL;

CREATE INDEX `communities_company_id_idx` ON `communities`(`company_id`);

ALTER TABLE `communities` ADD CONSTRAINT `communities_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `vecindario_users` ADD COLUMN `company_admin_company_id` INTEGER NULL;

CREATE INDEX `vecindario_users_company_admin_company_idx` ON `vecindario_users`(`company_admin_company_id`);

ALTER TABLE `vecindario_users` ADD CONSTRAINT `vecindario_users_company_admin_company_id_fkey` FOREIGN KEY (`company_admin_company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `vecindario_users` MODIFY COLUMN `role` ENUM('resident', 'community_admin', 'company_admin', 'president', 'super_admin', 'concierge') NOT NULL DEFAULT 'resident';
