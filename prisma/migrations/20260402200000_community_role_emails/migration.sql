-- AlterTable
ALTER TABLE `communities`
    ADD COLUMN `president_email` VARCHAR(255) NULL,
    ADD COLUMN `community_admin_email` VARCHAR(255) NULL;
