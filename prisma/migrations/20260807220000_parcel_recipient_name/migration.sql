-- Nombre del destinatario (opcional) al registrar un paquete.
ALTER TABLE `community_concierge_parcels` ADD COLUMN `recipient_name` VARCHAR(255) NULL;
