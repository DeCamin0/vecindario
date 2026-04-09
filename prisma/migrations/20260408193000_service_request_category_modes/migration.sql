-- Modos por categoría de solicitud de servicio (super admin).
ALTER TABLE `communities`
ADD COLUMN `service_request_category_modes_json` JSON NOT NULL DEFAULT (JSON_OBJECT());
