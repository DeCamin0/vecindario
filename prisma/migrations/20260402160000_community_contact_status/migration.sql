-- AlterTable
ALTER TABLE `communities` ADD COLUMN `contact_email` VARCHAR(255) NULL,
    ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'active';
