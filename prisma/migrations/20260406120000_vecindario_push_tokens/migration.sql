-- Push: Expo tokens + Web Push subscriptions (Vecindario only)

CREATE TABLE `vecindario_expo_push_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `token` VARCHAR(512) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `vept_user_token_uidx` (`user_id`, `token`),
  INDEX `vept_user_idx` (`user_id`),
  CONSTRAINT `vept_user_fk` FOREIGN KEY (`user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `vecindario_web_push_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `endpoint_key` VARCHAR(64) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dh` TEXT NOT NULL,
  `auth` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `vecindario_web_push_subscriptions_endpoint_key_key` (`endpoint_key`),
  INDEX `vwps_user_idx` (`user_id`),
  CONSTRAINT `vwps_user_fk` FOREIGN KEY (`user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
