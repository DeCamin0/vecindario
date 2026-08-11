-- AlterTable
ALTER TABLE `community_diario_entries` ADD COLUMN `updated_by_user_id` INTEGER NULL,
    ADD COLUMN `updated_by_name` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `community_control_entrada_entries` ADD COLUMN `updated_by_user_id` INTEGER NULL,
    ADD COLUMN `updated_by_name` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `cdiario_updated_by_idx` ON `community_diario_entries`(`updated_by_user_id`);

-- CreateIndex
CREATE INDEX `cce_updated_by_idx` ON `community_control_entrada_entries`(`updated_by_user_id`);

-- AddForeignKey
ALTER TABLE `community_diario_entries` ADD CONSTRAINT `community_diario_entries_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_control_entrada_entries` ADD CONSTRAINT `community_control_entrada_entries_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
