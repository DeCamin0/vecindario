-- Vecinos sin email + enlace a comunidad (portal/piso + VEC en login).

ALTER TABLE `vecindario_users` ADD COLUMN `community_id` INT NULL;

CREATE INDEX `vecindario_users_community_id_idx` ON `vecindario_users`(`community_id`);

ALTER TABLE `vecindario_users` ADD CONSTRAINT `vecindario_users_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `vecindario_users` MODIFY `email` VARCHAR(255) NULL;
