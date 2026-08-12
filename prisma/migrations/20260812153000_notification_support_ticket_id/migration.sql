-- Additive: deep-link Soporte desde notificaciones in-app.
-- No DROP / no MODIFY destructivo.

ALTER TABLE `vecindario_notifications`
  ADD COLUMN `support_ticket_id` INTEGER NULL AFTER `parcel_id`,
  ADD INDEX `vn_support_ticket_idx`(`support_ticket_id`);

ALTER TABLE `vecindario_notifications`
  ADD CONSTRAINT `vecindario_notifications_support_ticket_id_fkey`
    FOREIGN KEY (`support_ticket_id`) REFERENCES `support_tickets`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
