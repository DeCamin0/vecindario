-- Subtipo de servicio (p. ej. tipos de limpieza).
ALTER TABLE `community_service_requests`
ADD COLUMN `service_subtype` VARCHAR(64) NULL AFTER `category_label`;
