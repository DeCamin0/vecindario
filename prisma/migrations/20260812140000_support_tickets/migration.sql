-- Soporte / Tickets (self-serve + inbox Super Admin).
-- 100% ADITIVO: CREATE TABLE only.

CREATE TABLE `support_tickets` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `created_by_user_id` INTEGER NOT NULL,
  `community_id` INTEGER NULL,
  `company_id` INTEGER NULL,
  `area` VARCHAR(64) NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'open',
  `priority` VARCHAR(16) NOT NULL DEFAULT 'normal',
  `last_message_at` DATETIME(3) NOT NULL,
  `user_last_read_at` DATETIME(3) NULL,
  `staff_last_read_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `st_creator_updated_idx`(`created_by_user_id`, `updated_at`),
  INDEX `st_status_last_msg_idx`(`status`, `last_message_at`),
  INDEX `st_community_idx`(`community_id`),
  INDEX `st_area_idx`(`area`),
  INDEX `st_priority_idx`(`priority`),
  CONSTRAINT `support_tickets_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `vecindario_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `support_tickets_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `support_tickets_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_ticket_messages` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `ticket_id` INTEGER NOT NULL,
  `author_user_id` INTEGER NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `stm_ticket_created_idx`(`ticket_id`, `created_at`),
  INDEX `stm_author_idx`(`author_user_id`),
  CONSTRAINT `support_ticket_messages_ticket_id_fkey`
    FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `support_ticket_messages_author_user_id_fkey`
    FOREIGN KEY (`author_user_id`) REFERENCES `vecindario_users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
