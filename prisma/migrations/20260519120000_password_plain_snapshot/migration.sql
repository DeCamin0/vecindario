-- Última contraseña asignada por alta/reset (solo lectura super admin; no es recuperación del hash).
ALTER TABLE `vecindario_users` ADD COLUMN `password_plain_snapshot` VARCHAR(255) NULL;
