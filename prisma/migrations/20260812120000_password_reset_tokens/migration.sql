-- Recuperación de contraseña (self-serve).
-- 100% ADITIVO: CREATE TABLE only.
-- NO tocar community_billing* ni otras tablas.

CREATE TABLE `password_reset_tokens` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `request_ip` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
  INDEX `prt_user_idx`(`user_id`),
  INDEX `prt_expires_idx`(`expires_at`),
  CONSTRAINT `password_reset_tokens_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `vecindario_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
