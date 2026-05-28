-- Reserva hecha por conserje/gestión en nombre de un vecino: quién la registró.
ALTER TABLE `community_bookings`
  ADD COLUMN `booked_by_user_id` INT NULL AFTER `vecindario_user_id`,
  ADD COLUMN `booked_by_name` VARCHAR(255) NULL AFTER `booked_by_user_id`,
  ADD INDEX `cb_booked_by_user_idx` (`booked_by_user_id`),
  ADD CONSTRAINT `community_bookings_booked_by_user_id_fkey`
    FOREIGN KEY (`booked_by_user_id`) REFERENCES `vecindario_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
