-- staff = validado por socorrista; self = autoregistro vecino (QR en puerta / enlace)
ALTER TABLE `pool_presence_sessions`
  ADD COLUMN `admission_source` VARCHAR(16) NOT NULL DEFAULT 'staff';
