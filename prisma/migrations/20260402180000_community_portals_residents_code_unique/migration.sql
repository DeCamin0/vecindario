-- AlterTable
ALTER TABLE `communities`
    ADD COLUMN `portal_count` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `resident_slots` INTEGER NULL;

-- CreateIndex (códigos únicos para acceso por comunidad)
CREATE UNIQUE INDEX `communities_access_code_key` ON `communities`(`access_code`);
