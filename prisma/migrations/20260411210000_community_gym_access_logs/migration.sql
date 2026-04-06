-- Registros reales de entrada/salida gimnasio (Actividad / Reservas).
CREATE TABLE `community_gym_access_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `vecindario_user_id` INTEGER NULL,
    `tipo` VARCHAR(16) NOT NULL,
    `actor_email` VARCHAR(255) NULL,
    `actor_piso` VARCHAR(64) NULL,
    `actor_portal` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cgym_user_comm_created_idx`(`vecindario_user_id`, `community_id`, `created_at`),
    INDEX `cgym_comm_created_idx`(`community_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `community_gym_access_logs` ADD CONSTRAINT `community_gym_access_logs_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_gym_access_logs` ADD CONSTRAINT `community_gym_access_logs_vecindario_user_id_fkey` FOREIGN KEY (`vecindario_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
