-- Reservas multi-espacio: día + minutos (cualquier tramo en el mismo día natural)
CREATE TABLE `community_bookings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `community_id` INT NOT NULL,
  `facility_id` VARCHAR(120) NOT NULL,
  `facility_name` VARCHAR(255) NULL,
  `booking_date` DATE NOT NULL,
  `start_minute` INT NOT NULL,
  `end_minute` INT NOT NULL,
  `slot_key` VARCHAR(128) NULL,
  `slot_label` VARCHAR(255) NULL,
  `vecindario_user_id` INT NULL,
  `actor_email` VARCHAR(255) NULL,
  `actor_piso` VARCHAR(64) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'confirmed',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `cb_comm_facility_date_start` (`community_id`, `facility_id`, `booking_date`, `start_minute`),
  INDEX `cb_comm_date_idx` (`community_id`, `booking_date`),
  CONSTRAINT `community_bookings_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `community_bookings_vecindario_user_id_fkey` FOREIGN KEY (`vecindario_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
