CREATE TABLE `community_service_request_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `service_request_id` INT NOT NULL,
  `author_user_id` INT NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `csrm_req_created_idx` (`service_request_id`, `created_at`),
  CONSTRAINT `csrm_service_request_fk` FOREIGN KEY (`service_request_id`) REFERENCES `community_service_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `csrm_author_user_fk` FOREIGN KEY (`author_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
